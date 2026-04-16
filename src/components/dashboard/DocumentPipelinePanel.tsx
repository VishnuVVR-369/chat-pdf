"use client";

import { cn } from "@/lib/utils";
import type { WorkspaceDocument } from "./Sidebar";

type DocumentPipelinePanelProps = {
  document: WorkspaceDocument;
};

function getStatusSummary(document: WorkspaceDocument) {
  switch (document.status) {
    case "uploading":
      return "Waiting for the direct GCS upload to finish and the document record to finalize.";
    case "uploaded":
      return "Upload is complete. OCR has been queued and the per-page ingestion pipeline should start next.";
    case "processing":
      return "OCR is running and per-page embeddings are being generated from the extracted page text.";
    case "ready":
      return "Upload, OCR, and one embedding per page are complete. The ingestion pipeline is ready for the next chat PR.";
    case "failed":
      return document.processingError ?? "Document processing failed.";
  }
}

function formatTimestamp(timestamp?: number) {
  if (!timestamp) {
    return "Not yet";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function truncateMiddle(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  const edgeLength = Math.floor((maxLength - 3) / 2);
  return `${value.slice(0, edgeLength)}...${value.slice(-edgeLength)}`;
}

export function DocumentPipelinePanel({
  document,
}: DocumentPipelinePanelProps) {
  const statusSummary = getStatusSummary(document);
  const embeddedPageSummary =
    document.embeddedPageCount !== undefined && document.pageCount !== undefined
      ? `${document.embeddedPageCount}/${document.pageCount}`
      : document.embeddedPageCount !== undefined
        ? String(document.embeddedPageCount)
        : "Pending";

  return (
    <aside className="flex h-full flex-col bg-[radial-gradient(circle_at_top_right,_rgba(56,189,248,0.12),_transparent_26%),linear-gradient(180deg,_rgba(12,10,9,0.96),_rgba(7,7,7,0.98))]">
      <div className="border-b border-stone-800/70 px-4 py-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
            <PipelineIcon />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-stone-100">
              Ingestion Pipeline
            </h3>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              GCS upload, OCR, and one embedding vector per page.
            </p>
          </div>
        </div>

        <div
          className={cn(
            "mt-4 rounded-2xl border px-3 py-3 text-sm leading-6",
            document.status === "ready" &&
              "border-emerald-500/20 bg-emerald-500/10 text-emerald-100",
            document.status === "failed" &&
              "border-red-500/20 bg-red-500/10 text-red-100",
            document.status !== "ready" &&
              document.status !== "failed" &&
              "border-amber-500/20 bg-amber-500/10 text-amber-100",
          )}
        >
          {statusSummary}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="grid gap-3">
          <MetricCard label="Status" value={document.status} />
          <MetricCard
            label="Pages"
            value={
              document.pageCount !== undefined
                ? String(document.pageCount)
                : "Pending"
            }
          />
          <MetricCard label="Embedded pages" value={embeddedPageSummary} />
          <MetricCard
            label="Embedding model"
            value={document.embeddingModel ?? "gemini-embedding-2-preview"}
          />
          <MetricCard
            label="OCR processor"
            value={document.ocrModelOrProcessor ?? "Not yet recorded"}
          />
          <MetricCard
            label="Uploaded"
            value={formatTimestamp(document.uploadCompletedAt)}
          />
          <MetricCard
            label="Processing started"
            value={formatTimestamp(document.processingStartedAt)}
          />
          <MetricCard
            label="OCR completed"
            value={formatTimestamp(document.ocrCompletedAt)}
          />
          <MetricCard
            label="Embeddings completed"
            value={formatTimestamp(document.embeddingsCompletedAt)}
          />
          <MetricCard
            label="Source GCS URI"
            value={
              document.ocrGcsInputUri
                ? truncateMiddle(document.ocrGcsInputUri, 52)
                : "Pending"
            }
          />
        </div>

        {document.processingError ? (
          <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100">
            {document.processingError}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-800/80 bg-stone-950/60 px-4 py-3">
      <p className="text-[11px] font-medium tracking-[0.18em] text-stone-500 uppercase">
        {label}
      </p>
      <p className="mt-2 text-sm leading-6 break-words text-stone-100">
        {value}
      </p>
    </div>
  );
}

function PipelineIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      <path d="M4 7h5" />
      <path d="M15 7h5" />
      <path d="M9 7h6" />
      <path d="M12 7v10" />
      <path d="M8 13l4 4 4-4" />
    </svg>
  );
}
