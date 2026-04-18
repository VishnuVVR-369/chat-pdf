"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { action } from "./_generated/server";
import { createOpenAiChatClient, createOpenAiEmbeddingClient } from "./openAi";

const HYBRID_VECTOR_LIMIT = 12;
const HYBRID_SEARCH_LIMIT = 12;
const FINAL_CHUNK_LIMIT = 6;
const LEGACY_RETRIEVAL_LIMIT = 3;
const MAX_HISTORY_MESSAGES = 20;
const RANK_FUSION_K = 60;
const MAX_CITATIONS = 4;

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
]);

const citationValidator = v.object({
  pageNumber: v.number(),
  snippet: v.string(),
  chunkId: v.optional(v.id("documentChunks")),
  startPageNumber: v.optional(v.number()),
  endPageNumber: v.optional(v.number()),
  quote: v.optional(v.string()),
  quoteStartOffset: v.optional(v.number()),
  quoteEndOffset: v.optional(v.number()),
});

type ConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

type ChunkPageSpan = {
  pageNumber: number;
  startOffset: number;
  endOffset: number;
};

type RetrievedChunk = {
  _id: Id<"documentChunks">;
  chunkIndex: number;
  startPageNumber: number;
  endPageNumber: number;
  text: string;
  tokenCount: number;
  pageSpans: ChunkPageSpan[];
};

type RankedChunk = RetrievedChunk & {
  hybridScore: number;
  sourceId: string;
};

type StructuredAssistantResponse = {
  answer: string;
  citations: Array<{
    sourceId: string;
    quote: string;
  }>;
};

const structuredAnswerFormat = {
  type: "json_schema" as const,
  json_schema: {
    name: "chat_pdf_answer",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        answer: {
          type: "string",
        },
        citations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              sourceId: {
                type: "string",
              },
              quote: {
                type: "string",
              },
            },
            required: ["sourceId", "quote"],
          },
        },
      },
      required: ["answer", "citations"],
    },
  },
};

async function requireCurrentUser(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new Error("Authentication required.");
  }

  return identity;
}

async function embedQuery(query: string) {
  const { client, embeddingModel } = createOpenAiEmbeddingClient();

  const response = await client.embeddings.create({
    model: embeddingModel,
    input: query,
    encoding_format: "float",
  });

  const values = response.data[0]?.embedding;

  if (!values || values.length === 0) {
    throw new Error("Failed to embed the query.");
  }

  return values;
}

function normalizeWhitespace(text: string) {
  return text.trim().replace(/\s+/g, " ");
}

function extractKeywordTerms(query: string) {
  const uniqueTerms = new Set<string>();

  for (const term of query.toLowerCase().match(/[a-z0-9][a-z0-9._/-]*/g) ??
    []) {
    if (term.length < 2 && !/\d/.test(term)) {
      continue;
    }

    if (!/\d/.test(term) && term.length < 3) {
      continue;
    }

    if (STOP_WORDS.has(term)) {
      continue;
    }

    uniqueTerms.add(term);

    if (uniqueTerms.size >= 12) {
      break;
    }
  }

  return Array.from(uniqueTerms);
}

function buildLexicalSearchQuery(query: string) {
  const keywordTerms = extractKeywordTerms(query);
  return keywordTerms.length > 0 ? keywordTerms.join(" ") : query.trim();
}

function applyRankFusionScore(
  scores: Map<Id<"documentChunks">, number>,
  ids: Id<"documentChunks">[],
  weight: number,
) {
  ids.forEach((id, index) => {
    const currentScore = scores.get(id) ?? 0;
    scores.set(id, currentScore + weight / (RANK_FUSION_K + index + 1));
  });
}

function buildChunkSystemPrompt(title: string, chunks: RankedChunk[]) {
  const sources =
    chunks.length > 0
      ? chunks
          .map((chunk) => {
            const pageLabel =
              chunk.startPageNumber === chunk.endPageNumber
                ? `page ${chunk.startPageNumber}`
                : `pages ${chunk.startPageNumber}-${chunk.endPageNumber}`;

            return `[${chunk.sourceId}] ${pageLabel}\n${chunk.text}`;
          })
          .join("\n\n")
      : "No relevant sources were retrieved.";

  return `You answer questions about a PDF titled "${title}".

Use ONLY the provided sources. If the answer is not fully supported by the sources, say that you could not find enough evidence in the document.

Return JSON with this exact shape:
{
  "answer": string,
  "citations": [{ "sourceId": string, "quote": string }]
}

Rules:
- cite only the provided source IDs
- each quote must be copied verbatim as one contiguous substring from the cited source
- include 1 to 4 citations when the answer is supported
- return an empty citations array when the answer is not supported
- do not mention any source ID in the answer body

Sources:
${sources}`;
}

function buildLegacySystemPrompt(
  title: string,
  pageTexts: Array<{ pageNumber: number; text: string }>,
) {
  const contextBlock =
    pageTexts.length > 0
      ? pageTexts
          .map((page) => `--- Page ${page.pageNumber} ---\n${page.text}`)
          .join("\n\n")
      : "No relevant excerpts were retrieved for this question.";

  return `You are a helpful assistant that answers questions about a PDF document titled "${title}".

Use ONLY the provided page excerpts to answer. If the answer is not in the excerpts, say so honestly.

When referencing information, mention the page number it came from.

Document excerpts:
${contextBlock}`;
}

function parseStructuredAssistantResponse(
  content: string | null | undefined,
): StructuredAssistantResponse | null {
  if (!content) {
    return null;
  }

  try {
    const parsed = JSON.parse(content) as Partial<StructuredAssistantResponse>;

    if (
      typeof parsed.answer !== "string" ||
      !Array.isArray(parsed.citations) ||
      parsed.citations.some(
        (citation) =>
          typeof citation?.sourceId !== "string" ||
          typeof citation?.quote !== "string",
      )
    ) {
      return null;
    }

    return {
      answer: parsed.answer,
      citations: parsed.citations.map((citation) => ({
        sourceId: citation.sourceId,
        quote: citation.quote,
      })),
    };
  } catch {
    return null;
  }
}

function buildSnippet(text: string, start: number, end: number) {
  const snippetStart = Math.max(0, start - 100);
  const snippetEnd = Math.min(text.length, end + 100);
  const prefix = snippetStart > 0 ? "..." : "";
  const suffix = snippetEnd < text.length ? "..." : "";

  return `${prefix}${text.slice(snippetStart, snippetEnd).trim()}${suffix}`;
}

function resolveCitationPageNumber(
  chunk: RankedChunk,
  quoteStartOffset: number,
) {
  const matchingSpan = chunk.pageSpans.find(
    (pageSpan) =>
      quoteStartOffset >= pageSpan.startOffset &&
      quoteStartOffset < pageSpan.endOffset,
  );

  return matchingSpan?.pageNumber ?? chunk.startPageNumber;
}

function buildValidatedChunkCitations(
  rawCitations: StructuredAssistantResponse["citations"],
  chunks: RankedChunk[],
) {
  const chunksBySourceId = new Map(
    chunks.map((chunk) => [chunk.sourceId, chunk] as const),
  );
  const citations: Array<{
    pageNumber: number;
    snippet: string;
    chunkId: Id<"documentChunks">;
    startPageNumber: number;
    endPageNumber: number;
    quote: string;
    quoteStartOffset: number;
    quoteEndOffset: number;
  }> = [];
  const seen = new Set<string>();

  for (const rawCitation of rawCitations) {
    const chunk = chunksBySourceId.get(rawCitation.sourceId);

    if (!chunk) {
      continue;
    }

    const quote = normalizeWhitespace(rawCitation.quote);
    if (!quote) {
      continue;
    }

    const quoteStartOffset = chunk.text.indexOf(quote);
    if (quoteStartOffset < 0) {
      continue;
    }

    const quoteEndOffset = quoteStartOffset + quote.length;
    const dedupeKey = `${chunk._id}:${quoteStartOffset}:${quoteEndOffset}`;
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    citations.push({
      pageNumber: resolveCitationPageNumber(chunk, quoteStartOffset),
      snippet: buildSnippet(chunk.text, quoteStartOffset, quoteEndOffset),
      chunkId: chunk._id,
      startPageNumber: chunk.startPageNumber,
      endPageNumber: chunk.endPageNumber,
      quote,
      quoteStartOffset,
      quoteEndOffset,
    });

    if (citations.length >= MAX_CITATIONS) {
      break;
    }
  }

  return citations;
}

function rerankChunks(
  query: string,
  chunks: RetrievedChunk[],
  vectorIds: Id<"documentChunks">[],
  lexicalIds: Id<"documentChunks">[],
) {
  const scores = new Map<Id<"documentChunks">, number>();
  const queryTerms = extractKeywordTerms(query);

  applyRankFusionScore(scores, vectorIds, 0.65);
  applyRankFusionScore(scores, lexicalIds, 0.35);

  return chunks
    .map((chunk) => {
      const keywordHits =
        queryTerms.length === 0
          ? 0
          : queryTerms.filter((term) => chunk.text.toLowerCase().includes(term))
              .length / queryTerms.length;

      return {
        ...chunk,
        hybridScore: (scores.get(chunk._id) ?? 0) + keywordHits * 0.1,
      };
    })
    .sort((left, right) => right.hybridScore - left.hybridScore)
    .slice(0, FINAL_CHUNK_LIMIT)
    .map((chunk, index) => ({
      ...chunk,
      sourceId: `S${index + 1}`,
    }));
}

async function getChunkRetrievalContext(
  ctx: ActionCtx,
  args: {
    documentId: Id<"documents">;
    ownerTokenIdentifier: string;
    query: string;
  },
) {
  const ownerDocumentKey = `${args.ownerTokenIdentifier}:${args.documentId}`;
  const lexicalSearchPromise = ctx.runQuery(
    internal.chatData.searchDocumentChunks,
    {
      ownerDocumentKey,
      query: buildLexicalSearchQuery(args.query),
      limit: HYBRID_SEARCH_LIMIT,
    },
  );

  const queryVector = await embedQuery(args.query);
  const vectorResults = await ctx.vectorSearch(
    "documentChunks",
    "by_embedding",
    {
      vector: queryVector,
      limit: HYBRID_VECTOR_LIMIT,
      filter: (q) => q.eq("ownerDocumentKey", ownerDocumentKey),
    },
  );
  const lexicalIds = await lexicalSearchPromise;
  const candidateIds = Array.from(
    new Set([...vectorResults.map((result) => result._id), ...lexicalIds]),
  );

  if (candidateIds.length === 0) {
    return [];
  }

  const chunks = await ctx.runQuery(internal.chatData.getDocumentChunks, {
    chunkIds: candidateIds,
  });

  return rerankChunks(
    args.query,
    chunks,
    vectorResults.map((result) => result._id),
    lexicalIds,
  );
}

export const sendMessage = action({
  args: {
    documentId: v.id("documents"),
    conversationId: v.optional(v.id("conversations")),
    content: v.string(),
  },
  returns: v.object({
    conversationId: v.id("conversations"),
    assistantMessage: v.object({
      content: v.string(),
      citations: v.array(citationValidator),
    }),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    conversationId: Id<"conversations">;
    assistantMessage: {
      content: string;
      citations: Array<{
        pageNumber: number;
        snippet: string;
        chunkId?: Id<"documentChunks">;
        startPageNumber?: number;
        endPageNumber?: number;
        quote?: string;
        quoteStartOffset?: number;
        quoteEndOffset?: number;
      }>;
    };
  }> => {
    const identity = await requireCurrentUser(ctx);
    const ownerTokenIdentifier = identity.tokenIdentifier;
    const document = await ctx.runQuery(internal.documents.getOwnedDocument, {
      documentId: args.documentId,
      ownerTokenIdentifier,
    });

    if (!document) {
      throw new Error("Document not found.");
    }

    if (document.status !== "ready") {
      throw new Error("Document is not ready for chat yet.");
    }

    let conversationId = args.conversationId ?? null;

    if (conversationId) {
      const conversation: {
        _id: Id<"conversations">;
        documentId: Id<"documents">;
      } | null = await ctx.runQuery(internal.chatData.getOwnedConversation, {
        conversationId,
        ownerTokenIdentifier,
      });

      if (!conversation || conversation.documentId !== args.documentId) {
        throw new Error("Conversation not found.");
      }
    } else {
      conversationId = await ctx.runMutation(
        internal.chatData.createConversation,
        {
          ownerTokenIdentifier,
          documentId: args.documentId,
          title: args.content,
        },
      );
    }

    await ctx.runMutation(internal.chatData.addMessage, {
      conversationId,
      role: "user",
      content: args.content,
    });

    const history: ConversationTurn[] = await ctx.runQuery(
      internal.chatData.getConversationHistory,
      {
        conversationId,
        ownerTokenIdentifier,
        limit: MAX_HISTORY_MESSAGES,
      },
    );

    const hasChunkData = await ctx.runQuery(
      internal.chatData.hasDocumentChunks,
      {
        documentId: args.documentId,
        ownerTokenIdentifier,
      },
    );

    let assistantContent = "I could not generate a response. Please try again.";
    let citations: Array<{
      pageNumber: number;
      snippet: string;
      chunkId?: Id<"documentChunks">;
      startPageNumber?: number;
      endPageNumber?: number;
      quote?: string;
      quoteStartOffset?: number;
      quoteEndOffset?: number;
    }> = [];

    if (hasChunkData) {
      const chunks = await getChunkRetrievalContext(ctx, {
        documentId: args.documentId,
        ownerTokenIdentifier,
        query: args.content,
      });

      if (chunks.length === 0) {
        assistantContent =
          "I could not find enough evidence in this document to answer that question.";
      } else {
        const systemPrompt = buildChunkSystemPrompt(document.title, chunks);
        const { client: chatClient, chatModel } = createOpenAiChatClient();
        const chatMessages = [
          { role: "system", content: systemPrompt },
          ...history.map((message) => ({
            role: message.role as "user" | "assistant",
            content: message.content,
          })),
        ] as Array<{
          role: "system" | "user" | "assistant";
          content: string;
        }>;

        const completion = await chatClient.chat.completions.create({
          model: chatModel,
          messages: chatMessages,
          temperature: 0.1,
          response_format: structuredAnswerFormat,
        });

        const structuredResponse = parseStructuredAssistantResponse(
          completion.choices[0]?.message?.content,
        );

        if (structuredResponse) {
          assistantContent =
            structuredResponse.answer.trim() ||
            "I could not generate a response. Please try again.";
          citations = buildValidatedChunkCitations(
            structuredResponse.citations,
            chunks,
          );
        } else {
          assistantContent =
            normalizeWhitespace(
              completion.choices[0]?.message?.content ?? "",
            ) || "I could not generate a response. Please try again.";
        }
      }
    } else {
      const queryVector = await embedQuery(args.content);
      const ownerDocumentKey = `${ownerTokenIdentifier}:${args.documentId}`;
      const relevantPages = await ctx.vectorSearch(
        "documentPages",
        "by_embedding",
        {
          vector: queryVector,
          limit: LEGACY_RETRIEVAL_LIMIT,
          filter: (q) => q.eq("ownerDocumentKey", ownerDocumentKey),
        },
      );

      const pageTexts = (
        await ctx.runQuery(internal.chatData.getDocumentPages, {
          pageIds: relevantPages.map((result) => result._id),
        })
      )
        .map((page) => ({
          pageNumber: page.pageNumber,
          text: page.extractedText,
        }))
        .sort((left, right) => left.pageNumber - right.pageNumber);

      const systemPrompt = buildLegacySystemPrompt(document.title, pageTexts);
      const { client: chatClient, chatModel } = createOpenAiChatClient();
      const chatMessages = [
        { role: "system", content: systemPrompt },
        ...history.map((message) => ({
          role: message.role as "user" | "assistant",
          content: message.content,
        })),
      ] as Array<{
        role: "system" | "user" | "assistant";
        content: string;
      }>;

      const completion = await chatClient.chat.completions.create({
        model: chatModel,
        messages: chatMessages,
        temperature: 0.3,
      });

      assistantContent =
        completion.choices[0]?.message?.content?.trim() ??
        "I could not generate a response. Please try again.";
      citations = pageTexts.map((page) => ({
        pageNumber: page.pageNumber,
        snippet: page.text.slice(0, 150).trim(),
      }));
    }

    await ctx.runMutation(internal.chatData.addMessage, {
      conversationId,
      role: "assistant",
      content: assistantContent,
      citations,
    });

    return {
      conversationId,
      assistantMessage: {
        content: assistantContent,
        citations,
      },
    };
  },
});
