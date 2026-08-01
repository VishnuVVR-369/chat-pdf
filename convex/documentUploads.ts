"use node";

import { PDFDocument } from "pdf-lib";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { action, internalAction } from "./_generated/server";
import {
  MAX_PDF_FILE_SIZE_BYTES,
  MAX_PDF_FILE_SIZE_MIB,
  MAX_PDF_PAGES,
} from "../src/constants/pdf";

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
  ctx: Pick<ActionCtx, "runMutation" | "storage">,
  storageId: Id<"_storage"> | null,
  documentId: Id<"documents">,
  ownerTokenIdentifier: string,
) {
  if (storageId) {
    await ctx.storage.delete(storageId);
  }

  await ctx.runMutation(internal.documents.deleteReservedDocument, {
    documentId,
    ownerTokenIdentifier,
  });
}

export const expireDirectUploadReservation = internalAction({
  args: {
    documentId: v.id("documents"),
    ownerTokenIdentifier: v.string(),
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
      document.fileStorageId !== undefined
    ) {
      return null;
    }

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
    storageId: v.id("_storage"),
  },
  returns: v.id("documents"),
  handler: async (ctx, args): Promise<Id<"documents">> => {
    const ownerTokenIdentifier = (await requireCurrentUser(ctx))
      .tokenIdentifier;
    const document = await ctx.runQuery(internal.documents.getOwnedDocument, {
      documentId: args.documentId,
      ownerTokenIdentifier,
    });

    if (!document || document.status !== "uploading") {
      throw new Error("Upload reservation could not be found.");
    }

    const metadata = await ctx.runQuery(
      internal.storageData.getStorageMetadata,
      { storageId: args.storageId },
    );

    if (!metadata) {
      await discardReservedUpload(
        ctx,
        null,
        args.documentId,
        ownerTokenIdentifier,
      );
      throw new Error("Uploaded PDF could not be found in Convex storage.");
    }

    if (metadata.size === 0) {
      await discardReservedUpload(
        ctx,
        args.storageId,
        args.documentId,
        ownerTokenIdentifier,
      );
      throw new Error("Uploaded PDF is empty.");
    }

    if (metadata.size > MAX_PDF_FILE_SIZE_BYTES) {
      await discardReservedUpload(
        ctx,
        args.storageId,
        args.documentId,
        ownerTokenIdentifier,
      );
      throw new Error(`PDFs must be ${MAX_PDF_FILE_SIZE_MIB} MiB or smaller.`);
    }

    const pdfBlob = await ctx.storage.get(args.storageId);

    if (!pdfBlob) {
      await discardReservedUpload(
        ctx,
        null,
        args.documentId,
        ownerTokenIdentifier,
      );
      throw new Error("Uploaded PDF could not be found in Convex storage.");
    }

    const contents = new Uint8Array(await pdfBlob.arrayBuffer());

    const signature = Buffer.from(contents.subarray(0, 5)).toString("utf-8");

    if (signature !== "%PDF-") {
      await discardReservedUpload(
        ctx,
        args.storageId,
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
          fileStorageId: args.storageId,
          contentType:
            metadata.contentType || pdfBlob.type || "application/pdf",
          storageSize: metadata.size,
          sha256: metadata.sha256,
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
        args.storageId,
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

    if (!document?.fileStorageId) {
      return null;
    }

    return await ctx.storage.getUrl(document.fileStorageId);
  },
});
