import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const createConversation = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    documentId: v.id("documents"),
    title: v.string(),
  },
  returns: v.id("conversations"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("conversations", {
      ownerTokenIdentifier: args.ownerTokenIdentifier,
      documentId: args.documentId,
      title: args.title,
      createdAt: Date.now(),
    });
  },
});

export const addMessage = internalMutation({
  args: {
    conversationId: v.id("conversations"),
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
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: args.role,
      content: args.content,
      ...(args.citations !== undefined ? { citations: args.citations } : {}),
      createdAt: Date.now(),
    });
  },
});
