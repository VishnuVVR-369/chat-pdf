"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Menu01Icon } from "@hugeicons/core-free-icons";
import {
  captureEvent,
  captureException,
  identifyUser,
  resetAnalytics,
} from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ChatPanel } from "./ChatPanel";
import { GuestSessionBanner } from "./GuestSessionBanner";
import { PdfViewer } from "./PdfViewer";
import { PipelineStepper } from "./PipelineStepper";
import { Sidebar } from "./Sidebar";
import type { WorkspaceDocument } from "./Sidebar";
import { UploadDropZone } from "./UploadDropZone";
import { UploadModal } from "./UploadModal";

type DashboardWorkspaceProps = {
  email: string | null | undefined;
  isGuest: boolean;
  name: string | null | undefined;
  userId: string;
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

export function DashboardWorkspace({
  email,
  isGuest,
  name,
  userId,
}: DashboardWorkspaceProps) {
  const router = useRouter();
  const { signOut } = useClerk();
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const documents = useQuery(
    api.documents.listDocuments,
    isAuthenticated ? {} : "skip",
  );
  const createDirectUploadTarget = useMutation(
    api.documentUploadTargets.createDirectUploadTarget,
  );
  const completeDirectUpload = useAction(
    api.documentUploads.completeDirectUpload,
  );
  const getDocumentPdfUrl = useAction(api.documentUploads.getDocumentPdfUrl);
  const renameDocument = useMutation(api.documents.renameDocument);
  const retryDocumentProcessing = useMutation(
    api.documents.retryDocumentProcessing,
  );
  const deleteDocument = useAction(api.documents.deleteDocument);

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
  const [activeCitation, setActiveCitation] = useState<{
    page: number;
    quote?: string;
    quoteRatio?: number;
  } | null>(null);
  const trackedDocumentStatuses = useRef<Record<string, string>>({});
  const trackedDashboardReady = useRef(false);

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

  useEffect(() => {
    identifyUser(userId, { email: email ?? null, name: name ?? null });
  }, [email, name, userId]);

  useEffect(() => {
    if (trackedDashboardReady.current || documents === undefined) return;
    trackedDashboardReady.current = true;
    captureEvent("dashboard_loaded", {
      document_count: documents.length,
      has_documents: documents.length > 0,
    });
  }, [documents]);

  useEffect(() => {
    if (documents === undefined) return;

    for (const document of documents) {
      const previousStatus = trackedDocumentStatuses.current[document._id];
      if (previousStatus === document.status) continue;

      trackedDocumentStatuses.current[document._id] = document.status;

      captureEvent(
        previousStatus ? "document_status_changed" : "document_seen",
        {
          document_id: document._id,
          embedded_chunk_count: document.embeddedChunkCount,
          embedded_page_count: document.embeddedPageCount,
          has_processing_error: Boolean(document.processingError),
          ocr_method: document.ocrMethod,
          ocr_provider: document.ocrProvider,
          page_count: document.pageCount,
          previous_status: previousStatus,
          status: document.status,
          storage_content_type: document.storageContentType,
          storage_size: document.storageSize,
        },
      );
    }
  }, [documents]);

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
    setActiveCitation(null);
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
    captureEvent("sign_out_started");
    setIsSigningOut(true);

    try {
      await signOut();
      captureEvent("sign_out_completed");
      resetAnalytics();
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
      throw new Error("Upload rejected by Convex storage.");
    }

    const { storageId } = (await uploadResponse.json()) as {
      storageId?: Id<"_storage">;
    };

    if (!storageId) {
      throw new Error("Convex storage did not return a storage id.");
    }

    return await completeDirectUpload({
      documentId: directUploadTarget.documentId,
      storageId,
    });
  };

  const handleUploadClick = () => setIsUploadModalOpen(true);

  const handleDocumentSelect = (
    documentId: Id<"documents">,
    source: "desktop_sidebar" | "mobile_sidebar" | "auto" = "desktop_sidebar",
  ) => {
    setSelectedDocumentId(documentId);
    captureEvent("document_selected", {
      document_id: documentId,
      source,
    });
  };

  // When a citation is clicked, jump to its page, record the quote to highlight, and
  // switch to the PDF tab on mobile.
  const handleCitationSelect = (citation: {
    pageNumber: number;
    quote?: string;
    quoteRatio?: number;
  }) => {
    captureEvent("citation_selected", {
      document_id: selectedDocumentId ?? undefined,
      page_number: citation.pageNumber,
      quote_ratio: citation.quoteRatio,
    });
    setCurrentPage(citation.pageNumber);
    setActiveCitation({
      page: citation.pageNumber,
      quote: citation.quote,
      quoteRatio: citation.quoteRatio,
    });
    setMobileTab("pdf");
  };

  const handleRenameDocument = async (
    documentId: Id<"documents">,
    title: string,
  ) => {
    try {
      await renameDocument({ documentId, title });
      captureEvent("document_renamed", {
        document_id: documentId,
        title_length: title.length,
      });
    } catch (error) {
      captureException(error, {
        document_id: documentId,
        source: "document_rename",
      });
      throw error;
    }
  };

  const handleRetryDocument = async (documentId: Id<"documents">) => {
    try {
      await retryDocumentProcessing({ documentId });
      captureEvent("document_processing_retry_started", {
        document_id: documentId,
      });
    } catch (error) {
      captureException(error, {
        document_id: documentId,
        source: "document_processing_retry",
      });
      throw error;
    }
  };

  const handleDeleteDocument = async (documentId: Id<"documents">) => {
    const document = workspaceDocuments.find((item) => item._id === documentId);
    captureEvent("document_delete_started", {
      document_id: documentId,
      page_count: document?.pageCount,
      status: document?.status,
      storage_size: document?.storageSize,
    });
    if (selectedDocumentId === documentId) {
      setSelectedDocumentId(null);
    }
    if (recentDocumentId === documentId) {
      setRecentDocumentId(null);
      try {
        if (window.localStorage.getItem(RECENT_DOC_KEY) === documentId) {
          window.localStorage.removeItem(RECENT_DOC_KEY);
        }
      } catch {
        // ignore
      }
    }
    setUploadedPreviewFiles((current) => {
      if (!(documentId in current)) return current;
      const next = { ...current };
      delete next[documentId];
      return next;
    });
    try {
      await deleteDocument({ documentId });
      captureEvent("document_delete_completed", {
        document_id: documentId,
      });
    } catch (error) {
      captureException(error, {
        document_id: documentId,
        source: "document_delete",
      });
      throw error;
    }
  };

  const citationOnCurrentPage =
    activeCitation && activeCitation.page === currentPage
      ? activeCitation
      : null;
  const highlightQuote = citationOnCurrentPage?.quote ?? null;
  const highlightRatio = citationOnCurrentPage?.quoteRatio ?? null;

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
    <main className="surface-base relative flex h-screen flex-col overflow-hidden text-stone-100 selection:bg-amber-500/30 selection:text-amber-200">
      <UploadModal
        isOpen={isUploadModalOpen}
        initialFile={dropZoneFile}
        onClose={() => {
          captureEvent("upload_modal_closed");
          setIsUploadModalOpen(false);
          setDropZoneFile(null);
        }}
        onUpload={handleUploadFile}
        onSuccess={(documentId, file) => {
          captureEvent("document_upload_attached_to_workspace", {
            document_id: documentId,
            file_size: file.size,
            file_type: file.type || "application/pdf",
          });
          setUploadedPreviewFiles((currentFiles) => ({
            ...currentFiles,
            [documentId]: file,
          }));
          setSelectedDocumentId(documentId);
          setIsUploadModalOpen(false);
          setDropZoneFile(null);
        }}
      />

      <GuestSessionBanner isGuest={isGuest} />

      <div className="flex min-h-0 flex-1">
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
                  handleDocumentSelect(id, "mobile_sidebar");
                  setIsMobileSidebarOpen(false);
                }}
                onUploadClick={() => {
                  captureEvent("upload_modal_opened", {
                    source: "mobile_sidebar",
                  });
                  handleUploadClick();
                  setIsMobileSidebarOpen(false);
                }}
                onDeleteDocument={handleDeleteDocument}
                onRenameDocument={handleRenameDocument}
                onRetryDocument={handleRetryDocument}
              />
            </div>
          </div>
        )}

        {/* Desktop sidebar */}
        <div className="hidden lg:block">
          <Sidebar
            {...sidebarProps}
            collapsed={isSidebarCollapsed}
            onCollapsedChange={(collapsed) => {
              setIsSidebarCollapsed(collapsed);
              captureEvent("sidebar_collapsed_changed", { collapsed });
            }}
            onDocumentSelect={(id) => handleDocumentSelect(id)}
            onUploadClick={() => {
              captureEvent("upload_modal_opened", {
                source: "desktop_sidebar",
              });
              handleUploadClick();
            }}
            onDeleteDocument={handleDeleteDocument}
            onRenameDocument={handleRenameDocument}
            onRetryDocument={handleRetryDocument}
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
                onChange={(tab) => {
                  setMobileTab(tab);
                  captureEvent("mobile_workspace_tab_changed", {
                    document_id: selectedDocument._id,
                    tab,
                  });
                }}
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
                  <PdfViewer
                    key={selectedDocument._id}
                    document={selectedDocument}
                    highlightQuote={highlightQuote}
                    highlightRatio={highlightRatio}
                    localFile={
                      selectedDocumentPreviewUrl
                        ? null
                        : selectedDocumentLocalFile
                    }
                    onPageCountChange={setPageCount}
                    onPageChange={(page) => {
                      setCurrentPage(page);
                      captureEvent("pdf_page_changed", {
                        document_id: selectedDocument._id,
                        page,
                        page_count: pageCount,
                        source: "desktop_pdf_viewer",
                      });
                    }}
                    onRetry={handleRetryDocument}
                    pageCount={pageCount}
                    pageNumber={currentPage}
                    resolvedFileUrl={selectedDocumentPreviewUrl}
                  />
                </div>
                <div className="w-[420px] min-w-0 shrink-0 xl:w-[480px] 2xl:w-[520px]">
                  {selectedDocument.status === "ready" ? (
                    <ChatPanel
                      key={selectedDocument._id}
                      document={selectedDocument}
                      currentPage={currentPage}
                      onCitationSelect={handleCitationSelect}
                    />
                  ) : (
                    <PipelineStepper
                      key={selectedDocument._id}
                      document={selectedDocument}
                      onRetry={handleRetryDocument}
                    />
                  )}
                </div>
              </div>

              {/* Mobile single-pane (tab-switched) */}
              <div className="flex min-h-0 flex-1 flex-col lg:hidden">
                {mobileTab === "pdf" ? (
                  <PdfViewer
                    key={`mobile-pdf-${selectedDocument._id}`}
                    document={selectedDocument}
                    highlightQuote={highlightQuote}
                    highlightRatio={highlightRatio}
                    localFile={
                      selectedDocumentPreviewUrl
                        ? null
                        : selectedDocumentLocalFile
                    }
                    onPageCountChange={setPageCount}
                    onPageChange={(page) => {
                      setCurrentPage(page);
                      captureEvent("pdf_page_changed", {
                        document_id: selectedDocument._id,
                        page,
                        page_count: pageCount,
                        source: "mobile_pdf_viewer",
                      });
                    }}
                    onRetry={handleRetryDocument}
                    pageCount={pageCount}
                    pageNumber={currentPage}
                    resolvedFileUrl={selectedDocumentPreviewUrl}
                  />
                ) : (
                  <>
                    {selectedDocument.status === "ready" ? (
                      <ChatPanel
                        key={`mobile-chat-${selectedDocument._id}`}
                        document={selectedDocument}
                        currentPage={currentPage}
                        onCitationSelect={handleCitationSelect}
                      />
                    ) : (
                      <PipelineStepper
                        key={`mobile-chat-${selectedDocument._id}`}
                        document={selectedDocument}
                        onRetry={handleRetryDocument}
                      />
                    )}
                  </>
                )}
              </div>
            </>
          ) : (
            <UploadDropZone
              onFileSelect={(file) => {
                captureEvent("upload_modal_opened", {
                  file_size: file.size,
                  file_type: file.type || "application/pdf",
                  source: "empty_drop_zone",
                });
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
