"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { action } from "./_generated/server";
import { createGoogleClients } from "./googleCloud";

function parseGcsUri(uri: string) {
  const match = /^gs:\/\/([^/]+)\/(.+)$/.exec(uri);

  if (!match) {
    throw new Error("Invalid GCS URI.");
  }

  return {
    bucketName: match[1],
    objectName: match[2],
  };
}

async function requireCurrentUser(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new Error("Authentication required.");
  }

  return identity;
}

export const getDocumentPdfUrl = action({
  args: {
    documentId: v.id("documents"),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args): Promise<string | null> => {
    const identity = await requireCurrentUser(ctx);
    const document = await ctx.runQuery(internal.documents.getOwnedDocument, {
      documentId: args.documentId,
      ownerTokenIdentifier: identity.tokenIdentifier,
    });

    if (!document?.ocrGcsInputUri) {
      return null;
    }

    const { storageClient } = createGoogleClients();
    const { bucketName, objectName } = parseGcsUri(document.ocrGcsInputUri);
    const [signedUrl] = await storageClient
      .bucket(bucketName)
      .file(objectName)
      .getSignedUrl({
        action: "read",
        expires: Date.now() + 15 * 60 * 1000,
      });

    return signedUrl;
  },
});
