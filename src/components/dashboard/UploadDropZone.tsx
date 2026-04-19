"use client";

import type { ChangeEvent, DragEvent } from "react";
import { useCallback, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Upload04Icon } from "@hugeicons/core-free-icons";
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
          "focus-ring relative flex w-full max-w-lg flex-col items-center rounded-2xl border-2 border-dashed px-8 py-16 text-center transition-colors duration-200",
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
            "mb-5 flex h-14 w-14 items-center justify-center rounded-2xl transition-colors",
            isDragging
              ? "bg-amber-500/15 text-amber-400"
              : "bg-stone-800/60 text-stone-500",
          )}
        >
          <HugeiconsIcon icon={Upload04Icon} size={26} strokeWidth={1.6} />
        </div>

        <h2 className="text-lg font-semibold text-stone-200">
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
