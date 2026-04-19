"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Download01Icon,
} from "@hugeicons/core-free-icons";
import { Tooltip } from "radix-ui";
import { PdfPreview } from "@/components/dashboard/PdfPreview";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DocStatus } from "./DocStatus";
import type { WorkspaceDocument } from "./Sidebar";

type PdfViewerProps = {
  document: WorkspaceDocument;
  localFile?: File | null;
  pageCount?: number | null;
  pageNumber?: number;
  onPageChange?: (page: number) => void;
  onPageCountChange?: (count: number) => void;
  resolvedFileUrl?: string | null;
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PdfViewer({
  document: doc,
  localFile,
  pageCount: externalPageCount,
  pageNumber: externalPageNumber,
  onPageChange,
  onPageCountChange,
  resolvedFileUrl,
}: PdfViewerProps) {
  const [internalPageNumber, setInternalPageNumber] = useState(1);
  const [internalPageCount, setInternalPageCount] = useState<number | null>(
    doc.pageCount ?? null,
  );
  const [pageInputDraft, setPageInputDraft] = useState("");
  const [isEditingPageInput, setIsEditingPageInput] = useState(false);
  const pageNumber = externalPageNumber ?? internalPageNumber;
  const pageCount = externalPageCount ?? internalPageCount;
  const pageInput = isEditingPageInput ? pageInputDraft : String(pageNumber);

  const handlePageCountChange = (count: number) => {
    setInternalPageCount(count);
    const safePage = Math.min(pageNumber, count);
    if (safePage !== pageNumber) {
      setInternalPageNumber(safePage);
      setPageInputDraft(String(safePage));
      setIsEditingPageInput(false);
      onPageChange?.(safePage);
    }
    onPageCountChange?.(count);
  };

  const handleSetPage = (page: number) => {
    const maxPage = pageCount ?? doc.pageCount ?? page;
    const safePage = Math.min(Math.max(page, 1), maxPage);

    setInternalPageNumber(safePage);
    setPageInputDraft(String(safePage));
    setIsEditingPageInput(false);
    onPageChange?.(safePage);
  };

  const handlePageJump = () => {
    const nextPage = Number.parseInt(pageInputDraft || String(pageNumber), 10);

    if (Number.isNaN(nextPage)) {
      setPageInputDraft(String(pageNumber));
      setIsEditingPageInput(false);
      return;
    }

    handleSetPage(nextPage);
  };

  const downloadUrl = resolvedFileUrl ?? doc.fileUrl;

  // J / K keyboard shortcuts for paging — only when not typing.
  useEffect(() => {
    if (!pageCount) return;

    function isTypingTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false;
      if (target.isContentEditable) return true;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    }

    function handler(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      if (event.key === "j" || event.key === "ArrowRight") {
        event.preventDefault();
        handleSetPage(Math.min(pageCount ?? pageNumber, pageNumber + 1));
      } else if (event.key === "k" || event.key === "ArrowLeft") {
        event.preventDefault();
        handleSetPage(Math.max(1, pageNumber - 1));
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageCount, pageNumber]);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar — single dense row, three groups */}
      <div className="flex items-center gap-3 border-b border-stone-800/60 px-4 py-2.5">
        {/* Left: title + status dot, with metadata in tooltip */}
        <Tooltip.Provider delayDuration={300}>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <div className="focus-ring flex min-w-0 cursor-default items-center gap-2 rounded-md outline-none">
                <DocStatus status={doc.status} variant="dot" />
                <h3 className="truncate text-sm font-medium text-stone-200">
                  {doc.title}
                </h3>
              </div>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="z-50 rounded-lg border border-white/[0.08] bg-[#111111] px-3 py-2 text-xs text-stone-300 shadow-[0_12px_40px_rgba(0,0,0,0.5)]"
                side="bottom"
                sideOffset={6}
              >
                <div className="flex items-center gap-2">
                  <DocStatus status={doc.status} variant="pill" />
                  <span className="text-stone-500">·</span>
                  <span>{pageCount ? `${pageCount} pages` : "Loading…"}</span>
                  <span className="text-stone-500">·</span>
                  <span>{formatFileSize(doc.storageSize)}</span>
                </div>
                <Tooltip.Arrow className="fill-[#111111]" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>

        <div className="flex-1" />

        {/* Center-right: page navigation */}
        <div className="flex items-center gap-1.5">
          <Button
            aria-label="Previous page"
            className="border-stone-700/60"
            disabled={pageNumber <= 1}
            onClick={() => handleSetPage(Math.max(1, pageNumber - 1))}
            size="icon-xs"
            variant="outline"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={2} />
          </Button>
          <div className="flex items-center gap-1.5 rounded-lg border border-stone-800/80 bg-stone-950/80 px-2 py-1">
            <label className="sr-only" htmlFor="pdf-page-jump">
              Jump to page
            </label>
            <input
              id="pdf-page-jump"
              inputMode="numeric"
              className="w-10 bg-transparent text-center text-xs text-stone-200 outline-none placeholder:text-stone-600 focus-visible:text-amber-200"
              max={pageCount ?? undefined}
              min={1}
              onBlur={handlePageJump}
              onChange={(event) => {
                setIsEditingPageInput(true);
                setPageInputDraft(event.target.value.replace(/[^\d]/g, ""));
              }}
              onFocus={() => {
                setIsEditingPageInput(true);
                setPageInputDraft(String(pageNumber));
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handlePageJump();
                  event.currentTarget.blur();
                }
                if (event.key === "Escape") {
                  setPageInputDraft(String(pageNumber));
                  setIsEditingPageInput(false);
                  event.currentTarget.blur();
                }
              }}
              placeholder="1"
              type="text"
              value={pageInput}
            />
            <span className="text-xs text-stone-600">/</span>
            <span className="min-w-[2rem] text-center text-xs text-stone-400 tabular-nums">
              {pageCount ?? "–"}
            </span>
          </div>
          <Button
            aria-label="Next page"
            className="border-stone-700/60"
            disabled={pageCount === null || pageNumber >= pageCount}
            onClick={() =>
              handleSetPage(
                pageCount ? Math.min(pageCount, pageNumber + 1) : pageNumber,
              )
            }
            size="icon-xs"
            variant="outline"
          >
            <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={2} />
          </Button>
        </div>

        {/* Right: utility actions */}
        {downloadUrl && (
          <a
            aria-label="Download PDF"
            className={cn(
              "focus-ring bg-input/30 hover:bg-input/50 flex h-7 w-7 items-center justify-center rounded-lg border border-stone-700/60 text-stone-300 transition-colors hover:text-stone-100",
            )}
            download={doc.originalFilename}
            href={downloadUrl}
            rel="noreferrer"
            target="_blank"
            title="Download PDF"
          >
            <HugeiconsIcon icon={Download01Icon} size={14} strokeWidth={2} />
          </a>
        )}
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-hidden bg-stone-950/50">
        {doc.status === "failed" && doc.processingError && (
          <div className="flex items-start gap-2 border-b border-red-950/60 bg-red-500/[0.06] px-4 py-3 text-sm text-red-200">
            <span className="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
            <p className="leading-relaxed">{doc.processingError}</p>
          </div>
        )}
        <div className="h-full">
          <PdfPreview
            file={localFile}
            onPageCountChange={handlePageCountChange}
            pageNumber={pageNumber}
            url={resolvedFileUrl ?? doc.fileUrl}
          />
        </div>
      </div>
    </div>
  );
}
