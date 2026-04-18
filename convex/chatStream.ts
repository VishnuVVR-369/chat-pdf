import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  MAX_HISTORY_MESSAGES,
  LEGACY_RETRIEVAL_LIMIT,
  buildChunkSystemPrompt,
  buildLegacySystemPrompt,
  buildValidatedChunkCitations,
  createAnswerExtractor,
  embedQuery,
  getChunkRetrievalContext,
  parseStructuredAssistantResponse,
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
  const model = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";
  return { apiKey, model };
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

  const responseStream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        sseEvent({ type: "meta", conversationId, isNew: isNewConversation }),
      );

      try {
        const { apiKey, model } = getChatConfig();

        if (hasChunkData) {
          const chunks = await getChunkRetrievalContext(ctx, {
            documentId: documentId as Id<"documents">,
            ownerTokenIdentifier,
            query: content,
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
            controller.enqueue(sseEvent({ type: "done", citations: [] }));
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

          const openaiRes = await fetch(
            "https://api.openai.com/v1/chat/completions",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model,
                messages: chatMessages,
                temperature: 0.1,
                response_format: structuredAnswerFormat,
                stream: true,
              }),
            },
          );

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
                controller.enqueue(sseEvent({ type: "token", token: decoded }));
              }
            }
          }

          const fullBuffer = extractor.rawBuffer;
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
              fullBuffer.trim() ||
              "I could not generate a response. Please try again.";
          }

          // If the answer wasn't streamed (e.g. citations came first), emit it now
          if (!extractor.complete && assistantContent) {
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

          controller.enqueue(sseEvent({ type: "done", citations }));
        } else {
          // Legacy path: plain text streaming, page-level citations
          const queryVector = await embedQuery(content);
          const ownerDocumentKey = `${ownerTokenIdentifier}:${documentId}`;
          const relevantPages = await ctx.vectorSearch(
            "documentPages",
            "by_embedding",
            {
              vector: queryVector,
              limit: LEGACY_RETRIEVAL_LIMIT,
              filter: (q) => q.eq("ownerDocumentKey", ownerDocumentKey),
            },
          );

          const pageTexts = (
            await ctx.runQuery(internal.chatData.getDocumentPages, {
              pageIds: relevantPages.map((r) => r._id),
            })
          )
            .map((page) => ({
              pageNumber: page.pageNumber,
              text: page.extractedText,
            }))
            .sort((a, b) => a.pageNumber - b.pageNumber);

          const systemPrompt = buildLegacySystemPrompt(
            document.title,
            pageTexts,
          );
          const chatMessages = [
            { role: "system" as const, content: systemPrompt },
            ...history.map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            })),
          ];

          const openaiRes = await fetch(
            "https://api.openai.com/v1/chat/completions",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model,
                messages: chatMessages,
                temperature: 0.3,
                stream: true,
              }),
            },
          );

          if (!openaiRes.ok || !openaiRes.body) {
            throw new Error(`OpenAI API error: ${openaiRes.status}`);
          }

          let assistantContent = "";
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
              const token = parsed.choices?.[0]?.delta?.content ?? "";
              if (token) {
                assistantContent += token;
                controller.enqueue(sseEvent({ type: "token", token }));
              }
            }
          }

          if (!assistantContent) {
            assistantContent =
              "I could not generate a response. Please try again.";
            controller.enqueue(
              sseEvent({ type: "token", token: assistantContent }),
            );
          }

          const legacyCitations = pageTexts.map((page) => ({
            pageNumber: page.pageNumber,
            snippet: page.text.slice(0, 150).trim(),
          }));

          await ctx.runMutation(internal.chatData.addMessage, {
            conversationId,
            role: "assistant",
            content: assistantContent,
            citations: legacyCitations,
          });

          controller.enqueue(
            sseEvent({ type: "done", citations: legacyCitations }),
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
