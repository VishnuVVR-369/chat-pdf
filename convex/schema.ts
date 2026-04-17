import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const documentStatus = v.union(
  v.literal("uploading"),
  v.literal("uploaded"),
  v.literal("processing"),
  v.literal("ready"),
  v.literal("failed"),
);

const extractionMethod = v.literal("ocr");
const ocrMethod = v.literal("document_ai_batch");

export default defineSchema({
  documents: defineTable({
    ownerTokenIdentifier: v.string(),
    title: v.string(),
    originalFilename: v.string(),
    storageContentType: v.optional(v.string()),
    storageSize: v.number(),
    sha256: v.string(),
    status: documentStatus,
    pageCount: v.optional(v.number()),
    processingError: v.optional(v.string()),
    uploadCompletedAt: v.number(),
    processingStartedAt: v.optional(v.number()),
    ocrCompletedAt: v.optional(v.number()),
    embeddingsCompletedAt: v.optional(v.number()),
    lastProcessedAt: v.optional(v.number()),
    processingAttemptCount: v.optional(v.number()),
    ocrMethod: v.optional(ocrMethod),
    ocrProvider: v.optional(v.literal("google_document_ai")),
    ocrModelOrProcessor: v.optional(v.string()),
    embeddingModel: v.optional(v.string()),
    embeddedPageCount: v.optional(v.number()),
    ocrGcsInputUri: v.optional(v.string()),
    ocrGcsOutputPrefix: v.optional(v.string()),
    ocrFinalJsonGcsUri: v.optional(v.string()),
  })
    .index("by_ownerTokenIdentifier", ["ownerTokenIdentifier"])
    .index("by_ownerTokenIdentifier_and_status", [
      "ownerTokenIdentifier",
      "status",
    ])
    .index("by_ownerTokenIdentifier_and_originalFilename", [
      "ownerTokenIdentifier",
      "originalFilename",
    ]),
  documentPages: defineTable({
    ownerTokenIdentifier: v.string(),
    ownerDocumentKey: v.string(),
    documentId: v.id("documents"),
    pageNumber: v.number(),
    extractedText: v.string(),
    extractionMethod,
    embedding: v.optional(v.array(v.float64())),
    embeddingModel: v.optional(v.string()),
    embeddingTokenCount: v.optional(v.number()),
  })
    .index("by_ownerTokenIdentifier_and_documentId", [
      "ownerTokenIdentifier",
      "documentId",
    ])
    .index("by_documentId_and_pageNumber", ["documentId", "pageNumber"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["ownerTokenIdentifier", "ownerDocumentKey"],
    }),
  conversations: defineTable({
    ownerTokenIdentifier: v.string(),
    documentId: v.id("documents"),
    title: v.string(),
    createdAt: v.number(),
  }).index("by_ownerTokenIdentifier_and_documentId", [
    "ownerTokenIdentifier",
    "documentId",
  ]),
  messages: defineTable({
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    citations: v.optional(
      v.array(
        v.object({
          pageNumber: v.number(),
          snippet: v.string(),
        }),
      ),
    ),
    createdAt: v.number(),
  }).index("by_conversationId", ["conversationId"]),
});
