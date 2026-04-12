"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { action } from "./_generated/server";
import {
  searchSimilarChunksForOwner,
  type SearchChunkResult,
} from "./documentChunkSearch";

type AnswerStatus = "grounded" | "weak_evidence" | "not_found";

async function requireCurrentUser(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new Error("Authentication required.");
  }

  return identity;
}

function compactWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function clipText(text: string, maxChars: number) {
  const normalized = compactWhitespace(text);

  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
}

function buildAnswerFromChunks(
  documentTitle: string,
  question: string,
  chunks: SearchChunkResult[],
) {
  if (chunks.length === 0) {
    return {
      answerStatus: "not_found" as const,
      content: `I couldn't find a grounded answer in "${documentTitle}" for "${question}". Try using a narrower phrase or referencing a section name from the PDF.`,
      citations: [],
    };
  }

  const citedChunks = chunks.slice(0, 3);
  const answerStatus: AnswerStatus =
    citedChunks.length >= 2 ? "grounded" : "weak_evidence";
  const primary = citedChunks[0];
  const supporting = citedChunks.slice(1);
  const lead = `Most relevant passage from "${documentTitle}": ${clipText(
    primary.text,
    320,
  )} (p. ${primary.startPageNumber}).`;
  const supportText =
    supporting.length > 0
      ? `Supporting context: ${supporting
          .map(
            (chunk) =>
              `${clipText(chunk.text, 220)} (p. ${chunk.startPageNumber})`,
          )
          .join(" ")}`
      : "I found one directly relevant passage, but the supporting evidence is still thin.";

  return {
    answerStatus,
    content: `${lead}\n\n${supportText}`,
    citations: citedChunks.map((chunk) => ({
      documentId: chunk.documentId,
      chunkId: chunk._id,
      pageNumber: chunk.startPageNumber,
      snippet: clipText(chunk.text, 220),
      highlightedText: undefined,
    })),
  };
}

export const askDocumentQuestion = action({
  args: {
    documentId: v.id("documents"),
    question: v.string(),
  },
  returns: v.object({
    chatSessionId: v.id("chatSessions"),
    userMessageId: v.id("messages"),
    assistantMessageId: v.id("messages"),
  }),
  handler: async (ctx, args) => {
    const identity = await requireCurrentUser(ctx);
    const question = compactWhitespace(args.question);

    if (!question) {
      throw new Error("Ask a non-empty question.");
    }

    const document = await ctx.runQuery(
      internal.chatState.getOwnedDocumentForChat,
      {
        documentId: args.documentId,
        ownerTokenIdentifier: identity.tokenIdentifier,
      },
    );

    if (!document) {
      throw new Error("Document not found.");
    }

    if (document.status !== "ready") {
      throw new Error("This document is not ready for chat yet.");
    }

    const chatSessionId: Id<"chatSessions"> = await ctx.runMutation(
      internal.chatState.ensureDocumentChatSession,
      {
        documentId: args.documentId,
        ownerTokenIdentifier: identity.tokenIdentifier,
      },
    );
    const userMessageId: Id<"messages"> = await ctx.runMutation(
      internal.chatState.createMessage,
      {
        chatSessionId,
        ownerTokenIdentifier: identity.tokenIdentifier,
        role: "user",
        content: question,
      },
    );
    const chunks = await searchSimilarChunksForOwner(ctx, {
      ownerTokenIdentifier: identity.tokenIdentifier,
      documentId: args.documentId,
      query: question,
      limit: 6,
    });
    const answer = buildAnswerFromChunks(document.title, question, chunks);
    const assistantMessageId: Id<"messages"> = await ctx.runMutation(
      internal.chatState.createMessage,
      {
        chatSessionId,
        ownerTokenIdentifier: identity.tokenIdentifier,
        role: "assistant",
        content: answer.content,
        answerStatus: answer.answerStatus,
      },
    );

    if (answer.citations.length > 0) {
      await ctx.runMutation(internal.chatState.insertMessageCitations, {
        messageId: assistantMessageId,
        ownerTokenIdentifier: identity.tokenIdentifier,
        citations: answer.citations,
      });
    }

    return {
      chatSessionId,
      userMessageId,
      assistantMessageId,
    };
  },
});
