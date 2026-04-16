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
const EMBEDDING_REQUEST_BATCH_SIZE = 8;
const OCR_METHOD = "document_ai_batch" as const;

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

type EmbeddedPage = PageText & {
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

function getEmbeddingInput(page: PageText) {
  return page.extractedText.trim().length > 0
    ? page.extractedText
    : `[No extractable text found on page ${page.pageNumber} of the PDF.]`;
}

async function embedDocumentPages(pages: PageText[]) {
  if (pages.length === 0) {
    const { embeddingModel } = createVertexEmbeddingClient();
    return {
      embeddingModel,
      embeddedPages: [] as EmbeddedPage[],
    };
  }

  const { client, embeddingModel } = createVertexEmbeddingClient();
  const embeddedPages: EmbeddedPage[] = [];

  for (const batch of getBatches(pages, EMBEDDING_REQUEST_BATCH_SIZE)) {
    const response = await client.models.embedContent({
      model: embeddingModel,
      contents: batch.map(getEmbeddingInput),
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

    for (const [index, page] of batch.entries()) {
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
          "Vertex AI truncated an embedding input. Reduce the page payload before retrying.",
        );
      }

      embeddedPages.push({
        ...page,
        embedding: values,
        embeddingModel,
        ...(embedding.statistics?.tokenCount !== undefined
          ? { embeddingTokenCount: embedding.statistics.tokenCount }
          : {}),
      });
    }
  }

  return {
    embeddingModel,
    embeddedPages,
  };
}

async function persistDocumentPages(
  ctx: Pick<ActionCtx, "runMutation">,
  document: DocumentSnapshot,
  pages: EmbeddedPage[],
) {
  await ctx.runMutation(internal.documentProcessingState.clearDocumentPages, {
    documentId: document.documentId,
  });

  for (const batch of getBatches(pages, EMBEDDING_REQUEST_BATCH_SIZE)) {
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
      internal.documentProcessingState.beginProcessingAttempt,
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
      const { embeddingModel, embeddedPages } = await embedDocumentPages(pages);

      await persistDocumentPages(ctx, document, embeddedPages);
      await ctx.runMutation(
        internal.documentProcessingState.completeProcessingSuccess,
        {
          documentId: document.documentId,
          attemptNumber: args.attemptNumber,
          ocrMethod: result.method,
          ocrModelOrProcessor: clients.processorName,
          embeddingModel,
          embeddedPageCount: embeddedPages.length,
          ocrGcsInputUri: batchMetadata.inputUri,
          ocrGcsOutputPrefix: batchMetadata.outputPrefix,
          ocrFinalJsonGcsUri: batchMetadata.finalJsonUri,
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
