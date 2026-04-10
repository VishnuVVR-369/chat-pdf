import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { tables as betterAuthTables } from "./betterAuth/schema";

const documentStatus = v.union(
  v.literal("uploaded"),
  v.literal("processing"),
  v.literal("ready"),
  v.literal("failed"),
);

const extractionMethod = v.union(v.literal("text"), v.literal("ocr"));

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
  ...betterAuthTables,
  documents: defineTable({
    ownerTokenIdentifier: v.string(),
    title: v.string(),
    originalFilename: v.string(),
    storageId: v.id("_storage"),
    storageContentType: v.optional(v.string()),
    storageSize: v.number(),
    sha256: v.string(),
    status: documentStatus,
    pageCount: v.optional(v.number()),
    processingError: v.optional(v.string()),
    uploadCompletedAt: v.number(),
    lastProcessedAt: v.optional(v.number()),
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
    documentId: v.id("documents"),
    startPageNumber: v.number(),
    endPageNumber: v.number(),
    text: v.string(),
    tokenCount: v.optional(v.number()),
    embedding: v.optional(v.array(v.number())),
  })
    .index("by_ownerTokenIdentifier_and_documentId", [
      "ownerTokenIdentifier",
      "documentId",
    ])
    .index("by_documentId_and_startPageNumber", [
      "documentId",
      "startPageNumber",
    ]),
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
    messageId: v.id("messages"),
    documentId: v.id("documents"),
    chunkId: v.optional(v.id("documentChunks")),
    pageNumber: v.number(),
    snippet: v.string(),
    highlightedText: v.optional(v.string()),
  })
    .index("by_ownerTokenIdentifier_and_messageId", [
      "ownerTokenIdentifier",
      "messageId",
    ])
    .index("by_messageId", ["messageId"]),
});
