"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { inspectPdfFile } from "@/lib/pdf-client";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ChatPanel } from "./ChatPanel";
import { PdfViewer } from "./PdfViewer";
import { Sidebar } from "./Sidebar";
import type { WorkspaceDocument } from "./Sidebar";
import { UploadDropZone } from "./UploadDropZone";

type DashboardWorkspaceProps = {
  email: string | null | undefined;
  name: string | null | undefined;
  tokenIdentifier: string;
};

type PendingUpload = {
  file: File;
  message: string;
  pageCount: number | null;
  status: "checking" | "ready" | "rejected" | "server_check_required";
};

type MobileTab = "preview" | "chat";

export function DashboardWorkspace({
  email,
  name,
}: DashboardWorkspaceProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documents = useQuery(api.documents.listDocuments);
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const createDocument = useAction(api.documentUploads.createDocument);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<Id<"documents"> | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>("preview");

  const workspaceDocuments: WorkspaceDocument[] = useMemo(() => documents ?? [], [documents]);
  const selectedDocument = workspaceDocuments.find((d) => d._id === selectedDocumentId) ?? null;

  // Auto-select first document
  useEffect(() => {
    if (!selectedDocumentId && workspaceDocuments.length > 0) {
      setSelectedDocumentId(workspaceDocuments[0]._id);
    }
    if (selectedDocumentId && !workspaceDocuments.some((d) => d._id === selectedDocumentId)) {
      setSelectedDocumentId(workspaceDocuments[0]?._id ?? null);
    }
  }, [selectedDocumentId, workspaceDocuments]);

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

  const handleFileSelect = async (file: File) => {
    setUploadError(null);

    const looksLikePdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    if (!looksLikePdf) {
      setUploadError("Select a valid PDF file.");
      return;
    }

    setPendingUpload({ file, message: "Checking PDF...", pageCount: null, status: "checking" });

    try {
      const result = await inspectPdfFile(file);
      if (result.status === "ready") {
        setPendingUpload({ file, message: result.message, pageCount: result.pageCount, status: "ready" });
        // Auto-upload when ready
        await handleUploadFile(file);
      } else if (result.status === "server_check_required") {
        setPendingUpload({ file, message: result.message, pageCount: null, status: "server_check_required" });
        await handleUploadFile(file);
      } else {
        setPendingUpload({ file, message: result.message, pageCount: result.pageCount ?? null, status: "rejected" });
        setUploadError(result.message);
      }
    } catch (error) {
      setPendingUpload(null);
      setUploadError(error instanceof Error ? error.message : "PDF preflight failed.");
    }
  };

  const handleUploadFile = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);

    try {
      const uploadUrl = await generateUploadUrl({});
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/pdf" },
        body: file,
      });

      if (!uploadResponse.ok) throw new Error("Upload rejected by storage.");

      const body = (await uploadResponse.json()) as { storageId?: string };
      if (!body.storageId) throw new Error("Storage did not return a storage id.");

      const documentId = await createDocument({
        filename: file.name,
        storageId: body.storageId as Id<"_storage">,
      });

      setPendingUpload(null);
      setSelectedDocumentId(documentId);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    await handleFileSelect(file);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <main className="relative h-screen overflow-hidden bg-[#070707] text-stone-100 selection:bg-amber-500/30 selection:text-amber-200">
      <input
        ref={fileInputRef}
        accept=".pdf,application/pdf"
        className="sr-only"
        onChange={handleFileInputChange}
        type="file"
      />

      <div className="flex h-full">
        {/* Mobile sidebar overlay */}
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

        {/* Desktop sidebar */}
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

        {/* Main content */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile header */}
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

          {/* Upload status bar */}
          {(isUploading || uploadError) && (
            <div className={cn(
              "flex items-center gap-3 px-4 py-2 text-sm",
              uploadError
                ? "border-b border-red-500/20 bg-red-500/[0.06] text-red-300"
                : "border-b border-amber-500/20 bg-amber-500/[0.04] text-amber-300",
            )}>
              {isUploading && (
                <>
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-stone-600 border-t-amber-400" />
                  <span>Uploading PDF...</span>
                </>
              )}
              {uploadError && (
                <>
                  <span>{uploadError}</span>
                  <button
                    className="ml-auto text-xs text-stone-400 hover:text-stone-200"
                    onClick={() => setUploadError(null)}
                    type="button"
                  >
                    Dismiss
                  </button>
                </>
              )}
            </div>
          )}

          {/* Content area */}
          {selectedDocument ? (
            <>
              {/* Desktop: side-by-side */}
              <div className="hidden flex-1 lg:flex">
                <div className="flex-1 border-r border-stone-800/60">
                  <PdfViewer document={selectedDocument} />
                </div>
                <div className="w-[420px] shrink-0 xl:w-[480px]">
                  <ChatPanel document={selectedDocument} />
                </div>
              </div>

              {/* Mobile: tabbed */}
              <div className="flex flex-1 flex-col lg:hidden">
                <div className="flex border-b border-stone-800/60">
                  <button
                    className={cn(
                      "flex-1 px-4 py-2.5 text-center text-sm font-medium transition-colors",
                      mobileTab === "preview"
                        ? "border-b-2 border-amber-500 text-stone-100"
                        : "text-stone-500 hover:text-stone-300",
                    )}
                    onClick={() => setMobileTab("preview")}
                    type="button"
                  >
                    Preview
                  </button>
                  <button
                    className={cn(
                      "flex-1 px-4 py-2.5 text-center text-sm font-medium transition-colors",
                      mobileTab === "chat"
                        ? "border-b-2 border-amber-500 text-stone-100"
                        : "text-stone-500 hover:text-stone-300",
                    )}
                    onClick={() => setMobileTab("chat")}
                    type="button"
                  >
                    Chat
                  </button>
                </div>
                <div className="flex-1 overflow-hidden">
                  {mobileTab === "preview" ? (
                    <PdfViewer document={selectedDocument} />
                  ) : (
                    <ChatPanel document={selectedDocument} />
                  )}
                </div>
              </div>
            </>
          ) : (
            <UploadDropZone onFileSelect={handleFileSelect} />
          )}
        </div>
      </div>
    </main>
  );
}

function MenuIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h16" />
      <path d="M4 16h16" />
    </svg>
  );
}
