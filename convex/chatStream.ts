import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  MAX_HISTORY_MESSAGES,
  buildSummarySources,
  buildChunkSystemPrompt,
  buildSummarySystemPrompt,
  buildValidatedChunkCitations,
  buildValidatedSummaryCitations,
  type ConversationTurn,
  extractAnswerFromStructuredContent,
  getChunkRetrievalContext,
  parseStructuredAssistantResponse,
  parseSummaryAssistantResponse,
  routeChatQuery,
  summaryAnswerFormat,
  structuredAnswerFormat,
} from "./chatHelpers";
import { getChatConfig, streamStructuredAnswer } from "./chatCompletion";
import {
  MAX_CHAT_QUESTION_CHARACTERS,
  MAX_CHAT_REQUEST_BYTES,
} from "../src/constants/chat";

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

async function readLimitedRequestBody(
  req: Request,
  maxBytes: number,
): Promise<string | null> {
  if (!req.body) return "";

  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let bytesRead = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return body + decoder.decode();

      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
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

  type ChatRequestBody = {
    documentId: string;
    conversationId?: string;
    content?: string;
    regenerate?: boolean;
    expectedAssistantMessageId?: string;
    pageNumber?: number;
  };

  const declaredLength = Number(req.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_CHAT_REQUEST_BYTES
  ) {
    return jsonError(413, "Request body is too large");
  }

  let body: ChatRequestBody;
  try {
    const rawBody = await readLimitedRequestBody(req, MAX_CHAT_REQUEST_BYTES);
    if (rawBody === null) {
      return jsonError(413, "Request body is too large");
    }
    const parsedBody: unknown = JSON.parse(rawBody);
    if (
      typeof parsedBody !== "object" ||
      parsedBody === null ||
      Array.isArray(parsedBody)
    ) {
      return jsonError(400, "Invalid JSON body");
    }
    body = parsedBody as ChatRequestBody;
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const {
    documentId,
    conversationId: rawConversationId,
    content,
    regenerate,
    expectedAssistantMessageId,
    pageNumber: requestedPageNumber,
  } = body;

  const isRegenerate = regenerate === true;

  if (typeof documentId !== "string" || !documentId) {
    return jsonError(400, "Missing documentId");
  }
  if (
    rawConversationId !== undefined &&
    typeof rawConversationId !== "string"
  ) {
    return jsonError(400, "Invalid conversationId");
  }
  if (isRegenerate) {
    if (
      !rawConversationId ||
      typeof expectedAssistantMessageId !== "string" ||
      !expectedAssistantMessageId
    ) {
      return jsonError(
        400,
        "Regeneration requires conversationId and expectedAssistantMessageId",
      );
    }
  } else if (typeof content !== "string" || !content.trim()) {
    return jsonError(400, "Missing content");
  } else if (content.length > MAX_CHAT_QUESTION_CHARACTERS) {
    return jsonError(
      413,
      `Questions must be ${MAX_CHAT_QUESTION_CHARACTERS} characters or fewer`,
    );
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

  if (
    requestedPageNumber !== undefined &&
    (!Number.isInteger(requestedPageNumber) ||
      requestedPageNumber < 1 ||
      document.pageCount === undefined ||
      requestedPageNumber > document.pageCount)
  ) {
    return jsonError(400, "Invalid pageNumber");
  }

  let conversationId: Id<"conversations">;
  let assistantMessageId: Id<"messages">;
  let queryContent: string;
  let pageNumber: number | undefined;
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
    pageNumber = claim.pageNumber;
  } else {
    queryContent = (content as string).trim();
    pageNumber = requestedPageNumber;

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
      ...(pageNumber !== undefined ? { pageNumber } : {}),
      status: "complete",
    });

    assistantMessageId = await ctx.runMutation(
      internal.chatData.createStreamingAssistantMessage,
      { conversationId },
    );
  }

  const history: ConversationTurn[] = await ctx.runQuery(
    internal.chatData.getConversationHistory,
    {
      conversationId,
      ownerTokenIdentifier,
      limit: MAX_HISTORY_MESSAGES,
    },
  );

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

        if (routing.retrievalMode === "summaries" && pageNumber === undefined) {
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
            ...(pageNumber !== undefined ? { pageNumber } : {}),
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

          const systemPrompt = buildChunkSystemPrompt(
            document.title,
            document.documentSummary,
            chunks,
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
