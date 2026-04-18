import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery, query } from "./_generated/server";

const messageRoleValidator = v.union(v.literal("user"), v.literal("assistant"));
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

type AuthenticatedCtx = QueryCtx;

async function requireCurrentUser(ctx: AuthenticatedCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new Error("Authentication required.");
  }

  return identity;
}

export const getOwnedConversation = internalQuery({
  args: {
    conversationId: v.id("conversations"),
    ownerTokenIdentifier: v.string(),
  },
  returns: v.union(
    v.object({
      _id: v.id("conversations"),
      documentId: v.id("documents"),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);

    if (
      !conversation ||
      conversation.ownerTokenIdentifier !== args.ownerTokenIdentifier
    ) {
      return null;
    }

    return {
      _id: conversation._id,
      documentId: conversation.documentId,
    };
  },
});

export const createConversation = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    documentId: v.id("documents"),
    title: v.string(),
  },
  returns: v.id("conversations"),
  handler: async (ctx, args) => {
    const title = args.title.trim().slice(0, 80) || "New conversation";

    return await ctx.db.insert("conversations", {
      ownerTokenIdentifier: args.ownerTokenIdentifier,
      documentId: args.documentId,
      title,
      createdAt: Date.now(),
    });
  },
});

export const addMessage = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    role: messageRoleValidator,
    content: v.string(),
    citations: v.optional(v.array(citationValidator)),
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);

    if (!conversation) {
      throw new Error("Conversation not found.");
    }

    return await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: args.role,
      content: args.content,
      ...(args.citations !== undefined ? { citations: args.citations } : {}),
      createdAt: Date.now(),
    });
  },
});

export const getConversationHistory = internalQuery({
  args: {
    conversationId: v.id("conversations"),
    ownerTokenIdentifier: v.string(),
    limit: v.number(),
  },
  returns: v.array(
    v.object({
      role: messageRoleValidator,
      content: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);

    if (
      !conversation ||
      conversation.ownerTokenIdentifier !== args.ownerTokenIdentifier
    ) {
      return [];
    }

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversationId", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("desc")
      .take(args.limit);

    return messages.reverse().map(({ content, role }) => ({
      content,
      role,
    }));
  },
});

export const getDocumentPages = internalQuery({
  args: {
    pageIds: v.array(v.id("documentPages")),
  },
  returns: v.array(
    v.object({
      pageNumber: v.number(),
      extractedText: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const pages = await Promise.all(
      args.pageIds.map((pageId) => ctx.db.get(pageId)),
    );

    return pages.flatMap((page) =>
      page
        ? [{ pageNumber: page.pageNumber, extractedText: page.extractedText }]
        : [],
    );
  },
});

export const getDocumentSummaryContext = internalQuery({
  args: {
    documentId: v.id("documents"),
    ownerTokenIdentifier: v.string(),
  },
  returns: v.object({
    documentSummary: v.string(),
    pageSummaries: v.array(
      v.object({
        pageNumber: v.number(),
        summary: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);

    if (
      !document ||
      document.ownerTokenIdentifier !== args.ownerTokenIdentifier
    ) {
      throw new Error("Document not found.");
    }

    const pages = await ctx.db
      .query("documentPages")
      .withIndex("by_ownerTokenIdentifier_and_documentId", (q) =>
        q
          .eq("ownerTokenIdentifier", args.ownerTokenIdentifier)
          .eq("documentId", args.documentId),
      )
      .take(128);

    return {
      documentSummary: document.documentSummary,
      pageSummaries: pages
        .sort((a, b) => a.pageNumber - b.pageNumber)
        .map((page) => ({
          pageNumber: page.pageNumber,
          summary: page.summary,
        })),
    };
  },
});

export const hasDocumentChunks = internalQuery({
  args: {
    documentId: v.id("documents"),
    ownerTokenIdentifier: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const chunks = await ctx.db
      .query("documentChunks")
      .withIndex("by_ownerTokenIdentifier_and_documentId", (q) =>
        q
          .eq("ownerTokenIdentifier", args.ownerTokenIdentifier)
          .eq("documentId", args.documentId),
      )
      .take(1);

    return chunks.length > 0;
  },
});

export const searchDocumentChunks = internalQuery({
  args: {
    ownerDocumentKey: v.string(),
    query: v.string(),
    limit: v.number(),
  },
  returns: v.array(v.id("documentChunks")),
  handler: async (ctx, args) => {
    const queryText = args.query.trim();

    if (queryText.length === 0) {
      return [];
    }

    const chunks = await ctx.db
      .query("documentChunks")
      .withSearchIndex("search_text", (q) =>
        q
          .search("text", queryText)
          .eq("ownerDocumentKey", args.ownerDocumentKey),
      )
      .take(args.limit);

    return chunks.map((chunk) => chunk._id);
  },
});

export const getDocumentChunks = internalQuery({
  args: {
    chunkIds: v.array(v.id("documentChunks")),
  },
  returns: v.array(
    v.object({
      _id: v.id("documentChunks"),
      chunkIndex: v.number(),
      startPageNumber: v.number(),
      endPageNumber: v.number(),
      text: v.string(),
      tokenCount: v.number(),
      pageSpans: v.array(
        v.object({
          pageNumber: v.number(),
          startOffset: v.number(),
          endOffset: v.number(),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const chunks = await Promise.all(
      args.chunkIds.map((chunkId) => ctx.db.get(chunkId)),
    );

    return chunks.flatMap((chunk) =>
      chunk
        ? [
            {
              _id: chunk._id,
              chunkIndex: chunk.chunkIndex,
              startPageNumber: chunk.startPageNumber,
              endPageNumber: chunk.endPageNumber,
              text: chunk.text,
              tokenCount: chunk.tokenCount,
              pageSpans: chunk.pageSpans,
            },
          ]
        : [],
    );
  },
});

export const listConversationsForDocument = query({
  args: {
    documentId: v.id("documents"),
  },
  returns: v.array(
    v.object({
      _id: v.id("conversations"),
      title: v.string(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const identity = await requireCurrentUser(ctx);
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_ownerTokenIdentifier_and_documentId", (q) =>
        q
          .eq("ownerTokenIdentifier", identity.tokenIdentifier)
          .eq("documentId", args.documentId),
      )
      .order("desc")
      .take(50);

    return conversations.map(({ _id, createdAt, title }) => ({
      _id,
      createdAt,
      title,
    }));
  },
});

export const getConversationMessages = query({
  args: {
    conversationId: v.id("conversations"),
  },
  returns: v.array(
    v.object({
      _id: v.id("messages"),
      role: messageRoleValidator,
      content: v.string(),
      citations: v.optional(v.array(citationValidator)),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const identity = await requireCurrentUser(ctx);
    const conversation = await ctx.db.get(args.conversationId);

    if (
      !conversation ||
      conversation.ownerTokenIdentifier !== identity.tokenIdentifier
    ) {
      return [];
    }

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversationId", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("desc")
      .take(200);

    return messages.reverse().map((message) => ({
      _id: message._id,
      role: message.role,
      content: message.content,
      ...(message.citations !== undefined
        ? { citations: message.citations }
        : {}),
      createdAt: message.createdAt,
    }));
  },
});
