import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery, query } from "./_generated/server";

const messageRoleValidator = v.union(
  v.literal("system"),
  v.literal("user"),
  v.literal("assistant"),
);

const answerStatusValidator = v.union(
  v.literal("grounded"),
  v.literal("weak_evidence"),
  v.literal("not_found"),
);

type AuthenticatedCtx = QueryCtx | MutationCtx;

async function requireCurrentUser(ctx: AuthenticatedCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new Error("Authentication required.");
  }

  return identity;
}

export const getOwnedDocumentForChat = internalQuery({
  args: {
    documentId: v.id("documents"),
    ownerTokenIdentifier: v.string(),
  },
  returns: v.union(
    v.object({
      _id: v.id("documents"),
      title: v.string(),
      status: v.union(
        v.literal("uploading"),
        v.literal("uploaded"),
        v.literal("processing"),
        v.literal("ready"),
        v.literal("failed"),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);

    if (
      !document ||
      document.ownerTokenIdentifier !== args.ownerTokenIdentifier
    ) {
      return null;
    }

    return {
      _id: document._id,
      title: document.title,
      status: document.status,
    };
  },
});

export const getOwnedDocumentChatSession = internalQuery({
  args: {
    documentId: v.id("documents"),
    ownerTokenIdentifier: v.string(),
  },
  returns: v.union(v.id("chatSessions"), v.null()),
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("chatSessionDocuments")
      .withIndex("by_ownerTokenIdentifier_and_documentId", (q) =>
        q
          .eq("ownerTokenIdentifier", args.ownerTokenIdentifier)
          .eq("documentId", args.documentId),
      )
      .unique();

    return link?.chatSessionId ?? null;
  },
});

export const ensureDocumentChatSession = internalMutation({
  args: {
    documentId: v.id("documents"),
    ownerTokenIdentifier: v.string(),
  },
  returns: v.id("chatSessions"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("chatSessionDocuments")
      .withIndex("by_ownerTokenIdentifier_and_documentId", (q) =>
        q
          .eq("ownerTokenIdentifier", args.ownerTokenIdentifier)
          .eq("documentId", args.documentId),
      )
      .unique();

    if (existing) {
      return existing.chatSessionId;
    }

    const document = await ctx.db.get(args.documentId);

    if (
      !document ||
      document.ownerTokenIdentifier !== args.ownerTokenIdentifier
    ) {
      throw new Error("Document not found.");
    }

    const chatSessionId = await ctx.db.insert("chatSessions", {
      ownerTokenIdentifier: args.ownerTokenIdentifier,
      title: document.title,
      lastMessageAt: Date.now(),
    });

    await ctx.db.insert("chatSessionDocuments", {
      ownerTokenIdentifier: args.ownerTokenIdentifier,
      chatSessionId,
      documentId: args.documentId,
    });

    return chatSessionId;
  },
});

export const createMessage = internalMutation({
  args: {
    chatSessionId: v.id("chatSessions"),
    ownerTokenIdentifier: v.string(),
    role: messageRoleValidator,
    content: v.string(),
    answerStatus: v.optional(answerStatusValidator),
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.chatSessionId);

    if (
      !session ||
      session.ownerTokenIdentifier !== args.ownerTokenIdentifier
    ) {
      throw new Error("Chat session not found.");
    }

    const messageId = await ctx.db.insert("messages", {
      ownerTokenIdentifier: args.ownerTokenIdentifier,
      chatSessionId: args.chatSessionId,
      role: args.role,
      content: args.content,
      answerStatus: args.answerStatus,
    });

    await ctx.db.patch(args.chatSessionId, {
      lastMessageAt: Date.now(),
    });

    return messageId;
  },
});

export const insertMessageCitations = internalMutation({
  args: {
    messageId: v.id("messages"),
    ownerTokenIdentifier: v.string(),
    citations: v.array(
      v.object({
        documentId: v.id("documents"),
        chunkId: v.optional(v.id("documentChunks")),
        pageNumber: v.number(),
        snippet: v.string(),
        highlightedText: v.optional(v.string()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);

    if (
      !message ||
      message.ownerTokenIdentifier !== args.ownerTokenIdentifier
    ) {
      throw new Error("Message not found.");
    }

    for (const citation of args.citations) {
      await ctx.db.insert("citations", {
        ownerTokenIdentifier: args.ownerTokenIdentifier,
        messageId: args.messageId,
        documentId: citation.documentId,
        chunkId: citation.chunkId,
        pageNumber: citation.pageNumber,
        snippet: citation.snippet,
        highlightedText: citation.highlightedText,
      });
    }

    return null;
  },
});

export const getDocumentChat = query({
  args: {
    documentId: v.id("documents"),
  },
  returns: v.object({
    chatSessionId: v.union(v.id("chatSessions"), v.null()),
    messages: v.array(
      v.object({
        _id: v.id("messages"),
        _creationTime: v.number(),
        role: messageRoleValidator,
        content: v.string(),
        answerStatus: v.optional(answerStatusValidator),
        citations: v.array(
          v.object({
            _id: v.id("citations"),
            documentId: v.id("documents"),
            documentTitle: v.string(),
            chunkId: v.optional(v.id("documentChunks")),
            pageNumber: v.number(),
            snippet: v.string(),
            highlightedText: v.optional(v.string()),
          }),
        ),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const identity = await requireCurrentUser(ctx);
    const link = await ctx.db
      .query("chatSessionDocuments")
      .withIndex("by_ownerTokenIdentifier_and_documentId", (q) =>
        q
          .eq("ownerTokenIdentifier", identity.tokenIdentifier)
          .eq("documentId", args.documentId),
      )
      .unique();

    if (!link) {
      return {
        chatSessionId: null,
        messages: [],
      };
    }

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_ownerTokenIdentifier_and_chatSessionId", (q) =>
        q
          .eq("ownerTokenIdentifier", identity.tokenIdentifier)
          .eq("chatSessionId", link.chatSessionId),
      )
      .order("desc")
      .take(40);

    const orderedMessages = [...messages].reverse();

    return {
      chatSessionId: link.chatSessionId,
      messages: await Promise.all(
        orderedMessages.map(async (message) => {
          const citations = await ctx.db
            .query("citations")
            .withIndex("by_messageId", (q) => q.eq("messageId", message._id))
            .take(6);

          return {
            _id: message._id,
            _creationTime: message._creationTime,
            role: message.role,
            content: message.content,
            answerStatus: message.answerStatus,
            citations: await Promise.all(
              citations.map(async (citation) => {
                const document = await ctx.db.get(citation.documentId);

                return {
                  _id: citation._id,
                  documentId: citation.documentId,
                  documentTitle: document?.title ?? "Document",
                  chunkId: citation.chunkId,
                  pageNumber: citation.pageNumber,
                  snippet: citation.snippet,
                  highlightedText: citation.highlightedText,
                };
              }),
            ),
          };
        }),
      ),
    };
  },
});
