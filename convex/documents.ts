import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery, query } from "./_generated/server";

const documentStatus = v.union(
  v.literal("uploading"),
  v.literal("uploaded"),
  v.literal("processing"),
  v.literal("ready"),
  v.literal("failed"),
);

const ocrMethod = v.literal("document_ai_batch");

type AuthenticatedCtx = QueryCtx | MutationCtx;

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

export const reserveDirectUploadDocument = internalMutation({
  args: {
    filename: v.string(),
    ownerTokenIdentifier: v.string(),
    contentType: v.optional(v.string()),
  },
  returns: v.id("documents"),
  handler: async (ctx, args) => {
    const document = {
      ownerTokenIdentifier: args.ownerTokenIdentifier,
      title: deriveDocumentTitle(args.filename),
      originalFilename: args.filename,
      storageSize: 0,
      sha256: "",
      status: "uploading" as const,
      uploadCompletedAt: Date.now(),
      processingAttemptCount: 0,
    };

    return await ctx.db.insert("documents", {
      ...document,
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

export const listDocuments = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("documents"),
      _creationTime: v.number(),
      title: v.string(),
      originalFilename: v.string(),
      status: documentStatus,
      pageCount: v.optional(v.number()),
      processingError: v.optional(v.string()),
      storageContentType: v.optional(v.string()),
      storageSize: v.number(),
      uploadCompletedAt: v.number(),
      processingStartedAt: v.optional(v.number()),
      ocrCompletedAt: v.optional(v.number()),
      embeddingsCompletedAt: v.optional(v.number()),
      lastProcessedAt: v.optional(v.number()),
      ocrMethod: v.optional(ocrMethod),
      ocrProvider: v.optional(v.literal("google_document_ai")),
      ocrModelOrProcessor: v.optional(v.string()),
      embeddingModel: v.optional(v.string()),
      embeddedPageCount: v.optional(v.number()),
      ocrGcsInputUri: v.optional(v.string()),
      ocrFinalJsonGcsUri: v.optional(v.string()),
      fileUrl: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const identity = await requireCurrentUser(ctx);
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_ownerTokenIdentifier", (q) =>
        q.eq("ownerTokenIdentifier", identity.tokenIdentifier),
      )
      .order("desc")
      .take(50);

    return documents.map((document) => ({
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
      ocrGcsInputUri: document.ocrGcsInputUri,
      ocrFinalJsonGcsUri: document.ocrFinalJsonGcsUri,
      fileUrl: null,
    }));
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
      status: documentStatus,
      title: v.string(),
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
