"use client";

import { useEffect, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist/types/src/pdf";

type PdfPreviewProps = {
  file?: File | null;
  onPageCountChange?: (pageCount: number) => void;
  pageNumber: number;
  url?: string | null;
};

const PREVIEW_RETRY_DELAYS_MS = [250, 500, 1_000, 2_000];

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

function getPdfLoadErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Could not render this PDF page.";
}

function shouldRetryPdfLoad(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const candidate = error as Error & {
    status?: number;
  };

  return (
    candidate.status === 404 ||
    candidate.message.includes("Unexpected server response (404)")
  );
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPdfBytes(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });

  if (!response.ok) {
    const error = new Error(
      `Could not load this PDF (${response.status} ${response.statusText}).`,
    ) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return new Uint8Array(await response.arrayBuffer());
}

export function PdfPreview({
  file,
  onPageCountChange,
  pageNumber,
  url,
}: PdfPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageCountChangeRef = useRef(onPageCountChange);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingDocument, setIsLoadingDocument] = useState(false);
  const [isRenderingPage, setIsRenderingPage] = useState(false);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    pageCountChangeRef.current = onPageCountChange;
  }, [onPageCountChange]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const updateSize = () => {
      setContainerSize({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    };

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!file && !url) {
      setPdfDocument(null);
      setError(null);
      setIsLoadingDocument(false);
      return;
    }

    ensurePdfWorkerConfigured();

    let cancelled = false;
    let loadingTask: ReturnType<typeof getDocument> | null = null;
    const abortController = new AbortController();

    async function loadDocument() {
      setPdfDocument(null);
      setIsRenderingPage(false);
      setIsLoadingDocument(true);
      setError(null);

      try {
        let attempt = 0;

        while (!cancelled) {
          try {
            const source = {
              data: file
                ? new Uint8Array(await file.arrayBuffer())
                : await fetchPdfBytes(url ?? "", abortController.signal),
            };

            loadingTask = getDocument({
              ...source,
              isEvalSupported: false,
              stopAtErrors: true,
              useWorkerFetch: false,
            });

            const nextDocument = await loadingTask.promise;

            if (cancelled) {
              await nextDocument.destroy();
              return;
            }

            pageCountChangeRef.current?.(nextDocument.numPages);
            setPdfDocument(nextDocument);
            return;
          } catch (renderError) {
            const canRetry =
              !file &&
              attempt < PREVIEW_RETRY_DELAYS_MS.length &&
              shouldRetryPdfLoad(renderError);

            if (!canRetry) {
              throw renderError;
            }

            const retryDelay = PREVIEW_RETRY_DELAYS_MS[attempt];
            attempt += 1;
            await wait(retryDelay);
          }
        }
      } catch (renderError) {
        if (!cancelled) {
          setPdfDocument(null);
          setError(getPdfLoadErrorMessage(renderError));
        }
      } finally {
        if (!cancelled) {
          setIsLoadingDocument(false);
        }
      }
    }

    void loadDocument();

    return () => {
      cancelled = true;
      abortController.abort();
      if (loadingTask) {
        void loadingTask.destroy();
      }
    };
  }, [file, url]);

  useEffect(() => {
    if (!pdfDocument) {
      setIsRenderingPage(false);
      return;
    }

    const activeDocument = pdfDocument;
    let cancelled = false;
    let renderTask: RenderTask | null = null;

    async function renderPage() {
      setIsRenderingPage(true);
      setError(null);

      try {
        const safePageNumber = Math.min(
          Math.max(pageNumber, 1),
          activeDocument.numPages,
        );
        const pdfPage = await activeDocument.getPage(safePageNumber);

        if (cancelled) {
          return;
        }

        const canvas = canvasRef.current;
        const container = containerRef.current;

        if (!canvas || !container) {
          return;
        }

        const baseViewport = pdfPage.getViewport({ scale: 1 });
        const horizontalPadding = 48;
        const verticalPadding = 48;
        const fitSafetyMargin = 4;
        const maxWidth = Math.max(
          container.clientWidth - horizontalPadding - fitSafetyMargin,
          160,
        );
        const maxHeight = Math.max(
          container.clientHeight - verticalPadding - fitSafetyMargin,
          220,
        );
        const scale = Math.max(
          Math.min(
            maxWidth / baseViewport.width,
            maxHeight / baseViewport.height,
          ),
          0.25,
        );
        const viewport = pdfPage.getViewport({ scale });
        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("Canvas rendering is not available in this browser.");
        }

        const devicePixelRatio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * devicePixelRatio);
        canvas.height = Math.floor(viewport.height * devicePixelRatio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
        renderTask = pdfPage.render({
          canvas,
          canvasContext: context,
          viewport,
        });
        await renderTask.promise;
      } catch (renderError) {
        if (!cancelled) {
          setError(getPdfLoadErrorMessage(renderError));
        }
      } finally {
        if (!cancelled) {
          setIsRenderingPage(false);
        }
      }
    }

    void renderPage();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [containerSize.height, containerSize.width, pageNumber, pdfDocument]);

  const showLoadingOverlay = isLoadingDocument || isRenderingPage;

  if (error) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-[1.75rem] border border-red-500/20 bg-red-500/[0.04] p-6 text-center">
        <div className="max-w-md space-y-2">
          <p className="text-sm font-semibold tracking-[0.22em] text-red-400 uppercase">
            Preview unavailable
          </p>
          <p className="text-sm leading-7 text-stone-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full overflow-hidden bg-[#090909]"
    >
      <div className="relative flex h-full items-center justify-center overflow-hidden bg-stone-950/90 p-6">
        {showLoadingOverlay ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#090909]/75 backdrop-blur-sm">
            <div className="inline-flex items-center gap-3 rounded-full border border-amber-500/20 bg-amber-500/[0.06] px-4 py-2 text-sm text-amber-300">
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-stone-600 border-t-amber-400" />
              Rendering page preview
            </div>
          </div>
        ) : null}

        <div className="flex h-full w-full items-center justify-center overflow-hidden">
          <canvas
            ref={canvasRef}
            className="block max-w-none rounded-sm bg-white shadow-[0_24px_70px_-40px_rgba(255,255,255,0.25)]"
          />
        </div>
      </div>
    </div>
  );
}
