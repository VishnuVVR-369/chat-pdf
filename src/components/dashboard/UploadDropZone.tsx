"use client";

import type { ChangeEvent, DragEvent } from "react";
import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { MAX_PDF_PAGES } from "@/constants/pdf";

type UploadDropZoneProps = {
  onFileSelect: (file: File) => void;
};

export function UploadDropZone({ onFileSelect }: UploadDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

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

      const file = e.dataTransfer.files[0];
      if (file) {
        onFileSelect(file);
      }
    },
    [onFileSelect],
  );

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        return;
      }

      e.target.value = "";
      onFileSelect(file);
    },
    [onFileSelect],
  );

  return (
    <div className="flex h-full items-center justify-center p-8">
      <input
        ref={fileInputRef}
        accept=".pdf,application/pdf"
        className="sr-only"
        type="file"
        onChange={handleFileChange}
      />

      <button
        className={cn(
          "relative flex w-full max-w-lg flex-col items-center rounded-2xl border-2 border-dashed px-8 py-16 text-center transition-all duration-200",
          isDragging
            ? "border-amber-400/50 bg-amber-500/[0.06]"
            : "border-stone-700/50 bg-stone-900/20 hover:border-stone-600/60 hover:bg-stone-900/30",
        )}
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div
          className={cn(
            "mb-6 flex h-14 w-14 items-center justify-center rounded-2xl transition-colors",
            isDragging
              ? "bg-amber-500/15 text-amber-400"
              : "bg-stone-800/60 text-stone-500",
          )}
        >
          <UploadCloudIcon />
        </div>

        <h2 className="text-xl font-semibold text-stone-200">
          {isDragging ? "Drop your PDF here" : "Drop a PDF to get started"}
        </h2>

        <p className="mt-2 text-sm text-stone-500">
          click anywhere here or drag one in
        </p>

        <p className="mt-4 text-xs text-stone-600">
          PDF files up to {MAX_PDF_PAGES} pages
        </p>
      </button>
    </div>
  );
}

function UploadCloudIcon() {
  return (
    <svg
      className="h-7 w-7"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 13v8" />
      <path d="m8 17 4-4 4 4" />
      <path d="M20 16.7A4.5 4.5 0 0 0 17.5 8h-1.1A7 7 0 1 0 4 14.9" />
    </svg>
  );
}
