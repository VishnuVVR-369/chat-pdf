import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

/* ─── Constants ─────────────────────────────────────────────────── */

export const HYBRID_VECTOR_LIMIT = 12;
export const HYBRID_SEARCH_LIMIT = 12;
export const FINAL_CHUNK_LIMIT = 6;
export const LEGACY_RETRIEVAL_LIMIT = 3;
export const MAX_HISTORY_MESSAGES = 20;
export const RANK_FUSION_K = 60;
export const MAX_CITATIONS = 4;

export const STOP_WORDS = new Set([
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

export const structuredAnswerFormat = {
  type: "json_schema" as const,
  json_schema: {
    name: "chat_pdf_answer",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        answer: { type: "string" },
        citations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              sourceId: { type: "string" },
              quote: { type: "string" },
            },
            required: ["sourceId", "quote"],
          },
        },
      },
      required: ["answer", "citations"],
    },
  },
};

/* ─── Types ─────────────────────────────────────────────────────── */

export type ConversationTurn = { role: "user" | "assistant"; content: string };

export type ChunkPageSpan = {
  pageNumber: number;
  startOffset: number;
  endOffset: number;
};

export type RetrievedChunk = {
  _id: Id<"documentChunks">;
  chunkIndex: number;
  startPageNumber: number;
  endPageNumber: number;
  text: string;
  tokenCount: number;
  pageSpans: ChunkPageSpan[];
};

export type RankedChunk = RetrievedChunk & {
  hybridScore: number;
  sourceId: string;
};

export type StructuredAssistantResponse = {
  answer: string;
  citations: Array<{ sourceId: string; quote: string }>;
};

export type ValidatedCitation = {
  pageNumber: number;
  snippet: string;
  chunkId: Id<"documentChunks">;
  startPageNumber: number;
  endPageNumber: number;
  quote: string;
  quoteStartOffset: number;
  quoteEndOffset: number;
};

/* ─── Pure helpers ───────────────────────────────────────────────── */

export function normalizeWhitespace(text: string) {
  return text.trim().replace(/\s+/g, " ");
}

export function extractKeywordTerms(query: string) {
  const uniqueTerms = new Set<string>();
  for (const term of query.toLowerCase().match(/[a-z0-9][a-z0-9._/-]*/g) ??
    []) {
    if (term.length < 2 && !/\d/.test(term)) continue;
    if (!/\d/.test(term) && term.length < 3) continue;
    if (STOP_WORDS.has(term)) continue;
    uniqueTerms.add(term);
    if (uniqueTerms.size >= 12) break;
  }
  return Array.from(uniqueTerms);
}

export function buildLexicalSearchQuery(query: string) {
  const keywordTerms = extractKeywordTerms(query);
  return keywordTerms.length > 0 ? keywordTerms.join(" ") : query.trim();
}

export function applyRankFusionScore(
  scores: Map<Id<"documentChunks">, number>,
  ids: Id<"documentChunks">[],
  weight: number,
) {
  ids.forEach((id, index) => {
    const currentScore = scores.get(id) ?? 0;
    scores.set(id, currentScore + weight / (RANK_FUSION_K + index + 1));
  });
}

export function buildChunkSystemPrompt(title: string, chunks: RankedChunk[]) {
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

export function buildLegacySystemPrompt(
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

export function parseStructuredAssistantResponse(
  content: string | null | undefined,
): StructuredAssistantResponse | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as Partial<StructuredAssistantResponse>;
    if (
      typeof parsed.answer !== "string" ||
      !Array.isArray(parsed.citations) ||
      parsed.citations.some(
        (c) => typeof c?.sourceId !== "string" || typeof c?.quote !== "string",
      )
    ) {
      return null;
    }
    return {
      answer: parsed.answer,
      citations: parsed.citations.map((c) => ({
        sourceId: c.sourceId,
        quote: c.quote,
      })),
    };
  } catch {
    return null;
  }
}

export function buildSnippet(text: string, start: number, end: number) {
  const snippetStart = Math.max(0, start - 100);
  const snippetEnd = Math.min(text.length, end + 100);
  const prefix = snippetStart > 0 ? "..." : "";
  const suffix = snippetEnd < text.length ? "..." : "";
  return `${prefix}${text.slice(snippetStart, snippetEnd).trim()}${suffix}`;
}

export function resolveCitationPageNumber(
  chunk: RankedChunk,
  quoteStartOffset: number,
) {
  const matchingSpan = chunk.pageSpans.find(
    (s) => quoteStartOffset >= s.startOffset && quoteStartOffset < s.endOffset,
  );
  return matchingSpan?.pageNumber ?? chunk.startPageNumber;
}

export function buildValidatedChunkCitations(
  rawCitations: StructuredAssistantResponse["citations"],
  chunks: RankedChunk[],
): ValidatedCitation[] {
  const chunksBySourceId = new Map(chunks.map((c) => [c.sourceId, c] as const));
  const citations: ValidatedCitation[] = [];
  const seen = new Set<string>();

  for (const rawCitation of rawCitations) {
    const chunk = chunksBySourceId.get(rawCitation.sourceId);
    if (!chunk) continue;

    const quote = normalizeWhitespace(rawCitation.quote);
    if (!quote) continue;

    const quoteStartOffset = chunk.text.indexOf(quote);
    if (quoteStartOffset < 0) continue;

    const quoteEndOffset = quoteStartOffset + quote.length;
    const dedupeKey = `${chunk._id}:${quoteStartOffset}:${quoteEndOffset}`;
    if (seen.has(dedupeKey)) continue;
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

    if (citations.length >= MAX_CITATIONS) break;
  }

  return citations;
}

export function rerankChunks(
  query: string,
  chunks: RetrievedChunk[],
  vectorIds: Id<"documentChunks">[],
  lexicalIds: Id<"documentChunks">[],
): RankedChunk[] {
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
    .sort((a, b) => b.hybridScore - a.hybridScore)
    .slice(0, FINAL_CHUNK_LIMIT)
    .map((chunk, index) => ({ ...chunk, sourceId: `S${index + 1}` }));
}

/* ─── Context retrieval (needs ActionCtx) ────────────────────────── */

export async function embedQuery(query: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  const model = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input: query, encoding_format: "float" }),
  });

  if (!res.ok) {
    throw new Error(
      `OpenAI embeddings error: ${res.status} ${await res.text()}`,
    );
  }

  const data = (await res.json()) as {
    data: Array<{ embedding: number[] }>;
  };
  const values = data.data[0]?.embedding;
  if (!values || values.length === 0)
    throw new Error("Failed to embed the query.");
  return values;
}

export async function getChunkRetrievalContext(
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
    new Set([...vectorResults.map((r) => r._id), ...lexicalIds]),
  );

  if (candidateIds.length === 0) return [];

  const chunks = await ctx.runQuery(internal.chatData.getDocumentChunks, {
    chunkIds: candidateIds,
  });

  return rerankChunks(
    args.query,
    chunks,
    vectorResults.map((r) => r._id),
    lexicalIds,
  );
}

/* ─── Streaming JSON parser ──────────────────────────────────────── */

/**
 * Incrementally extracts the "answer" string value from a streaming
 * JSON response of the form {"answer":"...","citations":[...]}.
 * Returns decoded text to emit on each call to feed().
 */
export function createAnswerExtractor() {
  let rawBuffer = "";
  let answerOffset = -1;
  let emittedUpTo = 0;
  let isDone = false;

  return {
    feed(delta: string): string {
      if (isDone || !delta) return "";
      rawBuffer += delta;

      if (answerOffset === -1) {
        const match = rawBuffer.match(/"answer"\s*:\s*"/);
        if (match !== null && match.index !== undefined) {
          answerOffset = match.index + match[0].length;
          emittedUpTo = 0;
        }
      }

      if (answerOffset === -1) return "";

      const slice = rawBuffer.slice(answerOffset + emittedUpTo);
      let decoded = "";
      let i = 0;

      while (i < slice.length) {
        const ch = slice[i];
        if (ch === "\\") {
          if (i + 1 >= slice.length) break; // incomplete escape — wait for next chunk
          const next = slice[i + 1];
          if (next === '"') decoded += '"';
          else if (next === "\\") decoded += "\\";
          else if (next === "n") decoded += "\n";
          else if (next === "t") decoded += "\t";
          else if (next === "r") decoded += "\r";
          else decoded += next;
          i += 2;
        } else if (ch === '"') {
          isDone = true;
          i++;
          break;
        } else {
          decoded += ch;
          i++;
        }
      }

      emittedUpTo += i;
      return decoded;
    },
    get complete() {
      return isDone;
    },
    get rawBuffer() {
      return rawBuffer;
    },
  };
}
