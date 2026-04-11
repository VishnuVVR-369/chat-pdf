"use client";

import type { DragEvent, ChangeEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { inspectPdfFile } from "@/lib/pdf-client";
import { cn } from "@/lib/utils";
import { MAX_PDF_PAGES } from "@/constants/pdf";
import type { Id } from "../../../convex/_generated/dataModel";

type UploadModalProps = {
  isOpen: boolean;
  initialFile?: File | null;
  onClose: () => void;
  onUpload: (file: File) => Promise<Id<"documents">>;
  onSuccess: (documentId: Id<"documents">) => void;
};

type ModalPhase =
  | { type: "idle" }
  | { type: "checking"; file: File }
  | { type: "uploading"; file: File; pageCount: number | null }
  | { type: "success"; documentId: Id<"documents"> }
  | { type: "error"; message: string };

export function UploadModal({ isOpen, initialFile, onClose, onUpload, onSuccess }: UploadModalProps) {
  const [phase, setPhase] = useState<ModalPhase>({ type: "idle" });
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isProcessing = phase.type === "checking" || phase.type === "uploading";

  // Auto-process initialFile when modal opens
  useEffect(() => {
    if (isOpen && initialFile) {
      void processFile(initialFile);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialFile]);

  // Reset state after modal closes
  useEffect(() => {
    if (!isOpen) {
      const t = setTimeout(() => {
        setPhase({ type: "idle" });
        setIsDragging(false);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Auto-close on success
  useEffect(() => {
    if (phase.type === "success") {
      const t = setTimeout(() => {
        onSuccess(phase.documentId);
        onClose();
      }, 1400);
      return () => clearTimeout(t);
    }
  }, [phase, onSuccess, onClose]);

  // Escape key to close (not while processing)
  useEffect(() => {
    if (!isOpen) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isProcessing) onClose();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [isOpen, isProcessing, onClose]);

  const processFile = useCallback(
    async (file: File) => {
      const looksLikePdf =
        file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

      if (!looksLikePdf) {
        setPhase({ type: "error", message: "Please select a valid PDF file." });
        return;
      }

      setPhase({ type: "checking", file });

      try {
        const result = await inspectPdfFile(file);

        if (result.status === "rejected") {
          setPhase({ type: "error", message: result.message });
          return;
        }

        const pageCount = result.status === "ready" ? result.pageCount : null;
        setPhase({ type: "uploading", file, pageCount });

        const documentId = await onUpload(file);
        setPhase({ type: "success", documentId });
      } catch (error) {
        setPhase({
          type: "error",
          message: error instanceof Error ? error.message : "Upload failed. Please try again.",
        });
      }
    },
    [onUpload],
  );

  const handleDragOver = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (phase.type === "idle") setIsDragging(true);
    },
    [phase.type],
  );

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (phase.type !== "idle") return;
      const file = e.dataTransfer.files[0];
      if (file) void processFile(file);
    },
    [phase.type, processFile],
  );

  const handleFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";
      void processFile(file);
    },
    [processFile],
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center sm:p-6"
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {/* Backdrop */}
          <motion.div
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={!isProcessing ? onClose : undefined}
          />

          {/* Card */}
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className={cn(
              "relative z-10 w-full max-w-md overflow-hidden rounded-2xl border bg-[#111111] shadow-2xl shadow-black/60 transition-[border-color,box-shadow] duration-300",
              isDragging
                ? "border-amber-500/50 shadow-[0_0_80px_rgba(245,158,11,0.09)]"
                : "border-stone-800",
            )}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <input
              ref={fileInputRef}
              accept=".pdf,application/pdf"
              className="sr-only"
              type="file"
              onChange={handleFileInputChange}
            />

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-stone-800/60">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
                  <UploadIcon size={14} />
                </div>
                <h2 className="text-sm font-semibold text-stone-200">Upload PDF</h2>
              </div>
              {!isProcessing && (
                <button
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-stone-600 transition-colors hover:bg-stone-800 hover:text-stone-300"
                  type="button"
                  onClick={onClose}
                >
                  <CloseIcon />
                </button>
              )}
            </div>

            {/* Body */}
            <div className="p-5">
              <AnimatePresence mode="wait">
                {/* ── Idle: drop zone ── */}
                {phase.type === "idle" && (
                  <motion.div
                    key="idle"
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    initial={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <button
                      className={cn(
                        "group relative flex w-full cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-8 py-14 text-center transition-all duration-200",
                        isDragging
                          ? "border-amber-400/60 bg-amber-500/[0.04]"
                          : "border-stone-700/60 hover:border-stone-600/70 hover:bg-stone-800/20",
                      )}
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {/* Icon */}
                      <div
                        className={cn(
                          "mb-5 flex h-16 w-16 items-center justify-center rounded-2xl transition-all duration-300",
                          isDragging
                            ? "scale-110 bg-amber-500/15 text-amber-400"
                            : "bg-stone-800/80 text-stone-500 group-hover:bg-stone-800 group-hover:text-stone-400",
                        )}
                      >
                        <UploadIcon size={28} />
                      </div>

                      <p
                        className={cn(
                          "text-base font-medium transition-colors duration-200",
                          isDragging ? "text-amber-300" : "text-stone-300",
                        )}
                      >
                        {isDragging ? "Release to upload" : "Drop your PDF here"}
                      </p>

                      <p className="mt-1.5 text-sm text-stone-500">
                        or{" "}
                        <span className="text-stone-400 underline underline-offset-2">
                          click to browse
                        </span>
                      </p>

                      <div className="mt-6 flex items-center gap-1.5 text-xs text-stone-700">
                        <LockIcon />
                        <span>PDF files · up to {MAX_PDF_PAGES} pages</span>
                      </div>
                    </button>
                  </motion.div>
                )}

                {/* ── Checking / Uploading ── */}
                {(phase.type === "checking" || phase.type === "uploading") && (
                  <motion.div
                    key="progress"
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center py-10"
                    exit={{ opacity: 0 }}
                    initial={{ opacity: 0, y: 6 }}
                    transition={{ duration: 0.2 }}
                  >
                    {/* Spinning ring with PDF icon */}
                    <div className="relative mb-6 h-16 w-16">
                      <svg
                        className="absolute inset-0 h-full w-full -rotate-90"
                        viewBox="0 0 64 64"
                      >
                        <circle
                          className="text-stone-800"
                          cx="32"
                          cy="32"
                          fill="none"
                          r="28"
                          stroke="currentColor"
                          strokeWidth="3"
                        />
                        <circle
                          className="text-amber-400 transition-all duration-700 ease-out"
                          cx="32"
                          cy="32"
                          fill="none"
                          r="28"
                          stroke="currentColor"
                          strokeDasharray="175.9"
                          strokeDashoffset={phase.type === "checking" ? 100 : 40}
                          strokeLinecap="round"
                          strokeWidth="3"
                        />
                      </svg>
                      {/* Spinning outer arc overlay */}
                      <svg
                        className="absolute inset-0 h-full w-full animate-spin"
                        style={{ animationDuration: "1.2s" }}
                        viewBox="0 0 64 64"
                      >
                        <circle
                          className="text-amber-400/40"
                          cx="32"
                          cy="32"
                          fill="none"
                          r="28"
                          stroke="currentColor"
                          strokeDasharray="20 155.9"
                          strokeLinecap="round"
                          strokeWidth="3"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center text-amber-400">
                        <PdfFileIcon />
                      </div>
                    </div>

                    <p className="text-sm font-medium text-stone-200">
                      {phase.type === "checking" ? "Inspecting PDF…" : "Uploading…"}
                    </p>
                    <p className="mt-1.5 max-w-[200px] truncate text-center text-xs text-stone-500">
                      {phase.file.name}
                    </p>
                    {phase.type === "uploading" && phase.pageCount != null && (
                      <p className="mt-1 text-xs text-stone-600">{phase.pageCount} pages</p>
                    )}
                  </motion.div>
                )}

                {/* ── Success ── */}
                {phase.type === "success" && (
                  <motion.div
                    key="success"
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center py-10"
                    exit={{ opacity: 0 }}
                    initial={{ opacity: 0, scale: 0.88 }}
                    transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <motion.div
                      animate={{ scale: 1 }}
                      className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-400"
                      initial={{ scale: 0.6 }}
                      transition={{ delay: 0.05, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <CheckIcon />
                    </motion.div>
                    <p className="text-sm font-semibold text-stone-200">Upload complete!</p>
                    <p className="mt-1 text-xs text-stone-500">Opening your document…</p>
                  </motion.div>
                )}

                {/* ── Error ── */}
                {phase.type === "error" && (
                  <motion.div
                    key="error"
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center py-10"
                    exit={{ opacity: 0 }}
                    initial={{ opacity: 0, y: 6 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-red-400">
                      <ErrorIcon />
                    </div>
                    <p className="max-w-[250px] text-center text-sm text-stone-300 leading-relaxed">
                      {phase.message}
                    </p>
                    <button
                      className="mt-5 rounded-lg border border-stone-700/60 bg-stone-800/60 px-4 py-2 text-sm font-medium text-stone-200 transition-colors hover:bg-stone-700/80 hover:border-stone-600"
                      type="button"
                      onClick={() => {
                        setPhase({ type: "idle" });
                        setTimeout(() => fileInputRef.current?.click(), 50);
                      }}
                    >
                      Try another file
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────

function UploadIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.75"
      viewBox="0 0 24 24"
      width={size}
    >
      <path d="M12 13v8" />
      <path d="m8 17 4-4 4 4" />
      <path d="M20 16.7A4.5 4.5 0 0 0 17.5 8h-1.1A7 7 0 1 0 4 14.9" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24" width="14">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function PdfFileIcon() {
  return (
    <svg fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" viewBox="0 0 24 24" width="20">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg fill="none" height="28" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="28">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg fill="none" height="28" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" viewBox="0 0 24 24" width="28">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg fill="none" height="11" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" viewBox="0 0 24 24" width="11">
      <rect height="11" rx="2" ry="2" width="18" x="3" y="11" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
