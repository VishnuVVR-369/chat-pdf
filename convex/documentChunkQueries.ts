import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

export const getOwnedChunksByIds = internalQuery({
  args: {
    chunkIds: v.array(v.id("documentChunks")),
    ownerTokenIdentifier: v.string(),
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
    }),
  ),
  handler: async (ctx, args) => {
    const chunks = await Promise.all(
      args.chunkIds.map((chunkId) => ctx.db.get(chunkId)),
    );

    return chunks.flatMap((chunk) => {
      if (!chunk || chunk.ownerTokenIdentifier !== args.ownerTokenIdentifier) {
        return [];
      }

      return [
        {
          _id: chunk._id,
          _creationTime: chunk._creationTime,
          documentId: chunk.documentId,
          startPageNumber: chunk.startPageNumber,
          endPageNumber: chunk.endPageNumber,
          text: chunk.text,
          tokenCount: chunk.tokenCount,
        },
      ];
    });
  },
});
