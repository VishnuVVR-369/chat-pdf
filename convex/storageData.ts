import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

export const getStorageMetadata = internalQuery({
  args: {
    storageId: v.id("_storage"),
  },
  returns: v.union(
    v.object({
      contentType: v.optional(v.string()),
      sha256: v.string(),
      size: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const metadata = await ctx.db.system.get("_storage", args.storageId);

    if (!metadata) return null;

    return {
      ...(metadata.contentType !== undefined
        ? { contentType: metadata.contentType }
        : {}),
      sha256: metadata.sha256,
      size: metadata.size,
    };
  },
});
