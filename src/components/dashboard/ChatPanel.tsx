"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { WorkspaceDocument } from "./Sidebar";

type ChatCitation = {
  id: string;
  documentName: string;
  pageNumber: number;
  snippet: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: ChatCitation[];
};

type ChatPanelProps = {
  document: WorkspaceDocument;
};

function buildDemoAnswer(question: string, title: string) {
  return `This is a demo response for "${question}". Once retrieval is wired, this answer will reference relevant sections from "${title}" with page-level citations. Right now, this is a UI placeholder.`;
}

function buildDemoCitations(title: string): ChatCitation[] {
  return [
    {
      id: `cite-1-${Date.now()}`,
      documentName: title,
      pageNumber: 2,
      snippet: "Relevant content from the document will appear here once retrieval is connected.",
    },
  ];
}

export function ChatPanel({ document }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isGenerating]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const question = input.trim();
    if (!question || isGenerating) return;

    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-user`, role: "user", content: question },
    ]);
    setInput("");
    setIsGenerating(true);

    if (timerRef.current !== null) window.clearTimeout(timerRef.current);

    timerRef.current = window.setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-assistant`,
          role: "assistant",
          content: buildDemoAnswer(question, document.title),
          citations: buildDemoCitations(document.title),
        },
      ]);
      setIsGenerating(false);
    }, 700);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-stone-800/60 px-4 py-3">
        <ChatBubbleIcon />
        <div>
          <h3 className="text-sm font-medium text-stone-200">Chat</h3>
          <p className="text-xs text-stone-500">
            Ask questions about {document.title}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !isGenerating ? (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-sm text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-stone-800/50 text-stone-500">
                <ChatBubbleIcon />
              </div>
              <p className="text-sm font-medium text-stone-300">
                Ask anything about this document
              </p>
              <p className="mt-1.5 text-xs text-stone-500">
                Your questions will be answered using content from the selected PDF.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-3",
                  msg.role === "user"
                    ? "ml-auto bg-amber-500/10 text-stone-200"
                    : "bg-stone-800/40 text-stone-300",
                )}
              >
                <p className="text-sm leading-relaxed">{msg.content}</p>
                {msg.citations && msg.citations.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {msg.citations.map((cite) => (
                      <span
                        key={cite.id}
                        className="inline-flex items-center gap-1 rounded-md bg-stone-700/40 px-2 py-0.5 text-[11px] text-stone-400"
                      >
                        p. {cite.pageNumber}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {isGenerating && (
              <div className="max-w-[85%] rounded-2xl bg-stone-800/40 px-4 py-3">
                <div className="flex items-center gap-2">
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

      {/* Composer */}
      <div className="border-t border-stone-800/60 p-3">
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
                handleSubmit(e);
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
    </div>
  );
}

function ChatBubbleIcon() {
  return (
    <svg className="h-4 w-4 text-stone-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 10h10" />
      <path d="M7 14h7" />
      <path d="M5 19.5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-4 3.5Z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12 14-7-4 7 4 7Z" />
      <path d="M5 12h14" />
    </svg>
  );
}
