import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { EVALUATION_OWNER_TOKEN_IDENTIFIER } from "./evaluationConstants";

const statusValidator = v.union(
  v.literal("uploading"),
  v.literal("uploaded"),
  v.literal("processing"),
  v.literal("ready"),
  v.literal("failed"),
);

const corpusDocumentValidator = v.object({
  _id: v.id("documents"),
  originalFilename: v.string(),
  title: v.string(),
  sha256: v.string(),
  status: statusValidator,
  pageCount: v.optional(v.number()),
  processingError: v.optional(v.string()),
  embeddingModel: v.optional(v.string()),
  summaryModel: v.string(),
  embeddedChunkCount: v.optional(v.number()),
});

export const listCorpusDocuments = internalQuery({
  args: {},
  returns: v.array(corpusDocumentValidator),
  handler: async (ctx) => {
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_ownerTokenIdentifier", (q) =>
        q.eq("ownerTokenIdentifier", EVALUATION_OWNER_TOKEN_IDENTIFIER),
      )
      .take(20);

    return documents.map((document) => ({
      _id: document._id,
      originalFilename: document.originalFilename,
      title: document.title,
      sha256: document.sha256,
      status: document.status,
      ...(document.pageCount !== undefined
        ? { pageCount: document.pageCount }
        : {}),
      ...(document.processingError !== undefined
        ? { processingError: document.processingError }
        : {}),
      ...(document.embeddingModel !== undefined
        ? { embeddingModel: document.embeddingModel }
        : {}),
      summaryModel: document.summaryModel,
      ...(document.embeddedChunkCount !== undefined
        ? { embeddedChunkCount: document.embeddedChunkCount }
        : {}),
    }));
  },
});

export const getCorpusDocument = internalQuery({
  args: { originalFilename: v.string() },
  returns: v.union(corpusDocumentValidator, v.null()),
  handler: async (ctx, args) => {
    const document = await ctx.db
      .query("documents")
      .withIndex("by_ownerTokenIdentifier_and_originalFilename", (q) =>
        q
          .eq("ownerTokenIdentifier", EVALUATION_OWNER_TOKEN_IDENTIFIER)
          .eq("originalFilename", args.originalFilename),
      )
      .unique();

    if (!document) return null;

    return {
      _id: document._id,
      originalFilename: document.originalFilename,
      title: document.title,
      sha256: document.sha256,
      status: document.status,
      ...(document.pageCount !== undefined
        ? { pageCount: document.pageCount }
        : {}),
      ...(document.processingError !== undefined
        ? { processingError: document.processingError }
        : {}),
      ...(document.embeddingModel !== undefined
        ? { embeddingModel: document.embeddingModel }
        : {}),
      summaryModel: document.summaryModel,
      ...(document.embeddedChunkCount !== undefined
        ? { embeddedChunkCount: document.embeddedChunkCount }
        : {}),
    };
  },
});

export const getReadyCorpusDocumentForRun = internalQuery({
  args: { originalFilename: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("documents"),
      title: v.string(),
      originalFilename: v.string(),
      documentSummary: v.string(),
      pageCount: v.number(),
      sha256: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const document = await ctx.db
      .query("documents")
      .withIndex("by_ownerTokenIdentifier_and_originalFilename", (q) =>
        q
          .eq("ownerTokenIdentifier", EVALUATION_OWNER_TOKEN_IDENTIFIER)
          .eq("originalFilename", args.originalFilename),
      )
      .unique();

    if (
      !document ||
      document.status !== "ready" ||
      document.pageCount === undefined
    ) {
      return null;
    }

    return {
      _id: document._id,
      title: document.title,
      originalFilename: document.originalFilename,
      documentSummary: document.documentSummary,
      pageCount: document.pageCount,
      sha256: document.sha256,
    };
  },
});

export const getCorpusPages = internalQuery({
  args: { originalFilename: v.string() },
  returns: v.array(
    v.object({
      pageNumber: v.number(),
      extractedText: v.string(),
      summary: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const document = await ctx.db
      .query("documents")
      .withIndex("by_ownerTokenIdentifier_and_originalFilename", (q) =>
        q
          .eq("ownerTokenIdentifier", EVALUATION_OWNER_TOKEN_IDENTIFIER)
          .eq("originalFilename", args.originalFilename),
      )
      .unique();

    if (!document || document.status !== "ready") {
      throw new Error(
        `Evaluation document is not ready: ${args.originalFilename}`,
      );
    }

    const pages = await ctx.db
      .query("documentPages")
      .withIndex("by_ownerTokenIdentifier_and_documentId", (q) =>
        q
          .eq("ownerTokenIdentifier", EVALUATION_OWNER_TOKEN_IDENTIFIER)
          .eq("documentId", document._id),
      )
      .take(128);

    return pages
      .sort((a, b) => a.pageNumber - b.pageNumber)
      .map((page) => ({
        pageNumber: page.pageNumber,
        extractedText: page.extractedText,
        summary: page.summary,
      }));
  },
});
