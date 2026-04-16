import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";

const ocrMethodValidator = v.literal("document_ai_batch");

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
      originalFilename: v.string(),
      pageCount: v.number(),
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
        embedding: v.array(v.float64()),
        embeddingModel: v.string(),
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
        extractionMethod: "ocr",
        embedding: page.embedding,
        embeddingModel: page.embeddingModel,
        ...(page.embeddingTokenCount !== undefined
          ? { embeddingTokenCount: page.embeddingTokenCount }
          : {}),
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
    embeddedPageCount: v.number(),
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

    const replacement: DocumentReplacement = {
      ...withoutProcessingArtifacts(document),
      status: "ready",
      ocrCompletedAt: Date.now(),
      embeddingsCompletedAt: Date.now(),
      lastProcessedAt: Date.now(),
      ocrMethod: args.ocrMethod,
      ocrProvider: "google_document_ai",
      ocrModelOrProcessor: args.ocrModelOrProcessor,
      embeddingModel: args.embeddingModel,
      embeddedPageCount: args.embeddedPageCount,
    };

    if (args.ocrGcsInputUri !== undefined) {
      replacement.ocrGcsInputUri = args.ocrGcsInputUri;
    }

    if (args.ocrGcsOutputPrefix !== undefined) {
      replacement.ocrGcsOutputPrefix = args.ocrGcsOutputPrefix;
    }

    if (args.ocrFinalJsonGcsUri !== undefined) {
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
