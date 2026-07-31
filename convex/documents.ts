import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";

const MAX_DOCUMENT_TITLE_LENGTH = 200;

const documentStatusValidator = v.union(
  v.literal("uploading"),
  v.literal("uploaded"),
  v.literal("processing"),
  v.literal("ready"),
  v.literal("failed"),
);
const ocrMethodValidator = v.literal("mistral_ocr");
const documentListItemValidator = v.object({
  _id: v.id("documents"),
  _creationTime: v.number(),
  title: v.string(),
  originalFilename: v.string(),
  status: documentStatusValidator,
  pageCount: v.optional(v.number()),
  processingError: v.optional(v.string()),
  storageContentType: v.optional(v.string()),
  storageSize: v.number(),
  fileStorageId: v.optional(v.id("_storage")),
  uploadCompletedAt: v.number(),
  processingStartedAt: v.optional(v.number()),
  ocrCompletedAt: v.optional(v.number()),
  embeddingsCompletedAt: v.optional(v.number()),
  lastProcessedAt: v.optional(v.number()),
  ocrMethod: v.optional(ocrMethodValidator),
  ocrProvider: v.optional(v.literal("mistral")),
  ocrModel: v.optional(v.string()),
  mistralFileId: v.optional(v.string()),
  ocrResultStorageId: v.optional(v.id("_storage")),
  embeddingModel: v.optional(v.string()),
  embeddedPageCount: v.optional(v.number()),
  embeddedChunkCount: v.optional(v.number()),
  fileUrl: v.union(v.string(), v.null()),
});

type AuthenticatedCtx = QueryCtx | MutationCtx;
type DocumentReplacement = Omit<Doc<"documents">, "_creationTime" | "_id">;

async function requireCurrentUser(ctx: AuthenticatedCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new Error("Authentication required.");
  }

  return identity;
}

function deriveDocumentTitle(filename: string) {
  return filename.replace(/\.pdf$/i, "").trim() || "Untitled PDF";
}

function withoutSystemFields(document: Doc<"documents">): DocumentReplacement {
  const rest = {
    ...document,
  } as DocumentReplacement & {
    _creationTime?: number;
    _id?: string;
  };

  delete rest._creationTime;
  delete rest._id;
  return rest;
}

function withoutProcessingArtifacts(
  document: Doc<"documents">,
): DocumentReplacement {
  const rest = {
    ...withoutSystemFields(document),
  } as DocumentReplacement & { processingError?: string };

  delete rest.processingError;
  return rest;
}

function toDocumentListItem(document: Doc<"documents">) {
  return {
    _id: document._id,
    _creationTime: document._creationTime,
    title: document.title,
    originalFilename: document.originalFilename,
    status: document.status,
    pageCount: document.pageCount,
    processingError: document.processingError,
    storageContentType: document.storageContentType,
    storageSize: document.storageSize,
    fileStorageId: document.fileStorageId,
    uploadCompletedAt: document.uploadCompletedAt,
    processingStartedAt: document.processingStartedAt,
    ocrCompletedAt: document.ocrCompletedAt,
    embeddingsCompletedAt: document.embeddingsCompletedAt,
    lastProcessedAt: document.lastProcessedAt,
    ocrMethod: document.ocrMethod,
    ocrProvider: document.ocrProvider,
    ocrModel: document.ocrModel,
    mistralFileId: document.mistralFileId,
    ocrResultStorageId: document.ocrResultStorageId,
    embeddingModel: document.embeddingModel,
    embeddedPageCount: document.embeddedPageCount,
    embeddedChunkCount: document.embeddedChunkCount,
    fileUrl: null,
  };
}

export const reserveDirectUploadDocument = internalMutation({
  args: {
    filename: v.string(),
    ownerTokenIdentifier: v.string(),
    contentType: v.optional(v.string()),
  },
  returns: v.id("documents"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("documents", {
      ownerTokenIdentifier: args.ownerTokenIdentifier,
      title: deriveDocumentTitle(args.filename),
      originalFilename: args.filename,
      documentSummary: "",
      summaryModel: "",
      storageSize: 0,
      sha256: "",
      status: "uploading",
      uploadCompletedAt: Date.now(),
      processingAttemptCount: 0,
      ...(args.contentType !== undefined
        ? { storageContentType: args.contentType }
        : {}),
    });
  },
});

export const completeDirectUploadRecord = internalMutation({
  args: {
    documentId: v.id("documents"),
    ownerTokenIdentifier: v.string(),
    fileStorageId: v.id("_storage"),
    contentType: v.optional(v.string()),
    storageSize: v.number(),
    sha256: v.string(),
    pageCount: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);

    if (
      !document ||
      document.ownerTokenIdentifier !== args.ownerTokenIdentifier ||
      document.status !== "uploading"
    ) {
      return false;
    }

    await ctx.db.patch(args.documentId, {
      ...(args.contentType !== undefined
        ? { storageContentType: args.contentType }
        : {}),
      fileStorageId: args.fileStorageId,
      storageSize: args.storageSize,
      sha256: args.sha256,
      pageCount: args.pageCount,
      status: "uploaded",
      uploadCompletedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(
      0,
      internal.documentProcessing.runDocumentOcr,
      {
        documentId: args.documentId,
        attemptNumber: 1,
      },
    );

    return true;
  },
});

export const deleteReservedDocument = internalMutation({
  args: {
    documentId: v.id("documents"),
    ownerTokenIdentifier: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);

    if (
      !document ||
      document.ownerTokenIdentifier !== args.ownerTokenIdentifier ||
      document.status !== "uploading"
    ) {
      return null;
    }

    await ctx.db.delete(args.documentId);
    return null;
  },
});

export const beginProcessingAttempt = internalMutation({
  args: {
    documentId: v.id("documents"),
    attemptNumber: v.number(),
  },
  returns: v.union(
    v.null(),
    v.object({
      documentId: v.id("documents"),
      ownerTokenIdentifier: v.string(),
      originalFilename: v.string(),
      pageCount: v.number(),
      fileStorageId: v.union(v.id("_storage"), v.null()),
      ocrResultStorageId: v.union(v.id("_storage"), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);

    if (
      !document ||
      document.status === "ready" ||
      (document.processingAttemptCount ?? 0) >= args.attemptNumber
    ) {
      return null;
    }

    await ctx.db.replace(args.documentId, {
      ...withoutProcessingArtifacts(document),
      status: "processing",
      processingAttemptCount: args.attemptNumber,
      processingStartedAt: Date.now(),
    });

    return {
      documentId: document._id,
      ownerTokenIdentifier: document.ownerTokenIdentifier,
      originalFilename: document.originalFilename,
      pageCount: document.pageCount ?? 0,
      fileStorageId: document.fileStorageId ?? null,
      ocrResultStorageId: document.ocrResultStorageId ?? null,
    };
  },
});

export const recordOcrCheckpoint = internalMutation({
  args: {
    documentId: v.id("documents"),
    attemptNumber: v.number(),
    ocrResultStorageId: v.id("_storage"),
    ocrMethod: ocrMethodValidator,
    ocrModel: v.string(),
    mistralFileId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);

    if (
      !document ||
      (document.processingAttemptCount ?? 0) !== args.attemptNumber
    ) {
      return null;
    }

    await ctx.db.patch(args.documentId, {
      ocrResultStorageId: args.ocrResultStorageId,
      ocrMethod: args.ocrMethod,
      ocrProvider: "mistral",
      ocrModel: args.ocrModel,
      ...(args.mistralFileId !== undefined
        ? { mistralFileId: args.mistralFileId }
        : {}),
    });

    return null;
  },
});

export const clearDocumentPages = internalMutation({
  args: {
    documentId: v.id("documents"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    while (true) {
      const pages = await ctx.db
        .query("documentPages")
        .withIndex("by_documentId_and_pageNumber", (q) =>
          q.eq("documentId", args.documentId),
        )
        .take(128);

      if (pages.length === 0) {
        return null;
      }

      for (const page of pages) {
        await ctx.db.delete(page._id);
      }
    }
  },
});

export const insertDocumentPageBatch = internalMutation({
  args: {
    documentId: v.id("documents"),
    ownerTokenIdentifier: v.string(),
    pages: v.array(
      v.object({
        pageNumber: v.number(),
        extractedText: v.string(),
        summary: v.string(),
        embedding: v.optional(v.array(v.float64())),
        embeddingModel: v.optional(v.string()),
        embeddingTokenCount: v.optional(v.number()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Skip inserts if the document was deleted mid-processing (avoids orphan rows).
    const document = await ctx.db.get(args.documentId);
    if (
      !document ||
      document.ownerTokenIdentifier !== args.ownerTokenIdentifier
    ) {
      return null;
    }

    const ownerDocumentKey = `${args.ownerTokenIdentifier}:${args.documentId}`;

    for (const page of args.pages) {
      await ctx.db.insert("documentPages", {
        ownerTokenIdentifier: args.ownerTokenIdentifier,
        ownerDocumentKey,
        documentId: args.documentId,
        pageNumber: page.pageNumber,
        extractedText: page.extractedText,
        summary: page.summary,
        extractionMethod: "ocr",
        ...(page.embedding !== undefined ? { embedding: page.embedding } : {}),
        ...(page.embeddingModel !== undefined
          ? { embeddingModel: page.embeddingModel }
          : {}),
        ...(page.embeddingTokenCount !== undefined
          ? { embeddingTokenCount: page.embeddingTokenCount }
          : {}),
      });
    }

    return null;
  },
});

export const clearDocumentChunks = internalMutation({
  args: {
    documentId: v.id("documents"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    while (true) {
      const chunks = await ctx.db
        .query("documentChunks")
        .withIndex("by_documentId_and_chunkIndex", (q) =>
          q.eq("documentId", args.documentId),
        )
        .take(128);

      if (chunks.length === 0) {
        return null;
      }

      for (const chunk of chunks) {
        await ctx.db.delete(chunk._id);
      }
    }
  },
});

export const insertDocumentChunkBatch = internalMutation({
  args: {
    documentId: v.id("documents"),
    ownerTokenIdentifier: v.string(),
    chunks: v.array(
      v.object({
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
        embedding: v.array(v.float64()),
        embeddingModel: v.string(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Skip inserts if the document was deleted mid-processing (avoids orphan rows).
    const document = await ctx.db.get(args.documentId);
    if (
      !document ||
      document.ownerTokenIdentifier !== args.ownerTokenIdentifier
    ) {
      return null;
    }

    const ownerDocumentKey = `${args.ownerTokenIdentifier}:${args.documentId}`;

    for (const chunk of args.chunks) {
      await ctx.db.insert("documentChunks", {
        ownerTokenIdentifier: args.ownerTokenIdentifier,
        ownerDocumentKey,
        documentId: args.documentId,
        chunkIndex: chunk.chunkIndex,
        startPageNumber: chunk.startPageNumber,
        endPageNumber: chunk.endPageNumber,
        text: chunk.text,
        tokenCount: chunk.tokenCount,
        pageSpans: chunk.pageSpans,
        embedding: chunk.embedding,
        embeddingModel: chunk.embeddingModel,
      });
    }

    return null;
  },
});

export const completeProcessingSuccess = internalMutation({
  args: {
    documentId: v.id("documents"),
    attemptNumber: v.number(),
    ocrMethod: ocrMethodValidator,
    ocrModel: v.string(),
    mistralFileId: v.optional(v.string()),
    ocrResultStorageId: v.optional(v.id("_storage")),
    embeddingModel: v.string(),
    summaryModel: v.string(),
    documentSummary: v.string(),
    embeddedPageCount: v.number(),
    embeddedChunkCount: v.optional(v.number()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);

    if (
      !document ||
      (document.processingAttemptCount ?? 0) !== args.attemptNumber
    ) {
      return false;
    }

    const now = Date.now();
    await ctx.db.replace(args.documentId, {
      ...withoutProcessingArtifacts(document),
      status: "ready",
      ocrCompletedAt: now,
      embeddingsCompletedAt: now,
      lastProcessedAt: now,
      ocrMethod: args.ocrMethod,
      ocrProvider: "mistral",
      ocrModel: args.ocrModel,
      ...(args.mistralFileId !== undefined
        ? { mistralFileId: args.mistralFileId }
        : {}),
      ...(args.ocrResultStorageId !== undefined
        ? { ocrResultStorageId: args.ocrResultStorageId }
        : {}),
      embeddingModel: args.embeddingModel,
      summaryModel: args.summaryModel,
      documentSummary: args.documentSummary,
      embeddedPageCount: args.embeddedPageCount,
      ...(args.embeddedChunkCount !== undefined
        ? { embeddedChunkCount: args.embeddedChunkCount }
        : {}),
    });

    return true;
  },
});

export const completeProcessingFailure = internalMutation({
  args: {
    documentId: v.id("documents"),
    attemptNumber: v.number(),
    errorMessage: v.string(),
    ocrMethod: v.optional(ocrMethodValidator),
    mistralFileId: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);

    if (
      !document ||
      (document.processingAttemptCount ?? 0) !== args.attemptNumber
    ) {
      return false;
    }

    await ctx.db.patch(args.documentId, {
      status: "failed",
      processingError: args.errorMessage,
      lastProcessedAt: Date.now(),
      ...(args.ocrMethod !== undefined ? { ocrMethod: args.ocrMethod } : {}),
      ...(args.mistralFileId !== undefined
        ? { mistralFileId: args.mistralFileId }
        : {}),
    });

    return true;
  },
});

export const markRetryPending = internalMutation({
  args: {
    documentId: v.id("documents"),
    attemptNumber: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);

    if (
      !document ||
      (document.processingAttemptCount ?? 0) !== args.attemptNumber
    ) {
      return false;
    }

    await ctx.db.replace(args.documentId, {
      ...withoutProcessingArtifacts(document),
      status: "processing",
    });

    return true;
  },
});

export const listDocuments = query({
  args: {},
  returns: v.array(documentListItemValidator),
  handler: async (ctx) => {
    const identity = await requireCurrentUser(ctx);
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_ownerTokenIdentifier", (q) =>
        q.eq("ownerTokenIdentifier", identity.tokenIdentifier),
      )
      .order("desc")
      .take(50);

    return documents.map(toDocumentListItem);
  },
});

export const renameDocument = mutation({
  args: {
    documentId: v.id("documents"),
    title: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await requireCurrentUser(ctx);
    const document = await ctx.db.get(args.documentId);

    if (
      !document ||
      document.ownerTokenIdentifier !== identity.tokenIdentifier
    ) {
      throw new Error("Document not found.");
    }

    const title = args.title.trim().slice(0, MAX_DOCUMENT_TITLE_LENGTH);

    if (!title) {
      throw new Error("Document title cannot be empty.");
    }

    await ctx.db.patch(args.documentId, { title });
    return null;
  },
});

export const retryDocumentProcessing = mutation({
  args: {
    documentId: v.id("documents"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await requireCurrentUser(ctx);
    const document = await ctx.db.get(args.documentId);

    if (
      !document ||
      document.ownerTokenIdentifier !== identity.tokenIdentifier
    ) {
      throw new Error("Document not found.");
    }

    if (document.status !== "failed") {
      throw new Error("Only failed documents can be retried.");
    }

    const attemptNumber = (document.processingAttemptCount ?? 0) + 1;

    // Flip to processing immediately so the failed banner clears; the scheduled
    // pipeline reuses any OCR checkpoint and re-runs only the failed tail.
    await ctx.db.patch(args.documentId, { status: "processing" });

    await ctx.scheduler.runAfter(
      0,
      internal.documentProcessing.runDocumentOcr,
      {
        documentId: args.documentId,
        attemptNumber,
      },
    );

    return null;
  },
});

export const deleteDocumentRecord = internalMutation({
  args: {
    documentId: v.id("documents"),
    ownerTokenIdentifier: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);

    if (
      !document ||
      document.ownerTokenIdentifier !== args.ownerTokenIdentifier
    ) {
      return null;
    }

    await ctx.db.delete(args.documentId);
    return null;
  },
});

async function bestEffortDeleteStorage(
  ctx: ActionCtx,
  storageId: Id<"_storage"> | undefined,
) {
  if (!storageId) return;
  try {
    await ctx.storage.delete(storageId);
  } catch {
    // The blob may already be gone; deletion is best-effort.
  }
}

export const deleteDocument = action({
  args: {
    documentId: v.id("documents"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Authentication required.");
    }
    const ownerTokenIdentifier = identity.tokenIdentifier;

    const document = await ctx.runQuery(internal.documents.getOwnedDocument, {
      documentId: args.documentId,
      ownerTokenIdentifier,
    });

    if (!document) {
      throw new Error("Document not found.");
    }

    // Tombstone first: once the record is gone, getOwnedDocument returns null so any
    // in-flight processing / chat / retry mutations no-op safely.
    await ctx.runMutation(internal.documents.deleteDocumentRecord, {
      documentId: args.documentId,
      ownerTokenIdentifier,
    });

    await bestEffortDeleteStorage(ctx, document.fileStorageId);
    await bestEffortDeleteStorage(ctx, document.ocrResultStorageId);

    await ctx.runMutation(internal.documents.clearDocumentPages, {
      documentId: args.documentId,
    });
    await ctx.runMutation(internal.documents.clearDocumentChunks, {
      documentId: args.documentId,
    });

    // Cascade conversations + their messages in bounded batches.
    while (true) {
      const conversationIds = await ctx.runQuery(
        internal.chatData.getDocumentConversationIds,
        { documentId: args.documentId, ownerTokenIdentifier },
      );

      if (conversationIds.length === 0) break;

      for (const conversationId of conversationIds) {
        let hasMore = true;
        while (hasMore) {
          const result = await ctx.runMutation(
            internal.chatData.deleteConversationMessagesBatch,
            { conversationId },
          );
          hasMore = result.hasMore;
        }
        await ctx.runMutation(internal.chatData.deleteConversationRow, {
          conversationId,
        });
      }
    }

    return null;
  },
});

export const getOwnedDocument = internalQuery({
  args: {
    documentId: v.id("documents"),
    ownerTokenIdentifier: v.string(),
  },
  returns: v.union(
    v.object({
      _id: v.id("documents"),
      ownerTokenIdentifier: v.string(),
      status: documentStatusValidator,
      title: v.string(),
      documentSummary: v.string(),
      pageCount: v.optional(v.number()),
      originalFilename: v.string(),
      fileStorageId: v.optional(v.id("_storage")),
      ocrResultStorageId: v.optional(v.id("_storage")),
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
      ownerTokenIdentifier: document.ownerTokenIdentifier,
      status: document.status,
      title: document.title,
      documentSummary: document.documentSummary,
      ...(document.pageCount !== undefined
        ? { pageCount: document.pageCount }
        : {}),
      originalFilename: document.originalFilename,
      ...(document.fileStorageId !== undefined
        ? { fileStorageId: document.fileStorageId }
        : {}),
      ...(document.ocrResultStorageId !== undefined
        ? { ocrResultStorageId: document.ocrResultStorageId }
        : {}),
    };
  },
});
