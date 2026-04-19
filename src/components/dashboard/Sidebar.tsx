"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { DropdownMenu } from "radix-ui";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  Cancel01Icon,
  Logout03Icon,
  Pdf01Icon,
  PlusSignIcon,
  Search01Icon,
  SidebarLeftIcon,
  SidebarRightIcon,
  StarsIcon,
} from "@hugeicons/core-free-icons";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";
import { DocStatus } from "./DocStatus";

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
  embeddedChunkCount?: number;
  fileUrl: string | null;
  ocrGcsInputUri?: string;
  ocrFinalJsonGcsUri?: string;
};

type SortMode = "recent" | "alpha";

type DocumentGroup = {
  key: string;
  label: string;
  docs: WorkspaceDocument[];
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
  recentDocumentId: Id<"documents"> | null;
  selectedDocumentId: Id<"documents"> | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function groupDocuments(
  docs: WorkspaceDocument[],
  sortMode: SortMode,
): DocumentGroup[] {
  if (sortMode === "alpha") {
    const sorted = [...docs].sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
    );
    return [{ key: "all", label: "All documents", docs: sorted }];
  }

  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayCutoff = startOfToday.getTime();
  const weekCutoff = now - 7 * DAY_MS;

  const today: WorkspaceDocument[] = [];
  const week: WorkspaceDocument[] = [];
  const earlier: WorkspaceDocument[] = [];

  const sorted = [...docs].sort((a, b) => b._creationTime - a._creationTime);

  for (const doc of sorted) {
    if (doc._creationTime >= todayCutoff) {
      today.push(doc);
    } else if (doc._creationTime >= weekCutoff) {
      week.push(doc);
    } else {
      earlier.push(doc);
    }
  }

  return [
    { key: "today", label: "Today", docs: today },
    { key: "week", label: "This week", docs: week },
    { key: "earlier", label: "Earlier", docs: earlier },
  ].filter((group) => group.docs.length > 0);
}

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
  recentDocumentId,
  selectedDocumentId,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredDocuments = normalizedSearchQuery
    ? documents.filter((document) => {
        const searchableText =
          `${document.title} ${document.originalFilename}`.toLowerCase();
        return searchableText.includes(normalizedSearchQuery);
      })
    : documents;

  const continueDoc = useMemo(() => {
    if (!recentDocumentId) return null;
    if (normalizedSearchQuery) return null;
    return documents.find((d) => d._id === recentDocumentId) ?? null;
  }, [documents, recentDocumentId, normalizedSearchQuery]);

  const groupedDocuments = useMemo(() => {
    if (!continueDoc) return filteredDocuments;
    return filteredDocuments.filter(
      (document) => document._id !== continueDoc._id,
    );
  }, [continueDoc, filteredDocuments]);

  const groups = useMemo(
    () => groupDocuments(groupedDocuments, sortMode),
    [groupedDocuments, sortMode],
  );

  const userInitial = (name ?? email ?? "U").slice(0, 1).toUpperCase();

  return (
    <aside
      className={cn(
        "relative flex h-full flex-col overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]",
        collapsed ? "w-[56px]" : "w-[260px]",
      )}
    >
      <div className="absolute inset-0 bg-[#09090b]" />
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent" />
      <div className="absolute top-0 right-0 bottom-0 w-px bg-gradient-to-b from-white/[0.06] via-white/[0.03] to-white/[0.06]" />

      <div className="relative z-10 flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-4">
          {collapsed ? (
            <div className="mx-auto">
              <BrandLogo
                priority
                className="mx-auto"
                textClassName="hidden"
                logoClassName="h-7 w-7"
              />
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-between">
              <BrandLogo
                priority
                textClassName="bg-gradient-to-r from-amber-200 via-amber-400 to-orange-400 bg-clip-text text-transparent"
              />
            </div>
          )}
          <button
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "focus-ring flex h-7 w-7 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-white/[0.06] hover:text-stone-300",
              collapsed && "absolute top-4 right-1.5",
            )}
            onClick={() => onCollapsedChange(!collapsed)}
            type="button"
          >
            <HugeiconsIcon
              icon={collapsed ? SidebarRightIcon : SidebarLeftIcon}
              size={16}
              strokeWidth={1.8}
            />
          </button>
        </div>

        {/* Upload button */}
        <div className={cn("px-3", collapsed && "px-2.5")}>
          {collapsed ? (
            <button
              aria-label="Upload PDF"
              className="focus-ring surface-accent mx-auto flex h-9 w-9 items-center justify-center rounded-full transition-colors"
              onClick={onUploadClick}
              type="button"
            >
              <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={2} />
            </button>
          ) : (
            <button
              className="focus-ring surface-accent flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors"
              onClick={onUploadClick}
              type="button"
            >
              <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={2} />
              <span>Upload PDF</span>
            </button>
          )}
        </div>

        {/* Document list */}
        <div
          className={cn(
            "mt-4 flex-1 overflow-y-auto px-2",
            collapsed
              ? "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              : "chat-scroll-area",
          )}
        >
          {!collapsed && (
            <div className="mb-3 px-1">
              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <p className="text-xs font-semibold tracking-[0.12em] text-stone-500/80 uppercase">
                  Documents
                  {documents.length > 0 && (
                    <span className="ml-1.5 text-stone-600/60">
                      {filteredDocuments.length === documents.length
                        ? documents.length
                        : `${filteredDocuments.length}/${documents.length}`}
                    </span>
                  )}
                </p>
                {documents.length > 1 && (
                  <button
                    aria-label={
                      sortMode === "recent"
                        ? "Sort alphabetically"
                        : "Sort by recent"
                    }
                    className="focus-ring rounded-md px-1.5 py-0.5 text-xs text-stone-500 transition-colors hover:bg-white/[0.04] hover:text-stone-300"
                    onClick={() =>
                      setSortMode((m) => (m === "recent" ? "alpha" : "recent"))
                    }
                    type="button"
                  >
                    {sortMode === "recent" ? "Recent" : "A–Z"}
                  </button>
                )}
              </div>

              {documents.length > 0 && (
                <Input
                  aria-label="Search documents"
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search PDFs…"
                  startSlot={
                    <HugeiconsIcon
                      icon={Search01Icon}
                      size={14}
                      strokeWidth={2}
                    />
                  }
                  endSlot={
                    searchQuery.length > 0 ? (
                      <button
                        aria-label="Clear search"
                        className="focus-ring flex h-6 w-6 items-center justify-center rounded text-stone-500 hover:text-stone-300"
                        onClick={() => setSearchQuery("")}
                        type="button"
                      >
                        <HugeiconsIcon
                          icon={Cancel01Icon}
                          size={12}
                          strokeWidth={2}
                        />
                      </button>
                    ) : undefined
                  }
                  containerClassName="h-8"
                  type="search"
                  value={searchQuery}
                />
              )}
            </div>
          )}

          {/* Continue row */}
          {!collapsed && continueDoc && (
            <div className="mb-3">
              <p className="mb-1.5 px-2 text-xs font-semibold tracking-[0.12em] text-amber-400/70 uppercase">
                Continue
              </p>
              <DocumentRow
                collapsed={false}
                doc={continueDoc}
                isSelected={selectedDocumentId === continueDoc._id}
                onSelect={onDocumentSelect}
                eyebrow={
                  <HugeiconsIcon icon={StarsIcon} size={10} strokeWidth={2} />
                }
              />
            </div>
          )}

          {/* Document groups */}
          {groups.length > 0 ? (
            <div className="space-y-3">
              {groups.map((group) => (
                <div key={group.key}>
                  {!collapsed && groups.length > 1 && (
                    <p className="mb-1 px-2 text-xs tracking-[0.12em] text-stone-600 uppercase">
                      {group.label}
                    </p>
                  )}
                  <ul className="space-y-0.5">
                    {group.docs.map((doc) => (
                      <li key={doc._id}>
                        <DocumentRow
                          collapsed={collapsed}
                          doc={doc}
                          isSelected={selectedDocumentId === doc._id}
                          onSelect={onDocumentSelect}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : !continueDoc ? (
            !collapsed && (
              <div className="flex flex-col items-center gap-2 py-8">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.03] text-stone-600">
                  <HugeiconsIcon icon={Pdf01Icon} size={16} strokeWidth={1.8} />
                </div>
                <p className="text-sm text-stone-600">
                  {documents.length === 0
                    ? "No documents yet"
                    : `No PDFs match "${searchQuery.trim()}"`}
                </p>
              </div>
            )
          ) : null}
        </div>

        {/* User footer */}
        <div className="relative">
          <div className="absolute top-0 right-3 left-3 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
          <div className={cn("p-3", collapsed && "p-2")}>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  aria-label="Account menu"
                  className={cn(
                    "focus-ring flex w-full items-center gap-2.5 rounded-lg p-1 transition-colors hover:bg-white/[0.04]",
                    collapsed && "justify-center",
                  )}
                  type="button"
                >
                  <span className="relative shrink-0">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-xs font-bold text-[#070707]">
                      {userInitial}
                    </span>
                    <span className="absolute -inset-0.5 -z-10 rounded-full bg-gradient-to-br from-amber-400/20 to-orange-500/20 opacity-50 blur-sm" />
                  </span>
                  {!collapsed && (
                    <>
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-sm font-medium text-stone-200">
                          {name ?? "User"}
                        </span>
                        <span className="block truncate text-xs text-stone-500/70">
                          {email ?? ""}
                        </span>
                      </span>
                      <span className="text-stone-600">
                        <HugeiconsIcon
                          icon={ArrowDown01Icon}
                          size={12}
                          strokeWidth={2}
                        />
                      </span>
                    </>
                  )}
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align={collapsed ? "start" : "end"}
                  className="z-50 w-[220px] rounded-xl border border-white/[0.08] bg-[#111111] p-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl"
                  side="top"
                  sideOffset={8}
                >
                  <div className="px-2.5 py-2">
                    <p className="truncate text-sm font-medium text-stone-200">
                      {name ?? "User"}
                    </p>
                    <p className="truncate text-xs text-stone-500">
                      {email ?? ""}
                    </p>
                  </div>
                  <DropdownMenu.Separator className="my-1 h-px bg-white/[0.06]" />
                  <DropdownMenu.Item
                    className="focus-ring flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-stone-300 transition-colors outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-white/[0.05] data-[highlighted]:text-stone-100"
                    disabled={isSigningOut}
                    onSelect={(event) => {
                      event.preventDefault();
                      onSignOut();
                    }}
                  >
                    <HugeiconsIcon
                      icon={Logout03Icon}
                      size={14}
                      strokeWidth={1.8}
                    />
                    <span>{isSigningOut ? "Signing out…" : "Sign out"}</span>
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>
      </div>
    </aside>
  );
}

function DocumentRow({
  collapsed,
  doc,
  eyebrow,
  isSelected,
  onSelect,
}: {
  collapsed: boolean;
  doc: WorkspaceDocument;
  eyebrow?: ReactNode;
  isSelected: boolean;
  onSelect: (id: Id<"documents">) => void;
}) {
  return (
    <div className="relative">
      {isSelected && (
        <motion.div
          className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-gradient-to-b from-amber-400 to-orange-500"
          layoutId="selectedBar"
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      )}

      <button
        className={cn(
          "focus-ring group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-150",
          isSelected
            ? "bg-white/[0.05] text-stone-100"
            : "text-stone-400 hover:bg-white/[0.04] hover:text-stone-200",
          collapsed && "justify-center px-0",
        )}
        onClick={() => onSelect(doc._id)}
        title={collapsed ? doc.title : undefined}
        type="button"
      >
        <span
          className={cn(
            "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150",
            isSelected
              ? "bg-gradient-to-br from-amber-500/20 to-orange-500/10 text-amber-400 shadow-[0_0_8px_-2px_rgba(245,158,11,0.2)]"
              : "bg-white/[0.04] text-stone-500 group-hover:bg-white/[0.07] group-hover:text-stone-400",
          )}
        >
          <HugeiconsIcon icon={Pdf01Icon} size={14} strokeWidth={1.8} />
        </span>

        {!collapsed && (
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              {eyebrow && <span className="text-amber-400/70">{eyebrow}</span>}
              <span className="truncate text-sm leading-tight font-medium">
                {doc.title}
              </span>
            </span>
            <span className="mt-1 flex items-center gap-1.5">
              <DocStatus status={doc.status} variant="dot" />
              <span className="truncate text-xs text-stone-500/80">
                {doc.pageCount
                  ? `${doc.pageCount} pages`
                  : doc.status === "ready"
                    ? "Ready"
                    : "Processing"}
              </span>
            </span>
          </span>
        )}
      </button>
    </div>
  );
}
