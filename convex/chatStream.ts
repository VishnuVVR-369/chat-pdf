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
  onToken: (token: string) => void;
}) {
  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: args.model,
      messages: args.messages,
      temperature: args.temperature,
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

  return {
    rawBuffer: extractor.rawBuffer,
    complete: extractor.complete,
  };
}

export const streamChat = httpAction(async (ctx, req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
  const ownerTokenIdentifier = identity.tokenIdentifier;

  let body: { documentId: string; conversationId?: string; content: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const { documentId, conversationId: rawConversationId, content } = body;
  if (!documentId || !content) {
    return new Response(
      JSON.stringify({ error: "Missing documentId or content" }),
      {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }

  const document = await ctx.runQuery(internal.documents.getOwnedDocument, {
    documentId: documentId as Id<"documents">,
    ownerTokenIdentifier,
  });

  if (!document) {
    return new Response(JSON.stringify({ error: "Document not found" }), {
      status: 404,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  if (document.status !== "ready") {
    return new Response(
      JSON.stringify({ error: "Document is not ready for chat yet" }),
      {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }

  if (document.documentSummary.trim().length === 0) {
    return new Response(
      JSON.stringify({ error: "Document is missing summary artifacts" }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }

  let conversationId: Id<"conversations">;
  const isNewConversation = !rawConversationId;

  if (rawConversationId) {
    const conversation = await ctx.runQuery(
      internal.chatData.getOwnedConversation,
      {
        conversationId: rawConversationId as Id<"conversations">,
        ownerTokenIdentifier,
      },
    );
    if (!conversation || conversation.documentId !== documentId) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    conversationId = rawConversationId as Id<"conversations">;
  } else {
    conversationId = await ctx.runMutation(
      internal.chatData.createConversation,
      {
        ownerTokenIdentifier,
        documentId: documentId as Id<"documents">,
        title: content,
      },
    );
  }

  await ctx.runMutation(internal.chatData.addMessage, {
    conversationId,
    role: "user",
    content,
  });

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
    return new Response(
      JSON.stringify({ error: "Document is missing retrieval chunks" }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }

  const responseStream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        sseEvent({ type: "meta", conversationId, isNew: isNewConversation }),
      );

      try {
        const { apiKey, model } = getChatConfig();
        const routing = await routeChatQuery({
          title: document.title,
          history: history.slice(0, -1),
          currentUserMessage: content,
        });

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

          if (!streamed.complete && assistantContent) {
            controller.enqueue(
              sseEvent({ type: "token", token: assistantContent }),
            );
          }

          await ctx.runMutation(internal.chatData.addMessage, {
            conversationId,
            role: "assistant",
            content: assistantContent,
            citations,
          });

          controller.enqueue(
            sseEvent({ type: "done", content: assistantContent, citations }),
          );
        } else {
          const chunks = await getChunkRetrievalContext(ctx, {
            documentId: documentId as Id<"documents">,
            ownerTokenIdentifier,
            query: routing.standaloneQuery,
          });

          if (chunks.length === 0) {
            const fallback =
              "I could not find enough evidence in this document to answer that question.";
            controller.enqueue(sseEvent({ type: "token", token: fallback }));
            await ctx.runMutation(internal.chatData.addMessage, {
              conversationId,
              role: "assistant",
              content: fallback,
              citations: [],
            });
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

          // If the answer wasn't streamed (e.g. citations came first), emit it now
          if (!streamed.complete && assistantContent) {
            controller.enqueue(
              sseEvent({ type: "token", token: assistantContent }),
            );
          }

          await ctx.runMutation(internal.chatData.addMessage, {
            conversationId,
            role: "assistant",
            content: assistantContent,
            citations,
          });

          controller.enqueue(
            sseEvent({ type: "done", content: assistantContent, citations }),
          );
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "An error occurred";
        controller.enqueue(sseEvent({ type: "error", error: message }));
      }

      controller.close();
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
