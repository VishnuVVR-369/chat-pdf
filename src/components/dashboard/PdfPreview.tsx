"use client";

import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";

type PdfPreviewProps = {
  file?: File | null;
  onPageCountChange?: (pageCount: number) => void;
  pageNumber: number;
  url?: string | null;
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

export function PdfPreview({
  file,
  onPageCountChange,
  pageNumber,
  url,
}: PdfPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  useEffect(() => {
    if (!file && !url) {
      setError(null);
      setIsRendering(false);
      return;
    }

    ensurePdfWorkerConfigured();

    let cancelled = false;
    let loadingTask: ReturnType<typeof getDocument> | null = null;

    async function renderPage() {
      setIsRendering(true);
      setError(null);

      try {
        const source = file
          ? { data: new Uint8Array(await file.arrayBuffer()) }
          : { url: url ?? undefined };

        loadingTask = getDocument({
          ...source,
          isEvalSupported: false,
          stopAtErrors: true,
          useWorkerFetch: false,
        });

        const pdfDocument = await loadingTask.promise;

        if (cancelled) {
          return;
        }

        onPageCountChange?.(pdfDocument.numPages);

        const safePageNumber = Math.min(Math.max(pageNumber, 1), pdfDocument.numPages);
        const pdfPage = await pdfDocument.getPage(safePageNumber);

        if (cancelled) {
          return;
        }

        const viewport = pdfPage.getViewport({ scale: 1.45 });
        const canvas = canvasRef.current;

        if (!canvas) {
          return;
        }

        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("Canvas rendering is not available in this browser.");
        }

        const devicePixelRatio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * devicePixelRatio);
        canvas.height = Math.floor(viewport.height * devicePixelRatio);
        canvas.style.width = "100%";
        canvas.style.height = "auto";

        context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
        await pdfPage.render({
          canvas,
          canvasContext: context,
          viewport,
        }).promise;
      } catch (renderError) {
        if (!cancelled) {
          setError(
            renderError instanceof Error
              ? renderError.message
              : "Could not render this PDF page.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsRendering(false);
        }
      }
    }

    void renderPage();

    return () => {
      cancelled = true;
      if (loadingTask) {
        void loadingTask.destroy();
      }
    };
  }, [file, onPageCountChange, pageNumber, url]);

  if (error) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-[1.75rem] border border-red-500/20 bg-red-500/[0.04] p-6 text-center">
        <div className="max-w-md space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-red-400">
            Preview unavailable
          </p>
          <p className="text-sm leading-7 text-stone-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-[1.75rem] border border-stone-800/75 bg-[#090909] p-5 shadow-[0_24px_80px_-40px_rgba(0,0,0,0.75)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
      <div className="relative overflow-hidden rounded-[1.4rem] border border-stone-800/75 bg-stone-950/90">
        {isRendering ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#090909]/75 backdrop-blur-sm">
            <div className="inline-flex items-center gap-3 rounded-full border border-amber-500/20 bg-amber-500/[0.06] px-4 py-2 text-sm text-amber-300">
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-stone-600 border-t-amber-400" />
              Rendering page preview
            </div>
          </div>
        ) : null}

        <div className="flex justify-center p-4 sm:p-6">
          <canvas
            ref={canvasRef}
            className="block max-w-full rounded-xl bg-white shadow-[0_24px_70px_-40px_rgba(255,255,255,0.25)]"
          />
        </div>
      </div>
    </div>
  );
}
