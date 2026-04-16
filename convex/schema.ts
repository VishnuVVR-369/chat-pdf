import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const documentStatus = v.union(
  v.literal("uploading"),
  v.literal("uploaded"),
  v.literal("processing"),
  v.literal("ready"),
  v.literal("failed"),
);

const extractionMethod = v.union(v.literal("text"), v.literal("ocr"));

const ocrMethod = v.union(
  v.literal("document_ai_online"),
  v.literal("document_ai_online_imageless"),
  v.literal("document_ai_batch"),
);

const messageRole = v.union(
  v.literal("system"),
  v.literal("user"),
  v.literal("assistant"),
);

const answerStatus = v.union(
  v.literal("grounded"),
  v.literal("weak_evidence"),
  v.literal("not_found"),
);

export default defineSchema({
  documents: defineTable({
    ownerTokenIdentifier: v.string(),
    title: v.string(),
    originalFilename: v.string(),
    storageId: v.optional(v.id("_storage")),
    storageContentType: v.optional(v.string()),
    storageSize: v.number(),
    sha256: v.string(),
    status: documentStatus,
    pageCount: v.optional(v.number()),
    processingError: v.optional(v.string()),
    uploadCompletedAt: v.number(),
    lastProcessedAt: v.optional(v.number()),
    processingStartedAt: v.optional(v.number()),
    ocrCompletedAt: v.optional(v.number()),
    processingAttemptCount: v.optional(v.number()),
    ocrMethod: v.optional(ocrMethod),
    ocrProvider: v.optional(v.literal("google_document_ai")),
    ocrModelOrProcessor: v.optional(v.string()),
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
    ])
    .index("by_storageId", ["storageId"]),
  documentPages: defineTable({
    ownerTokenIdentifier: v.string(),
    documentId: v.id("documents"),
    pageNumber: v.number(),
    extractedText: v.string(),
    extractionMethod,
  })
    .index("by_ownerTokenIdentifier_and_documentId", [
      "ownerTokenIdentifier",
      "documentId",
    ])
    .index("by_documentId_and_pageNumber", ["documentId", "pageNumber"]),
  documentChunks: defineTable({
    ownerTokenIdentifier: v.string(),
    ownerDocumentKey: v.string(),
    documentId: v.id("documents"),
    startPageNumber: v.number(),
    endPageNumber: v.number(),
    text: v.string(),
    tokenCount: v.optional(v.number()),
    embedding: v.optional(v.array(v.float64())),
  })
    .index("by_ownerTokenIdentifier_and_documentId", [
      "ownerTokenIdentifier",
      "documentId",
    ])
    .index("by_documentId_and_startPageNumber", [
      "documentId",
      "startPageNumber",
    ])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 3072,
      filterFields: ["ownerTokenIdentifier", "ownerDocumentKey"],
    }),
  chatSessions: defineTable({
    ownerTokenIdentifier: v.string(),
    title: v.optional(v.string()),
    lastMessageAt: v.optional(v.number()),
  }).index("by_ownerTokenIdentifier", ["ownerTokenIdentifier"]),
  chatSessionDocuments: defineTable({
    ownerTokenIdentifier: v.string(),
    chatSessionId: v.id("chatSessions"),
    documentId: v.id("documents"),
  })
    .index("by_ownerTokenIdentifier_and_documentId", [
      "ownerTokenIdentifier",
      "documentId",
    ])
    .index("by_ownerTokenIdentifier_and_chatSessionId", [
      "ownerTokenIdentifier",
      "chatSessionId",
    ])
    .index("by_chatSessionId_and_documentId", ["chatSessionId", "documentId"]),
  messages: defineTable({
    ownerTokenIdentifier: v.string(),
    chatSessionId: v.id("chatSessions"),
    role: messageRole,
    content: v.string(),
    answerStatus: v.optional(answerStatus),
    model: v.optional(v.string()),
  })
    .index("by_ownerTokenIdentifier_and_chatSessionId", [
      "ownerTokenIdentifier",
      "chatSessionId",
    ])
    .index("by_chatSessionId", ["chatSessionId"]),
  citations: defineTable({
    ownerTokenIdentifier: v.string(),
    chatSessionId: v.optional(v.id("chatSessions")),
    messageId: v.id("messages"),
    documentId: v.id("documents"),
    documentTitle: v.optional(v.string()),
    chunkId: v.optional(v.id("documentChunks")),
    pageNumber: v.number(),
    snippet: v.string(),
    highlightedText: v.optional(v.string()),
  })
    .index("by_chatSessionId_and_messageId", ["chatSessionId", "messageId"])
    .index("by_ownerTokenIdentifier_and_messageId", [
      "ownerTokenIdentifier",
      "messageId",
    ])
    .index("by_messageId", ["messageId"]),
});
