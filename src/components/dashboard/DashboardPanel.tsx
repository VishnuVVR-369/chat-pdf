"use client";

import type { ChangeEvent } from "react";
import { useEffect, useState } from "react";
import {
  useAction,
  useConvex,
  useConvexAuth,
  useMutation,
  useQuery,
} from "convex/react";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/button";
import { MAX_PDF_PAGES } from "@/constants/pdf";
import { authClient } from "@/lib/auth-client";
import { inspectPdfFile } from "@/lib/pdf-client";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type DashboardPanelProps = {
  email: string | null | undefined;
  name: string | null | undefined;
  tokenIdentifier: string;
};

type ApiEvent = {
  id: string;
  label: string;
  detail: string;
  tone: "info" | "success" | "error";
  createdAt: number;
};

type PendingUpload = {
  file: File;
  message: string;
  pageCount: number | null;
  status: "checking" | "ready" | "rejected" | "server_check_required";
};

export function DashboardPanel({
  email,
  name,
  tokenIdentifier,
}: DashboardPanelProps) {
  const router = useRouter();
  const convex = useConvex();
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const documents = useQuery(
    api.documents.listDocuments,
    isAuthenticated ? {} : "skip",
  );
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const createDocument = useAction(api.documentUploads.createDocument);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isCheckingPdf, setIsCheckingPdf] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isRefreshingList, setIsRefreshingList] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(
    null,
  );
  const [lastUploadUrl, setLastUploadUrl] = useState<string | null>(null);
  const [lastStorageId, setLastStorageId] = useState<Id<"_storage"> | null>(
    null,
  );
  const [lastCreatedDocumentId, setLastCreatedDocumentId] =
    useState<Id<"documents"> | null>(null);
  const [lastListRunAt, setLastListRunAt] = useState<number | null>(null);
  const [apiEvents, setApiEvents] = useState<ApiEvent[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] =
    useState<Id<"documents"> | null>(null);

  const documentCount = documents?.length ?? 0;
  const uploadedCount =
    documents?.filter((document) => document.status === "uploaded").length ?? 0;
  const readyCount =
    documents?.filter((document) => document.status === "ready").length ?? 0;
  const selectedDocument =
    documents?.find((document) => document._id === selectedDocumentId) ?? null;

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.replace("/sign-in");
    }
  }, [isAuthLoading, isAuthenticated, router]);

  const pushApiEvent = (
    label: string,
    detail: string,
    tone: ApiEvent["tone"],
  ) => {
    setApiEvents((current) =>
      [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          label,
          detail,
          tone,
          createdAt: Date.now(),
        },
        ...current,
      ].slice(0, 10),
    );
  };

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

  const handleRefreshList = async () => {
    setIsRefreshingList(true);

    try {
      const latestDocuments = await convex.query(
        api.documents.listDocuments,
        {},
      );
      setLastListRunAt(Date.now());
      pushApiEvent(
        "listDocuments",
        `Returned ${latestDocuments.length} document${latestDocuments.length === 1 ? "" : "s"}.`,
        "info",
      );
    } catch (error) {
      pushApiEvent(
        "listDocuments",
        error instanceof Error ? error.message : "Manual list call failed.",
        "error",
      );
    } finally {
      setIsRefreshingList(false);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setUploadError(null);
    setPendingUpload({
      file,
      message: "Checking PDF page count...",
      pageCount: null,
      status: "checking",
    });

    const looksLikePdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");

    if (!looksLikePdf) {
      setPendingUpload(null);
      setUploadError("Select a PDF file.");
      event.target.value = "";
      return;
    }

    setIsCheckingPdf(true);

    try {
      const result = await inspectPdfFile(file);

      if (result.status === "ready") {
        pushApiEvent("pdfPreflight", result.message, "info");
        setPendingUpload({
          file,
          message: result.message,
          pageCount: result.pageCount,
          status: "ready",
        });
      } else if (result.status === "server_check_required") {
        pushApiEvent("pdfPreflight", result.message, "info");
        setPendingUpload({
          file,
          message: result.message,
          pageCount: null,
          status: "server_check_required",
        });
      } else {
        pushApiEvent("pdfPreflight", result.message, "error");
        setPendingUpload({
          file,
          message: result.message,
          pageCount: result.pageCount ?? null,
          status: "rejected",
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "PDF preflight failed.";
      setPendingUpload({
        file,
        message:
          "Could not read the PDF page count locally. You can still upload and let the server decide.",
        pageCount: null,
        status: "server_check_required",
      });
      pushApiEvent("pdfPreflight", message, "error");
    } finally {
      setIsCheckingPdf(false);
      event.target.value = "";
    }
  };

  const handleUpload = async () => {
    if (!pendingUpload || pendingUpload.status === "checking") {
      return;
    }

    setUploadError(null);
    setIsUploading(true);

    try {
      const uploadUrl = await generateUploadUrl({});
      setLastUploadUrl(uploadUrl);
      pushApiEvent(
        "generateUploadUrl",
        "Signed upload URL created.",
        "success",
      );

      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": pendingUpload.file.type || "application/pdf",
        },
        body: pendingUpload.file,
      });

      if (!uploadResponse.ok) {
        throw new Error("Convex storage rejected the PDF upload.");
      }

      const body = (await uploadResponse.json()) as {
        storageId?: string;
      };

      if (!body.storageId) {
        throw new Error("Convex storage did not return a storage id.");
      }

      const storageId = body.storageId as Id<"_storage">;
      setLastStorageId(storageId);
      pushApiEvent("storageUpload", `Stored PDF as ${storageId}.`, "success");

      const documentId = await createDocument({
        filename: pendingUpload.file.name,
        storageId,
      });

      setLastCreatedDocumentId(documentId);
      setSelectedDocumentId(documentId);
      pushApiEvent(
        "createDocument",
        `Created document ${documentId} for ${pendingUpload.file.name}.`,
        "success",
      );
      setPendingUpload(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "PDF upload failed.";
      setUploadError(message);
      pushApiEvent("uploadFlow", message, "error");
    } finally {
      setIsUploading(false);
    }
  };

  const canUpload =
    pendingUpload !== null &&
    pendingUpload.status !== "checking" &&
    pendingUpload.status !== "rejected";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.14),_transparent_26%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_48%,_#f8fafc_100%)] px-6 py-10 text-slate-950">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-4 rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_24px_90px_-32px_rgba(17,24,39,0.4)] backdrop-blur md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <BrandLogo
              className="gap-3"
              logoClassName="h-10 w-10"
              textClassName="text-slate-950"
            />
            <p className="text-sm font-semibold tracking-[0.24em] text-cyan-700 uppercase">
              Dashboard
            </p>
            <div className="space-y-1">
              <h1 className="text-3xl font-semibold tracking-tight">
                {name ? `Welcome, ${name}.` : "Welcome to ChatPDF."}
              </h1>
              <p className="max-w-3xl text-sm text-slate-600">
                This dashboard is now a live test harness for the current Convex
                document APIs. You can generate upload URLs, upload a PDF into
                Convex storage, create the document record, re-run
                `listDocuments`, and inspect the returned data in one place.
              </p>
            </div>
          </div>
          <Button
            className="rounded-full px-5"
            disabled={isSigningOut}
            onClick={handleSignOut}
            size="lg"
            variant="outline"
          >
            {isSigningOut ? "Signing out..." : "Sign out"}
          </Button>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <InfoCard label="Signed in as" value={name ?? "Anonymous profile"} />
          <InfoCard label="Scoped documents" value={String(documentCount)} />
          <InfoCard label="Uploaded state" value={String(uploadedCount)} />
          <InfoCard label="Ready state" value={String(readyCount)} />
        </section>

        <section className="rounded-[2rem] border border-white/70 bg-white/90 p-6 shadow-[0_24px_90px_-32px_rgba(17,24,39,0.35)] backdrop-blur">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-semibold tracking-[0.24em] text-cyan-700 uppercase">
                Upload API Test
              </p>
              <h2 className="text-2xl font-semibold tracking-tight">
                Check pages before upload.
              </h2>
              <p className="max-w-2xl text-sm leading-7 text-slate-600">
                Select a PDF to read its page count locally first. Files with
                more than {MAX_PDF_PAGES} pages are rejected before upload when
                possible, and the backend enforces the same limit before
                creating the document record.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-3 rounded-full border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-semibold text-cyan-950 transition hover:border-cyan-300 hover:bg-cyan-100">
                <input
                  accept=".pdf,application/pdf"
                  className="sr-only"
                  disabled={isCheckingPdf || isUploading}
                  onChange={handleFileChange}
                  type="file"
                />
                {isCheckingPdf ? "Checking PDF..." : "Choose PDF"}
              </label>
              <Button
                className="rounded-full px-5"
                disabled={!canUpload || isCheckingPdf || isUploading}
                onClick={handleUpload}
              >
                {isUploading
                  ? "Uploading PDF..."
                  : pendingUpload?.status === "server_check_required"
                    ? "Upload And Let Server Verify"
                    : "Upload PDF"}
              </Button>
            </div>
          </div>

          {pendingUpload ? (
            <div
              className={`mt-4 rounded-[1.6rem] border px-4 py-4 ${
                pendingUpload.status === "rejected"
                  ? "border-red-200 bg-red-50"
                  : pendingUpload.status === "ready"
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-slate-200 bg-slate-50"
              }`}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">
                    Pending PDF
                  </p>
                  <p className="mt-2 text-base font-semibold break-words text-slate-950">
                    {pendingUpload.file.name}
                  </p>
                </div>
                <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                  <DocumentMeta
                    label="Detected pages"
                    value={
                      pendingUpload.pageCount === null
                        ? "Not available locally"
                        : String(pendingUpload.pageCount)
                    }
                  />
                  <DocumentMeta
                    label="Status"
                    value={formatPendingUploadStatus(pendingUpload.status)}
                  />
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-700">
                {pendingUpload.message}
              </p>
            </div>
          ) : null}

          {uploadError ? (
            <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {uploadError}
            </p>
          ) : null}

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <ApiResultCard
              label="Last upload URL"
              value={
                lastUploadUrl
                  ? truncateMiddle(lastUploadUrl, 56)
                  : "Not requested yet"
              }
            />
            <ApiResultCard
              label="Last storage id"
              value={lastStorageId ?? "No file stored yet"}
            />
            <ApiResultCard
              label="Last document id"
              value={lastCreatedDocumentId ?? "No record created yet"}
            />
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <InfoCard label="Display name" value={name ?? "No name returned"} />
          <InfoCard label="Email" value={email ?? "No email returned"} />
          <InfoCard label="Identity key" value={tokenIdentifier} />
          <InfoCard
            label="Route policy"
            value="Unauthenticated requests to /dashboard are redirected to /sign-in."
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="rounded-[2rem] border border-white/70 bg-white/90 p-6 shadow-[0_24px_90px_-32px_rgba(17,24,39,0.35)] backdrop-blur">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold tracking-[0.24em] text-slate-500 uppercase">
                  listDocuments API
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                  Your uploaded PDFs
                </h2>
              </div>

              <div className="flex items-center gap-3">
                <p className="text-sm text-slate-500">
                  {documents ? `${documents.length} stored` : "Loading..."}
                </p>
                <Button
                  className="rounded-full px-4"
                  disabled={isRefreshingList}
                  onClick={handleRefreshList}
                  variant="outline"
                >
                  {isRefreshingList
                    ? "Running listDocuments..."
                    : "Run listDocuments"}
                </Button>
              </div>
            </div>

            {lastListRunAt ? (
              <p className="mt-4 text-sm text-slate-500">
                Last manual list run: {formatTimestamp(lastListRunAt)}
              </p>
            ) : null}

            <div className="mt-6">
              {documents === undefined ? (
                <p className="text-sm text-slate-500">
                  Loading your document index from Convex...
                </p>
              ) : documents.length === 0 ? (
                <div className="rounded-[1.6rem] border border-dashed border-slate-300 bg-slate-50/80 px-5 py-8 text-sm leading-7 text-slate-600">
                  No PDFs uploaded yet. Add your first document above to create
                  a user-scoped record in the{" "}
                  <span className="font-medium text-slate-900">documents</span>{" "}
                  table.
                </div>
              ) : (
                <div className="grid gap-4">
                  {documents.map((document) => (
                    <article
                      key={document._id}
                      className={`rounded-[1.6rem] border p-5 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.2)] transition ${
                        selectedDocumentId === document._id
                          ? "border-cyan-300 bg-cyan-50/80"
                          : "border-slate-200/80 bg-slate-50/85"
                      }`}
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-3">
                            <h3 className="text-lg font-semibold tracking-tight text-slate-950">
                              {document.title}
                            </h3>
                            <StatusBadge status={document.status} />
                          </div>
                          <p className="text-sm break-words text-slate-600">
                            {document.originalFilename}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            className="rounded-full px-4"
                            onClick={() => setSelectedDocumentId(document._id)}
                            variant="outline"
                          >
                            Inspect
                          </Button>
                          {document.fileUrl ? (
                            <Button
                              asChild
                              className="rounded-full px-4"
                              variant="outline"
                            >
                              <a
                                href={document.fileUrl}
                                rel="noreferrer"
                                target="_blank"
                              >
                                Open PDF
                              </a>
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-4">
                        <DocumentMeta
                          label="Uploaded"
                          value={formatTimestamp(document.uploadCompletedAt)}
                        />
                        <DocumentMeta
                          label="File size"
                          value={formatFileSize(document.storageSize)}
                        />
                        <DocumentMeta
                          label="Page count"
                          value={
                            document.pageCount !== undefined
                              ? String(document.pageCount)
                              : "Unavailable"
                          }
                        />
                        <DocumentMeta
                          label="Document id"
                          value={document._id}
                        />
                      </div>

                      {document.processingError ? (
                        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                          {document.processingError}
                        </p>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <section className="rounded-[2rem] border border-white/70 bg-white/90 p-6 shadow-[0_24px_90px_-32px_rgba(17,24,39,0.35)] backdrop-blur">
              <p className="text-sm font-semibold tracking-[0.24em] text-slate-500 uppercase">
                API Activity
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                Live test trace
              </h2>

              <div className="mt-6 space-y-3">
                {apiEvents.length === 0 ? (
                  <p className="rounded-[1.4rem] border border-dashed border-slate-300 bg-slate-50/80 px-4 py-5 text-sm leading-7 text-slate-600">
                    Run an upload or click{" "}
                    <span className="font-medium text-slate-900">
                      Run listDocuments
                    </span>{" "}
                    to record API activity here.
                  </p>
                ) : (
                  apiEvents.map((event) => (
                    <div
                      key={event.id}
                      className={`rounded-[1.4rem] border px-4 py-4 ${
                        event.tone === "success"
                          ? "border-emerald-200 bg-emerald-50"
                          : event.tone === "error"
                            ? "border-red-200 bg-red-50"
                            : "border-slate-200 bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-sm font-semibold text-slate-900">
                          {event.label}
                        </p>
                        <p className="text-xs tracking-[0.16em] text-slate-500 uppercase">
                          {formatTimestamp(event.createdAt)}
                        </p>
                      </div>
                      <p className="mt-2 text-sm leading-6 break-words text-slate-700">
                        {event.detail}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/70 bg-white/90 p-6 shadow-[0_24px_90px_-32px_rgba(17,24,39,0.35)] backdrop-blur">
              <p className="text-sm font-semibold tracking-[0.24em] text-slate-500 uppercase">
                Document Inspector
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                Selected record
              </h2>

              <div className="mt-6">
                {selectedDocument ? (
                  <div className="space-y-4">
                    <InfoRow label="Title" value={selectedDocument.title} />
                    <InfoRow
                      label="Filename"
                      value={selectedDocument.originalFilename}
                    />
                    <InfoRow label="Document id" value={selectedDocument._id} />
                    <InfoRow label="Status" value={selectedDocument.status} />
                    <InfoRow
                      label="Uploaded at"
                      value={formatTimestamp(
                        selectedDocument.uploadCompletedAt,
                      )}
                    />
                    <InfoRow
                      label="Storage size"
                      value={formatFileSize(selectedDocument.storageSize)}
                    />
                    <InfoRow
                      label="Content type"
                      value={selectedDocument.storageContentType ?? "Unknown"}
                    />
                    <InfoRow
                      label="Page count"
                      value={
                        selectedDocument.pageCount !== undefined
                          ? String(selectedDocument.pageCount)
                          : "Unavailable"
                      }
                    />
                    <InfoRow
                      label="Signed URL"
                      value={
                        selectedDocument.fileUrl
                          ? truncateMiddle(selectedDocument.fileUrl, 44)
                          : "No URL available"
                      }
                    />
                  </div>
                ) : (
                  <p className="rounded-[1.4rem] border border-dashed border-slate-300 bg-slate-50/80 px-4 py-5 text-sm leading-7 text-slate-600">
                    Select a document from the list to inspect the data returned
                    by
                    <span className="font-medium text-slate-900">
                      {" "}
                      listDocuments
                    </span>
                    .
                  </p>
                )}
              </div>
            </section>
          </div>
        </section>
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.6rem] border border-slate-200/80 bg-white/85 p-5 shadow-[0_18px_50px_-28px_rgba(15,23,42,0.35)]">
      <p className="text-xs font-semibold tracking-[0.22em] text-slate-500 uppercase">
        {label}
      </p>
      <p className="mt-3 text-base leading-7 break-words text-slate-900">
        {value}
      </p>
    </div>
  );
}

function DocumentMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium break-words text-slate-900">
        {value}
      </p>
    </div>
  );
}

function ApiResultCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.4rem] border border-slate-200/80 bg-slate-50/90 p-4">
      <p className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">
        {label}
      </p>
      <p className="mt-3 text-sm leading-6 break-words text-slate-900">
        {value}
      </p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.2rem] border border-slate-200/80 bg-slate-50/85 px-4 py-3">
      <p className="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">
        {label}
      </p>
      <p className="mt-2 text-sm leading-6 break-words text-slate-900">
        {value}
      </p>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: "uploaded" | "processing" | "ready" | "failed";
}) {
  const styles = {
    uploaded: "border-cyan-200 bg-cyan-50 text-cyan-700",
    processing: "border-amber-200 bg-amber-50 text-amber-700",
    ready: "border-emerald-200 bg-emerald-50 text-emerald-700",
    failed: "border-red-200 bg-red-50 text-red-700",
  } satisfies Record<"uploaded" | "processing" | "ready" | "failed", string>;

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.18em] uppercase ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatPendingUploadStatus(status: PendingUpload["status"]) {
  switch (status) {
    case "checking":
      return "Checking locally";
    case "ready":
      return "Ready to upload";
    case "rejected":
      return "Rejected";
    case "server_check_required":
      return "Server verification required";
  }
}

function truncateMiddle(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  const edgeLength = Math.floor((maxLength - 3) / 2);
  return `${value.slice(0, edgeLength)}...${value.slice(-edgeLength)}`;
}
