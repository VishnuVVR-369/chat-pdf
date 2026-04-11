"use node";

import { PDFDocument } from "pdf-lib";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { action } from "./_generated/server";
import { MAX_PDF_PAGES } from "../src/constants/pdf";

type StorageMetadata = {
  _id: Id<"_storage">;
  _creationTime: number;
  contentType?: string;
  sha256: string;
  size: number;
};

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

async function loadStorageMetadata(
  ctx: ActionCtx,
  storageId: Id<"_storage">,
): Promise<StorageMetadata> {
  const metadata = await ctx.runQuery(
    internal.documents.getStorageMetadata,
    { storageId },
  );

  if (metadata === null) {
    throw new Error("Uploaded file could not be found in Convex storage.");
  }

  return metadata as StorageMetadata;
}

async function readPdfPageCount(bytes: Uint8Array) {
  const document = await PDFDocument.load(bytes, {
    ignoreEncryption: false,
    throwOnInvalidObject: true,
    updateMetadata: false,
  });
  return document.getPageCount();
}

async function validateStoredPdf(
  ctx: ActionCtx,
  storageId: Id<"_storage">,
): Promise<StorageMetadata & { pageCount: number }> {
  const metadata = await loadStorageMetadata(ctx, storageId);

  if (metadata.size <= 0) {
    await ctx.storage.delete(storageId);
    throw new Error("Uploaded PDF is empty.");
  }

  const blob = await ctx.storage.get(storageId);

  if (!blob) {
    throw new Error("Uploaded file could not be read from Convex storage.");
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const signature = new TextDecoder("utf-8").decode(bytes.subarray(0, 5));

  if (signature !== "%PDF-") {
    await ctx.storage.delete(storageId);
    throw new Error("Only valid PDF files can be uploaded.");
  }

  try {
    const pageCount = await readPdfPageCount(bytes);

    if (pageCount > MAX_PDF_PAGES) {
      throw new Error(
        `PDFs must be ${MAX_PDF_PAGES} pages or fewer. This PDF has ${pageCount} pages.`,
      );
    }

    return {
      ...metadata,
      pageCount,
    };
  } catch (error) {
    await ctx.storage.delete(storageId);

    if (isPasswordProtectedPdfError(error)) {
      throw new Error("This PDF is password-protected or encrypted.");
    }

    if (error instanceof Error && error.message.includes("pages or fewer")) {
      throw error;
    }

    throw new Error("Could not read the PDF page count.");
  }
}

export const createDocument = action({
  args: {
    filename: v.string(),
    storageId: v.id("_storage"),
  },
  returns: v.id("documents"),
  handler: async (ctx, args): Promise<Id<"documents">> => {
    const identity = await requireCurrentUser(ctx);
    const metadata = await validateStoredPdf(ctx, args.storageId);

    return await ctx.runMutation(internal.documents.createDocumentRecord, {
      filename: args.filename,
      storageId: args.storageId,
      ownerTokenIdentifier: identity.tokenIdentifier,
      pageCount: metadata.pageCount,
      storageContentType: metadata.contentType,
      storageSize: metadata.size,
      sha256: metadata.sha256,
    });
  },
});
