"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { Popover } from "radix-ui";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  PlusSignIcon,
  SparklesIcon,
  Time04Icon,
} from "@hugeicons/core-free-icons";
import { Streamdown } from "streamdown";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { WorkspaceDocument } from "./Sidebar";

/* ─── Types ─────────────────────────────────────────────────────────── */

type ChatPanelProps = {
  document: WorkspaceDocument;
  currentPage?: number;
  onCitationSelect?: (pageNumber: number) => void;
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
};

type ConversationMessage = {
  _id: Id<"messages">;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  createdAt: number;
};

type PendingExchange = {
  assistantContent: string;
  citations: Citation[];
  conversationId: Id<"conversations"> | null;
  isStreaming: boolean;
  submittedAt: number;
  userContent: string;
};

type ChatMessageItem = {
  citations?: Citation[];
  content: string;
  createdAt: number;
  key: string;
  pending?: boolean;
  role: "user" | "assistant";
  streaming?: boolean;
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

function matchesPendingAssistant(
  message: ConversationMessage,
  pendingExchange: PendingExchange,
) {
  const normalizedMessageContent =
    message.role === "assistant"
      ? normalizeAssistantContent(message.content)
      : message.content;

  return (
    message.role === "assistant" &&
    pendingExchange.assistantContent.length > 0 &&
    normalizedMessageContent === pendingExchange.assistantContent &&
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
  });
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
    setSelectedConversation("new");
  };

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
              onSelect={(id) =>
                setSelectedConversation(id as Id<"conversations">)
              }
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
  onSelect,
  selectedConversation,
}: {
  activeConversationId: Id<"conversations"> | null;
  conversations: {
    _id: Id<"conversations">;
    title: string;
    createdAt: number;
  }[];
  onSelect: (id: string) => void;
  selectedConversation: Id<"conversations"> | "new" | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
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
          className="z-50 w-[260px] rounded-xl border border-white/[0.08] bg-[#111111] p-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl"
        >
          <div className="mb-1 px-2.5 py-1.5 text-xs font-semibold tracking-[0.15em] text-stone-500 uppercase">
            Conversations
          </div>
          <div className="max-h-[240px] overflow-y-auto">
            {conversations.map((conv) => (
              <button
                key={conv._id}
                className={cn(
                  "focus-ring flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors",
                  selectedConversation !== "new" &&
                    conv._id === activeConversationId
                    ? "bg-amber-500/[0.08] text-amber-300"
                    : "text-stone-400 hover:bg-white/[0.05] hover:text-stone-200",
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
            ))}
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
  onCitationSelect?: (pageNumber: number) => void;
  onConversationCreated: (id: Id<"conversations">) => void;
}) {
  const messages = useQuery(
    api.chatData.getConversationMessages,
    conversationId ? { conversationId } : "skip",
  );
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingExchange, setPendingExchange] =
    useState<PendingExchange | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [isGenerating, messages, pendingExchange]);

  useEffect(() => {
    setPendingExchange((current) =>
      current && current.conversationId !== conversationId ? null : current,
    );
  }, [conversationId]);

  useEffect(() => {
    if (!messages || !pendingExchange) return;
    if (pendingExchange.isStreaming) return;

    const persistedUser = messages.some((message) =>
      matchesPendingUser(message, pendingExchange),
    );
    const persistedAssistant = messages.some((message) =>
      matchesPendingAssistant(message, pendingExchange),
    );

    if (persistedUser && persistedAssistant) {
      setPendingExchange(null);
    }
  }, [messages, pendingExchange]);

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
    const submittedAt = Date.now();
    setPendingExchange({
      assistantContent: "",
      citations: [],
      conversationId,
      isStreaming: true,
      submittedAt,
      userContent: question,
    });

    try {
      const { data: tokenData } = await (
        authClient as unknown as {
          convex: {
            token: (
              opts: object,
            ) => Promise<{ data: { token: string } | null }>;
          };
        }
      ).convex.token({ fetchOptions: { throw: false } });
      const token = tokenData?.token ?? null;
      const siteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
      if (!siteUrl)
        throw new Error("NEXT_PUBLIC_CONVEX_SITE_URL is not configured");

      const res = await fetch(`${siteUrl}/api/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          documentId: document._id,
          conversationId: conversationId ?? undefined,
          content: question,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Stream request failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

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
            setPendingExchange((cur) =>
              cur ? { ...cur, conversationId: newConvId } : null,
            );
            if (event.isNew) {
              onConversationCreated(newConvId);
            }
          } else if (event.type === "token") {
            const tok = event.token as string;
            setPendingExchange((cur) =>
              cur
                ? {
                    ...cur,
                    assistantContent: cur.assistantContent + tok,
                  }
                : null,
            );
          } else if (event.type === "done") {
            const content = event.content as string | undefined;
            const citations = event.citations as Citation[];
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
      setInput(question);
      setPendingExchange(null);
      setError(err instanceof Error ? err.message : "Failed to send message.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSuggestedPrompt = useCallback((text: string) => {
    setInput(text);
    textareaRef.current?.focus();
  }, []);

  const persistedMessages = messages ?? [];
  const displayMessages: ChatMessageItem[] = persistedMessages.map(
    (message) => ({
      citations: message.citations,
      content:
        message.role === "assistant"
          ? normalizeAssistantContent(message.content)
          : message.content,
      createdAt: message.createdAt,
      key: message._id,
      role: message.role,
    }),
  );

  if (pendingExchange) {
    const hasPendingUser = persistedMessages.some((message) =>
      matchesPendingUser(message, pendingExchange),
    );
    const hasPendingAssistant = persistedMessages.some((message) =>
      matchesPendingAssistant(message, pendingExchange),
    );

    if (!hasPendingUser) {
      displayMessages.push({
        content: pendingExchange.userContent,
        createdAt: pendingExchange.submittedAt,
        key: `pending-user-${pendingExchange.submittedAt}`,
        pending: true,
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
                onClick={() => handleSuggestedPrompt(p.build(currentPage))}
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
          {currentPage && (
            <div className="flex px-4 pt-3 pb-0">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/[0.08] px-2 py-0.5 text-xs font-medium text-amber-400/80">
                Page {currentPage}
              </span>
            </div>
          )}

          <div className="flex items-end gap-2 px-4 py-3">
            <textarea
              ref={textareaRef}
              className="max-h-[120px] min-h-[24px] flex-1 resize-none bg-transparent text-base leading-relaxed text-stone-200 outline-none placeholder:text-stone-600 disabled:cursor-not-allowed"
              disabled={isGenerating}
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
            <button
              aria-label="Send message"
              className={cn(
                "focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-150",
                input.trim() && !isGenerating
                  ? "bg-amber-500 text-[#070707] shadow-[0_2px_12px_rgba(245,158,11,0.25)] hover:bg-amber-400"
                  : "bg-white/[0.06] text-stone-600",
              )}
              disabled={!input.trim() || isGenerating}
              type="submit"
            >
              <HugeiconsIcon icon={ArrowUp01Icon} size={16} strokeWidth={2} />
            </button>
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
}: {
  message: ChatMessageItem;
  onCitationSelect?: (pageNumber: number) => void;
}) {
  const isUser = message.role === "user";

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

      <div className={cn("max-w-[88%] min-w-0", isUser && "max-w-[82%]")}>
        <div
          className={cn(
            "mb-1.5 flex items-center gap-2 px-0.5 text-xs text-stone-500",
            isUser ? "justify-end" : "justify-start",
          )}
        >
          <span className="font-medium">{isUser ? "You" : "Assistant"}</span>
          <span className="text-stone-600">
            {messageTimeFormatter.format(message.createdAt)}
          </span>
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
  onCitationSelect?: (pageNumber: number) => void;
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
                onCitationSelect?.(cite.pageNumber);
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
