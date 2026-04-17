import { v } from "convex/values";
import { internalQuery, query } from "./_generated/server";

export const getConversationHistory = internalQuery({
  args: {
    conversationId: v.id("conversations"),
    ownerTokenIdentifier: v.string(),
    limit: v.number(),
  },
  returns: v.array(
    v.object({
      role: v.union(v.literal("user"), v.literal("assistant")),
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
      .order("asc")
      .take(args.limit);

    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  },
});

export const getDocumentPageText = internalQuery({
  args: {
    pageId: v.id("documentPages"),
  },
  returns: v.union(
    v.object({
      pageNumber: v.number(),
      extractedText: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const page = await ctx.db.get(args.pageId);

    if (!page) {
      return null;
    }

    return {
      pageNumber: page.pageNumber,
      extractedText: page.extractedText,
    };
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
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Authentication required.");
    }

    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_ownerTokenIdentifier_and_documentId", (q) =>
        q
          .eq("ownerTokenIdentifier", identity.tokenIdentifier)
          .eq("documentId", args.documentId),
      )
      .order("desc")
      .take(50);

    return conversations.map((conv) => ({
      _id: conv._id,
      title: conv.title,
      createdAt: conv.createdAt,
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
      role: v.union(v.literal("user"), v.literal("assistant")),
      content: v.string(),
      citations: v.optional(
        v.array(
          v.object({
            pageNumber: v.number(),
            snippet: v.string(),
          }),
        ),
      ),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Authentication required.");
    }

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
      .order("asc")
      .take(200);

    return messages.map((msg) => ({
      _id: msg._id,
      role: msg.role,
      content: msg.content,
      ...(msg.citations !== undefined ? { citations: msg.citations } : {}),
      createdAt: msg.createdAt,
    }));
  },
});
