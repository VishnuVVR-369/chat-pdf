"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { WorkspaceDocument } from "./Sidebar";

type ChatPanelProps = {
  document: WorkspaceDocument;
  currentPage?: number;
};

type Citation = {
  pageNumber: number;
  snippet: string;
};

type ConversationMessage = {
  _id: Id<"messages">;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  createdAt: number;
};

export function ChatPanel({ document, currentPage }: ChatPanelProps) {
  const conversations = useQuery(api.chatQueries.listConversationsForDocument, {
    documentId: document._id,
  });
  const [activeConversationId, setActiveConversationId] =
    useState<Id<"conversations"> | null>(null);

  // Auto-select latest conversation
  useEffect(() => {
    if (!activeConversationId && conversations && conversations.length > 0) {
      setActiveConversationId(conversations[0]._id);
    }
  }, [activeConversationId, conversations]);

  // Reset conversation when document changes
  useEffect(() => {
    setActiveConversationId(null);
  }, [document._id]);

  const handleNewConversation = () => {
    setActiveConversationId(null);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-stone-800/60 px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-stone-200">Chat</h3>
          <p className="truncate text-xs text-stone-500">
            {document.title}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {conversations && conversations.length > 0 && (
            <select
              className="h-7 rounded-lg border border-stone-700/50 bg-stone-900/60 px-2 text-xs text-stone-300 outline-none"
              value={activeConversationId ?? ""}
              onChange={(e) =>
                setActiveConversationId(
                  e.target.value
                    ? (e.target.value as Id<"conversations">)
                    : null,
                )
              }
            >
              <option value="">New chat</option>
              {conversations.map((conv: { _id: Id<"conversations">; title: string; createdAt: number }) => (
                <option key={conv._id} value={conv._id}>
                  {conv.title.slice(0, 40)}
                </option>
              ))}
            </select>
          )}
          <button
            className="flex h-7 w-7 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-800/50 hover:text-stone-300"
            onClick={handleNewConversation}
            title="New conversation"
            type="button"
          >
            <PlusIcon />
          </button>
        </div>
      </div>

      {/* Chat body */}
      <ChatConversation
        conversationId={activeConversationId}
        currentPage={currentPage}
        document={document}
        onConversationCreated={setActiveConversationId}
      />
    </div>
  );
}

function ChatConversation({
  conversationId,
  currentPage,
  document,
  onConversationCreated,
}: {
  conversationId: Id<"conversations"> | null;
  currentPage?: number;
  document: WorkspaceDocument;
  onConversationCreated: (id: Id<"conversations">) => void;
}) {
  const sendMessage = useAction(api.chat.sendMessage);
  const messages = useQuery(
    api.chatQueries.getConversationMessages,
    conversationId ? { conversationId } : "skip",
  );
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isGenerating]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const question = input.trim();
    if (!question || isGenerating) return;

    setInput("");
    setError(null);
    setIsGenerating(true);

    try {
      const result = await sendMessage({
        documentId: document._id,
        conversationId: conversationId ?? undefined,
        content: question,
      });

      if (!conversationId) {
        onConversationCreated(result.conversationId);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to send message.",
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const displayMessages = messages ?? [];

  return (
    <>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {displayMessages.length === 0 && !isGenerating ? (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-xs text-center">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-stone-800/40 text-stone-500">
                <ChatBubbleIcon />
              </div>
              <p className="text-sm font-medium text-stone-300">
                Ask anything about this document
              </p>
              <p className="mt-1 text-xs text-stone-500">
                Answers are grounded in the document content using semantic
                search.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {displayMessages.map((msg: ConversationMessage) => (
              <div
                key={msg._id}
                className={cn(
                  "max-w-[88%] rounded-2xl px-4 py-3",
                  msg.role === "user"
                    ? "ml-auto bg-amber-500/10 text-stone-200"
                    : "bg-stone-800/30 text-stone-300",
                )}
              >
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {msg.content}
                </p>
                {msg.citations && msg.citations.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {msg.citations.map((cite: Citation, i: number) => (
                      <span
                        key={`${cite.pageNumber}-${i}`}
                        className="inline-flex items-center gap-1 rounded-md bg-stone-700/30 px-2 py-0.5 text-[11px] text-stone-400"
                        title={cite.snippet}
                      >
                        p. {cite.pageNumber}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {isGenerating && (
              <div className="max-w-[88%] rounded-2xl bg-stone-800/30 px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400 [animation-delay:150ms]" />
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400 [animation-delay:300ms]" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="border-t border-red-500/20 bg-red-500/[0.04] px-4 py-2">
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      {/* Composer */}
      <div className="border-t border-stone-800/60 p-3">
        {currentPage && (
          <p className="mb-1.5 px-1 text-[11px] text-stone-600">
            Viewing page {currentPage}
          </p>
        )}
        <form
          className="flex items-end gap-2 rounded-xl border border-stone-700/40 bg-stone-900/40 px-3 py-2"
          onSubmit={handleSubmit}
        >
          <textarea
            ref={textareaRef}
            className="max-h-[120px] min-h-[20px] flex-1 resize-none bg-transparent text-sm leading-relaxed text-stone-200 outline-none placeholder:text-stone-600"
            disabled={isGenerating}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSubmit(e);
              }
            }}
            placeholder="Ask a question..."
            rows={1}
            value={input}
          />
          <button
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
              input.trim() && !isGenerating
                ? "bg-amber-500 text-[#070707] hover:bg-amber-400"
                : "bg-stone-800/60 text-stone-600",
            )}
            disabled={!input.trim() || isGenerating}
            type="submit"
          >
            <SendIcon />
          </button>
        </form>
      </div>
    </>
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

function PlusIcon() {
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
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}
