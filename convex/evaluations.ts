import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { getChatConfig, streamStructuredAnswer } from "./chatCompletion";
import {
  buildChunkSystemPrompt,
  buildValidatedChunkCitations,
  type ChatRoutingDecision,
  type ChunkRetrievalTrace,
  extractAnswerFromStructuredContent,
  getChunkRetrievalTrace,
  parseStructuredAssistantResponse,
  routeChatQuery,
  structuredAnswerFormat,
} from "./chatHelpers";
import { EVALUATION_OWNER_TOKEN_IDENTIFIER } from "./evaluationConstants";

type ReadyEvaluationDocument = {
  _id: Id<"documents">;
  title: string;
  originalFilename: string;
  documentSummary: string;
  pageCount: number;
  sha256: string;
};

type EvaluationRunResult = {
  document: {
    documentId: Id<"documents">;
    title: string;
    originalFilename: string;
    sha256: string;
  };
  routing: {
    retrievalMode: "chunks" | "summaries";
    standaloneQuery: string;
    /** "heuristic" when no LLM round-trip was made (the eval always has empty history). */
    source: "heuristic" | "llm";
    latencyMs: number;
  };
  retrieval: ChunkRetrievalTrace;
  generation: {
    answer: string;
    rawResponse: string;
    rawCitations: Array<{ sourceId: string; quote: string }>;
    validatedCitations: ReturnType<typeof buildValidatedChunkCitations>;
    model: string;
    latencyMs: number;
    usage: Awaited<ReturnType<typeof streamStructuredAnswer>>["usage"];
    finishReason: string | null;
    promptCharacters: number;
    contextChunkCount: number;
    contextTokenCount: number;
  };
};

const pageSpanValidator = v.object({
  pageNumber: v.number(),
  startOffset: v.number(),
  endOffset: v.number(),
});

const retrievedChunkValidator = v.object({
  _id: v.id("documentChunks"),
  chunkIndex: v.number(),
  startPageNumber: v.number(),
  endPageNumber: v.number(),
  text: v.string(),
  tokenCount: v.number(),
  pageSpans: v.array(pageSpanValidator),
});

const rankedChunkValidator = v.object({
  _id: v.id("documentChunks"),
  chunkIndex: v.number(),
  startPageNumber: v.number(),
  endPageNumber: v.number(),
  text: v.string(),
  tokenCount: v.number(),
  pageSpans: v.array(pageSpanValidator),
  hybridScore: v.number(),
  sourceId: v.string(),
});

const candidateValidator = v.object({
  chunkId: v.id("documentChunks"),
  rank: v.number(),
  score: v.optional(v.number()),
});

const validatedCitationValidator = v.object({
  pageNumber: v.number(),
  snippet: v.string(),
  chunkId: v.id("documentChunks"),
  startPageNumber: v.number(),
  endPageNumber: v.number(),
  quote: v.string(),
  quoteStartOffset: v.number(),
  quoteEndOffset: v.number(),
  pageQuote: v.string(),
  pageQuoteRatio: v.number(),
});

const usageValidator = v.union(
  v.null(),
  v.object({
    promptTokens: v.number(),
    cachedPromptTokens: v.number(),
    completionTokens: v.number(),
    reasoningTokens: v.number(),
    totalTokens: v.number(),
  }),
);

const embeddingCallValidator = v.union(
  v.null(),
  v.object({
    model: v.string(),
    promptTokens: v.number(),
    totalTokens: v.number(),
    latencyMs: v.number(),
  }),
);

export const runCase = internalAction({
  args: {
    originalFilename: v.string(),
    question: v.string(),
    pageNumber: v.optional(v.number()),
  },
  returns: v.object({
    document: v.object({
      documentId: v.id("documents"),
      title: v.string(),
      originalFilename: v.string(),
      sha256: v.string(),
    }),
    routing: v.object({
      retrievalMode: v.union(v.literal("chunks"), v.literal("summaries")),
      standaloneQuery: v.string(),
      source: v.union(v.literal("heuristic"), v.literal("llm")),
      latencyMs: v.number(),
    }),
    retrieval: v.object({
      query: v.string(),
      pageNumber: v.optional(v.number()),
      vectorCandidates: v.array(candidateValidator),
      lexicalCandidates: v.array(candidateValidator),
      selectedChunks: v.array(rankedChunkValidator),
      neighborChunks: v.array(retrievedChunkValidator),
      finalChunks: v.array(rankedChunkValidator),
      embedding: embeddingCallValidator,
      latencyMs: v.number(),
    }),
    generation: v.object({
      answer: v.string(),
      rawResponse: v.string(),
      rawCitations: v.array(
        v.object({ sourceId: v.string(), quote: v.string() }),
      ),
      validatedCitations: v.array(validatedCitationValidator),
      model: v.string(),
      latencyMs: v.number(),
      usage: usageValidator,
      finishReason: v.union(v.null(), v.string()),
      promptCharacters: v.number(),
      contextChunkCount: v.number(),
      contextTokenCount: v.number(),
    }),
  }),
  handler: async (ctx, args): Promise<EvaluationRunResult> => {
    const document: ReadyEvaluationDocument | null = await ctx.runQuery(
      internal.evaluationData.getReadyCorpusDocumentForRun,
      { originalFilename: args.originalFilename },
    );

    if (!document) {
      throw new Error(
        `Evaluation document is missing or not ready: ${args.originalFilename}`,
      );
    }

    if (
      args.pageNumber !== undefined &&
      (!Number.isInteger(args.pageNumber) ||
        args.pageNumber < 1 ||
        args.pageNumber > document.pageCount)
    ) {
      throw new Error(`Invalid evaluation page number: ${args.pageNumber}`);
    }

    const routingStartedAt = Date.now();
    const routing: ChatRoutingDecision = await routeChatQuery({
      title: document.title,
      history: [],
      currentUserMessage: args.question,
    });
    const routingLatencyMs = Date.now() - routingStartedAt;

    if (routing.retrievalMode !== "chunks" && args.pageNumber === undefined) {
      throw new Error(
        "This v1 evaluation runner only supports chunk retrieval cases.",
      );
    }

    const retrieval: ChunkRetrievalTrace = await getChunkRetrievalTrace(ctx, {
      documentId: document._id,
      ownerTokenIdentifier: EVALUATION_OWNER_TOKEN_IDENTIFIER,
      query: routing.standaloneQuery,
      ...(args.pageNumber !== undefined ? { pageNumber: args.pageNumber } : {}),
    });

    const { apiKey, model } = getChatConfig();
    const fallback =
      "I could not find enough evidence in this document to answer that question.";
    let answer = fallback;
    let rawResponse = "";
    let rawCitations: Array<{ sourceId: string; quote: string }> = [];
    let validatedCitations: ReturnType<typeof buildValidatedChunkCitations> =
      [];
    let usage: Awaited<ReturnType<typeof streamStructuredAnswer>>["usage"] =
      null;
    let finishReason: string | null = null;
    let promptCharacters = 0;
    const generationStartedAt = Date.now();

    if (retrieval.finalChunks.length > 0) {
      const systemPrompt = buildChunkSystemPrompt(
        document.title,
        document.documentSummary,
        retrieval.finalChunks,
      );
      promptCharacters = systemPrompt.length + args.question.length;
      const streamed = await streamStructuredAnswer({
        apiKey,
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: args.question },
        ],
        temperature: 0.1,
        responseFormat: structuredAnswerFormat,
        onToken: () => undefined,
      });

      rawResponse = streamed.rawBuffer;
      usage = streamed.usage;
      finishReason = streamed.finishReason;
      const structured = parseStructuredAssistantResponse(rawResponse);
      if (structured) {
        answer = structured.answer.trim() || fallback;
        rawCitations = structured.citations;
        validatedCitations = buildValidatedChunkCitations(
          structured.citations,
          retrieval.finalChunks,
        );
      } else {
        answer = extractAnswerFromStructuredContent(rawResponse) || fallback;
      }
    }

    return {
      document: {
        documentId: document._id,
        title: document.title,
        originalFilename: document.originalFilename,
        sha256: document.sha256,
      },
      routing: {
        retrievalMode: routing.retrievalMode,
        standaloneQuery: routing.standaloneQuery,
        // routeChatQuery short-circuits to the heuristic when history is empty,
        // which it always is here, so no routing LLM call is billed.
        source: "heuristic",
        latencyMs: routingLatencyMs,
      },
      retrieval,
      generation: {
        answer,
        rawResponse,
        rawCitations,
        validatedCitations,
        model,
        latencyMs: Date.now() - generationStartedAt,
        usage,
        finishReason,
        promptCharacters,
        contextChunkCount: retrieval.finalChunks.length,
        contextTokenCount: retrieval.finalChunks.reduce(
          (sum: number, chunk: { tokenCount: number }) =>
            sum + chunk.tokenCount,
          0,
        ),
      },
    };
  },
});
