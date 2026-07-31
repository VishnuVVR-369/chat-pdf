import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";

const messageRoleValidator = v.union(v.literal("user"), v.literal("assistant"));
const messageStatusValidator = v.union(
  v.literal("streaming"),
  v.literal("complete"),
  v.literal("stopped"),
  v.literal("failed"),
);
const MESSAGE_DELETE_BATCH = 256;
const EMPTY_DOCUMENT_CHUNK_TEXT = "[No extractable text found in this PDF.]";
const citationValidator = v.object({
  pageNumber: v.number(),
  snippet: v.string(),
  chunkId: v.optional(v.id("documentChunks")),
  startPageNumber: v.optional(v.number()),
  endPageNumber: v.optional(v.number()),
  quote: v.optional(v.string()),
  quoteStartOffset: v.optional(v.number()),
  quoteEndOffset: v.optional(v.number()),
  // The portion of the quote that lies on `pageNumber` (handles cross-page quotes),
  // plus where it sits within that page (0..1) to disambiguate repeated text.
  pageQuote: v.optional(v.string()),
  pageQuoteRatio: v.optional(v.number()),
});

type AuthenticatedCtx = QueryCtx | MutationCtx;

async function requireCurrentUser(ctx: AuthenticatedCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new Error("Authentication required.");
  }

  return identity;
}

// Deletes one bounded batch of a conversation's messages, returning whether more
// remain. Used both by the document-delete action loop and the self-scheduling purge.
async function deleteMessageBatch(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
) {
  const messages = await ctx.db
    .query("messages")
    .withIndex("by_conversationId", (q) =>
      q.eq("conversationId", conversationId),
    )
    .take(MESSAGE_DELETE_BATCH);

  for (const message of messages) {
    await ctx.db.delete(message._id);
  }

  return messages.length === MESSAGE_DELETE_BATCH;
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
    pageNumber: v.optional(v.number()),
    status: v.optional(messageStatusValidator),
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
      ...(args.pageNumber !== undefined ? { pageNumber: args.pageNumber } : {}),
      ...(args.status !== undefined ? { status: args.status } : {}),
      ...(args.citations !== undefined ? { citations: args.citations } : {}),
      createdAt: Date.now(),
    });
  },
});

// Creates the up-front assistant placeholder for a generation. Its _id is the
// generation id; finalization is guarded by status so a client stop wins.
export const createStreamingAssistantMessage = internalMutation({
  args: {
    conversationId: v.id("conversations"),
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);

    if (!conversation) {
      throw new Error("Conversation not found.");
    }

    return await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: "assistant",
      content: "",
      status: "streaming",
      createdAt: Date.now(),
    });
  },
});

// Returns the current status of an assistant message so the stream can bail out early
// if the user already stopped it.
export const getMessageStatus = internalQuery({
  args: {
    messageId: v.id("messages"),
  },
  returns: v.union(messageStatusValidator, v.null()),
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    return message?.status ?? null;
  },
});

// Idempotent, status-guarded finalization. Only writes when the message is still
// "streaming"; if the user stopped (or it was regenerated away) this is a no-op.
export const finalizeAssistantMessage = internalMutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
    status: v.union(
      v.literal("complete"),
      v.literal("failed"),
      v.literal("stopped"),
    ),
    citations: v.optional(v.array(citationValidator)),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);

    if (!message || message.status !== "streaming") {
      return false;
    }

    await ctx.db.patch(args.messageId, {
      content: args.content,
      status: args.status,
      ...(args.citations !== undefined ? { citations: args.citations } : {}),
    });

    return true;
  },
});

// Atomically claims a regeneration: verifies the expected assistant message is still
// the tail, deletes it, and creates a fresh streaming placeholder. Returns the prior
// user turn's content so the stream can re-answer it.
export const startRegeneration = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    expectedAssistantMessageId: v.id("messages"),
    ownerTokenIdentifier: v.string(),
  },
  returns: v.union(
    v.object({
      userContent: v.string(),
      pageNumber: v.optional(v.number()),
      assistantMessageId: v.id("messages"),
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

    const tail = await ctx.db
      .query("messages")
      .withIndex("by_conversationId", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("desc")
      .take(2);

    const assistant = tail[0];
    const user = tail[1];

    if (
      !assistant ||
      assistant._id !== args.expectedAssistantMessageId ||
      assistant.role !== "assistant" ||
      !user ||
      user.role !== "user"
    ) {
      return null;
    }

    await ctx.db.delete(assistant._id);

    const assistantMessageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: "assistant",
      content: "",
      status: "streaming",
      createdAt: Date.now(),
    });

    return {
      userContent: user.content,
      ...(user.pageNumber !== undefined ? { pageNumber: user.pageNumber } : {}),
      assistantMessageId,
    };
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

    // Over-fetch a little so hidden in-flight "streaming" placeholders don't shrink
    // the usable history below the requested limit.
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversationId", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("desc")
      .take(args.limit + 8);

    return messages
      .reverse()
      .filter((message) => message.status !== "streaming")
      .slice(-args.limit)
      .map(({ content, role }) => ({
        content,
        role,
      }));
  },
});

export const getDocumentConversationIds = internalQuery({
  args: {
    documentId: v.id("documents"),
    ownerTokenIdentifier: v.string(),
  },
  returns: v.array(v.id("conversations")),
  handler: async (ctx, args) => {
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_ownerTokenIdentifier_and_documentId", (q) =>
        q
          .eq("ownerTokenIdentifier", args.ownerTokenIdentifier)
          .eq("documentId", args.documentId),
      )
      .take(100);

    return conversations.map((conversation) => conversation._id);
  },
});

export const deleteConversationMessagesBatch = internalMutation({
  args: {
    conversationId: v.id("conversations"),
  },
  returns: v.object({ hasMore: v.boolean() }),
  handler: async (ctx, args) => {
    const hasMore = await deleteMessageBatch(ctx, args.conversationId);
    return { hasMore };
  },
});

export const deleteConversationRow = internalMutation({
  args: {
    conversationId: v.id("conversations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete(args.conversationId);
    return null;
  },
});

// Self-rescheduling purge of orphaned messages after a conversation row is deleted.
// Each invocation deletes one bounded batch to stay within transaction limits.
export const purgeConversationMessages = internalMutation({
  args: {
    conversationId: v.id("conversations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hasMore = await deleteMessageBatch(ctx, args.conversationId);

    if (hasMore) {
      await ctx.scheduler.runAfter(
        0,
        internal.chatData.purgeConversationMessages,
        { conversationId: args.conversationId },
      );
    }

    return null;
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

export const getDocumentChunksByIndexes = internalQuery({
  args: {
    documentId: v.id("documents"),
    ownerTokenIdentifier: v.string(),
    chunkIndexes: v.array(v.number()),
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
    const chunkIndexes = Array.from(new Set(args.chunkIndexes)).filter(
      (chunkIndex) => chunkIndex >= 0,
    );

    const chunks = await Promise.all(
      chunkIndexes.map((chunkIndex) =>
        ctx.db
          .query("documentChunks")
          .withIndex("by_documentId_and_chunkIndex", (q) =>
            q.eq("documentId", args.documentId).eq("chunkIndex", chunkIndex),
          )
          .unique(),
      ),
    );

    return chunks.flatMap((chunk) =>
      chunk && chunk.ownerTokenIdentifier === args.ownerTokenIdentifier
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

export const getDocumentChunksForPage = internalQuery({
  args: {
    documentId: v.id("documents"),
    ownerTokenIdentifier: v.string(),
    pageNumber: v.number(),
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
    const candidates = await ctx.db
      .query("documentChunks")
      .withIndex("by_documentId_and_startPageNumber", (q) =>
        q
          .eq("documentId", args.documentId)
          .lte("startPageNumber", args.pageNumber),
      )
      .order("desc")
      .take(24);

    return candidates
      .filter((chunk) => {
        if (chunk.ownerTokenIdentifier !== args.ownerTokenIdentifier) {
          return false;
        }

        const hasMatchingPageSpan = chunk.pageSpans.some(
          (span) => span.pageNumber === args.pageNumber,
        );
        const onlySpan = chunk.pageSpans[0];
        const isAllEmptyDocumentPlaceholder =
          chunk.text === EMPTY_DOCUMENT_CHUNK_TEXT &&
          chunk.pageSpans.length === 1 &&
          onlySpan?.pageNumber === chunk.startPageNumber &&
          onlySpan.startOffset === 0 &&
          onlySpan.endOffset === chunk.text.length &&
          chunk.startPageNumber <= args.pageNumber &&
          chunk.endPageNumber >= args.pageNumber;

        return hasMatchingPageSpan || isAllEmptyDocumentPlaceholder;
      })
      .sort((a, b) => a.chunkIndex - b.chunkIndex)
      .map((chunk) => ({
        _id: chunk._id,
        chunkIndex: chunk.chunkIndex,
        startPageNumber: chunk.startPageNumber,
        endPageNumber: chunk.endPageNumber,
        text: chunk.text,
        tokenCount: chunk.tokenCount,
        pageSpans: chunk.pageSpans,
      }));
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
      pageNumber: v.optional(v.number()),
      status: v.optional(messageStatusValidator),
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

    return messages
      .reverse()
      .filter((message) => message.status !== "streaming")
      .map((message) => ({
        _id: message._id,
        role: message.role,
        content: message.content,
        ...(message.pageNumber !== undefined
          ? { pageNumber: message.pageNumber }
          : {}),
        ...(message.status !== undefined ? { status: message.status } : {}),
        ...(message.citations !== undefined
          ? { citations: message.citations }
          : {}),
        createdAt: message.createdAt,
      }));
  },
});

// Persists a stopped generation's partial text. Authoritative over the server's
// finalization (which is guarded on status === "streaming").
export const stopGeneration = mutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await requireCurrentUser(ctx);
    const message = await ctx.db.get(args.messageId);

    if (!message || message.status !== "streaming") {
      return null;
    }

    const conversation = await ctx.db.get(message.conversationId);

    if (
      !conversation ||
      conversation.ownerTokenIdentifier !== identity.tokenIdentifier
    ) {
      return null;
    }

    await ctx.db.patch(args.messageId, {
      content: args.content.trim(),
      status: "stopped",
    });

    return null;
  },
});

export const renameConversation = mutation({
  args: {
    conversationId: v.id("conversations"),
    title: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await requireCurrentUser(ctx);
    const conversation = await ctx.db.get(args.conversationId);

    if (
      !conversation ||
      conversation.ownerTokenIdentifier !== identity.tokenIdentifier
    ) {
      throw new Error("Conversation not found.");
    }

    const title = args.title.trim().slice(0, 80);

    if (!title) {
      throw new Error("Conversation title cannot be empty.");
    }

    await ctx.db.patch(args.conversationId, { title });
    return null;
  },
});

export const deleteConversation = mutation({
  args: {
    conversationId: v.id("conversations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await requireCurrentUser(ctx);
    const conversation = await ctx.db.get(args.conversationId);

    if (
      !conversation ||
      conversation.ownerTokenIdentifier !== identity.tokenIdentifier
    ) {
      throw new Error("Conversation not found.");
    }

    // Remove the conversation immediately (so it vanishes from the UI and its messages
    // become unreachable), then purge the now-orphaned messages in bounded batches.
    await ctx.db.delete(args.conversationId);
    await ctx.scheduler.runAfter(
      0,
      internal.chatData.purgeConversationMessages,
      { conversationId: args.conversationId },
    );
    return null;
  },
});
