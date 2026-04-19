import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery, query } from "./_generated/server";

const documentStatusValidator = v.union(
  v.literal("uploading"),
  v.literal("uploaded"),
  v.literal("processing"),
  v.literal("ready"),
  v.literal("failed"),
);
const ocrMethodValidator = v.literal("document_ai_batch");
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
  uploadCompletedAt: v.number(),
  processingStartedAt: v.optional(v.number()),
  ocrCompletedAt: v.optional(v.number()),
  embeddingsCompletedAt: v.optional(v.number()),
  lastProcessedAt: v.optional(v.number()),
  ocrMethod: v.optional(ocrMethodValidator),
  ocrProvider: v.optional(v.literal("google_document_ai")),
  ocrModelOrProcessor: v.optional(v.string()),
  embeddingModel: v.optional(v.string()),
  embeddedPageCount: v.optional(v.number()),
  embeddedChunkCount: v.optional(v.number()),
  ocrGcsInputUri: v.optional(v.string()),
  ocrFinalJsonGcsUri: v.optional(v.string()),
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
    uploadCompletedAt: document.uploadCompletedAt,
    processingStartedAt: document.processingStartedAt,
    ocrCompletedAt: document.ocrCompletedAt,
    embeddingsCompletedAt: document.embeddingsCompletedAt,
    lastProcessedAt: document.lastProcessedAt,
    ocrMethod: document.ocrMethod,
    ocrProvider: document.ocrProvider,
    ocrModelOrProcessor: document.ocrModelOrProcessor,
    embeddingModel: document.embeddingModel,
    embeddedPageCount: document.embeddedPageCount,
    embeddedChunkCount: document.embeddedChunkCount,
    ocrGcsInputUri: document.ocrGcsInputUri,
    ocrFinalJsonGcsUri: document.ocrFinalJsonGcsUri,
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

export const setReservedDocumentInputGcsUri = internalMutation({
  args: {
    documentId: v.id("documents"),
    ownerTokenIdentifier: v.string(),
    ocrGcsInputUri: v.string(),
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
      ocrGcsInputUri: args.ocrGcsInputUri,
    });

    return true;
  },
});

export const completeDirectUploadRecord = internalMutation({
  args: {
    documentId: v.id("documents"),
    ownerTokenIdentifier: v.string(),
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
      ocrGcsInputUri: v.union(v.string(), v.null()),
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
      ocrGcsInputUri: document.ocrGcsInputUri ?? null,
    };
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
    ocrModelOrProcessor: v.string(),
    embeddingModel: v.string(),
    summaryModel: v.string(),
    documentSummary: v.string(),
    embeddedPageCount: v.number(),
    embeddedChunkCount: v.optional(v.number()),
    ocrGcsInputUri: v.optional(v.string()),
    ocrGcsOutputPrefix: v.optional(v.string()),
    ocrFinalJsonGcsUri: v.optional(v.string()),
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
      ocrProvider: "google_document_ai",
      ocrModelOrProcessor: args.ocrModelOrProcessor,
      embeddingModel: args.embeddingModel,
      summaryModel: args.summaryModel,
      documentSummary: args.documentSummary,
      embeddedPageCount: args.embeddedPageCount,
      ...(args.embeddedChunkCount !== undefined
        ? { embeddedChunkCount: args.embeddedChunkCount }
        : {}),
      ...(args.ocrGcsInputUri !== undefined
        ? { ocrGcsInputUri: args.ocrGcsInputUri }
        : {}),
      ...(args.ocrGcsOutputPrefix !== undefined
        ? { ocrGcsOutputPrefix: args.ocrGcsOutputPrefix }
        : {}),
      ...(args.ocrFinalJsonGcsUri !== undefined
        ? { ocrFinalJsonGcsUri: args.ocrFinalJsonGcsUri }
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
    ocrGcsInputUri: v.optional(v.string()),
    ocrGcsOutputPrefix: v.optional(v.string()),
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
      ...(args.ocrGcsInputUri !== undefined
        ? { ocrGcsInputUri: args.ocrGcsInputUri }
        : {}),
      ...(args.ocrGcsOutputPrefix !== undefined
        ? { ocrGcsOutputPrefix: args.ocrGcsOutputPrefix }
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
      originalFilename: v.string(),
      ocrGcsInputUri: v.optional(v.string()),
      ocrFinalJsonGcsUri: v.optional(v.string()),
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
      originalFilename: document.originalFilename,
      ...(document.ocrGcsInputUri !== undefined
        ? { ocrGcsInputUri: document.ocrGcsInputUri }
        : {}),
      ...(document.ocrFinalJsonGcsUri !== undefined
        ? { ocrFinalJsonGcsUri: document.ocrFinalJsonGcsUri }
        : {}),
    };
  },
});
