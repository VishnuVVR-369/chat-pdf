import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";

const ocrMethodValidator = v.union(
  v.literal("document_ai_online"),
  v.literal("document_ai_online_imageless"),
  v.literal("document_ai_batch"),
);

type DocumentReplacement = Omit<Doc<"documents">, "_creationTime" | "_id">;

function withoutSystemFields<T extends { _creationTime: number; _id: string }>(
  document: T,
) {
  const rest = { ...document } as Omit<T, "_creationTime" | "_id"> & {
    _creationTime?: number;
    _id?: string;
  };
  delete rest._creationTime;
  delete rest._id;
  return rest;
}

function withoutProcessingArtifacts<
  T extends { _creationTime: number; _id: string; processingError?: string },
>(document: T) {
  const rest = {
    ...withoutSystemFields(document),
  } as Omit<T, "_creationTime" | "_id" | "processingError"> & {
    processingError?: string;
  };
  delete rest.processingError;
  return rest;
}

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
      storageId: v.union(v.id("_storage"), v.null()),
      originalFilename: v.string(),
      pageCount: v.number(),
      sha256: v.string(),
      storageSize: v.number(),
      ocrGcsInputUri: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);

    if (!document) {
      return null;
    }

    if (document.status === "ready") {
      return null;
    }

    if ((document.processingAttemptCount ?? 0) >= args.attemptNumber) {
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
      storageId: document.storageId ?? null,
      originalFilename: document.originalFilename,
      pageCount: document.pageCount ?? 0,
      sha256: document.sha256,
      storageSize: document.storageSize,
      ocrGcsInputUri: document.ocrGcsInputUri ?? null,
    };
  },
});

export const setDocumentInputGcsUri = internalMutation({
  args: {
    documentId: v.id("documents"),
    attemptNumber: v.number(),
    ocrGcsInputUri: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);

    if (!document) {
      return false;
    }

    if ((document.processingAttemptCount ?? 0) !== args.attemptNumber) {
      return false;
    }

    const replacement: DocumentReplacement = {
      ...withoutProcessingArtifacts(document),
      storageId: undefined,
      ocrGcsInputUri: args.ocrGcsInputUri,
    };

    await ctx.db.replace(args.documentId, replacement);

    return true;
  },
});

export const clearDocumentPages = internalMutation({
  args: {
    documentId: v.id("documents"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    while (true) {
      const existingPages = await ctx.db
        .query("documentPages")
        .withIndex("by_documentId_and_pageNumber", (q) =>
          q.eq("documentId", args.documentId),
        )
        .take(128);

      if (existingPages.length === 0) {
        break;
      }

      for (const page of existingPages) {
        await ctx.db.delete(page._id);
      }
    }

    return null;
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
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const page of args.pages) {
      await ctx.db.insert("documentPages", {
        ownerTokenIdentifier: args.ownerTokenIdentifier,
        documentId: args.documentId,
        pageNumber: page.pageNumber,
        extractedText: page.extractedText,
        extractionMethod: "ocr",
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
      const existingChunks = await ctx.db
        .query("documentChunks")
        .withIndex("by_documentId_and_startPageNumber", (q) =>
          q.eq("documentId", args.documentId),
        )
        .take(64);

      if (existingChunks.length === 0) {
        break;
      }

      for (const chunk of existingChunks) {
        await ctx.db.delete(chunk._id);
      }
    }

    return null;
  },
});

export const insertDocumentChunkBatch = internalMutation({
  args: {
    documentId: v.id("documents"),
    ownerTokenIdentifier: v.string(),
    chunks: v.array(
      v.object({
        startPageNumber: v.number(),
        endPageNumber: v.number(),
        text: v.string(),
        tokenCount: v.optional(v.number()),
        embedding: v.array(v.float64()),
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
        startPageNumber: chunk.startPageNumber,
        endPageNumber: chunk.endPageNumber,
        text: chunk.text,
        tokenCount: chunk.tokenCount,
        embedding: chunk.embedding,
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
    ocrGcsInputUri: v.optional(v.string()),
    ocrGcsOutputPrefix: v.optional(v.string()),
    ocrFinalJsonGcsUri: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);

    if (!document) {
      return false;
    }

    if ((document.processingAttemptCount ?? 0) !== args.attemptNumber) {
      return false;
    }

    const baseDocument = {
      ...withoutProcessingArtifacts(document),
    } as DocumentReplacement & {
      ocrGcsInputUri?: string;
      ocrGcsOutputPrefix?: string;
      ocrFinalJsonGcsUri?: string;
    };
    delete baseDocument.ocrGcsInputUri;
    delete baseDocument.ocrGcsOutputPrefix;
    delete baseDocument.ocrFinalJsonGcsUri;

    const replacement: DocumentReplacement = {
      ...baseDocument,
      status: "ready",
      lastProcessedAt: Date.now(),
      ocrCompletedAt: Date.now(),
      ocrMethod: args.ocrMethod,
      ocrProvider: "google_document_ai",
      ocrModelOrProcessor: args.ocrModelOrProcessor,
    };

    if (args.ocrGcsInputUri) {
      replacement.ocrGcsInputUri = args.ocrGcsInputUri;
    }
    if (args.ocrGcsOutputPrefix) {
      replacement.ocrGcsOutputPrefix = args.ocrGcsOutputPrefix;
    }
    if (args.ocrFinalJsonGcsUri) {
      replacement.ocrFinalJsonGcsUri = args.ocrFinalJsonGcsUri;
    }

    await ctx.db.replace(args.documentId, replacement);

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

    if (!document) {
      return false;
    }

    if ((document.processingAttemptCount ?? 0) !== args.attemptNumber) {
      return false;
    }

    const patch: {
      status: "failed";
      processingError: string;
      lastProcessedAt: number;
      ocrMethod?:
        | "document_ai_online"
        | "document_ai_online_imageless"
        | "document_ai_batch";
      ocrGcsInputUri?: string;
      ocrGcsOutputPrefix?: string;
    } = {
      status: "failed",
      processingError: args.errorMessage,
      lastProcessedAt: Date.now(),
    };

    if (args.ocrMethod) {
      patch.ocrMethod = args.ocrMethod;
    }
    if (args.ocrGcsInputUri) {
      patch.ocrGcsInputUri = args.ocrGcsInputUri;
    }
    if (args.ocrGcsOutputPrefix) {
      patch.ocrGcsOutputPrefix = args.ocrGcsOutputPrefix;
    }

    await ctx.db.patch(args.documentId, patch);

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

    if (!document) {
      return false;
    }

    if ((document.processingAttemptCount ?? 0) !== args.attemptNumber) {
      return false;
    }

    await ctx.db.replace(args.documentId, {
      ...withoutProcessingArtifacts(document),
      status: "processing",
    });

    return true;
  },
});
