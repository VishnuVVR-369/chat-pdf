"use client";

import { useState } from "react";
import { PdfPreview } from "@/components/dashboard/PdfPreview";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WorkspaceDocument } from "./Sidebar";

type PdfViewerProps = {
  document: WorkspaceDocument;
  localFile?: File | null;
  onPageCountChange?: (count: number) => void;
  resolvedFileUrl?: string | null;
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PdfViewer({
  document,
  localFile,
  onPageCountChange,
  resolvedFileUrl,
}: PdfViewerProps) {
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState<number | null>(
    document.pageCount ?? null,
  );

  const handlePageCountChange = (count: number) => {
    setPageCount(count);
    onPageCountChange?.(count);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-stone-800/60 px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium text-stone-200">
            {document.title}
          </h3>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-stone-500">
            <span>{pageCount ? `${pageCount} pages` : "Loading..."}</span>
            <span className="text-stone-700">·</span>
            <span>{formatFileSize(document.storageSize)}</span>
            <span className="text-stone-700">·</span>
            <StatusBadge status={document.status} />
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            className="h-7 w-7 rounded-lg border-stone-700/60 p-0"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            size="icon-xs"
            variant="outline"
          >
            <ChevronLeftIcon />
          </Button>
          <span className="min-w-[4rem] text-center text-xs text-stone-400 tabular-nums">
            {pageNumber} / {pageCount ?? "–"}
          </span>
          <Button
            className="h-7 w-7 rounded-lg border-stone-700/60 p-0"
            disabled={pageCount === null || pageNumber >= pageCount}
            onClick={() =>
              setPageNumber((p) => (pageCount ? Math.min(pageCount, p + 1) : p))
            }
            size="icon-xs"
            variant="outline"
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-hidden bg-stone-950/50">
        {document.status === "failed" && document.processingError && (
          <div className="border-b border-red-950/60 bg-red-950/20 px-4 py-3 text-sm text-red-200">
            {document.processingError}
          </div>
        )}
        <div className="h-full">
          <PdfPreview
            file={localFile}
            onPageCountChange={handlePageCountChange}
            pageNumber={pageNumber}
            url={resolvedFileUrl ?? document.fileUrl}
          />
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase",
        status === "ready" && "bg-emerald-500/10 text-emerald-400",
        status === "uploading" && "bg-sky-500/10 text-sky-400",
        status === "uploaded" && "bg-cyan-500/10 text-cyan-400",
        status === "processing" && "bg-amber-500/10 text-amber-400",
        status === "failed" && "bg-red-500/10 text-red-400",
      )}
    >
      {status}
    </span>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
