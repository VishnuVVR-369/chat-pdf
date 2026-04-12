"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { WorkspaceDocument } from "./Sidebar";

type ChatCitation = {
  _id: string;
  documentId: string;
  documentTitle: string;
  chunkId?: string;
  pageNumber: number;
  snippet: string;
  highlightedText?: string;
};

type ChatMessage = {
  _id: string;
  _creationTime: number;
  role: "system" | "user" | "assistant";
  content: string;
  answerStatus?: "grounded" | "weak_evidence" | "not_found";
  citations: ChatCitation[];
};

type ChatPanelProps = {
  document: WorkspaceDocument;
};

const EMPTY_MESSAGES: ChatMessage[] = [];

function formatAnswerStatus(status: ChatMessage["answerStatus"]) {
  if (status === "grounded") {
    return "Grounded";
  }
  if (status === "weak_evidence") {
    return "Weak evidence";
  }
  if (status === "not_found") {
    return "No match";
  }
  return null;
}

export function ChatPanel({ document }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatData = useQuery(api.chatState.getDocumentChat, {
    documentId: document._id,
  });
  const askDocumentQuestion = useAction(api.chat.askDocumentQuestion);

  const messages = (chatData?.messages ?? EMPTY_MESSAGES) as ChatMessage[];
  const isDocumentReady = document.status === "ready";
  const isComposerDisabled = isSubmitting || !isDocumentReady;
  const isChatLoading = chatData === undefined;
  const statusMessage =
    document.status === "failed"
      ? (document.processingError ?? "Document processing failed.")
      : document.status === "uploading" ||
          document.status === "processing" ||
          document.status === "uploaded"
        ? "OCR and embedding are still running for this PDF. Chat will unlock when indexing finishes."
        : null;

  useEffect(() => {
    setInput("");
    setSubmissionError(null);
  }, [document._id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSubmitting]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const question = input.trim();

    if (!question || isComposerDisabled) {
      return;
    }

    setSubmissionError(null);
    setIsSubmitting(true);
    setInput("");

    try {
      await askDocumentQuestion({
        documentId: document._id,
        question,
      });
    } catch (error) {
      setInput(question);
      setSubmissionError(
        error instanceof Error ? error.message : "Could not send the message.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.12),_transparent_28%),linear-gradient(180deg,_rgba(12,10,9,0.96),_rgba(7,7,7,0.98))]">
      <div className="border-b border-stone-800/70 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-300">
                <ChatBubbleIcon />
              </span>
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-stone-100">
                  Document Chat
                </h3>
                <p className="truncate text-xs text-stone-500">
                  Retrieval-backed answers for {document.title}
                </p>
              </div>
            </div>
          </div>

          <div className="shrink-0 rounded-full border border-stone-800 bg-stone-950/80 px-2.5 py-1 text-[11px] font-medium tracking-[0.16em] text-stone-400 uppercase">
            {messages.length} msgs
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
            vector search
          </span>
          <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300">
            page-linked citations
          </span>
        </div>
      </div>

      {statusMessage && (
        <div
          className={cn(
            "border-b px-4 py-3 text-sm",
            document.status === "failed"
              ? "border-red-950/60 bg-red-950/20 text-red-200"
              : "border-amber-950/60 bg-amber-950/20 text-amber-100",
          )}
        >
          {statusMessage}
        </div>
      )}

      {submissionError && (
        <div className="border-b border-red-950/60 bg-red-950/20 px-4 py-3 text-sm text-red-200">
          {submissionError}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isChatLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex items-center gap-3 rounded-full border border-stone-800 bg-stone-950/70 px-4 py-2 text-sm text-stone-400">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-700 border-t-amber-400" />
              Loading conversation...
            </div>
          </div>
        ) : messages.length === 0 && !isSubmitting ? (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-md rounded-[28px] border border-stone-800/80 bg-stone-950/50 p-6 text-center shadow-[0_30px_80px_rgba(0,0,0,0.28)]">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/15 bg-amber-500/10 text-amber-300">
                <ChatBubbleIcon />
              </div>
              <p className="mt-4 text-base font-semibold text-stone-100">
                {isDocumentReady
                  ? "Start asking about this PDF"
                  : document.status === "failed"
                    ? "This document is not chat-ready"
                    : "Indexing still in progress"}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-stone-400">
                {isDocumentReady
                  ? "Questions run against the stored document embeddings and return the strongest supporting passages with page references."
                  : document.status === "failed"
                    ? "Fix the processing issue and re-run indexing before asking questions."
                    : "Chat will unlock automatically after OCR, chunking, and embedding storage finish."}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {messages.map((message) => {
              const answerStatus = formatAnswerStatus(message.answerStatus);

              return (
                <article
                  key={message._id}
                  className={cn(
                    "max-w-[92%] rounded-[28px] border px-4 py-4 shadow-[0_20px_70px_rgba(0,0,0,0.22)]",
                    message.role === "user"
                      ? "ml-auto border-amber-500/20 bg-[linear-gradient(180deg,rgba(245,158,11,0.18),rgba(245,158,11,0.06))] text-stone-100"
                      : "border-stone-800/90 bg-stone-950/65 text-stone-200",
                  )}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-2xl border text-xs font-semibold uppercase",
                          message.role === "user"
                            ? "border-amber-400/30 bg-amber-300/10 text-amber-200"
                            : "border-stone-700 bg-stone-900 text-stone-300",
                        )}
                      >
                        {message.role === "user" ? "You" : "AI"}
                      </span>
                      <span className="text-[11px] font-medium tracking-[0.18em] text-stone-500 uppercase">
                        {message.role === "user" ? "Question" : "Answer"}
                      </span>
                    </div>

                    {answerStatus && message.role === "assistant" && (
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[11px] font-medium",
                          message.answerStatus === "grounded"
                            ? "bg-emerald-500/12 text-emerald-300"
                            : message.answerStatus === "weak_evidence"
                              ? "bg-amber-500/12 text-amber-300"
                              : "bg-stone-800 text-stone-400",
                        )}
                      >
                        {answerStatus}
                      </span>
                    )}
                  </div>

                  <div className="space-y-3">
                    {message.content.split("\n\n").map((paragraph, index) => (
                      <p
                        key={`${message._id}-${index}`}
                        className="text-sm leading-7 text-inherit/95"
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>

                  {message.citations.length > 0 && (
                    <div className="mt-4 grid gap-2">
                      {message.citations.map((citation) => (
                        <div
                          key={citation._id}
                          className="rounded-2xl border border-stone-800/90 bg-stone-950/80 p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-[11px] font-medium tracking-[0.16em] text-stone-500 uppercase">
                              {citation.documentTitle}
                            </p>
                            <span className="shrink-0 rounded-full bg-stone-900 px-2 py-1 text-[11px] text-amber-300">
                              p. {citation.pageNumber}
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-stone-300">
                            {citation.highlightedText ?? citation.snippet}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}

            {isSubmitting && (
              <div className="max-w-[92%] rounded-[28px] border border-stone-800/90 bg-stone-950/65 px-4 py-4 shadow-[0_20px_70px_rgba(0,0,0,0.22)]">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-2xl border border-stone-700 bg-stone-900 text-xs font-semibold text-stone-300 uppercase">
                    AI
                  </span>
                  <span className="text-[11px] font-medium tracking-[0.18em] text-stone-500 uppercase">
                    Searching chunks
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400 [animation-delay:150ms]" />
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400 [animation-delay:300ms]" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="border-t border-stone-800/70 p-3">
        <form
          className="rounded-[26px] border border-stone-800/80 bg-stone-950/70 p-2 shadow-[0_-10px_50px_rgba(0,0,0,0.18)]"
          onSubmit={handleSubmit}
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              className="max-h-[120px] min-h-[24px] flex-1 resize-none bg-transparent px-3 py-2 text-sm leading-7 text-stone-100 outline-none placeholder:text-stone-600"
              disabled={isComposerDisabled}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSubmit(event);
                }
              }}
              placeholder={
                isDocumentReady
                  ? "Ask what this document actually says..."
                  : document.status === "failed"
                    ? "Document processing failed"
                    : "Waiting for indexing to finish..."
              }
              rows={1}
              value={input}
            />

            <button
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition-colors",
                input.trim() && !isComposerDisabled
                  ? "bg-amber-500 text-[#070707] hover:bg-amber-400"
                  : "bg-stone-900 text-stone-600",
              )}
              disabled={!input.trim() || isComposerDisabled}
              type="submit"
            >
              <SendIcon />
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 px-3 pb-1 text-[11px] text-stone-600">
            <span>
              {isDocumentReady
                ? "Answers are assembled from the top retrieved chunks."
                : "Chat stays disabled until the document is fully indexed."}
            </span>
            <span>Enter to send</span>
          </div>
        </form>
      </div>
    </div>
  );
}

function ChatBubbleIcon() {
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
      <path d="M7 10h10" />
      <path d="M7 14h7" />
      <path d="M5 19.5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-4 3.5Z" />
    </svg>
  );
}

function SendIcon() {
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
      <path d="m5 12 14-7-4 7 4 7Z" />
      <path d="M5 12h14" />
    </svg>
  );
}
