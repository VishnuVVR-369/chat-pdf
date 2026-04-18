import { MAX_PDF_PAGES } from "@/constants/pdf";

export type PdfPreflightResult =
  | {
      status: "ready";
      message: string;
      pageCount: number;
    }
  | {
      status: "rejected";
      message: string;
      pageCount?: number;
    };

function isPasswordProtectedPdfError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "PasswordException" ||
      error.message.toLowerCase().includes("password") ||
      error.message.toLowerCase().includes("encrypt"))
  );
}

async function readPdfPageCount(bytes: Uint8Array) {
  const { PDFDocument } = await import("pdf-lib");
  const document = await PDFDocument.load(bytes, {
    ignoreEncryption: false,
    throwOnInvalidObject: true,
    updateMetadata: false,
  });

  return document.getPageCount();
}

export async function inspectPdfFile(file: File): Promise<PdfPreflightResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const signature = new TextDecoder("utf-8").decode(bytes.subarray(0, 5));

  if (signature !== "%PDF-") {
    return {
      status: "rejected",
      message: "Only valid PDF files can be uploaded.",
    };
  }

  try {
    const pageCount = await readPdfPageCount(bytes);

    if (pageCount > MAX_PDF_PAGES) {
      return {
        status: "rejected",
        pageCount,
        message: `This PDF has ${pageCount} pages. PDFs must be ${MAX_PDF_PAGES} pages or fewer.`,
      };
    }

    return {
      status: "ready",
      pageCount,
      message: `Detected ${pageCount} page${pageCount === 1 ? "" : "s"} locally. Ready to upload.`,
    };
  } catch (error) {
    if (isPasswordProtectedPdfError(error)) {
      return {
        status: "rejected",
        message: "This PDF is password-protected or encrypted.",
      };
    }

    return {
      status: "rejected",
      message:
        "Could not validate this PDF in the browser. Please choose a different file.",
    };
  }
}
