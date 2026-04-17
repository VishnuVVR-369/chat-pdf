"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { action } from "./_generated/server";
import {
  createOpenAiChatClient,
  createOpenAiEmbeddingClient,
} from "./openAi";

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
  handler: async (ctx, args): Promise<{
    conversationId: Id<"conversations">;
    assistantMessage: {
      content: string;
      citations: Array<{ pageNumber: number; snippet: string }>;
    };
  }> => {
    const identity = await requireCurrentUser(ctx);
    const ownerTokenIdentifier = identity.tokenIdentifier;

    // Verify document ownership and readiness
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

    // Create or reuse conversation
    let conversationId = args.conversationId ?? null;

    if (!conversationId) {
      conversationId = await ctx.runMutation(
        internal.chatMutations.createConversation,
        {
          ownerTokenIdentifier,
          documentId: args.documentId,
          title: args.content.slice(0, 80),
        },
      );
    }

    // Persist user message
    await ctx.runMutation(internal.chatMutations.addMessage, {
      conversationId,
      role: "user",
      content: args.content,
    });

    // Load conversation history
    const history: Array<{ role: "user" | "assistant"; content: string }> =
      await ctx.runQuery(internal.chatQueries.getConversationHistory, {
        conversationId,
        ownerTokenIdentifier,
        limit: MAX_HISTORY_MESSAGES,
      });

    // Embed the question and retrieve relevant pages
    const queryVector = await embedQuery(args.content);

    const ownerDocumentKey = `${ownerTokenIdentifier}:${args.documentId}`;
    const relevantPages = await ctx.vectorSearch(
      "documentPages",
      "by_embedding",
      {
        vector: queryVector,
        limit: RETRIEVAL_LIMIT,
        filter: (q) =>
          q.eq("ownerDocumentKey", ownerDocumentKey),
      },
    );

    // Fetch page texts
    const pageTexts: Array<{
      pageNumber: number;
      text: string;
    }> = [];

    for (const result of relevantPages) {
      const page = await ctx.runQuery(
        internal.chatQueries.getDocumentPageText,
        { pageId: result._id },
      );

      if (page) {
        pageTexts.push({
          pageNumber: page.pageNumber,
          text: page.extractedText,
        });
      }
    }

    // Sort by page number for coherent context
    pageTexts.sort((a, b) => a.pageNumber - b.pageNumber);

    // Build context and call OpenAI
    const contextBlock = pageTexts
      .map(
        (page) =>
          `--- Page ${page.pageNumber} ---\n${page.text}`,
      )
      .join("\n\n");

    const systemPrompt = `You are a helpful assistant that answers questions about a PDF document titled "${document.title}".

Use ONLY the provided page excerpts to answer. If the answer is not in the excerpts, say so honestly.

When referencing information, mention the page number it came from.

Document excerpts:
${contextBlock}`;

    const { client: chatClient, chatModel } = createOpenAiChatClient();

    // Build messages array: system + history (excluding the just-added user message since it's the current turn)
    const historyWithoutLast = history.slice(0, -1);

    const chatMessages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [
      { role: "system", content: systemPrompt },
      ...historyWithoutLast.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
      { role: "user", content: args.content },
    ];

    const completion = await chatClient.chat.completions.create({
      model: chatModel,
      messages: chatMessages,
      temperature: 0.3,
    });

    const assistantContent =
      completion.choices[0]?.message?.content?.trim() ??
      "I could not generate a response. Please try again.";

    // Build citations from retrieved pages
    const citations = pageTexts.map((page) => ({
      pageNumber: page.pageNumber,
      snippet: page.text.slice(0, 150).trim(),
    }));

    // Persist assistant message
    await ctx.runMutation(internal.chatMutations.addMessage, {
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
