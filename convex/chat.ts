"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { action } from "./_generated/server";
import {
  MAX_HISTORY_MESSAGES,
  LEGACY_RETRIEVAL_LIMIT,
  buildChunkSystemPrompt,
  buildLegacySystemPrompt,
  buildValidatedChunkCitations,
  embedQuery,
  getChunkRetrievalContext,
  normalizeWhitespace,
  parseStructuredAssistantResponse,
  structuredAnswerFormat,
} from "./chatHelpers";
import { createOpenAiChatClient } from "./openAi";

const citationValidator = v.object({
  pageNumber: v.number(),
  snippet: v.string(),
  chunkId: v.optional(v.id("documentChunks")),
  startPageNumber: v.optional(v.number()),
  endPageNumber: v.optional(v.number()),
  quote: v.optional(v.string()),
  quoteStartOffset: v.optional(v.number()),
  quoteEndOffset: v.optional(v.number()),
});

async function requireCurrentUser(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Authentication required.");
  return identity;
}

export const sendMessage = action({
  args: {
    documentId: v.id("documents"),
    conversationId: v.optional(v.id("conversations")),
    content: v.string(),
  },
  returns: v.object({
    conversationId: v.id("conversations"),
    assistantMessage: v.object({
      content: v.string(),
      citations: v.array(citationValidator),
    }),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    conversationId: Id<"conversations">;
    assistantMessage: {
      content: string;
      citations: Array<{
        pageNumber: number;
        snippet: string;
        chunkId?: Id<"documentChunks">;
        startPageNumber?: number;
        endPageNumber?: number;
        quote?: string;
        quoteStartOffset?: number;
        quoteEndOffset?: number;
      }>;
    };
  }> => {
    const identity = await requireCurrentUser(ctx);
    const ownerTokenIdentifier = identity.tokenIdentifier;
    const document = await ctx.runQuery(internal.documents.getOwnedDocument, {
      documentId: args.documentId,
      ownerTokenIdentifier,
    });

    if (!document) throw new Error("Document not found.");
    if (document.status !== "ready")
      throw new Error("Document is not ready for chat yet.");

    let conversationId = args.conversationId ?? null;

    if (conversationId) {
      const conversation: {
        _id: Id<"conversations">;
        documentId: Id<"documents">;
      } | null = await ctx.runQuery(internal.chatData.getOwnedConversation, {
        conversationId,
        ownerTokenIdentifier,
      });
      if (!conversation || conversation.documentId !== args.documentId) {
        throw new Error("Conversation not found.");
      }
    } else {
      conversationId = await ctx.runMutation(
        internal.chatData.createConversation,
        {
          ownerTokenIdentifier,
          documentId: args.documentId,
          title: args.content,
        },
      );
    }

    await ctx.runMutation(internal.chatData.addMessage, {
      conversationId,
      role: "user",
      content: args.content,
    });

    const history = await ctx.runQuery(
      internal.chatData.getConversationHistory,
      {
        conversationId,
        ownerTokenIdentifier,
        limit: MAX_HISTORY_MESSAGES,
      },
    );

    const hasChunkData = await ctx.runQuery(
      internal.chatData.hasDocumentChunks,
      {
        documentId: args.documentId,
        ownerTokenIdentifier,
      },
    );

    let assistantContent = "I could not generate a response. Please try again.";
    let citations: Array<{
      pageNumber: number;
      snippet: string;
      chunkId?: Id<"documentChunks">;
      startPageNumber?: number;
      endPageNumber?: number;
      quote?: string;
      quoteStartOffset?: number;
      quoteEndOffset?: number;
    }> = [];

    if (hasChunkData) {
      const chunks = await getChunkRetrievalContext(ctx, {
        documentId: args.documentId,
        ownerTokenIdentifier,
        query: args.content,
      });

      if (chunks.length === 0) {
        assistantContent =
          "I could not find enough evidence in this document to answer that question.";
      } else {
        const systemPrompt = buildChunkSystemPrompt(document.title, chunks);
        const { client: chatClient, chatModel } = createOpenAiChatClient();
        const chatMessages = [
          { role: "system", content: systemPrompt },
          ...history.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        ] as Array<{ role: "system" | "user" | "assistant"; content: string }>;

        const completion = await chatClient.chat.completions.create({
          model: chatModel,
          messages: chatMessages,
          temperature: 0.1,
          response_format: structuredAnswerFormat,
        });

        const structuredResponse = parseStructuredAssistantResponse(
          completion.choices[0]?.message?.content,
        );

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
            normalizeWhitespace(
              completion.choices[0]?.message?.content ?? "",
            ) || "I could not generate a response. Please try again.";
        }
      }
    } else {
      const queryVector = await embedQuery(args.content);
      const ownerDocumentKey = `${ownerTokenIdentifier}:${args.documentId}`;
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

      const systemPrompt = buildLegacySystemPrompt(document.title, pageTexts);
      const { client: chatClient, chatModel } = createOpenAiChatClient();
      const chatMessages = [
        { role: "system", content: systemPrompt },
        ...history.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ] as Array<{ role: "system" | "user" | "assistant"; content: string }>;

      const completion = await chatClient.chat.completions.create({
        model: chatModel,
        messages: chatMessages,
        temperature: 0.3,
      });

      assistantContent =
        completion.choices[0]?.message?.content?.trim() ??
        "I could not generate a response. Please try again.";
      citations = pageTexts.map((page) => ({
        pageNumber: page.pageNumber,
        snippet: page.text.slice(0, 150).trim(),
      }));
    }

    await ctx.runMutation(internal.chatData.addMessage, {
      conversationId,
      role: "assistant",
      content: assistantContent,
      citations,
    });

    return {
      conversationId,
      assistantMessage: { content: assistantContent, citations },
    };
  },
});
