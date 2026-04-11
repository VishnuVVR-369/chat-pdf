import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";

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

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireCurrentUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const getStorageMetadata = internalQuery({
  args: {
    storageId: v.id("_storage"),
  },
  returns: v.union(
    v.object({
      _id: v.id("_storage"),
      _creationTime: v.number(),
      contentType: v.optional(v.string()),
      sha256: v.string(),
      size: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const metadata = await ctx.db.system.get("_storage", args.storageId);

    if (!metadata) {
      return null;
    }

    return {
      _id: metadata._id,
      _creationTime: metadata._creationTime,
      contentType: metadata.contentType,
      sha256: metadata.sha256,
      size: metadata.size,
    };
  },
});

export const createDocumentRecord = internalMutation({
  args: {
    filename: v.string(),
    storageId: v.id("_storage"),
    ownerTokenIdentifier: v.string(),
    pageCount: v.number(),
    storageContentType: v.optional(v.string()),
    storageSize: v.number(),
    sha256: v.string(),
  },
  returns: v.id("documents"),
  handler: async (ctx, args) => {
    const existingDocument = await ctx.db
      .query("documents")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .unique();

    if (existingDocument) {
      if (existingDocument.ownerTokenIdentifier !== args.ownerTokenIdentifier) {
        throw new Error("This file is already linked to another user.");
      }

      return existingDocument._id;
    }

    return await ctx.db.insert("documents", {
      ownerTokenIdentifier: args.ownerTokenIdentifier,
      title: deriveDocumentTitle(args.filename),
      originalFilename: args.filename,
      storageId: args.storageId,
      storageContentType: args.storageContentType,
      storageSize: args.storageSize,
      sha256: args.sha256,
      pageCount: args.pageCount,
      status: "uploaded",
      uploadCompletedAt: Date.now(),
    });
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
        fileUrl: await ctx.storage.getUrl(document.storageId),
      })),
    );
  },
});
