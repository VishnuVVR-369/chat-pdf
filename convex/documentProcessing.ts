"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { internalAction } from "./_generated/server";
import {
  createGoogleClients,
  createVertexEmbeddingClient,
} from "./googleCloud";

const MAX_PROCESSING_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [15_000, 60_000];
const BATCH_PAGE_LIMIT = 100;
const EMBEDDING_DIMENSIONS = 3072;
const MAX_CHUNK_CHARS = 3_500;
const CHUNK_OVERLAP_CHARS = 300;
const MIN_CHUNK_WORDS = 300;
const EMBEDDING_REQUEST_BATCH_SIZE = 8;

type OcrMethod =
  | "document_ai_online"
  | "document_ai_online_imageless"
  | "document_ai_batch";

type DocumentSnapshot = {
  documentId: Id<"documents">;
  ownerTokenIdentifier: string;
  storageId: Id<"_storage"> | null;
  originalFilename: string;
  pageCount: number;
  sha256: string;
  storageSize: number;
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
  batch?: {
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

type DocumentChunkDraft = {
  startPageNumber: number;
  endPageNumber: number;
  text: string;
};

type EmbeddedDocumentChunk = DocumentChunkDraft & {
  tokenCount?: number;
  embedding: number[];
};

type ChunkWordEntry = {
  word: string;
  pageNumber: number;
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

function extractPageTexts(documents: DocumentLike[]) {
  const pages = documents.flatMap((document) => {
    const fullText = document.text ?? "";
    const documentPages = document.pages ?? [];

    if (documentPages.length === 0 && fullText.trim().length > 0) {
      return [
        {
          pageNumber: 1,
          extractedText: normalizeExtractedText(fullText),
        },
      ];
    }

    return documentPages
      .map((page, index) => {
        const extractedText = normalizeExtractedText(
          extractTextFromAnchor(fullText, page.layout?.textAnchor),
        );

        if (!extractedText) {
          return null;
        }

        return {
          pageNumber:
            typeof page.pageNumber === "number" && page.pageNumber > 0
              ? page.pageNumber
              : index + 1,
          extractedText,
        };
      })
      .filter((page): page is PageText => page !== null);
  });

  const uniquePages = new Map<number, string>();
  for (const page of pages) {
    uniquePages.set(page.pageNumber, page.extractedText);
  }

  return Array.from(uniquePages.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([pageNumber, extractedText]) => ({
      pageNumber,
      extractedText,
    }));
}

function chunkPageTexts(pages: PageText[]) {
  const batches: PageText[][] = [];
  let currentBatch: PageText[] = [];
  let currentChars = 0;

  for (const page of pages) {
    const pageChars = page.extractedText.length;
    if (
      currentBatch.length > 0 &&
      (currentBatch.length >= 10 || currentChars + pageChars > 150_000)
    ) {
      batches.push(currentBatch);
      currentBatch = [];
      currentChars = 0;
    }

    currentBatch.push(page);
    currentChars += pageChars;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

function normalizeChunkSourceText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function getChunkWords(text: string) {
  const normalizedText = normalizeChunkSourceText(text);
  if (!normalizedText) {
    return [];
  }

  return normalizedText.split(" ").filter(Boolean);
}

function buildDocumentChunks(pages: PageText[]) {
  const words = pages.flatMap<ChunkWordEntry>((page) =>
    getChunkWords(page.extractedText).map((word) => ({
      word,
      pageNumber: page.pageNumber,
    })),
  );

  if (words.length === 0) {
    return [];
  }

  const chunks: DocumentChunkDraft[] = [];
  let start = 0;

  while (start < words.length) {
    let end = start;
    let currentLength = 0;

    while (end < words.length) {
      const nextLength = words[end].word.length + (end > start ? 1 : 0);
      if (currentLength + nextLength > MAX_CHUNK_CHARS) {
        break;
      }
      currentLength += nextLength;
      end += 1;
    }

    if (end === start) {
      end += 1;
    }

    const remainingWords = words.length - end;
    if (
      remainingWords > 0 &&
      remainingWords < MIN_CHUNK_WORDS &&
      end - start > MIN_CHUNK_WORDS
    ) {
      end = Math.max(start + MIN_CHUNK_WORDS, words.length - MIN_CHUNK_WORDS);
    }

    chunks.push({
      startPageNumber: words[start].pageNumber,
      endPageNumber: words[end - 1].pageNumber,
      text: words
        .slice(start, end)
        .map((entry) => entry.word)
        .join(" "),
    });

    if (end >= words.length) {
      break;
    }

    let overlapStart = end;
    let overlapLength = 0;

    while (overlapStart > start) {
      const nextLength = words[overlapStart - 1].word.length + 1;
      if (overlapLength + nextLength > CHUNK_OVERLAP_CHARS) {
        break;
      }
      overlapLength += nextLength;
      overlapStart -= 1;
    }

    start = overlapStart === end ? end - 1 : overlapStart;
  }

  return chunks;
}

function getOcrMethod(pageCount: number): OcrMethod {
  if (pageCount <= BATCH_PAGE_LIMIT) {
    return "document_ai_batch";
  }

  throw new Error(
    `Document OCR supports up to ${BATCH_PAGE_LIMIT} pages. Received ${pageCount} pages.`,
  );
}

function buildObjectName(prefix: string, document: DocumentSnapshot) {
  const safeFilename = document.originalFilename.replace(
    /[^a-zA-Z0-9._-]+/g,
    "_",
  );
  return `${prefix}/${document.documentId}/${safeFilename}`;
}

async function writeFinalOcrPayloadToGcs(
  clients: GoogleClients,
  outputPrefix: string,
  payload: StoredOcrPayload,
) {
  const finalObjectName = `${outputPrefix}/final.json`;
  const finalJson = JSON.stringify(payload, null, 2);
  await clients.storageClient
    .bucket(clients.bucketName)
    .file(finalObjectName)
    .save(finalJson, {
      contentType: "application/json",
      resumable: false,
    });
  return `gs://${clients.bucketName}/${finalObjectName}`;
}

async function persistDocumentPages(
  ctx: Pick<ActionCtx, "runMutation">,
  document: DocumentSnapshot,
  pages: PageText[],
) {
  await ctx.runMutation(internal.documentProcessingState.clearDocumentPages, {
    documentId: document.documentId,
  });

  for (const batch of chunkPageTexts(pages)) {
    await ctx.runMutation(
      internal.documentProcessingState.insertDocumentPageBatch,
      {
        documentId: document.documentId,
        ownerTokenIdentifier: document.ownerTokenIdentifier,
        pages: batch,
      },
    );
  }
}

function getChunkBatches<T>(items: T[], batchSize: number) {
  const batches: T[][] = [];

  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }

  return batches;
}

async function embedDocumentChunks(chunks: DocumentChunkDraft[]) {
  if (chunks.length === 0) {
    return [];
  }

  const { client, embeddingModel } = createVertexEmbeddingClient();
  const embeddedChunks: EmbeddedDocumentChunk[] = [];

  for (const batch of getChunkBatches(chunks, EMBEDDING_REQUEST_BATCH_SIZE)) {
    const response = await client.models.embedContent({
      model: embeddingModel,
      contents: batch.map((chunk) => chunk.text),
      config: {
        taskType: "RETRIEVAL_DOCUMENT",
        mimeType: "text/plain",
        autoTruncate: false,
      },
    });

    const embeddings = response.embeddings ?? [];

    if (embeddings.length !== batch.length) {
      throw new Error("Vertex AI returned an unexpected embedding batch size.");
    }

    for (const [index, chunk] of batch.entries()) {
      const embedding = embeddings[index];
      const values = embedding?.values;

      if (!values || values.length === 0) {
        throw new Error("Vertex AI returned an empty embedding vector.");
      }

      if (values.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Vertex AI returned ${values.length} embedding dimensions, expected ${EMBEDDING_DIMENSIONS}.`,
        );
      }

      if (embedding.statistics?.truncated) {
        throw new Error(
          "Vertex AI truncated an embedding input. Reduce chunk size before retrying.",
        );
      }

      embeddedChunks.push({
        ...chunk,
        tokenCount: embedding.statistics?.tokenCount,
        embedding: values,
      });
    }
  }

  return embeddedChunks;
}

async function persistDocumentChunks(
  ctx: Pick<ActionCtx, "runMutation">,
  document: DocumentSnapshot,
  chunks: EmbeddedDocumentChunk[],
) {
  await ctx.runMutation(internal.documentProcessingState.clearDocumentChunks, {
    documentId: document.documentId,
  });

  for (const batch of getChunkBatches(chunks, EMBEDDING_REQUEST_BATCH_SIZE)) {
    await ctx.runMutation(
      internal.documentProcessingState.insertDocumentChunkBatch,
      {
        documentId: document.documentId,
        ownerTokenIdentifier: document.ownerTokenIdentifier,
        chunks: batch,
      },
    );
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

async function readConvexFile(
  ctx: Pick<ActionCtx, "storage">,
  storageId: Id<"_storage">,
) {
  const blob = await ctx.storage.get(storageId);
  if (!blob) {
    throw new Error("The uploaded PDF could not be read from Convex storage.");
  }
  return Buffer.from(await blob.arrayBuffer());
}

async function runBatchOcr(
  ctx: Pick<ActionCtx, "storage" | "runMutation">,
  clients: GoogleClients,
  document: DocumentSnapshot,
  attemptNumber: number,
) {
  const bucket = clients.storageClient.bucket(clients.bucketName);
  const inputObjectName = document.ocrGcsInputUri
    ? document.ocrGcsInputUri.replace(`gs://${clients.bucketName}/`, "")
    : buildObjectName(clients.inputPrefix, document);
  const outputPrefix = `${clients.outputPrefix}/${document.documentId}`;
  const inputUri =
    document.ocrGcsInputUri ?? `gs://${clients.bucketName}/${inputObjectName}`;
  const outputUri = `gs://${clients.bucketName}/${outputPrefix}/`;

  if (!document.ocrGcsInputUri) {
    if (!document.storageId) {
      throw new Error("The uploaded PDF is missing from both Convex and GCS.");
    }
    const fileBytes = await readConvexFile(ctx, document.storageId);
    await bucket.file(inputObjectName).save(fileBytes, {
      contentType: "application/pdf",
      resumable: false,
    });
    await ctx.runMutation(
      internal.documentProcessingState.setDocumentInputGcsUri,
      {
        documentId: document.documentId,
        attemptNumber,
        ocrGcsInputUri: inputUri,
      },
    );
    await ctx.storage.delete(document.storageId);
  }

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
    method: "document_ai_batch" as const,
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
    const document = (await ctx.runMutation(
      internal.documentProcessingState.beginProcessingAttempt,
      {
        documentId: args.documentId,
        attemptNumber: args.attemptNumber,
      },
    )) as DocumentSnapshot | null;

    if (!document) {
      return null;
    }

    let batchMetadata: GcsBatchMetadata | undefined;
    let ocrMethod: OcrMethod | undefined;

    try {
      const clients = createGoogleClients();
      const selectedMethod = getOcrMethod(document.pageCount);
      ocrMethod = selectedMethod;
      const result = await runBatchOcr(
        ctx,
        clients,
        document,
        args.attemptNumber,
      );

      ocrMethod = result.method;

      const payload: StoredOcrPayload = {
        provider: "google_document_ai",
        processorName: clients.processorName,
        method: result.method,
        generatedAt: new Date().toISOString(),
        documents: result.documents,
        batch:
          result.method === "document_ai_batch"
            ? {
                inputUri: result.batch.inputUri,
                outputPrefix: result.batch.outputPrefix,
                outputFiles: result.batch.outputFiles,
              }
            : undefined,
      };

      if (result.method === "document_ai_batch") {
        batchMetadata = {
          inputUri: result.batch.inputUri,
          outputPrefix: result.batch.outputPrefix,
          finalJsonUri: `gs://${clients.bucketName}/${result.batch.outputPrefix}/final.json`,
        };
      }

      if (batchMetadata) {
        batchMetadata.finalJsonUri = await writeFinalOcrPayloadToGcs(
          clients,
          batchMetadata.outputPrefix,
          payload,
        );
      }
      const finalJsonGcsUri = batchMetadata?.finalJsonUri;
      const pages = extractPageTexts(result.documents);
      const chunks = buildDocumentChunks(pages);
      const embeddedChunks = await embedDocumentChunks(chunks);

      await persistDocumentPages(ctx, document, pages);
      await persistDocumentChunks(ctx, document, embeddedChunks);

      await ctx.runMutation(
        internal.documentProcessingState.completeProcessingSuccess,
        {
          documentId: document.documentId,
          attemptNumber: args.attemptNumber,
          ocrMethod: result.method,
          ocrModelOrProcessor: clients.processorName,
          ...(batchMetadata?.inputUri !== undefined
            ? { ocrGcsInputUri: batchMetadata.inputUri }
            : {}),
          ...(batchMetadata?.outputPrefix !== undefined
            ? { ocrGcsOutputPrefix: batchMetadata.outputPrefix }
            : {}),
          ...(finalJsonGcsUri !== undefined
            ? { ocrFinalJsonGcsUri: finalJsonGcsUri }
            : {}),
        },
      );
    } catch (error) {
      const canRetry =
        isTransientError(error) && args.attemptNumber < MAX_PROCESSING_ATTEMPTS;

      if (canRetry) {
        await ctx.runMutation(
          internal.documentProcessingState.markRetryPending,
          {
            documentId: document.documentId,
            attemptNumber: args.attemptNumber,
          },
        );

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

      await ctx.runMutation(
        internal.documentProcessingState.completeProcessingFailure,
        {
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
        },
      );
    }

    return null;
  },
});
