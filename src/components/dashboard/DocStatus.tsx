"use client";

import { cn } from "@/lib/utils";
import type { WorkspaceDocument } from "./Sidebar";

type DocStatusValue = WorkspaceDocument["status"];

type DocStatusProps = {
  status: DocStatusValue;
  variant?: "dot" | "badge" | "pill";
  className?: string;
};

const STATUS_LABELS: Record<DocStatusValue, string> = {
  uploading: "Uploading",
  uploaded: "Queued",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};

const STATUS_DOT_COLORS: Record<DocStatusValue, string> = {
  ready: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]",
  uploading: "bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.4)]",
  uploaded: "bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.4)]",
  processing: "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.4)]",
  failed: "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.4)]",
};

const STATUS_TONE: Record<DocStatusValue, string> = {
  ready: "bg-emerald-500/10 text-emerald-300",
  uploading: "bg-sky-500/10 text-sky-300",
  uploaded: "bg-cyan-500/10 text-cyan-300",
  processing: "bg-amber-500/10 text-amber-300",
  failed: "bg-red-500/10 text-red-300",
};

export function DocStatus({
  status,
  variant = "dot",
  className,
}: DocStatusProps) {
  if (variant === "dot") {
    return (
      <span
        aria-label={STATUS_LABELS[status]}
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          STATUS_DOT_COLORS[status],
          status === "processing" && "animate-pulse",
          className,
        )}
      />
    );
  }

  if (variant === "pill") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
          STATUS_TONE[status],
          className,
        )}
      >
        <span
          className={cn(
            "inline-block h-1.5 w-1.5 rounded-full",
            STATUS_DOT_COLORS[status],
            status === "processing" && "animate-pulse",
          )}
        />
        {STATUS_LABELS[status]}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium tracking-wide uppercase",
        STATUS_TONE[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
