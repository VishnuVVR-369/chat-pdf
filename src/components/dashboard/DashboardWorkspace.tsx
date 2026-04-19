"use client";

import { useEffect, useMemo, useState } from "react";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Menu01Icon } from "@hugeicons/core-free-icons";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ChatPanel } from "./ChatPanel";
import { PdfViewer } from "./PdfViewer";
import { Sidebar } from "./Sidebar";
import type { WorkspaceDocument } from "./Sidebar";
import { UploadDropZone } from "./UploadDropZone";
import { UploadModal } from "./UploadModal";

type DashboardWorkspaceProps = {
  email: string | null | undefined;
  name: string | null | undefined;
};

type MobileTab = "pdf" | "chat";

const EMPTY_DOCUMENTS: WorkspaceDocument[] = [];
const SIDEBAR_COLLAPSED_KEY = "chatpdf:sidebarCollapsed";
const RECENT_DOC_KEY = "chatpdf:recentDocumentId";

function readSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function readRecentDocumentId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(RECENT_DOC_KEY);
  } catch {
    return null;
  }
}

export function DashboardWorkspace({ email, name }: DashboardWorkspaceProps) {
  const router = useRouter();
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const documents = useQuery(
    api.documents.listDocuments,
    isAuthenticated ? {} : "skip",
  );
  const createDirectUploadTarget = useAction(
    api.documentUploads.createDirectUploadTarget,
  );
  const completeDirectUpload = useAction(
    api.documentUploads.completeDirectUpload,
  );
  const getDocumentPdfUrl = useAction(api.documentUploads.getDocumentPdfUrl);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("pdf");
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [dropZoneFile, setDropZoneFile] = useState<File | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] =
    useState<Id<"documents"> | null>(null);
  const [recentDocumentId, setRecentDocumentId] =
    useState<Id<"documents"> | null>(null);
  const [hasMounted, setHasMounted] = useState(false);
  const [selectedDocumentPreviewUrl, setSelectedDocumentPreviewUrl] = useState<
    string | null
  >(null);
  const [uploadedPreviewFiles, setUploadedPreviewFiles] = useState<
    Record<string, File>
  >({});
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState<number | null>(null);

  const workspaceDocuments: WorkspaceDocument[] = documents ?? EMPTY_DOCUMENTS;
  const selectedDocument: WorkspaceDocument | null =
    workspaceDocuments.find(
      (d: WorkspaceDocument) => d._id === selectedDocumentId,
    ) ?? null;
  const selectedDocumentLocalFile = selectedDocumentId
    ? (uploadedPreviewFiles[selectedDocumentId] ?? null)
    : null;
  const isDocumentsLoading = isAuthenticated && documents === undefined;
  const showWorkspaceLoading =
    hasMounted && (isAuthLoading || isDocumentsLoading);

  // Restore persisted UI state on mount.
  useEffect(() => {
    setHasMounted(true);
    setIsSidebarCollapsed(readSidebarCollapsed());
    const recent = readRecentDocumentId();
    if (recent) {
      setRecentDocumentId(recent as Id<"documents">);
    }
  }, []);

  // Persist sidebar collapsed state.
  useEffect(() => {
    if (!hasMounted) return;
    try {
      window.localStorage.setItem(
        SIDEBAR_COLLAPSED_KEY,
        isSidebarCollapsed ? "1" : "0",
      );
    } catch {
      // ignore
    }
  }, [hasMounted, isSidebarCollapsed]);

  // Track most recently opened document for the Continue row.
  useEffect(() => {
    if (!selectedDocumentId) return;
    setRecentDocumentId(selectedDocumentId);
    try {
      window.localStorage.setItem(RECENT_DOC_KEY, selectedDocumentId);
    } catch {
      // ignore
    }
  }, [selectedDocumentId]);

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.replace("/sign-in");
    }
  }, [isAuthLoading, isAuthenticated, router]);

  // Auto-select a document when none is selected, prefer the most recently opened.
  useEffect(() => {
    if (workspaceDocuments.length === 0) {
      if (selectedDocumentId !== null) setSelectedDocumentId(null);
      return;
    }

    if (
      !selectedDocumentId ||
      !workspaceDocuments.some((d) => d._id === selectedDocumentId)
    ) {
      const recentDoc =
        recentDocumentId &&
        workspaceDocuments.find((d) => d._id === recentDocumentId);
      setSelectedDocumentId(recentDoc?._id ?? workspaceDocuments[0]._id);
    }
  }, [recentDocumentId, selectedDocumentId, workspaceDocuments]);

  useEffect(() => {
    setCurrentPage(1);
    setPageCount(selectedDocument?.pageCount ?? null);
  }, [selectedDocument?._id, selectedDocument?.pageCount]);

  useEffect(() => {
    let cancelled = false;

    async function resolvePreviewUrl() {
      if (!selectedDocumentId) {
        setSelectedDocumentPreviewUrl(null);
        return;
      }

      setSelectedDocumentPreviewUrl(null);

      try {
        const previewUrl = await getDocumentPdfUrl({
          documentId: selectedDocumentId,
        });

        if (!cancelled) {
          setSelectedDocumentPreviewUrl(previewUrl ?? null);
        }
      } catch {
        if (!cancelled) {
          setSelectedDocumentPreviewUrl(null);
        }
      }
    }

    void resolvePreviewUrl();

    return () => {
      cancelled = true;
    };
  }, [getDocumentPdfUrl, selectedDocumentId]);

  const handleSignOut = async () => {
    setIsSigningOut(true);

    try {
      await authClient.signOut();
      router.push("/sign-in");
      router.refresh();
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleUploadFile = async (file: File): Promise<Id<"documents">> => {
    const contentType = file.type || "application/pdf";
    const directUploadTarget = await createDirectUploadTarget({
      filename: file.name,
      contentType,
    });

    const uploadResponse = await fetch(directUploadTarget.uploadUrl, {
      method: directUploadTarget.method,
      headers: { "Content-Type": contentType },
      body: file,
    });

    if (!uploadResponse.ok) {
      throw new Error("Upload rejected by GCS.");
    }

    return await completeDirectUpload({
      documentId: directUploadTarget.documentId,
    });
  };

  const handleUploadClick = () => setIsUploadModalOpen(true);

  // When a citation is clicked, jump page and switch to the PDF tab on mobile.
  const handleCitationSelect = (page: number) => {
    setCurrentPage(page);
    setMobileTab("pdf");
  };

  const sidebarProps = useMemo(
    () => ({
      documents: workspaceDocuments,
      email,
      isSigningOut,
      name,
      onSignOut: handleSignOut,
      recentDocumentId,
      selectedDocumentId,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      email,
      isSigningOut,
      name,
      recentDocumentId,
      selectedDocumentId,
      workspaceDocuments,
    ],
  );

  return (
    <main className="surface-base relative h-screen overflow-hidden text-stone-100 selection:bg-amber-500/30 selection:text-amber-200">
      <UploadModal
        isOpen={isUploadModalOpen}
        initialFile={dropZoneFile}
        onClose={() => {
          setIsUploadModalOpen(false);
          setDropZoneFile(null);
        }}
        onUpload={handleUploadFile}
        onSuccess={(documentId, file) => {
          setUploadedPreviewFiles((currentFiles) => ({
            ...currentFiles,
            [documentId]: file,
          }));
          setSelectedDocumentId(documentId);
          setIsUploadModalOpen(false);
          setDropZoneFile(null);
        }}
      />

      <div className="flex h-full">
        {/* Mobile sidebar overlay */}
        {isMobileSidebarOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsMobileSidebarOpen(false)}
            />
            <div className="relative z-50 h-full w-[260px]">
              <Sidebar
                {...sidebarProps}
                collapsed={false}
                onCollapsedChange={() => setIsMobileSidebarOpen(false)}
                onDocumentSelect={(id) => {
                  setSelectedDocumentId(id);
                  setIsMobileSidebarOpen(false);
                }}
                onUploadClick={() => {
                  handleUploadClick();
                  setIsMobileSidebarOpen(false);
                }}
              />
            </div>
          </div>
        )}

        {/* Desktop sidebar */}
        <div className="hidden lg:block">
          <Sidebar
            {...sidebarProps}
            collapsed={isSidebarCollapsed}
            onCollapsedChange={setIsSidebarCollapsed}
            onDocumentSelect={setSelectedDocumentId}
            onUploadClick={handleUploadClick}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile top bar */}
          <div className="flex items-center gap-3 border-b border-stone-800/60 px-4 py-2.5 lg:hidden">
            <button
              aria-label="Open menu"
              className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-800/50 hover:text-stone-200"
              onClick={() => setIsMobileSidebarOpen(true)}
              type="button"
            >
              <HugeiconsIcon icon={Menu01Icon} size={18} strokeWidth={1.8} />
            </button>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-300">
              {selectedDocument?.title ?? "ChatPDF"}
            </span>
            {selectedDocument && (
              <MobileTabSwitcher
                activeTab={mobileTab}
                onChange={setMobileTab}
              />
            )}
          </div>

          {showWorkspaceLoading ? (
            <WorkspaceSkeleton />
          ) : selectedDocument ? (
            <>
              {/* Desktop split */}
              <div className="hidden min-h-0 flex-1 lg:flex">
                <div className="surface-base min-w-0 flex-1 border-r border-stone-800/60">
                  <CitationPulseWrapper page={currentPage}>
                    <PdfViewer
                      key={selectedDocument._id}
                      document={selectedDocument}
                      localFile={
                        selectedDocumentPreviewUrl
                          ? null
                          : selectedDocumentLocalFile
                      }
                      onPageCountChange={setPageCount}
                      onPageChange={setCurrentPage}
                      pageCount={pageCount}
                      pageNumber={currentPage}
                      resolvedFileUrl={selectedDocumentPreviewUrl}
                    />
                  </CitationPulseWrapper>
                </div>
                <div className="w-[420px] min-w-0 shrink-0 xl:w-[480px] 2xl:w-[520px]">
                  <ChatPanel
                    key={selectedDocument._id}
                    document={selectedDocument}
                    currentPage={currentPage}
                    onCitationSelect={setCurrentPage}
                  />
                </div>
              </div>

              {/* Mobile single-pane (tab-switched) */}
              <div className="flex min-h-0 flex-1 flex-col lg:hidden">
                {mobileTab === "pdf" ? (
                  <CitationPulseWrapper page={currentPage}>
                    <PdfViewer
                      key={`mobile-pdf-${selectedDocument._id}`}
                      document={selectedDocument}
                      localFile={
                        selectedDocumentPreviewUrl
                          ? null
                          : selectedDocumentLocalFile
                      }
                      onPageCountChange={setPageCount}
                      onPageChange={setCurrentPage}
                      pageCount={pageCount}
                      pageNumber={currentPage}
                      resolvedFileUrl={selectedDocumentPreviewUrl}
                    />
                  </CitationPulseWrapper>
                ) : (
                  <ChatPanel
                    key={`mobile-chat-${selectedDocument._id}`}
                    document={selectedDocument}
                    currentPage={currentPage}
                    onCitationSelect={handleCitationSelect}
                  />
                )}
              </div>
            </>
          ) : (
            <UploadDropZone
              onFileSelect={(file) => {
                setDropZoneFile(file);
                setIsUploadModalOpen(true);
              }}
            />
          )}
        </div>
      </div>
    </main>
  );
}

function MobileTabSwitcher({
  activeTab,
  onChange,
}: {
  activeTab: MobileTab;
  onChange: (tab: MobileTab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Workspace view"
      className="inline-flex items-center rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5"
    >
      {(["pdf", "chat"] as const).map((tab) => (
        <button
          key={tab}
          role="tab"
          aria-selected={activeTab === tab}
          className={cn(
            "focus-ring rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
            activeTab === tab
              ? "bg-amber-500/15 text-amber-200"
              : "text-stone-400 hover:text-stone-200",
          )}
          onClick={() => onChange(tab)}
          type="button"
        >
          {tab.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

// Re-keys on every page change so the citation-land CSS animation re-runs.
function CitationPulseWrapper({
  children,
  page,
}: {
  children: React.ReactNode;
  page: number;
}) {
  return (
    <div
      key={page}
      data-citation-pulse="true"
      className="h-full min-h-0 rounded-none"
    >
      {children}
    </div>
  );
}

function WorkspaceSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-stone-800/60 px-4 py-3">
        <div className="skeleton h-4 w-40" />
        <div className="ml-auto flex items-center gap-1.5">
          <div className="skeleton h-7 w-7" />
          <div className="skeleton h-7 w-24" />
          <div className="skeleton h-7 w-7" />
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="skeleton h-full max-h-[640px] w-full max-w-[520px] rounded-2xl" />
      </div>
    </div>
  );
}
