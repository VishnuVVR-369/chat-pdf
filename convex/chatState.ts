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

    const message = {
      ownerTokenIdentifier: args.ownerTokenIdentifier,
      chatSessionId: args.chatSessionId,
      role: args.role,
      content: args.content,
    } as {
      ownerTokenIdentifier: string;
      chatSessionId: typeof args.chatSessionId;
      role: "system" | "user" | "assistant";
      content: string;
      answerStatus?: "grounded" | "weak_evidence" | "not_found";
    };

    if (args.answerStatus !== undefined) {
      message.answerStatus = args.answerStatus;
    }

    const messageId = await ctx.db.insert("messages", message);

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
        documentTitle: v.string(),
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
      const citationDocument = {
        ownerTokenIdentifier: args.ownerTokenIdentifier,
        chatSessionId: message.chatSessionId,
        messageId: args.messageId,
        documentId: citation.documentId,
        documentTitle: citation.documentTitle,
        pageNumber: citation.pageNumber,
        snippet: citation.snippet,
      } as {
        ownerTokenIdentifier: string;
        chatSessionId: typeof message.chatSessionId;
        messageId: typeof args.messageId;
        documentId: typeof citation.documentId;
        documentTitle: string;
        chunkId?: typeof citation.chunkId;
        pageNumber: number;
        snippet: string;
        highlightedText?: string;
      };

      if (citation.chunkId !== undefined) {
        citationDocument.chunkId = citation.chunkId;
      }

      if (citation.highlightedText !== undefined) {
        citationDocument.highlightedText = citation.highlightedText;
      }

      await ctx.db.insert("citations", citationDocument);
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
    const document = await ctx.db.get(args.documentId);

    if (
      !document ||
      document.ownerTokenIdentifier !== identity.tokenIdentifier
    ) {
      throw new Error("Document not found.");
    }

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
    const bulkCitations = await ctx.db
      .query("citations")
      .withIndex("by_chatSessionId_and_messageId", (q) =>
        q.eq("chatSessionId", link.chatSessionId),
      )
      .take(240);

    const citationsByMessageId = new Map<
      (typeof orderedMessages)[number]["_id"],
      (typeof bulkCitations)[number][]
    >();

    for (const citation of bulkCitations) {
      const currentCitations = citationsByMessageId.get(citation.messageId) ?? [];
      currentCitations.push(citation);
      citationsByMessageId.set(citation.messageId, currentCitations);
    }

    const fallbackMessageIds = orderedMessages
      .filter(
        (message) =>
          message.role === "assistant" && !citationsByMessageId.has(message._id),
      )
      .map((message) => message._id);

    for (const messageId of fallbackMessageIds) {
      const messageCitations = await ctx.db
        .query("citations")
        .withIndex("by_ownerTokenIdentifier_and_messageId", (q) =>
          q
            .eq("ownerTokenIdentifier", identity.tokenIdentifier)
            .eq("messageId", messageId),
        )
        .take(6);

      citationsByMessageId.set(messageId, messageCitations);
    }

    const citationDocumentIds = Array.from(
      new Set(
        Array.from(citationsByMessageId.values())
          .flat()
          .filter((citation) => citation.documentTitle === undefined)
          .map((citation) => citation.documentId),
      ),
    );
    const documentTitlesById = new Map<typeof document._id, string>([
      [document._id, document.title],
    ]);

    for (const documentId of citationDocumentIds) {
      if (documentTitlesById.has(documentId)) {
        continue;
      }

      const citationDocument = await ctx.db.get(documentId);
      if (citationDocument) {
        documentTitlesById.set(documentId, citationDocument.title);
      }
    }

    return {
      chatSessionId: link.chatSessionId,
      messages: orderedMessages.map((message) => {
        const citations = citationsByMessageId.get(message._id) ?? [];
        return {
          _id: message._id,
          _creationTime: message._creationTime,
          role: message.role,
          content: message.content,
          ...(message.answerStatus !== undefined
            ? { answerStatus: message.answerStatus }
            : {}),
          citations: citations.map((citation) => ({
            _id: citation._id,
            documentId: citation.documentId,
            documentTitle:
              citation.documentTitle ??
              documentTitlesById.get(citation.documentId) ??
              "Document",
            ...(citation.chunkId !== undefined
              ? { chunkId: citation.chunkId }
              : {}),
            pageNumber: citation.pageNumber,
            snippet: citation.snippet,
            ...(citation.highlightedText !== undefined
              ? { highlightedText: citation.highlightedText }
              : {}),
          })),
        };
      }),
    };
  },
});
