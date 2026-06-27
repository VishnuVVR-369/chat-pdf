import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation } from "./_generated/server";

const DIRECT_UPLOAD_EXPIRY_MS = 30 * 60 * 1000;

async function requireCurrentUser(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new Error("Authentication required.");
  }

  return identity;
}

export const createDirectUploadTarget = mutation({
  args: {
    filename: v.string(),
    contentType: v.optional(v.string()),
  },
  returns: v.object({
    documentId: v.id("documents"),
    uploadUrl: v.string(),
    method: v.literal("POST"),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    documentId: Id<"documents">;
    uploadUrl: string;
    method: "POST";
  }> => {
    const ownerTokenIdentifier = (await requireCurrentUser(ctx))
      .tokenIdentifier;
    const uploadUrl = await ctx.storage.generateUploadUrl();
    const documentId: Id<"documents"> = await ctx.runMutation(
      internal.documents.reserveDirectUploadDocument,
      {
        filename: args.filename,
        ownerTokenIdentifier,
        ...(args.contentType !== undefined
          ? { contentType: args.contentType }
          : {}),
      },
    );

    await ctx.scheduler.runAfter(
      DIRECT_UPLOAD_EXPIRY_MS,
      internal.documentUploads.expireDirectUploadReservation,
      {
        documentId,
        ownerTokenIdentifier,
      },
    );

    return {
      documentId,
      uploadUrl,
      method: "POST" as const,
    };
  },
});
