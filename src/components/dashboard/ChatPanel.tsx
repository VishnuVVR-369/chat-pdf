"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { Popover } from "radix-ui";
import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
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
  assistant?: Pick<ConversationMessage, "content" | "citations">;
  conversationId: Id<"conversations"> | null;
  submittedAt: number;
  user: string;
  streamingContent?: string;
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

const SUGGESTED_QUESTIONS = [
  { icon: "summary", text: "Summarize this document" },
  { icon: "key", text: "What are the key findings?" },
  { icon: "page", text: "Explain page" },
];

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
    <div className="dark flex h-full min-h-0 flex-col overflow-hidden bg-[#0a0a0a]">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="relative flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3.5">
        {/* Left: title area */}
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400/80">
            <SparkleIcon />
          </div>
          <div className="min-w-0">
            <h3 className="text-[13px] font-semibold tracking-tight text-stone-100">
              {activeTitle ? activeTitle.slice(0, 36) : "New Chat"}
            </h3>
            <p className="truncate text-[11px] text-stone-500">
              {document.title}
            </p>
          </div>
        </div>

        {/* Right: actions */}
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
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-[12px] font-medium text-stone-300 transition-all hover:border-amber-400/20 hover:bg-amber-500/[0.07] hover:text-amber-300"
            onClick={handleNewConversation}
            title="New conversation"
            type="button"
          >
            <PlusIcon />
            <span>New</span>
          </button>
        </div>
      </div>

      {/* ── Chat body ──────────────────────────────────────────── */}
      <ChatConversation
        conversationId={activeConversationId}
        currentPage={currentPage}
        document={document}
        onCitationSelect={onCitationSelect}
        onConversationCreated={setSelectedConversation}
      />
    </div>
  );
}

/* ─── Conversation Switcher (Radix Popover) ─────────────────────── */

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
            "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium transition-all",
            open
              ? "border-amber-400/25 bg-amber-500/[0.08] text-amber-300"
              : "border-white/[0.08] bg-white/[0.04] text-stone-400 hover:border-white/[0.12] hover:text-stone-300",
          )}
          type="button"
        >
          <HistoryIcon />
          <span className="max-w-[100px] truncate">History</span>
          <ChevronDownIcon />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 w-[260px] rounded-xl border border-white/[0.08] bg-[#111111] p-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl"
        >
          <div className="mb-1 px-2.5 py-1.5 text-[10px] font-semibold tracking-[0.15em] text-stone-500 uppercase">
            Conversations
          </div>
          <div className="max-h-[240px] overflow-y-auto">
            {conversations.map((conv) => (
              <button
                key={conv._id}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] transition-colors",
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

/* ─── Chat conversation (messages + composer) ───────────────────── */

function ChatConversation({
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
    // While still streaming don't clear — wait for the "done" SSE event first
    if (pendingExchange.streamingContent !== undefined) return;

    const persistedUser = messages.some(
      (message) =>
        message.role === "user" &&
        message.content === pendingExchange.user &&
        message.createdAt >= pendingExchange.submittedAt - 5_000,
    );
    const persistedAssistant =
      !pendingExchange.assistant ||
      messages.some(
        (message) =>
          message.role === "assistant" &&
          message.content === pendingExchange.assistant?.content &&
          message.createdAt >= pendingExchange.submittedAt - 5_000,
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
      conversationId,
      submittedAt,
      user: question,
      streamingContent: "",
    });

    try {
      // Get the Convex JWT from the better-auth token endpoint
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
                    streamingContent: (cur.streamingContent ?? "") + tok,
                  }
                : null,
            );
          } else if (event.type === "done") {
            const citations = event.citations as Citation[];
            setPendingExchange((cur) => {
              if (!cur) return null;
              const content = cur.streamingContent ?? "";
              return {
                ...cur,
                streamingContent: undefined,
                assistant: { content, citations },
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

  const handleSuggestedQuestion = useCallback(
    (text: string) => {
      const question =
        text === "Explain page" && currentPage
          ? `Explain page ${currentPage}`
          : text;
      setInput(question);
      textareaRef.current?.focus();
    },
    [currentPage],
  );

  const persistedMessages = messages ?? [];
  const displayMessages: ChatMessageItem[] = persistedMessages.map(
    (message) => ({
      citations: message.citations,
      content: message.content,
      createdAt: message.createdAt,
      key: message._id,
      role: message.role,
    }),
  );

  if (pendingExchange) {
    const hasPendingUser = persistedMessages.some(
      (message) =>
        message.role === "user" &&
        message.content === pendingExchange.user &&
        message.createdAt >= pendingExchange.submittedAt - 5_000,
    );

    if (!hasPendingUser) {
      displayMessages.push({
        content: pendingExchange.user,
        createdAt: pendingExchange.submittedAt,
        key: `pending-user-${pendingExchange.submittedAt}`,
        pending: true,
        role: "user",
      });
    }

    if (pendingExchange.streamingContent !== undefined) {
      // Live streaming bubble — shown while tokens are arriving
      displayMessages.push({
        content: pendingExchange.streamingContent,
        createdAt: pendingExchange.submittedAt + 1,
        key: `pending-stream-${pendingExchange.submittedAt}`,
        pending: true,
        role: "assistant",
        streaming: true,
      });
    } else if (pendingExchange.assistant) {
      const hasPendingAssistant = persistedMessages.some(
        (message) =>
          message.role === "assistant" &&
          message.content === pendingExchange.assistant?.content &&
          message.createdAt >= pendingExchange.submittedAt - 5_000,
      );

      if (!hasPendingAssistant) {
        displayMessages.push({
          citations: pendingExchange.assistant.citations,
          content: pendingExchange.assistant.content,
          createdAt: pendingExchange.submittedAt + 1,
          key: `pending-assistant-${pendingExchange.submittedAt}`,
          pending: true,
          role: "assistant",
        });
      }
    }
  }

  return (
    <>
      {/* ── Messages area ──────────────────────────────────────── */}
      <div className="chat-scroll-area min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {displayMessages.length === 0 && !isGenerating ? (
          <EmptyState
            currentPage={currentPage}
            onSuggestionClick={handleSuggestedQuestion}
          />
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

            {/* Typing indicator — only shown before first token arrives */}
            <AnimatePresence>
              {isGenerating &&
                !pendingExchange?.assistant &&
                pendingExchange?.streamingContent === "" && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.25 }}
                    className="flex items-start gap-3"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400/70">
                      <SparkleIcon />
                    </div>
                    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="chat-typing-dot inline-block h-1.5 w-1.5 rounded-full bg-amber-400/80" />
                        <span className="chat-typing-dot inline-block h-1.5 w-1.5 rounded-full bg-amber-400/80 [animation-delay:150ms]" />
                        <span className="chat-typing-dot inline-block h-1.5 w-1.5 rounded-full bg-amber-400/80 [animation-delay:300ms]" />
                        <span className="ml-2 text-[13px] text-stone-500">
                          Thinking...
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
              <p className="text-[12px] text-red-300/90">{error}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Composer ─────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-white/[0.06] bg-[#080808] px-4 pt-3 pb-4">
        <form
          className={cn(
            "relative rounded-2xl border transition-all duration-300",
            isFocused
              ? "border-amber-400/20 bg-white/[0.04] shadow-[0_0_20px_rgba(245,158,11,0.06)]"
              : "border-white/[0.07] bg-white/[0.025]",
          )}
          onSubmit={handleSubmit}
        >
          {/* Page context chip */}
          {currentPage && (
            <div className="flex px-4 pt-3 pb-0">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/[0.08] px-2 py-0.5 text-[11px] font-medium text-amber-400/80">
                <PageIcon />
                Page {currentPage}
              </span>
            </div>
          )}

          <div className="flex items-end gap-2 px-4 py-3">
            <textarea
              ref={textareaRef}
              className="max-h-[120px] min-h-[24px] flex-1 resize-none bg-transparent text-[14px] leading-relaxed text-stone-200 outline-none placeholder:text-stone-600"
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
              placeholder="Ask about this document..."
              rows={1}
              value={input}
            />
            <motion.button
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-200",
                input.trim() && !isGenerating
                  ? "bg-amber-500 text-[#070707] shadow-[0_2px_12px_rgba(245,158,11,0.25)]"
                  : "bg-white/[0.06] text-stone-600",
              )}
              disabled={!input.trim() || isGenerating}
              type="submit"
              whileHover={input.trim() && !isGenerating ? { scale: 1.05 } : {}}
              whileTap={input.trim() && !isGenerating ? { scale: 0.95 } : {}}
            >
              <ArrowUpIcon />
            </motion.button>
          </div>

          {/* Subtle hint */}
          <div className="flex items-center justify-between px-4 pt-0 pb-2.5">
            <span className="text-[11px] text-stone-600/60">
              <kbd className="rounded border border-white/[0.06] bg-white/[0.04] px-1 py-0.5 font-mono text-[10px]">
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

function EmptyState({
  currentPage,
  onSuggestionClick,
}: {
  currentPage?: number;
  onSuggestionClick: (text: string) => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-sm text-center"
      >
        {/* Glow + icon */}
        <div className="relative mx-auto mb-6 h-16 w-16">
          <div className="absolute inset-0 rounded-full bg-amber-500/[0.08] blur-xl" />
          <div className="relative flex h-full w-full items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03]">
            <DocumentChatIcon />
          </div>
        </div>

        <h3 className="text-[16px] font-semibold tracking-tight text-stone-100">
          What would you like to know?
        </h3>
        <p className="mx-auto mt-2 max-w-[260px] text-[13px] leading-relaxed text-stone-500">
          Ask questions about this document. Answers include citations with page
          references.
        </p>

        {/* Suggested questions */}
        <div className="mt-6 space-y-2">
          {SUGGESTED_QUESTIONS.map((q) => (
            <motion.button
              key={q.text}
              className="group flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-left transition-all hover:border-amber-400/15 hover:bg-amber-500/[0.04]"
              onClick={() => onSuggestionClick(q.text)}
              type="button"
              whileHover={{ x: 2 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-stone-500 transition-colors group-hover:bg-amber-500/[0.08] group-hover:text-amber-400">
                {q.icon === "summary" && <SummaryIcon />}
                {q.icon === "key" && <KeyIcon />}
                {q.icon === "page" && <PageIcon />}
              </span>
              <span className="text-[13px] text-stone-400 transition-colors group-hover:text-stone-200">
                {q.text === "Explain page"
                  ? `Explain page ${currentPage ?? 1}`
                  : q.text}
              </span>
              <span className="ml-auto text-stone-700 transition-colors group-hover:text-stone-500">
                <ArrowRightIcon />
              </span>
            </motion.button>
          ))}
        </div>
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
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}
    >
      {/* Avatar */}
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400/70">
          <SparkleIcon />
        </div>
      )}

      <div className={cn("max-w-[88%] min-w-0", isUser && "max-w-[82%]")}>
        {/* Meta row */}
        <div
          className={cn(
            "mb-1.5 flex items-center gap-2 px-0.5 text-[11px] text-stone-500",
            isUser ? "justify-end" : "justify-start",
          )}
        >
          <span className="font-medium">{isUser ? "You" : "Assistant"}</span>
          <span className="text-stone-600">
            {messageTimeFormatter.format(message.createdAt)}
          </span>
          {message.pending && (
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-400/60">
              <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-amber-400/60" />
              {isUser ? "Sending" : "Syncing"}
            </span>
          )}
        </div>

        {/* Bubble */}
        <div
          className={cn(
            "rounded-2xl px-4 py-3",
            isUser
              ? "bg-amber-500/[0.1] text-stone-100"
              : "border border-white/[0.06] bg-white/[0.03] text-stone-200",
          )}
        >
          {isUser ? (
            <p className="text-[14px] leading-7 whitespace-pre-wrap">
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

        {/* Citations */}
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
      <span className="mr-0.5 self-center text-[10px] font-medium tracking-wider text-stone-600 uppercase">
        Sources
      </span>
      {citations.map((cite, index) => {
        const isExpanded = expandedIndex === index;
        return (
          <div key={`${cite.pageNumber}-${index}`} className="inline-flex">
            <button
              className={cn(
                "inline-flex items-center gap-1 rounded-lg border text-[11px] font-medium transition-all duration-200",
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
                <ChevronDownSmallIcon />
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
                    <p className="line-clamp-3 text-[11px] leading-relaxed text-stone-400">
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

/* ─── Icons ─────────────────────────────────────────────────────── */

function SparkleIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0a.5.5 0 0 1 .473.338L9.82 4.18l3.842 1.347a.5.5 0 0 1 0 .946L9.82 7.82 8.473 11.662a.5.5 0 0 1-.946 0L6.18 7.82 2.338 6.473a.5.5 0 0 1 0-.946L6.18 4.18 7.527.338A.5.5 0 0 1 8 0Zm3.5 9a.5.5 0 0 1 .463.311l.585 1.441 1.441.585a.5.5 0 0 1 0 .926l-1.441.585-.585 1.441a.5.5 0 0 1-.926 0l-.585-1.441-1.441-.585a.5.5 0 0 1 0-.926l1.441-.585.585-1.441A.5.5 0 0 1 11.5 9Z" />
    </svg>
  );
}

function DocumentChatIcon() {
  return (
    <svg
      className="h-7 w-7 text-amber-400/60"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h3" />
      <path d="M8 17h6" />
      <path d="M8 9h1" />
    </svg>
  );
}

function SummaryIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M3 4h10M3 8h7M3 12h9" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M8 2l1.5 3.5L13 7l-3.5 1.5L8 12 6.5 8.5 3 7l3.5-1.5Z" />
    </svg>
  );
}

function PageIcon() {
  return (
    <svg
      className="h-3 w-3"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4Z" />
      <path d="M10 1v3h3" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 12V4M4 7l4-3 4 3" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      className="h-3 w-3"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      className="h-3 w-3"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg
      className="h-3 w-3"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 3v4h4" />
      <path d="M3.5 10a5.5 5.5 0 1 0 1-6.5L1 7" />
      <path d="M8 5v3.5l2 1" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      className="h-3 w-3 opacity-50"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

function ChevronDownSmallIcon() {
  return (
    <svg
      className="h-2.5 w-2.5"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}
