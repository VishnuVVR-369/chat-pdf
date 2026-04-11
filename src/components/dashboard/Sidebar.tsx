"use client";

import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

export type WorkspaceDocument = {
  _id: Id<"documents">;
  _creationTime: number;
  title: string;
  originalFilename: string;
  status: "uploaded" | "processing" | "ready" | "failed";
  pageCount?: number;
  processingError?: string;
  storageContentType?: string;
  storageSize: number;
  uploadCompletedAt: number;
  fileUrl: string | null;
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
  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-stone-800/60 bg-[#0a0a0a] transition-all duration-300",
        collapsed ? "w-[68px]" : "w-[280px]",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-4">
        <BrandLogo
          priority
          className={cn("transition-opacity", collapsed && "hidden")}
          textClassName="text-stone-100"
        />
        {collapsed && (
          <BrandLogo
            priority
            className="mx-auto"
            textClassName="hidden"
          />
        )}
        <button
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-800/60 hover:text-stone-300",
            collapsed && "mx-auto",
          )}
          onClick={() => onCollapsedChange(!collapsed)}
          type="button"
        >
          {collapsed ? <PanelExpandIcon /> : <PanelCollapseIcon />}
        </button>
      </div>

      {/* Upload button */}
      <div className={cn("px-3", collapsed && "px-2")}>
        {collapsed ? (
          <button
            className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-[#070707] transition-colors hover:bg-amber-400"
            onClick={onUploadClick}
            type="button"
          >
            <PlusIcon />
          </button>
        ) : (
          <Button
            className="w-full rounded-xl bg-amber-500 font-medium text-[#070707] hover:bg-amber-400"
            onClick={onUploadClick}
            size="sm"
          >
            <PlusIcon />
            Upload PDF
          </Button>
        )}
      </div>

      {/* Document list */}
      <div className="mt-4 flex-1 overflow-y-auto px-2">
        {!collapsed && (
          <p className="mb-2 px-2 text-[11px] font-medium uppercase tracking-wider text-stone-500">
            Documents
            {documents.length > 0 && (
              <span className="ml-1.5 text-stone-600">{documents.length}</span>
            )}
          </p>
        )}

        <div className="space-y-0.5">
          {documents.map((doc) => (
            <button
              key={doc._id}
              className={cn(
                "group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                selectedDocumentId === doc._id
                  ? "bg-amber-500/10 text-stone-100"
                  : "text-stone-400 hover:bg-stone-800/50 hover:text-stone-200",
                collapsed && "justify-center px-0",
              )}
              onClick={() => onDocumentSelect(doc._id)}
              type="button"
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-medium",
                  selectedDocumentId === doc._id
                    ? "bg-amber-500/15 text-amber-400"
                    : "bg-stone-800/60 text-stone-500 group-hover:text-stone-400",
                )}
              >
                <PdfIcon />
              </span>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{doc.title}</p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <StatusDot status={doc.status} />
                    <span className="truncate text-[11px] text-stone-500">
                      {doc.pageCount ? `${doc.pageCount} pages` : doc.status}
                    </span>
                  </div>
                </div>
              )}
            </button>
          ))}
        </div>

        {documents.length === 0 && !collapsed && (
          <p className="px-2 py-4 text-center text-sm text-stone-600">
            No documents yet
          </p>
        )}
      </div>

      {/* User section */}
      <div className={cn("border-t border-stone-800/60 p-3", collapsed && "p-2")}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 text-xs font-semibold text-[#070707]">
              {(name ?? email ?? "U").slice(0, 1).toUpperCase()}
            </div>
            <button
              className="flex h-8 w-8 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-800/60 hover:text-stone-300"
              disabled={isSigningOut}
              onClick={onSignOut}
              type="button"
            >
              <LogoutIcon />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 text-xs font-semibold text-[#070707]">
              {(name ?? email ?? "U").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-stone-200">
                {name ?? "User"}
              </p>
              <p className="truncate text-[11px] text-stone-500">
                {email ?? ""}
              </p>
            </div>
            <button
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-stone-800/60 hover:text-stone-300"
              disabled={isSigningOut}
              onClick={onSignOut}
              type="button"
            >
              <LogoutIcon />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/*  Small presentational helpers                                      */
/* ------------------------------------------------------------------ */

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-block h-1.5 w-1.5 rounded-full",
        status === "ready" && "bg-emerald-400",
        status === "uploaded" && "bg-cyan-400",
        status === "processing" && "bg-amber-400",
        status === "failed" && "bg-red-400",
      )}
    />
  );
}

function PdfIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M10 13h4" />
      <path d="M10 17h4" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function PanelCollapseIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m14 18-6-6 6-6" />
      <path d="M20 5v14" />
    </svg>
  );
}

function PanelExpandIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m10 18 6-6-6-6" />
      <path d="M4 5v14" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" />
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
    </svg>
  );
}
