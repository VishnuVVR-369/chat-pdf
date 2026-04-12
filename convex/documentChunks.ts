"use node";

import { v } from "convex/values";
import type { ActionCtx, QueryCtx } from "./_generated/server";
import { action } from "./_generated/server";
import {
  searchSimilarChunksForOwner,
  type SearchChunkResult,
} from "./documentChunkSearch";

async function requireCurrentUser(ctx: ActionCtx | QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new Error("Authentication required.");
  }

  return identity;
}

export const searchSimilarChunks = action({
  args: {
    query: v.string(),
    documentId: v.optional(v.id("documents")),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("documentChunks"),
      _creationTime: v.number(),
      documentId: v.id("documents"),
      startPageNumber: v.number(),
      endPageNumber: v.number(),
      text: v.string(),
      tokenCount: v.optional(v.number()),
      score: v.number(),
    }),
  ),
  handler: async (ctx, args): Promise<SearchChunkResult[]> => {
    const identity = await requireCurrentUser(ctx);
    return await searchSimilarChunksForOwner(ctx, {
      ownerTokenIdentifier: identity.tokenIdentifier,
      query: args.query,
      documentId: args.documentId,
      limit: args.limit,
    });
  },
});
