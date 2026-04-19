"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  Cancel01Icon,
  ReloadIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import type { WorkspaceDocument } from "./Sidebar";

type PipelineStepperProps = {
  document: WorkspaceDocument;
  defaultCollapsed?: boolean;
};

type StepStatus = "completed" | "active" | "pending" | "failed";

type PipelineStep = {
  id: string;
  label: string;
  description: string;
  status: StepStatus;
  detail?: string;
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function deriveSteps(document: WorkspaceDocument): PipelineStep[] {
  const steps: PipelineStep[] = [];

  const uploadDone = document.status !== "uploading";
  steps.push({
    id: "upload",
    label: "Upload",
    description: "PDF stored in cloud",
    status: uploadDone
      ? "completed"
      : document.status === "uploading"
        ? "active"
        : "pending",
    detail: uploadDone
      ? `${document.pageCount ?? "?"} pages · ${formatFileSize(document.storageSize)}`
      : "Uploading…",
  });

  const ocrDone = !!document.ocrCompletedAt;
  const ocrActive =
    !ocrDone &&
    (document.status === "processing" || document.status === "uploaded");
  const ocrFailed = document.status === "failed" && !ocrDone;
  steps.push({
    id: "ocr",
    label: "OCR",
    description: "Extracting text from each page",
    status: ocrFailed
      ? "failed"
      : ocrDone
        ? "completed"
        : ocrActive
          ? "active"
          : "pending",
    detail: ocrFailed
      ? (document.processingError ?? "OCR failed")
      : ocrDone
        ? `${document.pageCount ?? "?"} pages processed`
        : ocrActive
          ? "Running OCR on document pages…"
          : "Waiting for upload",
  });

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
    description: "Building vector index for search",
    status: embeddingFailed
      ? "failed"
      : embeddingDone
        ? "completed"
        : embeddingActive
          ? "active"
          : "pending",
    detail: embeddingFailed
      ? (document.processingError ?? "Embedding failed")
      : embeddingDone
        ? `${embeddedPageCount}/${totalPages} pages`
        : embeddingActive
          ? `${embeddedPageCount}/${totalPages} pages indexed…`
          : "Waiting for OCR",
  });

  return steps;
}

export function PipelineStepper({
  document,
  defaultCollapsed = false,
}: PipelineStepperProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const steps = deriveSteps(document);
  const isFailed = document.status === "failed";
  const completedCount = steps.filter((s) => s.status === "completed").length;
  const activeStep = steps.find((s) => s.status === "active");

  return (
    <section
      aria-label="Document processing"
      className={cn(
        "rounded-xl border bg-stone-950/40 backdrop-blur-sm",
        isFailed ? "border-red-500/20" : "border-white/[0.06]",
      )}
    >
      <button
        aria-expanded={!isCollapsed}
        className="focus-ring flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left"
        onClick={() => setIsCollapsed((v) => !v)}
        type="button"
      >
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
            isFailed
              ? "bg-red-500/10 text-red-400"
              : completedCount === steps.length
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-amber-500/10 text-amber-400",
          )}
        >
          {isFailed ? (
            <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
          ) : (
            <HugeiconsIcon icon={ReloadIcon} size={14} strokeWidth={2} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-stone-100">
            {isFailed
              ? "Processing failed"
              : completedCount === steps.length
                ? "Ready to chat"
                : "Preparing your document"}
          </p>
          <p className="truncate text-xs text-stone-500">
            {isFailed
              ? "Try uploading the document again."
              : activeStep
                ? activeStep.detail
                : `${completedCount} of ${steps.length} steps complete`}
          </p>
        </div>
        <span
          className={cn(
            "text-stone-500 transition-transform",
            isCollapsed ? "" : "rotate-180",
          )}
        >
          <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={2} />
        </span>
      </button>

      {!isCollapsed && (
        <div className="border-t border-white/[0.05] px-3.5 py-3">
          <ol className="space-y-2.5">
            {steps.map((step) => (
              <li key={step.id} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                  {step.status === "completed" ? (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        size={11}
                        strokeWidth={3}
                      />
                    </span>
                  ) : step.status === "active" ? (
                    <span className="relative flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/15">
                      <span className="absolute inset-0 animate-ping rounded-full bg-amber-500/10" />
                      <span className="h-2 w-2 rounded-full bg-amber-400" />
                    </span>
                  ) : step.status === "failed" ? (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/15 text-red-400">
                      <HugeiconsIcon
                        icon={Cancel01Icon}
                        size={11}
                        strokeWidth={3}
                      />
                    </span>
                  ) : (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/[0.04]">
                      <span className="h-1.5 w-1.5 rounded-full bg-stone-600" />
                    </span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        step.status === "completed" && "text-stone-200",
                        step.status === "active" && "text-amber-300",
                        step.status === "failed" && "text-red-300",
                        step.status === "pending" && "text-stone-500",
                      )}
                    >
                      {step.label}
                    </p>
                    {step.detail && (
                      <p
                        className={cn(
                          "truncate text-xs",
                          step.status === "failed"
                            ? "text-red-300/80"
                            : "text-stone-500",
                        )}
                      >
                        {step.detail}
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-stone-600">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
