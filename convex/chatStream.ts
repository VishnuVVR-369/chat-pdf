import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  modelSupportsTemperature,
  resolveChatReasoningEffort,
} from "./modelCapabilities";
import {
  MAX_HISTORY_MESSAGES,
  buildSummarySources,
  buildChunkSystemPrompt,
  buildSummarySystemPrompt,
  buildValidatedChunkCitations,
  buildValidatedSummaryCitations,
  createAnswerExtractor,
  extractAnswerFromStructuredContent,
  getChunkRetrievalContext,
  parseStructuredAssistantResponse,
  parseSummaryAssistantResponse,
  routeChatQuery,
  summaryAnswerFormat,
  structuredAnswerFormat,
} from "./chatHelpers";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function sseEvent(data: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function getChatConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  const model = process.env.OPENAI_CHAT_MODEL ?? "gpt-5.4-mini";
  return { apiKey, model };
}

async function streamStructuredAnswer(args: {
  apiKey: string;
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature: number;
  responseFormat: typeof structuredAnswerFormat | typeof summaryAnswerFormat;
  signal?: AbortSignal;
  onToken: (token: string) => void;
}) {
  // Cap hidden reasoning so the answer starts streaming promptly instead of
  // stalling on a long think phase (the main reason streaming looked absent).
  const reasoningEffort = resolveChatReasoningEffort(args.model);

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: args.signal,
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: args.model,
      messages: args.messages,
      ...(modelSupportsTemperature(args.model)
        ? { temperature: args.temperature }
        : {}),
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      response_format: args.responseFormat,
      stream: true,
    }),
  });

  if (!openaiRes.ok || !openaiRes.body) {
    throw new Error(`OpenAI API error: ${openaiRes.status}`);
  }

  const extractor = createAnswerExtractor();
  const reader = openaiRes.body.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = "";
  let aborted = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      sseBuffer += decoder.decode(value, { stream: true });

      const lines = sseBuffer.split("\n");
      sseBuffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice("data: ".length).trim();
        if (raw === "[DONE]") break;
        let parsed: { choices?: Array<{ delta?: { content?: string } }> };
        try {
          parsed = JSON.parse(raw) as typeof parsed;
        } catch {
          continue;
        }
        const delta = parsed.choices?.[0]?.delta?.content ?? "";
        if (!delta) continue;
        const decoded = extractor.feed(delta);
        if (decoded) {
          args.onToken(decoded);
        }
      }
    }
  } catch (err) {
    // A client-driven stop aborts the fetch; surface partial output rather than throw.
    if (!isAbortError(err)) throw err;
    aborted = true;
  }

  return {
    rawBuffer: extractor.rawBuffer,
    complete: extractor.complete,
    aborted,
  };
}

export const streamChat = httpAction(async (ctx, req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return jsonError(401, "Unauthorized");
  }
  const ownerTokenIdentifier = identity.tokenIdentifier;

  let body: {
    documentId: string;
    conversationId?: string;
    content?: string;
    regenerate?: boolean;
    expectedAssistantMessageId?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const {
    documentId,
    conversationId: rawConversationId,
    content,
    regenerate,
    expectedAssistantMessageId,
  } = body;

  const isRegenerate = regenerate === true;

  if (!documentId) {
    return jsonError(400, "Missing documentId");
  }
  if (isRegenerate) {
    if (!rawConversationId || !expectedAssistantMessageId) {
      return jsonError(
        400,
        "Regeneration requires conversationId and expectedAssistantMessageId",
      );
    }
  } else if (!content) {
    return jsonError(400, "Missing content");
  }

  const document = await ctx.runQuery(internal.documents.getOwnedDocument, {
    documentId: documentId as Id<"documents">,
    ownerTokenIdentifier,
  });

  if (!document) {
    return jsonError(404, "Document not found");
  }

  if (document.status !== "ready") {
    return jsonError(400, "Document is not ready for chat yet");
  }

  if (document.documentSummary.trim().length === 0) {
    return jsonError(500, "Document is missing summary artifacts");
  }

  let conversationId: Id<"conversations">;
  let assistantMessageId: Id<"messages">;
  let queryContent: string;
  const isNewConversation = !isRegenerate && !rawConversationId;

  if (isRegenerate) {
    const conversation = await ctx.runQuery(
      internal.chatData.getOwnedConversation,
      {
        conversationId: rawConversationId as Id<"conversations">,
        ownerTokenIdentifier,
      },
    );
    if (!conversation || conversation.documentId !== documentId) {
      return jsonError(404, "Conversation not found");
    }
    conversationId = rawConversationId as Id<"conversations">;

    const claim = await ctx.runMutation(internal.chatData.startRegeneration, {
      conversationId,
      expectedAssistantMessageId: expectedAssistantMessageId as Id<"messages">,
      ownerTokenIdentifier,
    });
    if (!claim) {
      return jsonError(409, "Nothing to regenerate");
    }
    assistantMessageId = claim.assistantMessageId;
    queryContent = claim.userContent;
  } else {
    queryContent = content as string;

    if (rawConversationId) {
      const conversation = await ctx.runQuery(
        internal.chatData.getOwnedConversation,
        {
          conversationId: rawConversationId as Id<"conversations">,
          ownerTokenIdentifier,
        },
      );
      if (!conversation || conversation.documentId !== documentId) {
        return jsonError(404, "Conversation not found");
      }
      conversationId = rawConversationId as Id<"conversations">;
    } else {
      conversationId = await ctx.runMutation(
        internal.chatData.createConversation,
        {
          ownerTokenIdentifier,
          documentId: documentId as Id<"documents">,
          title: queryContent,
        },
      );
    }

    await ctx.runMutation(internal.chatData.addMessage, {
      conversationId,
      role: "user",
      content: queryContent,
      status: "complete",
    });

    assistantMessageId = await ctx.runMutation(
      internal.chatData.createStreamingAssistantMessage,
      { conversationId },
    );
  }

  const history = await ctx.runQuery(internal.chatData.getConversationHistory, {
    conversationId,
    ownerTokenIdentifier,
    limit: MAX_HISTORY_MESSAGES,
  });

  const hasChunkData = await ctx.runQuery(internal.chatData.hasDocumentChunks, {
    documentId: documentId as Id<"documents">,
    ownerTokenIdentifier,
  });

  if (!hasChunkData) {
    await ctx.runMutation(internal.chatData.finalizeAssistantMessage, {
      messageId: assistantMessageId,
      content: "",
      status: "failed",
    });
    return jsonError(500, "Document is missing retrieval chunks");
  }

  const abort = new AbortController();

  // Returns false once the user has stopped this generation so we can bail out of the
  // expensive model call instead of finishing it.
  const isStillStreaming = async () => {
    const status = await ctx.runQuery(internal.chatData.getMessageStatus, {
      messageId: assistantMessageId,
    });
    return status === "streaming";
  };

  const finalize = async (
    finalContent: string,
    citations:
      | ReturnType<typeof buildValidatedChunkCitations>
      | ReturnType<typeof buildValidatedSummaryCitations>,
    status: "complete" | "stopped" = "complete",
  ) => {
    await ctx.runMutation(internal.chatData.finalizeAssistantMessage, {
      messageId: assistantMessageId,
      content: finalContent,
      status,
      citations: status === "complete" ? citations : [],
    });
  };

  const responseStream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        sseEvent({
          type: "meta",
          conversationId,
          assistantMessageId,
          isNew: isNewConversation,
        }),
      );

      try {
        const { apiKey, model } = getChatConfig();
        const routing = await routeChatQuery({
          title: document.title,
          history: history.slice(0, -1),
          currentUserMessage: queryContent,
          signal: abort.signal,
        });

        if (!(await isStillStreaming())) {
          controller.close();
          return;
        }

        if (routing.retrievalMode === "summaries") {
          const summaryContext = await ctx.runQuery(
            internal.chatData.getDocumentSummaryContext,
            {
              documentId: documentId as Id<"documents">,
              ownerTokenIdentifier,
            },
          );

          if (
            summaryContext.documentSummary.trim().length === 0 ||
            summaryContext.pageSummaries.length === 0
          ) {
            throw new Error("Ready document is missing summary artifacts.");
          }

          const summarySources = buildSummarySources(
            summaryContext.pageSummaries,
          );
          const systemPrompt = buildSummarySystemPrompt(
            document.title,
            summaryContext.documentSummary,
            summarySources,
          );
          const chatMessages = [
            { role: "system" as const, content: systemPrompt },
            ...history.map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            })),
          ];

          const streamed = await streamStructuredAnswer({
            apiKey,
            model,
            messages: chatMessages,
            temperature: 0.1,
            responseFormat: summaryAnswerFormat,
            signal: abort.signal,
            onToken: (token) =>
              controller.enqueue(sseEvent({ type: "token", token })),
          });

          const structuredResponse = parseSummaryAssistantResponse(
            streamed.rawBuffer,
          );
          let assistantContent: string;
          let citations: ReturnType<typeof buildValidatedSummaryCitations> = [];

          if (structuredResponse) {
            assistantContent =
              structuredResponse.answer.trim() ||
              "I could not generate a response. Please try again.";
            citations = buildValidatedSummaryCitations(
              structuredResponse.citations,
              summarySources,
            );
          } else {
            assistantContent =
              extractAnswerFromStructuredContent(streamed.rawBuffer) ||
              "I could not generate a response. Please try again.";
          }

          if (streamed.aborted) {
            // Client stopped: persist the partial as a terminal "stopped" message so
            // we never leave a hidden streaming row and never overwrite with a full
            // answer the user cancelled. (No-op if stopGeneration already ran.)
            await finalize(assistantContent, [], "stopped");
            controller.close();
            return;
          }

          if (!streamed.complete && assistantContent) {
            controller.enqueue(
              sseEvent({ type: "token", token: assistantContent }),
            );
          }

          await finalize(assistantContent, citations);

          controller.enqueue(
            sseEvent({ type: "done", content: assistantContent, citations }),
          );
        } else {
          const chunks = await getChunkRetrievalContext(ctx, {
            documentId: documentId as Id<"documents">,
            ownerTokenIdentifier,
            query: routing.standaloneQuery,
            signal: abort.signal,
          });

          if (!(await isStillStreaming())) {
            controller.close();
            return;
          }

          if (chunks.length === 0) {
            const fallback =
              "I could not find enough evidence in this document to answer that question.";
            controller.enqueue(sseEvent({ type: "token", token: fallback }));
            await finalize(fallback, []);
            controller.enqueue(
              sseEvent({ type: "done", content: fallback, citations: [] }),
            );
            controller.close();
            return;
          }

          const systemPrompt = buildChunkSystemPrompt(document.title, chunks);
          const chatMessages = [
            { role: "system" as const, content: systemPrompt },
            ...history.map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            })),
          ];

          const streamed = await streamStructuredAnswer({
            apiKey,
            model,
            messages: chatMessages,
            temperature: 0.1,
            responseFormat: structuredAnswerFormat,
            signal: abort.signal,
            onToken: (token) =>
              controller.enqueue(sseEvent({ type: "token", token })),
          });

          const fullBuffer = streamed.rawBuffer;
          const structuredResponse =
            parseStructuredAssistantResponse(fullBuffer);
          let assistantContent: string;
          let citations: ReturnType<typeof buildValidatedChunkCitations> = [];

          if (structuredResponse) {
            assistantContent =
              structuredResponse.answer.trim() ||
              "I could not generate a response. Please try again.";
            citations = buildValidatedChunkCitations(
              structuredResponse.citations,
              chunks,
            );
          } else {
            assistantContent =
              extractAnswerFromStructuredContent(fullBuffer) ||
              "I could not generate a response. Please try again.";
          }

          if (streamed.aborted) {
            // Client stopped: persist the partial as a terminal "stopped" message so
            // we never leave a hidden streaming row and never overwrite with a full
            // answer the user cancelled. (No-op if stopGeneration already ran.)
            await finalize(assistantContent, [], "stopped");
            controller.close();
            return;
          }

          // If the answer wasn't streamed (e.g. citations came first), emit it now
          if (!streamed.complete && assistantContent) {
            controller.enqueue(
              sseEvent({ type: "token", token: assistantContent }),
            );
          }

          await finalize(assistantContent, citations);

          controller.enqueue(
            sseEvent({ type: "done", content: assistantContent, citations }),
          );
        }
      } catch (err) {
        if (isAbortError(err)) {
          // Abort surfaced before streaming finished (e.g. during routing/retrieval).
          // Mark the placeholder stopped so it never lingers as a hidden streaming row.
          await ctx.runMutation(internal.chatData.finalizeAssistantMessage, {
            messageId: assistantMessageId,
            content: "",
            status: "stopped",
          });
          controller.close();
          return;
        }
        const message =
          err instanceof Error ? err.message : "An error occurred";
        await ctx.runMutation(internal.chatData.finalizeAssistantMessage, {
          messageId: assistantMessageId,
          content: "",
          status: "failed",
        });
        controller.enqueue(sseEvent({ type: "error", error: message }));
      }

      controller.close();
    },
    // Best-effort: if the runtime propagates client disconnect, stop the model call.
    cancel() {
      abort.abort();
    },
  });

  return new Response(responseStream, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
});
