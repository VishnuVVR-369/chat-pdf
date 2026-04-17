"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { action } from "./_generated/server";
import { createOpenAiChatClient, createOpenAiEmbeddingClient } from "./openAi";

const RETRIEVAL_LIMIT = 3;
const MAX_HISTORY_MESSAGES = 20;

const citationValidator = v.object({
  pageNumber: v.number(),
  snippet: v.string(),
});

async function requireCurrentUser(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new Error("Authentication required.");
  }

  return identity;
}

async function embedQuery(query: string) {
  const { client, embeddingModel } = createOpenAiEmbeddingClient();

  const response = await client.embeddings.create({
    model: embeddingModel,
    input: query,
    encoding_format: "float",
  });

  const values = response.data[0]?.embedding;

  if (!values || values.length === 0) {
    throw new Error("Failed to embed the query.");
  }

  return values;
}

function buildSystemPrompt(
  title: string,
  pageTexts: Array<{ pageNumber: number; text: string }>,
) {
  const contextBlock =
    pageTexts.length > 0
      ? pageTexts
          .map((page) => `--- Page ${page.pageNumber} ---\n${page.text}`)
          .join("\n\n")
      : "No relevant excerpts were retrieved for this question.";

  return `You are a helpful assistant that answers questions about a PDF document titled "${title}".

Use ONLY the provided page excerpts to answer. If the answer is not in the excerpts, say so honestly.

When referencing information, mention the page number it came from.

Document excerpts:
${contextBlock}`;
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
      citations: Array<{ pageNumber: number; snippet: string }>;
    };
  }> => {
    const identity = await requireCurrentUser(ctx);
    const ownerTokenIdentifier = identity.tokenIdentifier;
    const document = await ctx.runQuery(internal.documents.getOwnedDocument, {
      documentId: args.documentId,
      ownerTokenIdentifier,
    });

    if (!document) {
      throw new Error("Document not found.");
    }

    if (document.status !== "ready") {
      throw new Error("Document is not ready for chat yet.");
    }

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

    const history: Array<{ role: "user" | "assistant"; content: string }> =
      await ctx.runQuery(internal.chatData.getConversationHistory, {
        conversationId,
        ownerTokenIdentifier,
        limit: MAX_HISTORY_MESSAGES,
      });

    const queryVector = await embedQuery(args.content);
    const ownerDocumentKey = `${ownerTokenIdentifier}:${args.documentId}`;
    const relevantPages = await ctx.vectorSearch(
      "documentPages",
      "by_embedding",
      {
        vector: queryVector,
        limit: RETRIEVAL_LIMIT,
        filter: (q) => q.eq("ownerDocumentKey", ownerDocumentKey),
      },
    );

    const pageTexts = (
      await ctx.runQuery(internal.chatData.getDocumentPages, {
        pageIds: relevantPages.map((result) => result._id),
      })
    )
      .map((page) => ({
        pageNumber: page.pageNumber,
        text: page.extractedText,
      }))
      .sort((a, b) => a.pageNumber - b.pageNumber);

    const systemPrompt = buildSystemPrompt(document.title, pageTexts);
    const { client: chatClient, chatModel } = createOpenAiChatClient();
    const chatMessages = [
      { role: "system", content: systemPrompt },
      ...history.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
    ] as Array<{ role: "system" | "user" | "assistant"; content: string }>;

    const completion = await chatClient.chat.completions.create({
      model: chatModel,
      messages: chatMessages,
      temperature: 0.3,
    });

    const assistantContent =
      completion.choices[0]?.message?.content?.trim() ??
      "I could not generate a response. Please try again.";

    const citations = pageTexts.map((page) => ({
      pageNumber: page.pageNumber,
      snippet: page.text.slice(0, 150).trim(),
    }));

    await ctx.runMutation(internal.chatData.addMessage, {
      conversationId,
      role: "assistant",
      content: assistantContent,
      citations,
    });

    return {
      conversationId,
      assistantMessage: {
        content: assistantContent,
        citations,
      },
    };
  },
});
