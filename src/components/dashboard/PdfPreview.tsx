"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist/types/src/pdf";

type PdfPreviewProps = {
  file?: File | null;
  highlightQuote?: string | null;
  highlightRatio?: number | null;
  onPageCountChange?: (pageCount: number) => void;
  pageNumber: number;
  url?: string | null;
};

type TextLayerData = {
  divs: HTMLElement[];
  itemStrings: string[];
};

type TextIndexEntry = { divIndex: number; charOffset: number } | null;

type HighlightBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const PREVIEW_RETRY_DELAYS_MS = [250, 500, 1_000, 2_000];
const SOFT_HYPHEN = /­/g;
const MIN_PREFIX_FALLBACK = 12;
const MAX_PREFIX_FALLBACK = 40;

type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
type PdfLoadingTask = ReturnType<PdfJsModule["getDocument"]>;
type PdfTextLayer = InstanceType<PdfJsModule["TextLayer"]>;

let workerConfigured = false;
let pdfJsModulePromise: Promise<PdfJsModule> | null = null;

async function loadPdfJs() {
  if (!pdfJsModulePromise) {
    pdfJsModulePromise = import("pdfjs-dist/legacy/build/pdf.mjs");
  }

  const pdfJs = await pdfJsModulePromise;

  if (!workerConfigured) {
    pdfJs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.mjs",
      import.meta.url,
    ).toString();
    workerConfigured = true;
  }

  return pdfJs;
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

/* ─── Citation highlight matching ────────────────────────────────── */

function normalizeForMatch(text: string) {
  return text
    .normalize("NFKC")
    .replace(SOFT_HYPHEN, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Builds a normalized page string with a parallel map from each normalized character
// back to its source text item + character offset. Collapsed/synthetic whitespace maps
// to `null` (no DOM rect). Normalization is applied per source character so the index
// stays aligned to the original text nodes. `joinWithSpace` toggles whether adjacent
// text items are separated by a space (handles words split across items either way).
function buildTextIndex(itemStrings: string[], joinWithSpace: boolean) {
  let normalized = "";
  const map: TextIndexEntry[] = [];
  let prevWasSpace = true;

  const push = (char: string, entry: TextIndexEntry) => {
    normalized += char;
    map.push(entry);
  };

  for (let divIndex = 0; divIndex < itemStrings.length; divIndex++) {
    const source = itemStrings[divIndex];

    if (joinWithSpace && divIndex > 0 && !prevWasSpace) {
      push(" ", null);
      prevWasSpace = true;
    }

    for (let i = 0; i < source.length; i++) {
      const normChar = source[i]
        .normalize("NFKC")
        .replace(SOFT_HYPHEN, "")
        .toLowerCase();

      for (const ch of normChar) {
        if (/\s/.test(ch)) {
          if (!prevWasSpace) {
            push(" ", { divIndex, charOffset: i });
            prevWasSpace = true;
          }
        } else {
          push(ch, { divIndex, charOffset: i });
          prevWasSpace = false;
        }
      }
    }
  }

  while (normalized.endsWith(" ")) {
    normalized = normalized.slice(0, -1);
    map.pop();
  }

  return { normalized, map };
}

// Finds the occurrence of `target` whose start position best matches `ratio` (0..1
// position within the page), disambiguating repeated text. Returns -1 if not found.
function findOccurrence(
  normalized: string,
  target: string,
  ratio: number | null,
): number {
  if (normalized.length === 0) return -1;

  const matches: number[] = [];
  let from = 0;
  while (matches.length < 64) {
    const idx = normalized.indexOf(target, from);
    if (idx === -1) break;
    matches.push(idx);
    from = idx + 1;
  }

  if (matches.length === 0) return -1;
  if (matches.length === 1 || ratio == null) return matches[0];

  const targetPos = ratio * normalized.length;
  return matches.reduce((best, idx) =>
    Math.abs(idx - targetPos) < Math.abs(best - targetPos) ? idx : best,
  );
}

function computeHighlightBoxes(
  data: TextLayerData,
  wrapper: HTMLElement,
  quote: string,
  ratio: number | null,
): HighlightBox[] {
  const target = normalizeForMatch(quote);
  if (target.length < 3) return [];

  // Try joining adjacent text items with and then without a separating space, since a
  // word can be split across pdf.js items either way.
  let normalized = "";
  let map: TextIndexEntry[] = [];
  let startIdx = -1;
  let matchLength = target.length;

  for (const joinWithSpace of [true, false]) {
    const index = buildTextIndex(data.itemStrings, joinWithSpace);
    if (!index.normalized) continue;

    let found = findOccurrence(index.normalized, target, ratio);
    let length = target.length;

    // Fall back to matching the opening slice when OCR text and the PDF's embedded
    // text diverge (ligatures, hyphenation, reading order).
    if (found === -1) {
      const prefix = target.slice(0, MAX_PREFIX_FALLBACK);
      if (prefix.length >= MIN_PREFIX_FALLBACK) {
        found = findOccurrence(index.normalized, prefix, ratio);
        length = prefix.length;
      }
    }

    if (found !== -1) {
      normalized = index.normalized;
      map = index.map;
      startIdx = found;
      matchLength = length;
      break;
    }
  }

  if (startIdx === -1 || !normalized) return [];

  const endIdx = Math.min(startIdx + matchLength, map.length);
  const perDiv = new Map<number, { min: number; max: number }>();

  for (let k = startIdx; k < endIdx; k++) {
    const entry = map[k];
    if (!entry) continue;
    const current = perDiv.get(entry.divIndex);
    if (!current) {
      perDiv.set(entry.divIndex, {
        min: entry.charOffset,
        max: entry.charOffset,
      });
    } else {
      current.min = Math.min(current.min, entry.charOffset);
      current.max = Math.max(current.max, entry.charOffset);
    }
  }

  const wrapperRect = wrapper.getBoundingClientRect();
  const boxes: HighlightBox[] = [];

  for (const [divIndex, { min, max }] of perDiv) {
    const div = data.divs[divIndex];
    const textNode = div?.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) continue;
    const len = textNode.textContent?.length ?? 0;
    if (len === 0) continue;

    const range = document.createRange();
    range.setStart(textNode, Math.min(min, len));
    range.setEnd(textNode, Math.min(max + 1, len));

    for (const rect of Array.from(range.getClientRects())) {
      if (rect.width === 0 || rect.height === 0) continue;
      boxes.push({
        left: rect.left - wrapperRect.left,
        top: rect.top - wrapperRect.top,
        width: rect.width,
        height: rect.height,
      });
    }
  }

  return boxes;
}

/* ─── Component ──────────────────────────────────────────────────── */

export function PdfPreview({
  file,
  highlightQuote,
  highlightRatio,
  onPageCountChange,
  pageNumber,
  url,
}: PdfPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const textLayerDataRef = useRef<TextLayerData | null>(null);
  const pageCountChangeRef = useRef(onPageCountChange);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingDocument, setIsLoadingDocument] = useState(false);
  const [isRenderingPage, setIsRenderingPage] = useState(false);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [textLayerVersion, setTextLayerVersion] = useState(0);
  const [highlightBoxes, setHighlightBoxes] = useState<HighlightBox[]>([]);

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

    let cancelled = false;
    let loadingTask: PdfLoadingTask | null = null;

    async function loadDocument() {
      setPdfDocument(null);
      setIsRenderingPage(false);
      setIsLoadingDocument(true);
      setError(null);

      try {
        const pdfJs = await loadPdfJs();
        const source = file
          ? { data: new Uint8Array(await file.arrayBuffer()) }
          : { url: url ?? undefined };

        let attempt = 0;

        while (!cancelled) {
          try {
            loadingTask = pdfJs.getDocument({
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
    let textLayer: PdfTextLayer | null = null;

    async function renderPage() {
      setIsRenderingPage(true);
      setError(null);
      textLayerDataRef.current = null;
      setHighlightBoxes([]);

      try {
        const pdfJs = await loadPdfJs();
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
        const wrapper = wrapperRef.current;
        const textLayerEl = textLayerRef.current;

        if (!canvas || !container || !wrapper || !textLayerEl) {
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

        // Size the overlay wrapper to the page and expose the scale factors the
        // pdf.js text layer relies on for positioning/sizing.
        wrapper.style.width = `${viewport.width}px`;
        wrapper.style.height = `${viewport.height}px`;
        wrapper.style.setProperty("--total-scale-factor", `${scale}`);
        wrapper.style.setProperty("--scale-factor", `${scale}`);
        wrapper.style.setProperty("--scale-round-x", "1px");
        wrapper.style.setProperty("--scale-round-y", "1px");

        context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
        renderTask = pdfPage.render({
          canvas,
          canvasContext: context,
          viewport,
        });
        await renderTask.promise;

        if (cancelled) {
          return;
        }

        // Build a transparent, selectable text layer over the canvas so cited text
        // can be located and highlighted.
        textLayerEl.replaceChildren();
        const textContent = await pdfPage.getTextContent();
        if (cancelled) {
          return;
        }
        textLayer = new pdfJs.TextLayer({
          textContentSource: textContent,
          container: textLayerEl,
          viewport,
        });
        await textLayer.render();
        if (cancelled) {
          textLayer.cancel();
          return;
        }

        textLayerDataRef.current = {
          divs: textLayer.textDivs,
          itemStrings: textLayer.textContentItemsStr,
        };
        setTextLayerVersion((version) => version + 1);
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
      textLayer?.cancel();
    };
  }, [containerSize.height, containerSize.width, pageNumber, pdfDocument]);

  // Recompute highlight boxes when the cited quote or the rendered text layer changes.
  useEffect(() => {
    const data = textLayerDataRef.current;
    const wrapper = wrapperRef.current;

    if (!data || !wrapper || !highlightQuote) {
      setHighlightBoxes([]);
      return;
    }

    setHighlightBoxes(
      computeHighlightBoxes(
        data,
        wrapper,
        highlightQuote,
        highlightRatio ?? null,
      ),
    );
  }, [highlightQuote, highlightRatio, textLayerVersion]);

  const isRendering = isLoadingDocument || isRenderingPage;

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
        {isRendering ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#090909]/75 backdrop-blur-sm">
            <div className="inline-flex items-center gap-3 rounded-full border border-amber-500/20 bg-amber-500/[0.06] px-4 py-2 text-sm text-amber-300">
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-stone-600 border-t-amber-400" />
              Rendering page preview
            </div>
          </div>
        ) : null}

        <div className="flex h-full w-full items-center justify-center overflow-hidden">
          <div ref={wrapperRef} className="relative">
            <canvas
              ref={canvasRef}
              className="block max-w-none rounded-sm bg-white shadow-[0_24px_70px_-40px_rgba(255,255,255,0.25)]"
            />
            <div ref={textLayerRef} className="textLayer" />
            <div className="pdf-highlight-layer" aria-hidden="true">
              {highlightBoxes.map((box, index) => (
                <div
                  key={index}
                  className="pdf-highlight-box"
                  style={{
                    left: `${box.left}px`,
                    top: `${box.top}px`,
                    width: `${box.width}px`,
                    height: `${box.height}px`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
