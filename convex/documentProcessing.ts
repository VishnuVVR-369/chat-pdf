"use node";

import { Mistral } from "@mistralai/mistralai";
import type {
  OCRPageObject,
  OCRResponse,
} from "@mistralai/mistralai/models/components";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { internalAction } from "./_generated/server";
import { buildDocumentChunks, type DocumentChunk } from "./documentChunking";
import { createOpenAiEmbeddingClient, loadOpenAiChatConfig } from "./openAi";
import { modelSupportsTemperature } from "./modelCapabilities";
import { MAX_SUMMARY_COMPLETION_TOKENS } from "../src/constants/chat";

const MAX_PROCESSING_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [15_000, 60_000];
const OCR_PAGE_LIMIT = 100;
const EMBEDDING_DIMENSIONS = 1536;
const EMBEDDING_REQUEST_BATCH_SIZE = 64;
const DOCUMENT_PAGE_BATCH_SIZE = 32;
const PAGE_SUMMARY_BATCH_SIZE = 10;
const OCR_METHOD = "mistral_ocr" as const;
const DEFAULT_MISTRAL_OCR_MODEL = "mistral-ocr-4-0";
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
  fileStorageId: Id<"_storage"> | null;
  ocrResultStorageId: Id<"_storage"> | null;
};

type StoredOcrPayload = {
  provider: "mistral";
  model: string;
  mistralFileId: string;
  generatedAt: string;
  response: OCRResponse;
};

type MistralOcrResult = {
  method: OcrMethod;
  model: string;
  mistralFileId: string;
  pages: OCRPageObject[];
  ocrResultStorageId: Id<"_storage">;
};

type PageText = {
  pageNumber: number;
  extractedText: string;
};

type SummarizedPage = PageText & {
  summary: string;
};

type EmbeddedChunk = DocumentChunk & {
  embedding: number[];
  embeddingModel: string;
  embeddingTokenCount?: number;
};

function normalizeExtractedText(text: string) {
  return text.replace(/\u0000/g, "").trim();
}

function extractPageTexts(pages: OCRPageObject[], expectedPageCount: number) {
  const extractedTextByPageNumber = new Map<number, string>();

  for (const page of pages) {
    extractedTextByPageNumber.set(
      page.index + 1,
      normalizeExtractedText(page.markdown),
    );
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

  if (pageCount > OCR_PAGE_LIMIT) {
    throw new Error(
      `Mistral OCR supports up to ${OCR_PAGE_LIMIT} pages in this pipeline. Received ${pageCount} pages.`,
    );
  }

  return OCR_METHOD;
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
      ...(modelSupportsTemperature(chatModel) ? { temperature } : {}),
      max_completion_tokens: MAX_SUMMARY_COMPLETION_TOKENS,
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

function loadMistralOcrConfig() {
  const apiKey = process.env.MISTRAL_API_KEY;

  if (!apiKey) {
    throw new Error("MISTRAL_API_KEY is required for OCR.");
  }

  return {
    apiKey,
    ocrModel: process.env.MISTRAL_OCR_MODEL ?? DEFAULT_MISTRAL_OCR_MODEL,
  };
}

function createMistralOcrClient() {
  const { apiKey, ocrModel } = loadMistralOcrConfig();

  return {
    client: new Mistral({ apiKey }),
    ocrModel,
  };
}

async function runMistralOcr(
  ctx: Pick<ActionCtx, "storage">,
  document: DocumentSnapshot,
): Promise<MistralOcrResult> {
  if (!document.fileStorageId) {
    throw new Error("The uploaded PDF is missing its Convex storage id.");
  }

  const pdfBlob = await ctx.storage.get(document.fileStorageId);

  if (!pdfBlob) {
    throw new Error("The uploaded PDF could not be found in Convex storage.");
  }

  const { client, ocrModel } = createMistralOcrClient();
  const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());
  const uploadedPdf = await client.files.upload({
    file: {
      fileName: document.originalFilename,
      content: pdfBytes,
    },
    purpose: "ocr",
  });
  const response = await client.ocr.process({
    model: ocrModel,
    document: {
      type: "file",
      fileId: uploadedPdf.id,
    },
    tableFormat: "markdown",
    includeImageBase64: false,
    includeBlocks: true,
    confidenceScoresGranularity: "page",
  });
  const payload: StoredOcrPayload = {
    provider: "mistral",
    model: response.model,
    mistralFileId: uploadedPdf.id,
    generatedAt: new Date().toISOString(),
    response,
  };
  const ocrResultStorageId = await ctx.storage.store(
    new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    }),
  );

  // The parsed OCR result is now persisted in Convex storage, so the uploaded
  // copy on Mistral's side is no longer needed. Best-effort cleanup.
  try {
    await client.files.delete({ fileId: uploadedPdf.id });
  } catch {
    // Ignore cleanup failures; an orphaned Mistral file must not fail OCR.
  }

  return {
    method: OCR_METHOD,
    model: response.model,
    mistralFileId: uploadedPdf.id,
    pages: response.pages,
    ocrResultStorageId,
  };
}

async function loadCheckpointedOcr(
  ctx: Pick<ActionCtx, "storage">,
  ocrResultStorageId: Id<"_storage">,
): Promise<MistralOcrResult> {
  const blob = await ctx.storage.get(ocrResultStorageId);

  if (!blob) {
    throw new Error("Checkpointed OCR result is missing from Convex storage.");
  }

  const payload = JSON.parse(await blob.text()) as StoredOcrPayload;

  return {
    method: OCR_METHOD,
    model: payload.model,
    mistralFileId: payload.mistralFileId,
    pages: payload.response.pages,
    ocrResultStorageId,
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

    let ocrMethod: OcrMethod | undefined;
    let mistralFileId: string | undefined;

    try {
      ocrMethod = getOcrMethod(document.pageCount);

      // Reuse a prior attempt's OCR output instead of re-running the (costly)
      // Mistral OCR call when a transient failure happened after OCR succeeded.
      let result: MistralOcrResult;
      if (document.ocrResultStorageId) {
        result = await loadCheckpointedOcr(ctx, document.ocrResultStorageId);
      } else {
        result = await runMistralOcr(ctx, document);
        await ctx.runMutation(internal.documents.recordOcrCheckpoint, {
          documentId: document.documentId,
          attemptNumber: args.attemptNumber,
          ocrResultStorageId: result.ocrResultStorageId,
          ocrMethod: result.method,
          ocrModel: result.model,
          ...(result.mistralFileId !== undefined
            ? { mistralFileId: result.mistralFileId }
            : {}),
        });
      }
      mistralFileId = result.mistralFileId;
      const pages = extractPageTexts(result.pages, document.pageCount);
      const chunks = buildDocumentChunks(result.pages, document.pageCount);
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
        ocrModel: result.model,
        mistralFileId: result.mistralFileId,
        ocrResultStorageId: result.ocrResultStorageId,
        embeddingModel,
        summaryModel,
        documentSummary: summary,
        embeddedPageCount: summarizedPages.length,
        embeddedChunkCount: embeddedChunks.length,
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
        ...(mistralFileId !== undefined ? { mistralFileId } : {}),
      });
    }

    return null;
  },
});
