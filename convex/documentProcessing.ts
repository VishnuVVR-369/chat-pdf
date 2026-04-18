"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { internalAction } from "./_generated/server";
import { createGoogleClients } from "./googleCloud";
import { createOpenAiEmbeddingClient, loadOpenAiChatConfig } from "./openAi";

const MAX_PROCESSING_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [15_000, 60_000];
const BATCH_PAGE_LIMIT = 100;
const EMBEDDING_DIMENSIONS = 1536;
const EMBEDDING_REQUEST_BATCH_SIZE = 64;
const DOCUMENT_PAGE_BATCH_SIZE = 32;
const DOCUMENT_CHUNK_WORD_TARGET = 450;
const DOCUMENT_CHUNK_WORD_OVERLAP = 75;
const PAGE_SUMMARY_BATCH_SIZE = 10;
const OCR_METHOD = "document_ai_batch" as const;
const EMPTY_PAGE_SUMMARY = "No meaningful extractable text on this page.";
const EMPTY_DOCUMENT_SUMMARY =
  "No meaningful extractable text was found in this document.";

const pageSummaryResponseFormat = {
  type: "json_schema" as const,
  json_schema: {
    name: "document_page_summaries",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        pages: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              pageNumber: { type: "number" },
              summary: { type: "string" },
            },
            required: ["pageNumber", "summary"],
          },
        },
      },
      required: ["pages"],
    },
  },
};

const documentSummaryResponseFormat = {
  type: "json_schema" as const,
  json_schema: {
    name: "document_summary",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string" },
      },
      required: ["summary"],
    },
  },
};

type OcrMethod = typeof OCR_METHOD;

type DocumentSnapshot = {
  documentId: Id<"documents">;
  ownerTokenIdentifier: string;
  originalFilename: string;
  pageCount: number;
  ocrGcsInputUri: string | null;
};

type GoogleClients = ReturnType<typeof createGoogleClients>;

type GcsBatchMetadata = {
  inputUri: string;
  outputPrefix: string;
  finalJsonUri: string;
};

type StoredOcrPayload = {
  provider: "google_document_ai";
  processorName: string;
  method: OcrMethod;
  generatedAt: string;
  documents: DocumentLike[];
  batch: {
    inputUri: string;
    outputPrefix: string;
    outputFiles: string[];
  };
};

type DocumentLike = {
  text?: string | null;
  pages?: Array<{
    pageNumber?: number | null;
    layout?: {
      textAnchor?: {
        textSegments?: Array<{
          startIndex?: string | number | null;
          endIndex?: string | number | null;
        }> | null;
      } | null;
    } | null;
  }> | null;
};

type PageText = {
  pageNumber: number;
  extractedText: string;
};

type SummarizedPage = PageText & {
  summary: string;
};

type ChunkPageSpan = {
  pageNumber: number;
  startOffset: number;
  endOffset: number;
};

type DocumentChunk = {
  chunkIndex: number;
  startPageNumber: number;
  endPageNumber: number;
  text: string;
  tokenCount: number;
  pageSpans: ChunkPageSpan[];
};

type EmbeddedChunk = DocumentChunk & {
  embedding: number[];
  embeddingModel: string;
  embeddingTokenCount?: number;
};

function coerceTextIndex(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.length > 0) {
    return Number.parseInt(value, 10);
  }

  return 0;
}

function extractTextFromAnchor(
  fullText: string,
  textAnchor:
    | {
        textSegments?: Array<{
          startIndex?: string | number | null;
          endIndex?: string | number | null;
        }> | null;
      }
    | null
    | undefined,
) {
  const segments = textAnchor?.textSegments ?? [];

  if (segments.length === 0) {
    return "";
  }

  return segments
    .map((segment) => {
      const start = coerceTextIndex(segment.startIndex);
      const end = coerceTextIndex(segment.endIndex);
      return fullText.slice(start, end);
    })
    .join("");
}

function normalizeExtractedText(text: string) {
  return text.replace(/\u0000/g, "").trim();
}

function extractPageTexts(
  documents: DocumentLike[],
  expectedPageCount: number,
) {
  const extractedTextByPageNumber = new Map<number, string>();

  for (const document of documents) {
    const fullText = document.text ?? "";
    const documentPages = document.pages ?? [];

    if (documentPages.length === 0 && fullText.trim().length > 0) {
      extractedTextByPageNumber.set(1, normalizeExtractedText(fullText));
      continue;
    }

    for (const [index, page] of documentPages.entries()) {
      const pageNumber =
        typeof page.pageNumber === "number" && page.pageNumber > 0
          ? page.pageNumber
          : index + 1;
      const extractedText = normalizeExtractedText(
        extractTextFromAnchor(fullText, page.layout?.textAnchor),
      );

      extractedTextByPageNumber.set(pageNumber, extractedText);
    }
  }

  const highestDetectedPageNumber = Math.max(
    expectedPageCount,
    ...extractedTextByPageNumber.keys(),
    0,
  );

  return Array.from({ length: highestDetectedPageNumber }, (_, index) => ({
    pageNumber: index + 1,
    extractedText: extractedTextByPageNumber.get(index + 1) ?? "",
  }));
}

function getOcrMethod(pageCount: number): OcrMethod {
  if (pageCount <= 0) {
    throw new Error("The uploaded PDF is missing its page count.");
  }

  if (pageCount > BATCH_PAGE_LIMIT) {
    throw new Error(
      `Document OCR supports up to ${BATCH_PAGE_LIMIT} pages. Received ${pageCount} pages.`,
    );
  }

  return OCR_METHOD;
}

async function writeFinalOcrPayloadToGcs(
  clients: GoogleClients,
  outputPrefix: string,
  payload: StoredOcrPayload,
) {
  const finalObjectName = `${outputPrefix}/final.json`;
  await clients.storageClient
    .bucket(clients.bucketName)
    .file(finalObjectName)
    .save(JSON.stringify(payload, null, 2), {
      contentType: "application/json",
      resumable: false,
    });

  return `gs://${clients.bucketName}/${finalObjectName}`;
}

function getBatches<T>(items: T[], batchSize: number) {
  const batches: T[][] = [];

  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }

  return batches;
}

function getEmbeddingInput(text: string, fallback: string) {
  return text.trim().length > 0 ? text : fallback;
}

function normalizeSummary(summary: string, fallback: string) {
  const normalized = summary.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : fallback;
}

async function fetchStructuredChatCompletion(
  messages: Array<{
    role: "system" | "user";
    content: string;
  }>,
  responseFormat: typeof pageSummaryResponseFormat,
  temperature?: number,
): Promise<{ content: string; model: string }>;
async function fetchStructuredChatCompletion(
  messages: Array<{
    role: "system" | "user";
    content: string;
  }>,
  responseFormat: typeof documentSummaryResponseFormat,
  temperature?: number,
): Promise<{ content: string; model: string }>;
async function fetchStructuredChatCompletion(
  messages: Array<{
    role: "system" | "user";
    content: string;
  }>,
  responseFormat:
    | typeof pageSummaryResponseFormat
    | typeof documentSummaryResponseFormat,
  temperature = 0.1,
) {
  const { apiKey, chatModel } = loadOpenAiChatConfig();
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: chatModel,
      messages,
      temperature,
      response_format: responseFormat,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `OpenAI chat completion error: ${response.status} ${await response.text()}`,
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
      };
    }>;
  };
  const content = payload.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("OpenAI returned an empty structured response.");
  }

  return {
    content,
    model: chatModel,
  };
}

async function generatePageSummaryBatch(pages: PageText[]) {
  const promptPages = pages.map((page) => ({
    pageNumber: page.pageNumber,
    extractedText: page.extractedText,
  }));
  const { content } = await fetchStructuredChatCompletion(
    [
      {
        role: "system",
        content: `You summarize OCR-extracted PDF pages.

Return JSON with a "pages" array. Each output item must correspond to one input page number.

Rules:
- summarize only the provided extracted text
- keep each summary to 1 or 2 sentences
- preserve concrete facts such as names, dates, figures, clauses, and conclusions
- do not speculate or infer beyond the text
- do not omit any input page`,
      },
      {
        role: "user",
        content: JSON.stringify({ pages: promptPages }),
      },
    ],
    pageSummaryResponseFormat,
    0.1,
  );

  const parsed = JSON.parse(content) as {
    pages?: Array<{ pageNumber?: unknown; summary?: unknown }>;
  };
  const entries = parsed.pages;

  if (!Array.isArray(entries)) {
    throw new Error("Page summary response was missing the pages array.");
  }

  const summariesByPageNumber = new Map<number, string>();
  for (const entry of entries) {
    if (
      typeof entry?.pageNumber !== "number" ||
      typeof entry.summary !== "string"
    ) {
      throw new Error("Page summary response contained an invalid item.");
    }

    if (summariesByPageNumber.has(entry.pageNumber)) {
      throw new Error(
        `Page summary response duplicated page ${entry.pageNumber}.`,
      );
    }

    summariesByPageNumber.set(
      entry.pageNumber,
      normalizeSummary(entry.summary, EMPTY_PAGE_SUMMARY),
    );
  }

  return pages.map((page) => {
    const summary = summariesByPageNumber.get(page.pageNumber);
    if (!summary) {
      throw new Error(
        `Page summary response was missing page ${page.pageNumber}.`,
      );
    }

    return {
      pageNumber: page.pageNumber,
      summary,
    };
  });
}

async function generatePageSummaries(pages: PageText[]) {
  const summariesByPageNumber = new Map<number, string>();
  const pagesNeedingSummaries = pages.filter(
    (page) => page.extractedText.trim().length > 0,
  );

  for (const page of pages) {
    if (page.extractedText.trim().length === 0) {
      summariesByPageNumber.set(page.pageNumber, EMPTY_PAGE_SUMMARY);
    }
  }

  for (const batch of getBatches(
    pagesNeedingSummaries,
    PAGE_SUMMARY_BATCH_SIZE,
  )) {
    const batchSummaries = await generatePageSummaryBatch(batch);
    for (const summary of batchSummaries) {
      summariesByPageNumber.set(summary.pageNumber, summary.summary);
    }
  }

  return pages.map((page) => {
    const summary = summariesByPageNumber.get(page.pageNumber);
    if (!summary) {
      throw new Error(`Missing summary for page ${page.pageNumber}.`);
    }

    return {
      ...page,
      summary,
    };
  });
}

async function generateDocumentSummary(pages: SummarizedPage[]) {
  if (pages.every((page) => page.summary === EMPTY_PAGE_SUMMARY)) {
    const { chatModel } = loadOpenAiChatConfig();
    return {
      summary: EMPTY_DOCUMENT_SUMMARY,
      summaryModel: chatModel,
    };
  }

  const { content, model } = await fetchStructuredChatCompletion(
    [
      {
        role: "system",
        content: `You summarize a PDF from page-level summaries.

Return JSON with a single "summary" string.

Rules:
- write a compact, reusable document summary
- cover the overall topic, major sections, and key findings or conclusions
- stay factual and grounded in the provided page summaries
- do not speculate or add information not present in the page summaries`,
      },
      {
        role: "user",
        content: JSON.stringify({
          pages: pages.map((page) => ({
            pageNumber: page.pageNumber,
            summary: page.summary,
          })),
        }),
      },
    ],
    documentSummaryResponseFormat,
    0.1,
  );

  const parsed = JSON.parse(content) as { summary?: unknown };
  if (typeof parsed.summary !== "string") {
    throw new Error("Document summary response was invalid.");
  }

  return {
    summary: normalizeSummary(parsed.summary, EMPTY_DOCUMENT_SUMMARY),
    summaryModel: model,
  };
}

function tokenizeText(text: string) {
  return text.match(/\S+/g) ?? [];
}

function buildDocumentChunks(pages: PageText[]): DocumentChunk[] {
  const allTokens = pages.flatMap((page) =>
    tokenizeText(page.extractedText).map((token) => ({
      pageNumber: page.pageNumber,
      token,
    })),
  );

  if (allTokens.length === 0) {
    const startPageNumber = pages[0]?.pageNumber ?? 1;
    const endPageNumber = pages.at(-1)?.pageNumber ?? startPageNumber;
    const text = "[No extractable text found in this PDF.]";

    return [
      {
        chunkIndex: 0,
        startPageNumber,
        endPageNumber,
        text,
        tokenCount: tokenizeText(text).length,
        pageSpans: [
          {
            pageNumber: startPageNumber,
            startOffset: 0,
            endOffset: text.length,
          },
        ],
      },
    ];
  }

  const chunks: DocumentChunk[] = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < allTokens.length) {
    const end = Math.min(start + DOCUMENT_CHUNK_WORD_TARGET, allTokens.length);
    const slice = allTokens.slice(start, end);
    const parts: string[] = [];
    const pageSpans: ChunkPageSpan[] = [];
    let currentOffset = 0;

    for (const [index, tokenInfo] of slice.entries()) {
      if (index > 0) {
        parts.push(" ");
        currentOffset += 1;
      }

      const startOffset = currentOffset;
      parts.push(tokenInfo.token);
      currentOffset += tokenInfo.token.length;

      const lastPageSpan = pageSpans[pageSpans.length - 1];
      if (lastPageSpan?.pageNumber === tokenInfo.pageNumber) {
        lastPageSpan.endOffset = currentOffset;
      } else {
        pageSpans.push({
          pageNumber: tokenInfo.pageNumber,
          startOffset,
          endOffset: currentOffset,
        });
      }
    }

    chunks.push({
      chunkIndex,
      startPageNumber: pageSpans[0]?.pageNumber ?? slice[0].pageNumber,
      endPageNumber:
        pageSpans[pageSpans.length - 1]?.pageNumber ??
        slice[slice.length - 1].pageNumber,
      text: parts.join(""),
      tokenCount: slice.length,
      pageSpans,
    });

    if (end >= allTokens.length) {
      break;
    }

    start = Math.max(start + 1, end - DOCUMENT_CHUNK_WORD_OVERLAP);
    chunkIndex += 1;
  }

  return chunks;
}

async function embedDocumentChunks(chunks: DocumentChunk[]) {
  if (chunks.length === 0) {
    const { embeddingModel } = createOpenAiEmbeddingClient();
    return {
      embeddingModel,
      embeddedChunks: [] as EmbeddedChunk[],
    };
  }

  const { client, embeddingModel } = createOpenAiEmbeddingClient();
  const embeddedChunks: EmbeddedChunk[] = [];

  for (const batch of getBatches(chunks, EMBEDDING_REQUEST_BATCH_SIZE)) {
    const response = await client.embeddings.create({
      model: embeddingModel,
      input: batch.map((chunk) =>
        getEmbeddingInput(
          chunk.text,
          `[No extractable text found in chunk ${chunk.chunkIndex} of the PDF.]`,
        ),
      ),
      encoding_format: "float",
    });

    const embeddings = response.data ?? [];

    if (embeddings.length !== batch.length) {
      throw new Error("OpenAI returned an unexpected embedding batch size.");
    }

    for (const [index, chunk] of batch.entries()) {
      const embedding = embeddings[index];
      const values = embedding?.embedding;

      if (!values || values.length === 0) {
        throw new Error("OpenAI returned an empty embedding vector.");
      }

      if (values.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `OpenAI returned ${values.length} embedding dimensions, expected ${EMBEDDING_DIMENSIONS}.`,
        );
      }

      embeddedChunks.push({
        ...chunk,
        embedding: values,
        embeddingModel,
      });
    }
  }

  return {
    embeddingModel,
    embeddedChunks,
  };
}

async function persistDocumentContent(
  ctx: Pick<ActionCtx, "runMutation">,
  document: DocumentSnapshot,
  pages: SummarizedPage[],
  chunks: EmbeddedChunk[],
) {
  await ctx.runMutation(internal.documents.clearDocumentPages, {
    documentId: document.documentId,
  });
  await ctx.runMutation(internal.documents.clearDocumentChunks, {
    documentId: document.documentId,
  });

  for (const batch of getBatches(pages, DOCUMENT_PAGE_BATCH_SIZE)) {
    await ctx.runMutation(internal.documents.insertDocumentPageBatch, {
      documentId: document.documentId,
      ownerTokenIdentifier: document.ownerTokenIdentifier,
      pages: batch,
    });
  }

  for (const batch of getBatches(chunks, EMBEDDING_REQUEST_BATCH_SIZE)) {
    await ctx.runMutation(internal.documents.insertDocumentChunkBatch, {
      documentId: document.documentId,
      ownerTokenIdentifier: document.ownerTokenIdentifier,
      chunks: batch,
    });
  }
}

function isTransientError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const candidate = error as Error & {
    code?: number | string;
    status?: number;
  };

  if (
    candidate.status !== undefined &&
    [408, 429, 500, 502, 503, 504].includes(candidate.status)
  ) {
    return true;
  }

  if (
    typeof candidate.code === "number" &&
    [4, 8, 13, 14].includes(candidate.code)
  ) {
    return true;
  }

  if (
    typeof candidate.code === "string" &&
    ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"].includes(candidate.code)
  ) {
    return true;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("temporarily unavailable") ||
    message.includes("connection reset") ||
    message.includes("rate limit")
  );
}

function getDisplayErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "Document OCR failed.";
  }

  return error.message.length > 240
    ? `${error.message.slice(0, 237)}...`
    : error.message;
}

async function runBatchOcr(clients: GoogleClients, document: DocumentSnapshot) {
  if (!document.ocrGcsInputUri) {
    throw new Error("The uploaded PDF is missing its GCS source URI.");
  }

  const bucket = clients.storageClient.bucket(clients.bucketName);
  const inputUri = document.ocrGcsInputUri;
  const outputPrefix = `${clients.outputPrefix}/${document.documentId}`;
  const outputUri = `gs://${clients.bucketName}/${outputPrefix}/`;

  await bucket.deleteFiles({
    prefix: outputPrefix,
    force: true,
  });

  const [operation] = await clients.documentAiClient.batchProcessDocuments({
    name: clients.processorName,
    inputDocuments: {
      gcsDocuments: {
        documents: [
          {
            gcsUri: inputUri,
            mimeType: "application/pdf",
          },
        ],
      },
    },
    documentOutputConfig: {
      gcsOutputConfig: {
        gcsUri: outputUri,
        shardingConfig: {
          pagesPerShard: BATCH_PAGE_LIMIT,
          pagesOverlap: 0,
        },
      },
    },
  });

  await operation.promise();

  const [files] = await bucket.getFiles({
    prefix: outputPrefix,
  });
  const jsonFiles = files.filter((file) => file.name.endsWith(".json"));

  if (jsonFiles.length === 0) {
    throw new Error(
      "Document AI batch processing completed without JSON output.",
    );
  }

  const documents = (
    await Promise.all(
      jsonFiles
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(async (file) => {
          const [contents] = await file.download();
          return JSON.parse(contents.toString("utf-8")) as DocumentLike;
        }),
    )
  ).filter((value): value is DocumentLike => Boolean(value));

  return {
    method: OCR_METHOD,
    documents,
    batch: {
      inputUri,
      outputPrefix,
      outputFiles: jsonFiles.map((file) => file.name),
    },
  };
}

export const runDocumentOcr = internalAction({
  args: {
    documentId: v.id("documents"),
    attemptNumber: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const document = await ctx.runMutation(
      internal.documents.beginProcessingAttempt,
      {
        documentId: args.documentId,
        attemptNumber: args.attemptNumber,
      },
    );

    if (!document) {
      return null;
    }

    let batchMetadata: GcsBatchMetadata | undefined;
    let ocrMethod: OcrMethod | undefined;

    try {
      const clients = createGoogleClients();
      ocrMethod = getOcrMethod(document.pageCount);

      const result = await runBatchOcr(clients, document);
      const payload: StoredOcrPayload = {
        provider: "google_document_ai",
        processorName: clients.processorName,
        method: result.method,
        generatedAt: new Date().toISOString(),
        documents: result.documents,
        batch: {
          inputUri: result.batch.inputUri,
          outputPrefix: result.batch.outputPrefix,
          outputFiles: result.batch.outputFiles,
        },
      };

      batchMetadata = {
        inputUri: result.batch.inputUri,
        outputPrefix: result.batch.outputPrefix,
        finalJsonUri: "",
      };
      batchMetadata.finalJsonUri = await writeFinalOcrPayloadToGcs(
        clients,
        batchMetadata.outputPrefix,
        payload,
      );

      const pages = extractPageTexts(result.documents, document.pageCount);
      const chunks = buildDocumentChunks(pages);
      const { embeddingModel, embeddedChunks } =
        await embedDocumentChunks(chunks);
      const summarizedPages = await generatePageSummaries(pages);
      const { summary, summaryModel } =
        await generateDocumentSummary(summarizedPages);

      await persistDocumentContent(
        ctx,
        document,
        summarizedPages,
        embeddedChunks,
      );
      await ctx.runMutation(internal.documents.completeProcessingSuccess, {
        documentId: document.documentId,
        attemptNumber: args.attemptNumber,
        ocrMethod: result.method,
        ocrModelOrProcessor: clients.processorName,
        embeddingModel,
        summaryModel,
        documentSummary: summary,
        embeddedPageCount: summarizedPages.length,
        embeddedChunkCount: embeddedChunks.length,
        ocrGcsInputUri: batchMetadata.inputUri,
        ocrGcsOutputPrefix: batchMetadata.outputPrefix,
        ocrFinalJsonGcsUri: batchMetadata.finalJsonUri,
      });
    } catch (error) {
      const canRetry =
        isTransientError(error) && args.attemptNumber < MAX_PROCESSING_ATTEMPTS;

      if (canRetry) {
        await ctx.runMutation(internal.documents.markRetryPending, {
          documentId: document.documentId,
          attemptNumber: args.attemptNumber,
        });

        const retryDelay = RETRY_DELAYS_MS[args.attemptNumber - 1] ?? 60_000;
        await ctx.scheduler.runAfter(
          retryDelay,
          internal.documentProcessing.runDocumentOcr,
          {
            documentId: document.documentId,
            attemptNumber: args.attemptNumber + 1,
          },
        );

        return null;
      }

      await ctx.runMutation(internal.documents.completeProcessingFailure, {
        documentId: document.documentId,
        attemptNumber: args.attemptNumber,
        errorMessage: getDisplayErrorMessage(error),
        ...(ocrMethod !== undefined ? { ocrMethod } : {}),
        ...(batchMetadata?.inputUri !== undefined
          ? { ocrGcsInputUri: batchMetadata.inputUri }
          : {}),
        ...(batchMetadata?.outputPrefix !== undefined
          ? { ocrGcsOutputPrefix: batchMetadata.outputPrefix }
          : {}),
      });
    }

    return null;
  },
});
