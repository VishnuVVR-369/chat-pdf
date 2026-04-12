import {
  getDocument,
  GlobalWorkerOptions,
} from "pdfjs-dist/legacy/build/pdf.mjs";
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
    }
  | {
      status: "server_check_required";
      message: string;
    };

let workerConfigured = false;

function ensurePdfWorkerConfigured() {
  if (workerConfigured || typeof window === "undefined") {
    return;
  }

  GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();
  workerConfigured = true;
}

function isPasswordProtectedPdfError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "PasswordException" ||
      error.message.toLowerCase().includes("password"))
  );
}

async function readPdfPageCount(bytes: Uint8Array) {
  ensurePdfWorkerConfigured();

  const loadingTask = getDocument({
    data: bytes,
    isEvalSupported: false,
    stopAtErrors: true,
    useWorkerFetch: false,
  });

  try {
    const document = await loadingTask.promise;
    return document.numPages;
  } finally {
    await loadingTask.destroy();
  }
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
      status: "server_check_required",
      message:
        "Could not read the PDF page count locally. You can still upload and let the server decide.",
    };
  }
}
