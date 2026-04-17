"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { cn } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

export type WorkspaceDocument = {
  _id: Id<"documents">;
  _creationTime: number;
  title: string;
  originalFilename: string;
  status: "uploading" | "uploaded" | "processing" | "ready" | "failed";
  pageCount?: number;
  processingError?: string;
  storageContentType?: string;
  storageSize: number;
  uploadCompletedAt: number;
  processingStartedAt?: number;
  ocrCompletedAt?: number;
  embeddingsCompletedAt?: number;
  lastProcessedAt?: number;
  ocrMethod?: "document_ai_batch";
  ocrProvider?: "google_document_ai";
  ocrModelOrProcessor?: string;
  embeddingModel?: string;
  embeddedPageCount?: number;
  fileUrl: string | null;
  ocrGcsInputUri?: string;
  ocrFinalJsonGcsUri?: string;
};

type SidebarProps = {
  collapsed: boolean;
  documents: WorkspaceDocument[];
  email: string | null | undefined;
  isSigningOut: boolean;
  name: string | null | undefined;
  onCollapsedChange: (collapsed: boolean) => void;
  onDocumentSelect: (id: Id<"documents">) => void;
  onSignOut: () => void;
  onUploadClick: () => void;
  selectedDocumentId: Id<"documents"> | null;
};

export function Sidebar({
  collapsed,
  documents,
  email,
  isSigningOut,
  name,
  onCollapsedChange,
  onDocumentSelect,
  onSignOut,
  onUploadClick,
  selectedDocumentId,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredDocId, setHoveredDocId] = useState<Id<"documents"> | null>(
    null,
  );
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredDocuments = normalizedSearchQuery
    ? documents.filter((document) => {
        const searchableText =
          `${document.title} ${document.originalFilename}`.toLowerCase();
        return searchableText.includes(normalizedSearchQuery);
      })
    : documents;

  return (
    <aside
      className={cn(
        "relative flex h-full flex-col overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]",
        collapsed ? "w-[62px]" : "w-[280px]",
      )}
    >
      {/* Glassmorphic background layers */}
      <div className="absolute inset-0 bg-[#09090b]" />
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent" />
      <div className="absolute top-0 right-0 bottom-0 w-px bg-gradient-to-b from-white/[0.06] via-white/[0.03] to-white/[0.06]" />

      {/* Content */}
      <div className="relative z-10 flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-4">
          <AnimatePresence mode="wait" initial={false}>
            {collapsed ? (
              <motion.div
                key="collapsed-logo"
                className="mx-auto"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
              >
                <div className="relative">
                  <BrandLogo
                    priority
                    className="mx-auto"
                    textClassName="hidden"
                    logoClassName="h-8 w-8"
                  />
                  <div className="absolute -inset-1 -z-10 rounded-xl bg-amber-500/10 blur-md" />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="expanded-logo"
                className="flex flex-1 items-center justify-between"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <BrandLogo
                  priority
                  textClassName="bg-gradient-to-r from-amber-200 via-amber-400 to-orange-400 bg-clip-text text-transparent"
                />
                <motion.button
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-white/[0.06] hover:text-stone-300"
                  onClick={() => onCollapsedChange(true)}
                  type="button"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <PanelCollapseIcon />
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
          {collapsed && (
            <motion.button
              className="absolute top-4 right-1.5 flex h-7 w-7 items-center justify-center rounded-lg text-stone-600 transition-colors hover:bg-white/[0.06] hover:text-stone-400"
              onClick={() => onCollapsedChange(false)}
              type="button"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              style={{ display: collapsed ? undefined : "none" }}
            >
              <PanelExpandIcon />
            </motion.button>
          )}
        </div>

        {/* Upload button */}
        <div className={cn("px-3", collapsed && "px-2.5")}>
          {collapsed ? (
            <motion.button
              className="group relative mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-amber-500/20 bg-amber-500/10 text-amber-400 backdrop-blur-sm"
              onClick={onUploadClick}
              type="button"
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.95 }}
            >
              <PlusIcon />
              <div className="absolute inset-0 rounded-full bg-amber-500/10 opacity-0 blur-md transition-opacity group-hover:opacity-100" />
            </motion.button>
          ) : (
            <motion.button
              className="group relative flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-300 backdrop-blur-sm transition-colors hover:border-amber-500/30 hover:bg-amber-500/15 hover:text-amber-200"
              onClick={onUploadClick}
              type="button"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
            >
              <PlusIcon />
              <span>Upload PDF</span>
              <div className="absolute inset-0 rounded-xl bg-amber-500/5 opacity-0 blur-lg transition-opacity group-hover:opacity-100" />
            </motion.button>
          )}
        </div>

        {/* Document list */}
        <div className="scrollbar-thin mt-4 flex-1 overflow-y-auto px-2">
          <AnimatePresence mode="wait">
            {!collapsed && (
              <motion.div
                key="doc-header"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
              >
                <div className="mb-2.5 flex items-center justify-between gap-2 px-2">
                  <p className="text-[10px] font-semibold tracking-[0.12em] text-stone-500/80 uppercase">
                    Documents
                    {documents.length > 0 && (
                      <span className="ml-1.5 text-stone-600/60">
                        {filteredDocuments.length === documents.length
                          ? documents.length
                          : `${filteredDocuments.length}/${documents.length}`}
                      </span>
                    )}
                  </p>
                </div>

                {/* Glass search input */}
                <label className="relative mb-3 block px-1">
                  <span className="sr-only">Search PDFs</span>
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-4 h-3.5 w-3.5 -translate-y-1/2 text-stone-600 transition-colors peer-focus:text-amber-400/70" />
                  <input
                    className="peer h-8 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] pr-8 pl-9 text-[13px] text-stone-300 transition-all outline-none placeholder:text-stone-600 focus:border-amber-500/30 focus:bg-white/[0.05] focus:shadow-[0_0_12px_-3px_rgba(245,158,11,0.15)]"
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search PDFs…"
                    type="search"
                    value={searchQuery}
                  />
                  <AnimatePresence>
                    {searchQuery.length > 0 && (
                      <motion.button
                        aria-label="Clear PDF search"
                        className="absolute top-1/2 right-3 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-stone-500 transition-colors hover:text-stone-300"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        onClick={() => setSearchQuery("")}
                        type="button"
                      >
                        <ClearIcon />
                      </motion.button>
                    )}
                  </AnimatePresence>
                </label>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-0.5">
            {filteredDocuments.map((doc, index) => {
              const isSelected = selectedDocumentId === doc._id;
              return (
                <motion.div
                  key={doc._id}
                  className="relative"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    duration: 0.25,
                    delay: Math.min(index * 0.03, 0.3),
                  }}
                  onHoverStart={() => setHoveredDocId(doc._id)}
                  onHoverEnd={() => setHoveredDocId(null)}
                >
                  {/* Selected indicator bar */}
                  {isSelected && (
                    <motion.div
                      className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-gradient-to-b from-amber-400 to-orange-500"
                      layoutId="selectedBar"
                      transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 30,
                      }}
                    />
                  )}

                  <button
                    className={cn(
                      "group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all duration-200",
                      isSelected
                        ? "bg-white/[0.05] text-stone-100"
                        : "text-stone-400 hover:bg-white/[0.04] hover:text-stone-200",
                      collapsed && "justify-center px-0",
                    )}
                    onClick={() => onDocumentSelect(doc._id)}
                    type="button"
                  >
                    <span
                      className={cn(
                        "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-medium transition-all duration-200",
                        isSelected
                          ? "bg-gradient-to-br from-amber-500/20 to-orange-500/10 text-amber-400 shadow-[0_0_8px_-2px_rgba(245,158,11,0.2)]"
                          : "bg-white/[0.04] text-stone-500 group-hover:bg-white/[0.07] group-hover:text-stone-400",
                      )}
                    >
                      <PdfIcon />
                    </span>

                    {/* Tooltip for collapsed mode */}
                    <AnimatePresence>
                      {collapsed && hoveredDocId === doc._id && (
                        <motion.div
                          className="absolute left-[calc(100%+8px)] z-50 rounded-lg border border-white/[0.08] bg-[#18181b]/95 px-3 py-1.5 text-xs font-medium text-stone-200 shadow-xl backdrop-blur-md"
                          initial={{ opacity: 0, x: -4 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -4 }}
                          transition={{ duration: 0.12 }}
                        >
                          {doc.title}
                          <div className="absolute top-1/2 left-0 -translate-x-1 -translate-y-1/2 border-4 border-transparent border-r-[#18181b]/95" />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {!collapsed && (
                      <motion.div
                        className="min-w-0 flex-1"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.1 }}
                      >
                        <p className="truncate text-[13px] leading-tight font-medium">
                          {doc.title}
                        </p>
                        <div className="mt-1 flex items-center gap-1.5">
                          <StatusDot status={doc.status} />
                          <span className="truncate text-[11px] text-stone-500/80">
                            {doc.pageCount
                              ? `${doc.pageCount} pages`
                              : doc.status}
                          </span>
                        </div>
                      </motion.div>
                    )}
                  </button>
                </motion.div>
              );
            })}
          </div>

          {documents.length === 0 && !collapsed && (
            <motion.div
              className="flex flex-col items-center gap-2 py-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.03] text-stone-600">
                <PdfIcon />
              </div>
              <p className="text-[13px] text-stone-600">No documents yet</p>
            </motion.div>
          )}

          {documents.length > 0 &&
            filteredDocuments.length === 0 &&
            !collapsed && (
              <p className="px-2 py-6 text-center text-[13px] text-stone-600">
                No PDFs match &quot;{searchQuery.trim()}&quot;
              </p>
            )}
        </div>

        {/* User section — gradient divider instead of hard border */}
        <div className="relative">
          <div className="absolute top-0 right-3 left-3 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
          <div
            className={cn(
              "group/footer p-3 transition-colors",
              collapsed && "p-2",
            )}
          >
            {collapsed ? (
              <div className="flex flex-col items-center gap-2">
                <div className="relative">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-[11px] font-bold text-[#070707]">
                    {(name ?? email ?? "U").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="absolute -inset-0.5 -z-10 rounded-full bg-gradient-to-br from-amber-400/20 to-orange-500/20 opacity-60 blur-sm" />
                </div>
                <motion.button
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-stone-600 transition-colors hover:bg-white/[0.06] hover:text-stone-400"
                  disabled={isSigningOut}
                  onClick={onSignOut}
                  type="button"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <LogoutIcon />
                </motion.button>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 rounded-lg px-1 py-1 transition-colors hover:bg-white/[0.03]">
                <div className="relative">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-[11px] font-bold text-[#070707]">
                    {(name ?? email ?? "U").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="absolute -inset-0.5 -z-10 rounded-full bg-gradient-to-br from-amber-400/20 to-orange-500/20 opacity-40 blur-sm" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-stone-200">
                    {name ?? "User"}
                  </p>
                  <p className="truncate text-[11px] text-stone-500/70">
                    {email ?? ""}
                  </p>
                </div>
                <motion.button
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-stone-600 opacity-0 transition-all group-hover/footer:opacity-100 hover:bg-white/[0.06] hover:text-stone-400"
                  disabled={isSigningOut}
                  onClick={onSignOut}
                  type="button"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <LogoutIcon />
                </motion.button>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/*  Small presentational helpers                                      */
/* ------------------------------------------------------------------ */

function StatusDot({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    ready: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]",
    uploading: "bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.4)]",
    uploaded: "bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.4)]",
    processing: "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.4)]",
    failed: "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.4)]",
  };

  return (
    <span
      className={cn(
        "inline-block h-1.5 w-1.5 rounded-full",
        colorMap[status] ?? "bg-stone-500",
        status === "processing" && "animate-pulse",
      )}
    />
  );
}

function PdfIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M10 13h4" />
      <path d="M10 17h4" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function PanelCollapseIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m14 18-6-6 6-6" />
      <path d="M20 5v14" />
    </svg>
  );
}

function PanelExpandIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m10 18 6-6-6-6" />
      <path d="M4 5v14" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" />
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function ClearIcon() {
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
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
