"use client";

import { cn } from "@/lib/utils";
import type { WorkspaceDocument } from "./Sidebar";

type PipelineStepperProps = {
  document: WorkspaceDocument;
};

type StepStatus = "completed" | "active" | "pending" | "failed";

type PipelineStep = {
  id: string;
  label: string;
  description: string;
  status: StepStatus;
  detail?: string;
  timestamp?: number;
};

function formatTimestamp(timestamp?: number) {
  if (!timestamp) return null;

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function deriveSteps(document: WorkspaceDocument): PipelineStep[] {
  const steps: PipelineStep[] = [];

  // Step 1: Upload
  const uploadDone =
    document.status !== "uploading";
  steps.push({
    id: "upload",
    label: "Upload",
    description: "PDF uploaded to cloud storage",
    status: uploadDone
      ? "completed"
      : document.status === "uploading"
        ? "active"
        : "pending",
    detail: uploadDone
      ? `${document.pageCount ?? "?"} pages · ${formatFileSize(document.storageSize)}`
      : "Uploading to storage...",
    timestamp: uploadDone ? document.uploadCompletedAt : undefined,
  });

  // Step 2: OCR Processing
  const ocrDone = !!document.ocrCompletedAt;
  const ocrActive =
    !ocrDone &&
    (document.status === "processing" || document.status === "uploaded");
  const ocrFailed =
    document.status === "failed" && !ocrDone;
  steps.push({
    id: "ocr",
    label: "OCR Processing",
    description: "Extracting text from each page",
    status: ocrFailed
      ? "failed"
      : ocrDone
        ? "completed"
        : ocrActive
          ? "active"
          : "pending",
    detail: ocrFailed
      ? document.processingError ?? "OCR failed"
      : ocrDone
        ? `${document.ocrModelOrProcessor ?? "Document AI"} · ${document.pageCount ?? "?"} pages processed`
        : ocrActive
          ? "Running OCR on document pages..."
          : "Waiting for upload to complete",
    timestamp: ocrDone ? document.ocrCompletedAt : undefined,
  });

  // Step 3: Embedding
  const embeddingDone = !!document.embeddingsCompletedAt;
  const embeddingActive =
    ocrDone && !embeddingDone && document.status === "processing";
  const embeddingFailed =
    document.status === "failed" && ocrDone && !embeddingDone;
  const embeddedPageCount = document.embeddedPageCount ?? 0;
  const totalPages = document.pageCount ?? 0;
  steps.push({
    id: "embedding",
    label: "Embedding",
    description: "Creating vector embeddings for search",
    status: embeddingFailed
      ? "failed"
      : embeddingDone
        ? "completed"
        : embeddingActive
          ? "active"
          : "pending",
    detail: embeddingFailed
      ? document.processingError ?? "Embedding failed"
      : embeddingDone
        ? `${embeddedPageCount}/${totalPages} pages · ${document.embeddingModel ?? "text-embedding-3-small"}`
        : embeddingActive
          ? `Embedding pages... ${embeddedPageCount > 0 ? `${embeddedPageCount}/${totalPages}` : ""}`
          : "Waiting for OCR",
    timestamp: embeddingDone ? document.embeddingsCompletedAt : undefined,
  });

  return steps;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PipelineStepper({ document }: PipelineStepperProps) {
  const steps = deriveSteps(document);
  const isFailed = document.status === "failed";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-stone-800/60 px-5 py-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl",
              isFailed
                ? "bg-red-500/10 text-red-400"
                : "bg-amber-500/10 text-amber-400",
            )}
          >
            <PipelineIcon />
          </span>
          <div>
            <h3 className="text-sm font-medium text-stone-200">
              Ingestion Pipeline
            </h3>
            <p className="text-xs text-stone-500">
              {isFailed
                ? "Processing failed"
                : "Preparing document for chat..."}
            </p>
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="relative">
          {steps.map((step, index) => {
            const isLast = index === steps.length - 1;

            return (
              <div key={step.id} className="relative flex gap-4 pb-8 last:pb-0">
                {/* Vertical line */}
                {!isLast && (
                  <div
                    className={cn(
                      "absolute left-[15px] top-[34px] bottom-0 w-px",
                      step.status === "completed"
                        ? "bg-emerald-500/30"
                        : "bg-stone-800/60",
                    )}
                  />
                )}

                {/* Dot */}
                <div className="relative z-10 flex h-[30px] w-[30px] shrink-0 items-center justify-center">
                  {step.status === "completed" ? (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                      <CheckIcon />
                    </span>
                  ) : step.status === "active" ? (
                    <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/15">
                      <span className="absolute inset-0 animate-ping rounded-full bg-amber-500/10" />
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                    </span>
                  ) : step.status === "failed" ? (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/15 text-red-400">
                      <XIcon />
                    </span>
                  ) : (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-800/40">
                      <span className="h-2 w-2 rounded-full bg-stone-600" />
                    </span>
                  )}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1 pt-0.5">
                  <p
                    className={cn(
                      "text-sm font-medium",
                      step.status === "completed" && "text-emerald-300",
                      step.status === "active" && "text-amber-300",
                      step.status === "failed" && "text-red-300",
                      step.status === "pending" && "text-stone-500",
                    )}
                  >
                    {step.label}
                  </p>
                  <p className="mt-0.5 text-xs text-stone-500">
                    {step.description}
                  </p>
                  {step.detail && (
                    <p
                      className={cn(
                        "mt-2 rounded-lg border px-3 py-2 text-xs leading-relaxed",
                        step.status === "failed"
                          ? "border-red-500/20 bg-red-500/[0.06] text-red-200"
                          : step.status === "active"
                            ? "border-amber-500/15 bg-amber-500/[0.04] text-amber-200"
                            : step.status === "completed"
                              ? "border-stone-800/50 bg-stone-900/30 text-stone-400"
                              : "border-stone-800/40 bg-stone-950/40 text-stone-500",
                      )}
                    >
                      {step.detail}
                    </p>
                  )}
                  {step.timestamp && (
                    <p className="mt-1 text-[11px] text-stone-600">
                      {formatTimestamp(step.timestamp)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer hint */}
      <div className="border-t border-stone-800/60 px-5 py-3">
        <p className="text-xs text-stone-600">
          {isFailed
            ? "Try uploading the document again."
            : "Chat will be available once processing completes."}
        </p>
      </div>
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

function CheckIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}
