"use node";

import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { action } from "./_generated/server";
import { createGoogleClients } from "./googleCloud";
import { MAX_PDF_PAGES } from "../src/constants/pdf";

function isPasswordProtectedPdfError(error: unknown) {
  return (
    error instanceof Error &&
    (error.message.toLowerCase().includes("password") ||
      error.message.toLowerCase().includes("encrypt"))
  );
}

async function requireCurrentUser(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new Error("Authentication required.");
  }

  return identity;
}

async function readPdfPageCount(bytes: Uint8Array) {
  const document = await PDFDocument.load(bytes, {
    ignoreEncryption: false,
    throwOnInvalidObject: true,
    updateMetadata: false,
  });
  return document.getPageCount();
}

function buildObjectName(
  prefix: string,
  documentId: Id<"documents">,
  filename: string,
) {
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return `${prefix}/${documentId}/${safeFilename}`;
}

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

export const createDirectUploadTarget = action({
  args: {
    filename: v.string(),
    contentType: v.optional(v.string()),
  },
  returns: v.object({
    documentId: v.id("documents"),
    uploadUrl: v.string(),
    gcsUri: v.string(),
    method: v.literal("PUT"),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    documentId: Id<"documents">;
    uploadUrl: string;
    gcsUri: string;
    method: "PUT";
  }> => {
    const identity = await requireCurrentUser(ctx);
    const clients = createGoogleClients();
    const provisionalDocumentId: Id<"documents"> = await ctx.runMutation(
      internal.documents.reserveDirectUploadDocument,
      {
        filename: args.filename,
        ownerTokenIdentifier: identity.tokenIdentifier,
        contentType: args.contentType,
      },
    );

    const objectName = buildObjectName(
      clients.inputPrefix,
      provisionalDocumentId,
      args.filename,
    );
    const gcsUri = `gs://${clients.bucketName}/${objectName}`;

    await ctx.runMutation(
      internal.documentProcessingState.setDocumentInputGcsUri,
      {
        documentId: provisionalDocumentId,
        attemptNumber: 0,
        ocrGcsInputUri: gcsUri,
      },
    );

    const [uploadUrl] = await clients.storageClient
      .bucket(clients.bucketName)
      .file(objectName)
      .getSignedUrl({
        version: "v4",
        action: "write",
        expires: Date.now() + 15 * 60 * 1000,
        contentType: args.contentType ?? "application/pdf",
      });

    return {
      documentId: provisionalDocumentId,
      uploadUrl,
      gcsUri,
      method: "PUT",
    };
  },
});

export const completeDirectUpload = action({
  args: {
    documentId: v.id("documents"),
  },
  returns: v.id("documents"),
  handler: async (ctx, args): Promise<Id<"documents">> => {
    const identity = await requireCurrentUser(ctx);
    const clients = createGoogleClients();
    const document = await ctx.runQuery(internal.documents.getOwnedDocument, {
      documentId: args.documentId,
      ownerTokenIdentifier: identity.tokenIdentifier,
    });

    if (!document?.ocrGcsInputUri) {
      throw new Error("Uploaded PDF could not be found in GCS.");
    }

    const { bucketName, objectName } = parseGcsUri(document.ocrGcsInputUri);
    const file = clients.storageClient.bucket(bucketName).file(objectName);
    const [metadata] = await file.getMetadata();
    const [contents] = await file.download();

    if (!contents || contents.length === 0) {
      await file.delete({ ignoreNotFound: true });
      await ctx.runMutation(internal.documents.deleteReservedDocument, {
        documentId: args.documentId,
        ownerTokenIdentifier: identity.tokenIdentifier,
      });
      throw new Error("Uploaded PDF is empty.");
    }

    const signature = contents.subarray(0, 5).toString("utf-8");

    if (signature !== "%PDF-") {
      await file.delete({ ignoreNotFound: true });
      await ctx.runMutation(internal.documents.deleteReservedDocument, {
        documentId: args.documentId,
        ownerTokenIdentifier: identity.tokenIdentifier,
      });
      throw new Error("Only valid PDF files can be uploaded.");
    }

    try {
      const pageCount = await readPdfPageCount(contents);

      if (pageCount > MAX_PDF_PAGES) {
        throw new Error(
          `PDFs must be ${MAX_PDF_PAGES} pages or fewer. This PDF has ${pageCount} pages.`,
        );
      }

      const completed = await ctx.runMutation(
        internal.documents.completeDirectUploadRecord,
        {
          documentId: args.documentId,
          ownerTokenIdentifier: identity.tokenIdentifier,
          contentType: metadata.contentType ?? "application/pdf",
          storageSize: Number(metadata.size ?? contents.length),
          sha256: createHash("sha256").update(contents).digest("hex"),
          pageCount,
        },
      );

      if (!completed) {
        throw new Error("Document upload could not be finalized.");
      }

      return args.documentId;
    } catch (error) {
      await file.delete({ ignoreNotFound: true });
      await ctx.runMutation(internal.documents.deleteReservedDocument, {
        documentId: args.documentId,
        ownerTokenIdentifier: identity.tokenIdentifier,
      });

      if (isPasswordProtectedPdfError(error)) {
        throw new Error("This PDF is password-protected or encrypted.");
      }

      if (error instanceof Error && error.message.includes("pages or fewer")) {
        throw error;
      }

      throw new Error("Could not validate the uploaded PDF.");
    }
  },
});
