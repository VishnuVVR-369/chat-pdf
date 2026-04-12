import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery, query } from "./_generated/server";

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
    gcsInputUri: v.optional(v.string()),
    contentType: v.optional(v.string()),
  },
  returns: v.id("documents"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("documents", {
      ownerTokenIdentifier: args.ownerTokenIdentifier,
      title: deriveDocumentTitle(args.filename),
      originalFilename: args.filename,
      storageContentType: args.contentType,
      storageSize: 0,
      sha256: "",
      status: "uploading",
      uploadCompletedAt: Date.now(),
      processingAttemptCount: 0,
      ocrGcsInputUri: args.gcsInputUri,
    });
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
      document.ownerTokenIdentifier !== args.ownerTokenIdentifier
    ) {
      return false;
    }

    const rest = {
      ...document,
    } as Omit<typeof document, "_creationTime" | "_id" | "processingError"> & {
      _creationTime?: number;
      _id?: typeof document._id;
      processingError?: string;
    };
    delete rest._creationTime;
    delete rest._id;
    delete rest.processingError;

    await ctx.db.replace(args.documentId, {
      ...rest,
      storageContentType: args.contentType,
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
      document.ownerTokenIdentifier !== args.ownerTokenIdentifier
    ) {
      return null;
    }

    if (document.status === "uploading") {
      await ctx.db.delete(args.documentId);
    }

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
      status: v.union(
        v.literal("uploading"),
        v.literal("uploaded"),
        v.literal("processing"),
        v.literal("ready"),
        v.literal("failed"),
      ),
      pageCount: v.optional(v.number()),
      processingError: v.optional(v.string()),
      storageContentType: v.optional(v.string()),
      storageSize: v.number(),
      uploadCompletedAt: v.number(),
      fileUrl: v.union(v.string(), v.null()),
      ocrGcsInputUri: v.optional(v.string()),
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

    return await Promise.all(
      documents.map(async (document) => ({
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
        fileUrl: null,
        ocrGcsInputUri: document.ocrGcsInputUri,
      })),
    );
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
      originalFilename: v.string(),
      storageId: v.optional(v.id("_storage")),
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
      originalFilename: document.originalFilename,
      storageId: document.storageId,
      ocrGcsInputUri: document.ocrGcsInputUri,
      ocrFinalJsonGcsUri: document.ocrFinalJsonGcsUri,
    };
  },
});
