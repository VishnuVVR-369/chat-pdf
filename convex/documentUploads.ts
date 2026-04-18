"use node";

import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { Redis } from "@upstash/redis";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { action, internalAction } from "./_generated/server";
import { createGoogleClients } from "./googleCloud";
import { MAX_PDF_PAGES } from "../src/constants/pdf";

const SIGNED_URL_TTL_SECONDS = 840; // 14 min — 60s safety margin before 15-min GCS expiry

const DIRECT_UPLOAD_EXPIRY_MS = 30 * 60 * 1000;

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

async function discardReservedUpload(
  ctx: Pick<ActionCtx, "runMutation">,
  file: { delete(options: { ignoreNotFound: boolean }): Promise<unknown> },
  documentId: Id<"documents">,
  ownerTokenIdentifier: string,
) {
  await file.delete({ ignoreNotFound: true });
  await ctx.runMutation(internal.documents.deleteReservedDocument, {
    documentId,
    ownerTokenIdentifier,
  });
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
    const ownerTokenIdentifier = (await requireCurrentUser(ctx))
      .tokenIdentifier;
    const clients = createGoogleClients();
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

    try {
      const objectName = buildObjectName(
        clients.inputPrefix,
        documentId,
        args.filename,
      );
      const gcsUri = `gs://${clients.bucketName}/${objectName}`;
      const updatedDocument = await ctx.runMutation(
        internal.documents.setReservedDocumentInputGcsUri,
        {
          documentId,
          ownerTokenIdentifier,
          ocrGcsInputUri: gcsUri,
        },
      );

      if (!updatedDocument) {
        throw new Error("Could not reserve the direct upload target.");
      }

      const [uploadUrl] = await clients.storageClient
        .bucket(clients.bucketName)
        .file(objectName)
        .getSignedUrl({
          version: "v4",
          action: "write",
          expires: Date.now() + 15 * 60 * 1000,
          contentType: args.contentType ?? "application/pdf",
        });

      await ctx.scheduler.runAfter(
        DIRECT_UPLOAD_EXPIRY_MS,
        internal.documentUploads.expireDirectUploadReservation,
        {
          documentId,
          ownerTokenIdentifier,
          gcsUri,
        },
      );

      return {
        documentId,
        uploadUrl,
        gcsUri,
        method: "PUT",
      };
    } catch (error) {
      await ctx.runMutation(internal.documents.deleteReservedDocument, {
        documentId,
        ownerTokenIdentifier,
      });

      throw error;
    }
  },
});

export const expireDirectUploadReservation = internalAction({
  args: {
    documentId: v.id("documents"),
    ownerTokenIdentifier: v.string(),
    gcsUri: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const document = await ctx.runQuery(internal.documents.getOwnedDocument, {
      documentId: args.documentId,
      ownerTokenIdentifier: args.ownerTokenIdentifier,
    });

    if (
      !document ||
      document.status !== "uploading" ||
      document.ocrGcsInputUri !== args.gcsUri
    ) {
      return null;
    }

    const { storageClient } = createGoogleClients();
    const { bucketName, objectName } = parseGcsUri(args.gcsUri);
    await storageClient
      .bucket(bucketName)
      .file(objectName)
      .delete({ ignoreNotFound: true });

    await ctx.runMutation(internal.documents.deleteReservedDocument, {
      documentId: args.documentId,
      ownerTokenIdentifier: args.ownerTokenIdentifier,
    });

    return null;
  },
});

export const completeDirectUpload = action({
  args: {
    documentId: v.id("documents"),
  },
  returns: v.id("documents"),
  handler: async (ctx, args): Promise<Id<"documents">> => {
    const ownerTokenIdentifier = (await requireCurrentUser(ctx))
      .tokenIdentifier;
    const clients = createGoogleClients();
    const document = await ctx.runQuery(internal.documents.getOwnedDocument, {
      documentId: args.documentId,
      ownerTokenIdentifier,
    });

    if (!document?.ocrGcsInputUri) {
      throw new Error("Uploaded PDF could not be found in GCS.");
    }

    const { bucketName, objectName } = parseGcsUri(document.ocrGcsInputUri);
    const file = clients.storageClient.bucket(bucketName).file(objectName);
    const [metadata] = await file.getMetadata();
    const [contents] = await file.download();

    if (!contents || contents.length === 0) {
      await discardReservedUpload(
        ctx,
        file,
        args.documentId,
        ownerTokenIdentifier,
      );
      throw new Error("Uploaded PDF is empty.");
    }

    const signature = contents.subarray(0, 5).toString("utf-8");

    if (signature !== "%PDF-") {
      await discardReservedUpload(
        ctx,
        file,
        args.documentId,
        ownerTokenIdentifier,
      );
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
          ownerTokenIdentifier,
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
      await discardReservedUpload(
        ctx,
        file,
        args.documentId,
        ownerTokenIdentifier,
      );

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

export const getDocumentPdfUrl = action({
  args: {
    documentId: v.id("documents"),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args): Promise<string | null> => {
    const ownerTokenIdentifier = (await requireCurrentUser(ctx))
      .tokenIdentifier;
    const document = await ctx.runQuery(internal.documents.getOwnedDocument, {
      documentId: args.documentId,
      ownerTokenIdentifier,
    });

    if (!document?.ocrGcsInputUri) {
      return null;
    }

    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    const cacheKey = `pdf_url:${args.documentId}`;
    const cached = await redis.get<string>(cacheKey);
    if (cached) {
      return cached;
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

    await redis.set(cacheKey, signedUrl, { ex: SIGNED_URL_TTL_SECONDS });

    return signedUrl;
  },
});
