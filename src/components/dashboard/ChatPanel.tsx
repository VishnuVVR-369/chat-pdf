"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { Popover } from "radix-ui";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  ArrowReloadHorizontalIcon,
  ArrowUp01Icon,
  Cancel01Icon,
  Copy01Icon,
  Delete02Icon,
  PencilEdit01Icon,
  PlusSignIcon,
  SparklesIcon,
  StopCircleIcon,
  Tick02Icon,
  Time04Icon,
} from "@hugeicons/core-free-icons";
import { Streamdown } from "streamdown";
import { MAX_CHAT_QUESTION_CHARACTERS } from "@/constants/chat";
import { captureEvent, captureException } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { WorkspaceDocument } from "./Sidebar";

/* ─── Types ─────────────────────────────────────────────────────────── */

type CitationTarget = {
  pageNumber: number;
  quote?: string;
  quoteRatio?: number;
};

type ChatPanelProps = {
  document: WorkspaceDocument;
  currentPage?: number;
  onCitationSelect?: (citation: CitationTarget) => void;
};

type Citation = {
  pageNumber: number;
  snippet: string;
  chunkId?: Id<"documentChunks">;
  startPageNumber?: number;
  endPageNumber?: number;
  quote?: string;
  quoteStartOffset?: number;
  quoteEndOffset?: number;
  pageQuote?: string;
  pageQuoteRatio?: number;
};

type MessageStatus = "streaming" | "complete" | "stopped" | "failed";

type ConversationMessage = {
  _id: Id<"messages">;
  role: "user" | "assistant";
  content: string;
  pageNumber?: number;
  status?: MessageStatus;
  citations?: Citation[];
  createdAt: number;
};

type PendingExchange = {
  assistantContent: string;
  assistantMessageId: Id<"messages"> | null;
  citations: Citation[];
  conversationId: Id<"conversations"> | null;
  isRegenerate: boolean;
  isStreaming: boolean;
  pageNumber?: number;
  submittedAt: number;
  userContent: string;
};

type ChatMessageItem = {
  citations?: Citation[];
  content: string;
  createdAt: number;
  id?: Id<"messages">;
  key: string;
  pending?: boolean;
  pageNumber?: number;
  role: "user" | "assistant";
  status?: MessageStatus;
  streaming?: boolean;
};

type ConversationListItem = {
  _id: Id<"conversations">;
  title: string;
  createdAt: number;
};

/* ─── Constants ─────────────────────────────────────────────────────── */

const messageTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const SUGGESTED_PROMPTS: {
  id: string;
  label: string;
  build: (page?: number) => string;
}[] = [
  {
    id: "summary",
    label: "Summarize this document",
    build: () => "Summarize this document",
  },
  {
    id: "key",
    label: "Key findings",
    build: () => "What are the key findings?",
  },
  {
    id: "page",
    label: "Explain current page",
    build: (page) => `Explain page ${page ?? 1}`,
  },
];

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function normalizeAssistantContent(content: string) {
  const trimmed = content.trim();

  try {
    const parsed = JSON.parse(trimmed) as { answer?: unknown };
    if (typeof parsed.answer === "string" && parsed.answer.trim()) {
      return parsed.answer.trim();
    }
  } catch {
    // Fall through to tolerant extraction below.
  }

  const answerMatch = trimmed.match(/"answer"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (!answerMatch) {
    return trimmed;
  }

  try {
    return JSON.parse(`"${answerMatch[1]}"`) as string;
  } catch {
    return answerMatch[1]
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\r/g, "\r");
  }
}

function isRecentPendingMatch(
  createdAt: number,
  submittedAt: number,
  windowMs = 5_000,
) {
  return createdAt >= submittedAt - windowMs;
}

function matchesPendingUser(
  message: ConversationMessage,
  pendingExchange: PendingExchange,
) {
  return (
    message.role === "user" &&
    message.content === pendingExchange.userContent &&
    isRecentPendingMatch(message.createdAt, pendingExchange.submittedAt)
  );
}

/* ─── Main component ─────────────────────────────────────────────── */

export function ChatPanel({
  document,
  currentPage,
  onCitationSelect,
}: ChatPanelProps) {
  const conversations = useQuery(api.chatData.listConversationsForDocument, {
    documentId: document._id,
  }) as ConversationListItem[] | undefined;
  const renameConversation = useMutation(api.chatData.renameConversation);
  const deleteConversation = useMutation(api.chatData.deleteConversation);
  const [selectedConversation, setSelectedConversation] = useState<
    Id<"conversations"> | "new" | null
  >(null);
  const activeConversationId =
    selectedConversation === "new"
      ? null
      : conversations?.some(
            (conversation) => conversation._id === selectedConversation,
          )
        ? selectedConversation
        : (conversations?.[0]?._id ?? null);

  const handleNewConversation = () => {
    captureEvent("conversation_new_started", {
      document_id: document._id,
    });
    setSelectedConversation("new");
  };

  const handleRenameConversation = useCallback(
    (id: Id<"conversations">, title: string) => {
      void renameConversation({ conversationId: id, title });
      captureEvent("conversation_renamed", {
        conversation_id: id,
        document_id: document._id,
        title_length: title.length,
      });
    },
    [document._id, renameConversation],
  );

  const handleDeleteConversation = useCallback(
    (id: Id<"conversations">) => {
      if (selectedConversation === id) {
        setSelectedConversation("new");
      }
      void deleteConversation({ conversationId: id });
      captureEvent("conversation_deleted", {
        conversation_id: id,
        document_id: document._id,
      });
    },
    [deleteConversation, document._id, selectedConversation],
  );

  const activeTitle = activeConversationId
    ? conversations?.find((c) => c._id === activeConversationId)?.title
    : null;

  return (
    <div className="dark surface-raised flex h-full min-h-0 flex-col overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="relative flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400/80">
            <HugeiconsIcon icon={SparklesIcon} size={14} strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold tracking-tight text-stone-100">
              {activeTitle ? activeTitle.slice(0, 36) : "New chat"}
            </h3>
            <p className="truncate text-xs text-stone-500">{document.title}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {conversations && conversations.length > 0 && (
            <ConversationSwitcher
              activeConversationId={activeConversationId}
              conversations={conversations}
              onDelete={handleDeleteConversation}
              onRename={handleRenameConversation}
              onSelect={(id) => {
                setSelectedConversation(id as Id<"conversations">);
                captureEvent("conversation_selected", {
                  conversation_id: id,
                  document_id: document._id,
                });
              }}
              selectedConversation={selectedConversation}
            />
          )}
          <button
            className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-xs font-medium text-stone-300 transition-colors hover:border-amber-400/20 hover:bg-amber-500/[0.07] hover:text-amber-300"
            onClick={handleNewConversation}
            title="New conversation"
            type="button"
          >
            <HugeiconsIcon icon={PlusSignIcon} size={12} strokeWidth={2} />
            <span>New</span>
          </button>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────── */}
      <ChatBody
        conversationId={activeConversationId}
        currentPage={currentPage}
        document={document}
        onCitationSelect={onCitationSelect}
        onConversationCreated={setSelectedConversation}
      />
    </div>
  );
}

/* ─── Conversation Switcher ─────────────────────────────────────── */

function ConversationSwitcher({
  activeConversationId,
  conversations,
  onDelete,
  onRename,
  onSelect,
  selectedConversation,
}: {
  activeConversationId: Id<"conversations"> | null;
  conversations: ConversationListItem[];
  onDelete: (id: Id<"conversations">) => void;
  onRename: (id: Id<"conversations">, title: string) => void;
  onSelect: (id: string) => void;
  selectedConversation: Id<"conversations"> | "new" | null;
}) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<Id<"conversations"> | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmingId, setConfirmingId] = useState<Id<"conversations"> | null>(
    null,
  );

  const startEditing = (conv: ConversationListItem) => {
    setConfirmingId(null);
    setEditingId(conv._id);
    setDraft(conv.title);
  };

  const commitEditing = () => {
    if (editingId && draft.trim()) {
      onRename(editingId, draft.trim());
    }
    setEditingId(null);
    setDraft("");
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setEditingId(null);
          setConfirmingId(null);
        }
      }}
    >
      <Popover.Trigger asChild>
        <button
          className={cn(
            "focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors",
            open
              ? "border-amber-400/25 bg-amber-500/[0.08] text-amber-300"
              : "border-white/[0.08] bg-white/[0.04] text-stone-400 hover:border-white/[0.12] hover:text-stone-300",
          )}
          type="button"
        >
          <HugeiconsIcon icon={Time04Icon} size={12} strokeWidth={1.8} />
          <span className="max-w-[100px] truncate">History</span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={12}
            strokeWidth={2}
            className="opacity-60"
          />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 w-[280px] rounded-xl border border-white/[0.08] bg-[#111111] p-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl"
        >
          <div className="mb-1 px-2.5 py-1.5 text-xs font-semibold tracking-[0.15em] text-stone-500 uppercase">
            Conversations
          </div>
          <div className="max-h-[280px] overflow-y-auto">
            {conversations.map((conv) => {
              const isActive =
                selectedConversation !== "new" &&
                conv._id === activeConversationId;
              const isEditing = editingId === conv._id;
              const isConfirming = confirmingId === conv._id;

              if (isEditing) {
                return (
                  <div
                    key={conv._id}
                    className="flex items-center gap-1 rounded-lg bg-white/[0.04] px-2 py-1.5"
                  >
                    <input
                      autoFocus
                      className="min-w-0 flex-1 bg-transparent text-xs text-stone-200 outline-none"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitEditing();
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setEditingId(null);
                        }
                      }}
                    />
                    <button
                      aria-label="Save name"
                      className="focus-ring flex h-6 w-6 items-center justify-center rounded text-emerald-400/80 hover:text-emerald-300"
                      onClick={commitEditing}
                      type="button"
                    >
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        size={13}
                        strokeWidth={2}
                      />
                    </button>
                    <button
                      aria-label="Cancel rename"
                      className="focus-ring flex h-6 w-6 items-center justify-center rounded text-stone-500 hover:text-stone-300"
                      onClick={() => setEditingId(null)}
                      type="button"
                    >
                      <HugeiconsIcon
                        icon={Cancel01Icon}
                        size={12}
                        strokeWidth={2}
                      />
                    </button>
                  </div>
                );
              }

              return (
                <div
                  key={conv._id}
                  className={cn(
                    "group flex items-center gap-1 rounded-lg px-1 transition-colors",
                    isActive ? "bg-amber-500/[0.08]" : "hover:bg-white/[0.05]",
                  )}
                >
                  <button
                    className={cn(
                      "focus-ring flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-2 text-left text-xs transition-colors",
                      isActive
                        ? "text-amber-300"
                        : "text-stone-400 group-hover:text-stone-200",
                    )}
                    onClick={() => {
                      onSelect(conv._id);
                      setOpen(false);
                    }}
                    type="button"
                  >
                    <span className="h-1 w-1 shrink-0 rounded-full bg-current opacity-40" />
                    <span className="truncate">{conv.title.slice(0, 40)}</span>
                  </button>

                  {isConfirming ? (
                    <div className="flex items-center gap-0.5 pr-1">
                      <button
                        aria-label="Confirm delete"
                        className="focus-ring flex h-6 items-center rounded px-1.5 text-xs font-medium text-red-300 hover:text-red-200"
                        onClick={() => {
                          onDelete(conv._id);
                          setConfirmingId(null);
                        }}
                        type="button"
                      >
                        Delete
                      </button>
                      <button
                        aria-label="Cancel delete"
                        className="focus-ring flex h-6 w-6 items-center justify-center rounded text-stone-500 hover:text-stone-300"
                        onClick={() => setConfirmingId(null)}
                        type="button"
                      >
                        <HugeiconsIcon
                          icon={Cancel01Icon}
                          size={12}
                          strokeWidth={2}
                        />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-0.5 pr-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <button
                        aria-label="Rename conversation"
                        className="focus-ring flex h-6 w-6 items-center justify-center rounded text-stone-500 hover:text-stone-200"
                        onClick={() => startEditing(conv)}
                        type="button"
                      >
                        <HugeiconsIcon
                          icon={PencilEdit01Icon}
                          size={12}
                          strokeWidth={1.8}
                        />
                      </button>
                      <button
                        aria-label="Delete conversation"
                        className="focus-ring flex h-6 w-6 items-center justify-center rounded text-stone-500 hover:text-red-300"
                        onClick={() => setConfirmingId(conv._id)}
                        type="button"
                      >
                        <HugeiconsIcon
                          icon={Delete02Icon}
                          size={12}
                          strokeWidth={1.8}
                        />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/* ─── Chat body (messages + composer + locked states) ───────────── */

function ChatBody({
  conversationId,
  currentPage,
  document,
  onCitationSelect,
  onConversationCreated,
}: {
  conversationId: Id<"conversations"> | null;
  currentPage?: number;
  document: WorkspaceDocument;
  onCitationSelect?: (citation: CitationTarget) => void;
  onConversationCreated: (id: Id<"conversations">) => void;
}) {
  const { getToken, sessionClaims } = useAuth();
  const stopGeneration = useMutation(api.chatData.stopGeneration);
  const messages = useQuery(
    api.chatData.getConversationMessages,
    conversationId ? { conversationId } : "skip",
  ) as ConversationMessage[] | undefined;
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingExchange, setPendingExchange] =
    useState<PendingExchange | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pendingRef = useRef<PendingExchange | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [questionScope, setQuestionScope] = useState<"document" | "page">(
    "document",
  );

  // Mirror pending state into a ref so stop can read the latest partial synchronously.
  useEffect(() => {
    pendingRef.current = pendingExchange;
  }, [pendingExchange]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [isGenerating, messages, pendingExchange]);

  useEffect(() => {
    setPendingExchange((current) =>
      current && current.conversationId !== conversationId ? null : current,
    );
  }, [conversationId]);

  // Abort any in-flight stream when switching conversations or unmounting.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, [conversationId]);

  useEffect(() => {
    if (!messages || !pendingExchange) return;
    if (pendingExchange.isStreaming) return;

    const assistantPersisted = pendingExchange.assistantMessageId
      ? messages.some(
          (message) => message._id === pendingExchange.assistantMessageId,
        )
      : false;
    const userPersisted = pendingExchange.isRegenerate
      ? true
      : messages.some((message) =>
          matchesPendingUser(message, pendingExchange),
        );

    if (assistantPersisted && userPersisted) {
      setPendingExchange(null);
    }
  }, [messages, pendingExchange]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const runGeneration = useCallback(
    async (params: {
      regenerate?: boolean;
      expectedAssistantMessageId?: Id<"messages">;
      userContent?: string;
      pageNumber?: number;
    }) => {
      if (isGenerating) return;

      const isRegenerate = params.regenerate === true;
      const userContent = params.userContent ?? "";
      const pageNumber = params.pageNumber;

      setError(null);
      setIsGenerating(true);
      const submittedAt = Date.now();
      const generationStartedAt = performance.now();
      const controller = new AbortController();
      abortRef.current = controller;

      captureEvent("chat_generation_started", {
        conversation_id: conversationId ?? undefined,
        current_page: currentPage,
        document_id: document._id,
        is_regenerate: isRegenerate,
        question_length: userContent.length,
        question_scope: pageNumber === undefined ? "document" : "page",
        scoped_page: pageNumber,
        status: document.status,
      });

      setPendingExchange({
        assistantContent: "",
        assistantMessageId: null,
        citations: [],
        conversationId,
        isRegenerate,
        isStreaming: true,
        ...(pageNumber !== undefined ? { pageNumber } : {}),
        submittedAt,
        userContent,
      });

      try {
        // Match ConvexProviderWithClerk: use Clerk's native Convex session token
        // when its audience is already "convex", otherwise fall back to a JWT
        // template named "convex".
        const token =
          sessionClaims?.aud === "convex"
            ? await getToken()
            : await getToken({ template: "convex" });
        const siteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
        if (!siteUrl)
          throw new Error("NEXT_PUBLIC_CONVEX_SITE_URL is not configured");

        const requestBody = isRegenerate
          ? {
              documentId: document._id,
              conversationId: conversationId ?? undefined,
              regenerate: true,
              expectedAssistantMessageId: params.expectedAssistantMessageId,
            }
          : {
              documentId: document._id,
              conversationId: conversationId ?? undefined,
              content: userContent,
              ...(pageNumber !== undefined ? { pageNumber } : {}),
            };

        const res = await fetch(`${siteUrl}/api/chat/stream`, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(requestBody),
        });

        if (!res.ok || !res.body) {
          throw new Error(`Stream request failed: ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        // Time-to-first-token: proves the answer is actually streaming (vs. landing
        // in one burst after a long hidden reasoning phase).
        let firstTokenAt: number | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice("data: ".length).trim();
            if (!raw) continue;

            let event: { type: string; [k: string]: unknown };
            try {
              event = JSON.parse(raw) as typeof event;
            } catch {
              continue;
            }

            if (event.type === "meta") {
              const newConvId = event.conversationId as Id<"conversations">;
              const assistantMessageId =
                event.assistantMessageId as Id<"messages">;
              captureEvent("chat_generation_meta_received", {
                assistant_message_id: assistantMessageId,
                conversation_id: newConvId,
                document_id: document._id,
                is_new_conversation: Boolean(event.isNew),
                is_regenerate: isRegenerate,
              });
              setPendingExchange((cur) =>
                cur
                  ? { ...cur, conversationId: newConvId, assistantMessageId }
                  : null,
              );
              if (event.isNew) {
                captureEvent("conversation_created", {
                  conversation_id: newConvId,
                  document_id: document._id,
                  source: "chat_generation",
                });
                onConversationCreated(newConvId);
              }
            } else if (event.type === "token") {
              const tok = event.token as string;
              if (firstTokenAt === null) firstTokenAt = performance.now();
              setPendingExchange((cur) =>
                cur
                  ? { ...cur, assistantContent: cur.assistantContent + tok }
                  : null,
              );
            } else if (event.type === "done") {
              const content = event.content as string | undefined;
              const citations = event.citations as Citation[];
              captureEvent("chat_generation_completed", {
                answer_length: content?.length,
                citation_count: citations.length,
                conversation_id:
                  pendingRef.current?.conversationId ??
                  conversationId ??
                  undefined,
                document_id: document._id,
                duration_ms: Math.round(
                  performance.now() - generationStartedAt,
                ),
                is_regenerate: isRegenerate,
                question_length: userContent.length,
                question_scope: pageNumber === undefined ? "document" : "page",
                scoped_page: pageNumber,
                time_to_first_token_ms:
                  firstTokenAt !== null
                    ? Math.round(firstTokenAt - generationStartedAt)
                    : undefined,
              });
              setPendingExchange((cur) => {
                if (!cur) return null;
                return {
                  ...cur,
                  assistantContent: content ?? cur.assistantContent,
                  citations,
                  isStreaming: false,
                };
              });
            } else if (event.type === "error") {
              throw new Error(event.error as string);
            }
          }
        }
      } catch (err) {
        if (isAbortError(err)) {
          // Stop was requested; handleStop persists the partial. Leave the bubble.
          return;
        }
        if (!isRegenerate) {
          setInput(userContent);
        }
        captureException(err, {
          conversation_id: conversationId ?? undefined,
          document_id: document._id,
          duration_ms: Math.round(performance.now() - generationStartedAt),
          is_regenerate: isRegenerate,
          question_length: userContent.length,
          source: "chat_generation",
        });
        setPendingExchange(null);
        setError(
          err instanceof Error ? err.message : "Failed to send message.",
        );
      } finally {
        setIsGenerating(false);
        abortRef.current = null;
      }
    },
    [
      conversationId,
      currentPage,
      document._id,
      document.status,
      getToken,
      isGenerating,
      onConversationCreated,
      sessionClaims?.aud,
    ],
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const question = input.trim();
    if (!question || isGenerating) return;
    setInput("");
    await runGeneration({
      userContent: question,
      ...(questionScope === "page" && currentPage !== undefined
        ? { pageNumber: currentPage }
        : {}),
    });
  };

  const handleStop = useCallback(async () => {
    const pending = pendingRef.current;
    captureEvent("chat_generation_stop_requested", {
      assistant_message_id: pending?.assistantMessageId ?? undefined,
      conversation_id: pending?.conversationId ?? conversationId ?? undefined,
      document_id: document._id,
      partial_answer_length: pending?.assistantContent.length ?? 0,
    });
    // Stop visual streaming immediately for responsiveness.
    setPendingExchange((cur) => (cur ? { ...cur, isStreaming: false } : cur));

    if (pending?.assistantMessageId) {
      // Persist the stop and AWAIT it before aborting, so it commits while the server
      // is still streaming and wins the race against complete-finalization (which is
      // guarded on status === "streaming").
      try {
        await stopGeneration({
          messageId: pending.assistantMessageId,
          content: pending.assistantContent,
        });
      } catch {
        // Best-effort; the server also marks the message stopped on abort.
      }
    } else {
      // No generation id yet — drop the optimistic bubble.
      setPendingExchange(null);
    }
    abortRef.current?.abort();
  }, [conversationId, document._id, stopGeneration]);

  const handleRegenerate = useCallback(
    (assistantMessageId: Id<"messages">) => {
      if (isGenerating) return;
      const assistantIndex = messages?.findIndex(
        (message) => message._id === assistantMessageId,
      );
      const userMessage =
        assistantIndex !== undefined && assistantIndex > 0
          ? messages?.[assistantIndex - 1]
          : undefined;
      captureEvent("chat_regenerate_requested", {
        assistant_message_id: assistantMessageId,
        conversation_id: conversationId ?? undefined,
        document_id: document._id,
      });
      void runGeneration({
        regenerate: true,
        expectedAssistantMessageId: assistantMessageId,
        ...(userMessage?.role === "user"
          ? {
              userContent: userMessage.content,
              ...(userMessage.pageNumber !== undefined
                ? { pageNumber: userMessage.pageNumber }
                : {}),
            }
          : {}),
      });
    },
    [conversationId, document._id, isGenerating, messages, runGeneration],
  );

  const handleSuggestedPrompt = useCallback(
    (prompt: (typeof SUGGESTED_PROMPTS)[number]) => {
      const text = prompt.build(currentPage);
      setQuestionScope(prompt.id === "page" ? "page" : "document");
      captureEvent("suggested_prompt_selected", {
        current_page: currentPage,
        document_id: document._id,
        prompt_id: prompt.id,
      });
      setInput(text);
      textareaRef.current?.focus();
    },
    [currentPage, document._id],
  );

  const persistedMessages = messages ?? [];
  const displayMessages: ChatMessageItem[] = persistedMessages.map(
    (message) => ({
      citations: message.citations,
      content:
        message.role === "assistant"
          ? normalizeAssistantContent(message.content)
          : message.content,
      createdAt: message.createdAt,
      id: message._id,
      key: message._id,
      pageNumber: message.pageNumber,
      role: message.role,
      status: message.status,
    }),
  );

  if (pendingExchange) {
    const hasPendingUser = persistedMessages.some((message) =>
      matchesPendingUser(message, pendingExchange),
    );
    const hasPendingAssistant = pendingExchange.assistantMessageId
      ? persistedMessages.some(
          (message) => message._id === pendingExchange.assistantMessageId,
        )
      : false;

    if (!pendingExchange.isRegenerate && !hasPendingUser) {
      displayMessages.push({
        content: pendingExchange.userContent,
        createdAt: pendingExchange.submittedAt,
        key: `pending-user-${pendingExchange.submittedAt}`,
        pending: true,
        pageNumber: pendingExchange.pageNumber,
        role: "user",
      });
    }

    if (pendingExchange.assistantContent && !hasPendingAssistant) {
      displayMessages.push({
        citations: pendingExchange.isStreaming
          ? undefined
          : pendingExchange.citations,
        content: pendingExchange.assistantContent,
        createdAt: pendingExchange.submittedAt + 1,
        key: `pending-assistant-${pendingExchange.submittedAt}`,
        pending: true,
        role: "assistant",
        streaming: pendingExchange.isStreaming,
      });
    }
  }

  // Index of the last assistant message that can be regenerated (persisted + idle).
  const lastAssistantId =
    !pendingExchange && !isGenerating
      ? [...displayMessages].reverse().find((m) => m.role === "assistant")?.id
      : undefined;

  const hasMessages = displayMessages.length > 0;
  const showSuggestionChips = !hasMessages && !isGenerating;

  return (
    <>
      {/* ── Messages area ──────────────────────────────────────── */}
      <div className="chat-scroll-area min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {!hasMessages && !isGenerating ? (
          <EmptyState />
        ) : (
          <div
            aria-busy={isGenerating}
            aria-live="polite"
            className="space-y-5"
            role="log"
          >
            <AnimatePresence initial={false}>
              {displayMessages.map((msg) => (
                <ChatMessageBubble
                  key={msg.key}
                  message={msg}
                  onCitationSelect={onCitationSelect}
                  onRegenerate={
                    msg.id && msg.id === lastAssistantId
                      ? handleRegenerate
                      : undefined
                  }
                />
              ))}
            </AnimatePresence>

            <AnimatePresence>
              {isGenerating &&
                pendingExchange?.isStreaming &&
                pendingExchange.assistantContent === "" && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.25 }}
                    className="flex items-start gap-3"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400/70">
                      <HugeiconsIcon
                        icon={SparklesIcon}
                        size={14}
                        strokeWidth={1.8}
                      />
                    </div>
                    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="chat-typing-dot inline-block h-1.5 w-1.5 rounded-full bg-amber-400/80" />
                        <span className="chat-typing-dot inline-block h-1.5 w-1.5 rounded-full bg-amber-400/80 [animation-delay:150ms]" />
                        <span className="chat-typing-dot inline-block h-1.5 w-1.5 rounded-full bg-amber-400/80 [animation-delay:300ms]" />
                        <span className="ml-2 text-sm text-stone-500">
                          Thinking…
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}
            </AnimatePresence>

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ── Suggested prompt chips (empty + ready) ───────────── */}
      {showSuggestionChips && (
        <div className="shrink-0 px-4 pb-2">
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_PROMPTS.map((p) => (
              <button
                key={p.id}
                className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs text-stone-300 transition-colors hover:border-amber-400/25 hover:bg-amber-500/[0.06] hover:text-amber-200"
                onClick={() => handleSuggestedPrompt(p)}
                type="button"
              >
                <HugeiconsIcon
                  icon={SparklesIcon}
                  size={11}
                  strokeWidth={1.8}
                />
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-red-500/15 bg-red-500/[0.04]"
          >
            <div className="flex items-center gap-2 px-5 py-2.5">
              <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
              <p className="text-xs text-red-300/90">{error}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Composer ─────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-white/[0.06] bg-[#080808] px-4 pt-3 pb-4">
        <form
          className={cn(
            "relative rounded-xl border transition-colors duration-200",
            isFocused
              ? "border-amber-400/20 bg-white/[0.04] shadow-[0_0_20px_rgba(245,158,11,0.06)]"
              : "border-white/[0.07] bg-white/[0.025]",
          )}
          onSubmit={handleSubmit}
        >
          <div className="flex px-4 pt-3 pb-0">
            <div
              aria-label="Question scope"
              className="inline-flex rounded-lg border border-white/[0.07] bg-black/20 p-0.5"
              role="group"
            >
              <button
                aria-pressed={questionScope === "document"}
                className={cn(
                  "rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
                  questionScope === "document"
                    ? "bg-white/[0.08] text-stone-200"
                    : "text-stone-500 hover:text-stone-300",
                )}
                onClick={() => setQuestionScope("document")}
                type="button"
              >
                Document
              </button>
              {currentPage !== undefined && (
                <button
                  aria-pressed={questionScope === "page"}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
                    questionScope === "page"
                      ? "bg-amber-500/[0.12] text-amber-300"
                      : "text-stone-500 hover:text-stone-300",
                  )}
                  onClick={() => setQuestionScope("page")}
                  type="button"
                >
                  Page {currentPage}
                </button>
              )}
            </div>
          </div>

          <div className="flex items-end gap-2 px-4 py-3">
            <textarea
              ref={textareaRef}
              className="max-h-[120px] min-h-[24px] flex-1 resize-none bg-transparent text-base leading-relaxed text-stone-200 outline-none placeholder:text-stone-600 disabled:cursor-not-allowed"
              disabled={isGenerating}
              maxLength={MAX_CHAT_QUESTION_CHARACTERS}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSubmit(e);
                }
              }}
              placeholder="Ask about this document…"
              rows={1}
              value={input}
            />
            {isGenerating ? (
              <button
                aria-label="Stop generating"
                className="focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.08] text-stone-200 transition-colors duration-150 hover:bg-white/[0.12]"
                onClick={() => void handleStop()}
                type="button"
              >
                <HugeiconsIcon
                  icon={StopCircleIcon}
                  size={18}
                  strokeWidth={1.8}
                />
              </button>
            ) : (
              <button
                aria-label="Send message"
                className={cn(
                  "focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-150",
                  input.trim()
                    ? "bg-amber-500 text-[#070707] shadow-[0_2px_12px_rgba(245,158,11,0.25)] hover:bg-amber-400"
                    : "bg-white/[0.06] text-stone-600",
                )}
                disabled={!input.trim()}
                type="submit"
              >
                <HugeiconsIcon icon={ArrowUp01Icon} size={16} strokeWidth={2} />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between px-4 pt-0 pb-2.5">
            <span className="text-xs text-stone-600/60">
              <kbd className="rounded border border-white/[0.06] bg-white/[0.04] px-1 py-0.5 font-mono text-xs">
                ↵
              </kbd>{" "}
              to send
            </span>
          </div>
        </form>
      </div>
    </>
  );
}

/* ─── Empty state ───────────────────────────────────────────────── */

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-sm text-center"
      >
        <div className="relative mx-auto mb-5 h-14 w-14">
          <div className="absolute inset-0 rounded-full bg-amber-500/[0.08] blur-xl" />
          <div className="relative flex h-full w-full items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03] text-amber-400/70">
            <HugeiconsIcon icon={SparklesIcon} size={22} strokeWidth={1.6} />
          </div>
        </div>

        <h3 className="text-md font-semibold tracking-tight text-stone-100">
          What would you like to know?
        </h3>
        <p className="mx-auto mt-2 max-w-[260px] text-sm leading-relaxed text-stone-500">
          Ask anything about this document. Answers include citations with page
          references.
        </p>
      </motion.div>
    </div>
  );
}

/* ─── Chat message bubble ───────────────────────────────────────── */

function ChatMessageBubble({
  message,
  onCitationSelect,
  onRegenerate,
}: {
  message: ChatMessageItem;
  onCitationSelect?: (citation: CitationTarget) => void;
  onRegenerate?: (assistantMessageId: Id<"messages">) => void;
}) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 1_500);
    } catch {
      // Clipboard may be unavailable; ignore.
    }
  };

  const showActions =
    !isUser && !message.streaming && message.content.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}
    >
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400/70">
          <HugeiconsIcon icon={SparklesIcon} size={14} strokeWidth={1.8} />
        </div>
      )}

      <div className={cn("group max-w-[88%] min-w-0", isUser && "max-w-[82%]")}>
        <div
          className={cn(
            "mb-1.5 flex items-center gap-2 px-0.5 text-xs text-stone-500",
            isUser ? "justify-end" : "justify-start",
          )}
        >
          <span className="font-medium">{isUser ? "You" : "Assistant"}</span>
          {isUser && message.pageNumber !== undefined && (
            <span className="rounded bg-amber-500/[0.08] px-1.5 py-0.5 text-amber-400/70">
              Page {message.pageNumber}
            </span>
          )}
          <span className="text-stone-600">
            {messageTimeFormatter.format(message.createdAt)}
          </span>
          {message.status === "stopped" && (
            <span className="text-stone-500/80">· stopped</span>
          )}
          {message.pending && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-400/60">
              <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-amber-400/60" />
              {isUser ? "Sending" : "Syncing"}
            </span>
          )}
        </div>

        <div
          className={cn(
            "rounded-2xl px-4 py-3",
            isUser
              ? "bg-amber-500/[0.1] text-stone-100"
              : "border border-white/[0.06] bg-white/[0.03] text-stone-200",
          )}
        >
          {isUser ? (
            <p className="text-base leading-7 whitespace-pre-wrap">
              {message.content}
            </p>
          ) : (
            <Streamdown
              animated={!!message.streaming}
              className="chat-markdown"
              isAnimating={!!message.streaming}
            >
              {message.content}
            </Streamdown>
          )}
        </div>

        {message.citations && message.citations.length > 0 && (
          <CitationList
            citations={message.citations}
            onCitationSelect={onCitationSelect}
          />
        )}

        {showActions && (
          <div className="mt-1.5 flex items-center gap-1 px-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <button
              aria-label={copied ? "Copied" : "Copy answer"}
              className="focus-ring inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-stone-500 transition-colors hover:text-stone-300"
              onClick={handleCopy}
              type="button"
            >
              <HugeiconsIcon
                icon={copied ? Tick02Icon : Copy01Icon}
                size={12}
                strokeWidth={1.8}
              />
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
            {onRegenerate && message.id && (
              <button
                aria-label="Regenerate answer"
                className="focus-ring inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-stone-500 transition-colors hover:text-amber-300"
                onClick={() => onRegenerate(message.id as Id<"messages">)}
                type="button"
              >
                <HugeiconsIcon
                  icon={ArrowReloadHorizontalIcon}
                  size={12}
                  strokeWidth={1.8}
                />
                <span>Regenerate</span>
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ─── Expandable citations ──────────────────────────────────────── */

function CitationList({
  citations,
  onCitationSelect,
}: {
  citations: Citation[];
  onCitationSelect?: (citation: CitationTarget) => void;
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  return (
    <div className="mt-2 flex flex-wrap items-start gap-1.5 px-0.5">
      <span className="mr-0.5 self-center text-xs font-medium tracking-wider text-stone-600 uppercase">
        Sources
      </span>
      {citations.map((cite, index) => {
        const isExpanded = expandedIndex === index;
        return (
          <div key={`${cite.pageNumber}-${index}`} className="inline-flex">
            <button
              className={cn(
                "focus-ring inline-flex items-center gap-1 rounded-lg border text-xs font-medium transition-colors duration-150",
                isExpanded
                  ? "border-amber-400/20 bg-amber-500/[0.08] px-2.5 py-1 text-amber-300"
                  : "border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-stone-400 hover:border-amber-400/15 hover:text-stone-300",
              )}
              onClick={() => {
                onCitationSelect?.({
                  pageNumber: cite.pageNumber,
                  quote: cite.pageQuote ?? cite.quote,
                  quoteRatio: cite.pageQuoteRatio,
                });
                setExpandedIndex(isExpanded ? null : index);
              }}
              type="button"
            >
              <span className="tabular-nums">p.{cite.pageNumber}</span>
              <span
                className={cn(
                  "transition-transform duration-200",
                  isExpanded && "rotate-180",
                )}
              >
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  size={10}
                  strokeWidth={2}
                />
              </span>
            </button>

            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="ml-1 max-w-[220px] rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5">
                    <p className="line-clamp-3 text-xs leading-relaxed text-stone-400">
                      {cite.snippet}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
