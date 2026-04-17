import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery, query } from "./_generated/server";

const messageRoleValidator = v.union(v.literal("user"), v.literal("assistant"));
const citationValidator = v.object({
  pageNumber: v.number(),
  snippet: v.string(),
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
