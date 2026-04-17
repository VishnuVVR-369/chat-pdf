"use client";

import { useEffect, useState } from "react";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ChatPanel } from "./ChatPanel";
import { PdfViewer } from "./PdfViewer";
import { PipelineStepper } from "./PipelineStepper";
import { Sidebar } from "./Sidebar";
import type { WorkspaceDocument } from "./Sidebar";
import { UploadDropZone } from "./UploadDropZone";
import { UploadModal } from "./UploadModal";

type DashboardWorkspaceProps = {
  email: string | null | undefined;
  name: string | null | undefined;
  tokenIdentifier: string;
};

const EMPTY_DOCUMENTS: WorkspaceDocument[] = [];

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
  const getDocumentPdfUrl = useAction(api.documentAccess.getDocumentPdfUrl);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [dropZoneFile, setDropZoneFile] = useState<File | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] =
    useState<Id<"documents"> | null>(null);
  const [hasMounted, setHasMounted] = useState(false);
  const [selectedDocumentPreviewUrl, setSelectedDocumentPreviewUrl] = useState<
    string | null
  >(null);
  const [uploadedPreviewFiles, setUploadedPreviewFiles] = useState<
    Record<string, File>
  >({});
  const [currentPage, setCurrentPage] = useState(1);

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

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.replace("/sign-in");
    }
  }, [isAuthLoading, isAuthenticated, router]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!selectedDocumentId && workspaceDocuments.length > 0) {
      setSelectedDocumentId(workspaceDocuments[0]._id);
    }

    if (
      selectedDocumentId &&
      !workspaceDocuments.some(
        (d: WorkspaceDocument) => d._id === selectedDocumentId,
      )
    ) {
      setSelectedDocumentId(workspaceDocuments[0]?._id ?? null);
    }
  }, [selectedDocumentId, workspaceDocuments]);

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
    const directUploadTarget = await createDirectUploadTarget({
      filename: file.name,
      contentType: file.type || "application/pdf",
    });

    const uploadResponse = await fetch(directUploadTarget.uploadUrl, {
      method: directUploadTarget.method,
      headers: { "Content-Type": file.type || "application/pdf" },
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

  return (
    <main className="relative h-screen overflow-hidden bg-[#070707] text-stone-100 selection:bg-amber-500/30 selection:text-amber-200">
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
        {isMobileSidebarOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsMobileSidebarOpen(false)}
            />
            <div className="relative z-50 h-full w-[280px]">
              <Sidebar
                collapsed={false}
                documents={workspaceDocuments}
                email={email}
                isSigningOut={isSigningOut}
                name={name}
                onCollapsedChange={() => setIsMobileSidebarOpen(false)}
                onDocumentSelect={(id) => {
                  setSelectedDocumentId(id);
                  setIsMobileSidebarOpen(false);
                }}
                onSignOut={handleSignOut}
                onUploadClick={() => {
                  handleUploadClick();
                  setIsMobileSidebarOpen(false);
                }}
                selectedDocumentId={selectedDocumentId}
              />
            </div>
          </div>
        )}

        <div className="hidden lg:block">
          <Sidebar
            collapsed={isSidebarCollapsed}
            documents={workspaceDocuments}
            email={email}
            isSigningOut={isSigningOut}
            name={name}
            onCollapsedChange={setIsSidebarCollapsed}
            onDocumentSelect={setSelectedDocumentId}
            onSignOut={handleSignOut}
            onUploadClick={handleUploadClick}
            selectedDocumentId={selectedDocumentId}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3 border-b border-stone-800/60 px-4 py-3 lg:hidden">
            <button
              className="flex h-8 w-8 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-800/50 hover:text-stone-200"
              onClick={() => setIsMobileSidebarOpen(true)}
              type="button"
            >
              <MenuIcon />
            </button>
            <span className="text-sm font-medium text-stone-300">
              {selectedDocument?.title ?? "ChatPDF"}
            </span>
          </div>

          {showWorkspaceLoading ? (
            <div className="flex flex-1 items-center justify-center px-6">
              <div className="flex items-center gap-3 text-sm text-stone-400">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-700 border-t-amber-400" />
                Loading your workspace...
              </div>
            </div>
          ) : selectedDocument ? (
            <>
              <div className="hidden flex-1 lg:flex">
                <div className="min-w-0 flex-1 border-r border-stone-800/60">
                  <PdfViewer
                    key={selectedDocument._id}
                    document={selectedDocument}
                    localFile={
                      selectedDocumentPreviewUrl
                        ? null
                        : selectedDocumentLocalFile
                    }
                    onPageChange={setCurrentPage}
                    resolvedFileUrl={selectedDocumentPreviewUrl}
                  />
                </div>
                <div className="w-[380px] shrink-0 xl:w-[420px]">
                  {selectedDocument.status === "ready" ? (
                    <ChatPanel
                      key={selectedDocument._id}
                      document={selectedDocument}
                      currentPage={currentPage}
                    />
                  ) : (
                    <PipelineStepper
                      key={selectedDocument._id}
                      document={selectedDocument}
                    />
                  )}
                </div>
              </div>

              <div className="flex flex-1 flex-col lg:hidden">
                <div className="min-h-0 flex-1">
                  <PdfViewer
                    key={`mobile-${selectedDocument._id}`}
                    document={selectedDocument}
                    localFile={
                      selectedDocumentPreviewUrl
                        ? null
                        : selectedDocumentLocalFile
                    }
                    onPageChange={setCurrentPage}
                    resolvedFileUrl={selectedDocumentPreviewUrl}
                  />
                </div>
                <div className="max-h-[40%] min-h-[280px] border-t border-stone-800/60">
                  {selectedDocument.status === "ready" ? (
                    <ChatPanel
                      key={`mobile-${selectedDocument._id}`}
                      document={selectedDocument}
                      currentPage={currentPage}
                    />
                  ) : (
                    <PipelineStepper
                      key={`mobile-${selectedDocument._id}`}
                      document={selectedDocument}
                    />
                  )}
                </div>
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

function MenuIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      <path d="M4 8h16" />
      <path d="M4 16h16" />
    </svg>
  );
}
