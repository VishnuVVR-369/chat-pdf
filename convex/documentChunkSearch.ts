"use node";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { createVertexEmbeddingClient } from "./googleCloud";

const EMBEDDING_DIMENSIONS = 3072;

export type OwnedChunkRecord = {
  _id: Id<"documentChunks">;
  _creationTime: number;
  documentId: Id<"documents">;
  startPageNumber: number;
  endPageNumber: number;
  text: string;
  tokenCount?: number;
};

export type SearchChunkResult = OwnedChunkRecord & {
  score: number;
};

type SearchCtx = Pick<ActionCtx, "runQuery" | "vectorSearch">;

function normalizeLimit(limit: number | undefined) {
  return Math.min(Math.max(limit ?? 8, 1), 20);
}

async function createQueryEmbedding(query: string) {
  const { client, embeddingModel } = createVertexEmbeddingClient();
  const response = await client.models.embedContent({
    model: embeddingModel,
    contents: [query],
    config: {
      taskType: "RETRIEVAL_QUERY",
      mimeType: "text/plain",
      autoTruncate: false,
    },
  });

  const vector = response.embeddings?.[0]?.values;

  if (!vector || vector.length === 0) {
    throw new Error("Vertex AI returned an empty query embedding.");
  }

  if (vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Vertex AI returned ${vector.length} embedding dimensions, expected ${EMBEDDING_DIMENSIONS}.`,
    );
  }

  return vector;
}

export async function searchSimilarChunksForOwner(
  ctx: SearchCtx,
  args: {
    ownerTokenIdentifier: string;
    query: string;
    documentId?: Id<"documents">;
    limit?: number;
  },
): Promise<SearchChunkResult[]> {
  const normalizedQuery = args.query.trim();

  if (!normalizedQuery) {
    return [];
  }

  const vector = await createQueryEmbedding(normalizedQuery);
  const limit = normalizeLimit(args.limit);
  const searchResults = await ctx.vectorSearch(
    "documentChunks",
    "by_embedding",
    {
      vector,
      limit,
      filter: (q) =>
        args.documentId
          ? q.eq(
              "ownerDocumentKey",
              `${args.ownerTokenIdentifier}:${args.documentId}`,
            )
          : q.eq("ownerTokenIdentifier", args.ownerTokenIdentifier),
    },
  );

  if (searchResults.length === 0) {
    return [];
  }

  const chunks: OwnedChunkRecord[] = await ctx.runQuery(
    internal.documentChunkQueries.getOwnedChunksByIds,
    {
      chunkIds: searchResults.map((result) => result._id),
      ownerTokenIdentifier: args.ownerTokenIdentifier,
    },
  );
  const scoreById = new Map<Id<"documentChunks">, number>(
    searchResults.map((result) => [result._id, result._score]),
  );

  return chunks.map((chunk) => ({
    ...chunk,
    score: scoreById.get(chunk._id) ?? 0,
  }));
}
