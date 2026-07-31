// @vitest-environment jsdom

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";

const mockState = vi.hoisted(() => ({
  conversations: [
    {
      _id: "conversation-page-scope" as Id<"conversations">,
      title: "Page-aware Q&A",
      createdAt: Date.now(),
    },
  ],
  messages: [
    {
      _id: "message-document" as Id<"messages">,
      role: "user" as const,
      content: "Summarize this document",
      status: "complete" as const,
      createdAt: Date.now() - 120_000,
    },
    {
      _id: "message-document-answer" as Id<"messages">,
      role: "assistant" as const,
      content: "This handbook covers alpha, beta, and gamma.",
      status: "complete" as const,
      createdAt: Date.now() - 110_000,
    },
    {
      _id: "message-page" as Id<"messages">,
      role: "user" as const,
      content: "Explain the beta evidence on this page",
      pageNumber: 2,
      status: "complete" as const,
      createdAt: Date.now() - 60_000,
    },
    {
      _id: "message-page-answer" as Id<"messages">,
      role: "assistant" as const,
      content: "Page two contains the beta-only evidence.",
      status: "complete" as const,
      citations: [
        {
          pageNumber: 2,
          snippet: "Page two contains beta-only evidence for scoped retrieval.",
        },
      ],
      createdAt: Date.now() - 50_000,
    },
  ],
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    getToken: vi.fn(async () => "test-convex-token"),
    sessionClaims: { aud: "convex" },
  }),
}));

vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(),
  useQuery: (_reference: unknown, args: Record<string, unknown> | "skip") => {
    if (args === "skip") return undefined;
    return "conversationId" in args
      ? mockState.messages
      : mockState.conversations;
  },
}));

vi.mock("motion/react", async () => {
  const React = await import("react");
  const ignoredProps = new Set(["animate", "exit", "initial", "transition"]);
  const motion = new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        React.forwardRef<HTMLElement, Record<string, unknown>>(
          ({ children, ...props }, ref) => {
            const safeProps = Object.fromEntries(
              Object.entries(props).filter(([name]) => !ignoredProps.has(name)),
            );
            return React.createElement(tag, { ...safeProps, ref }, children);
          },
        ),
    },
  );

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion,
  };
});

vi.mock("streamdown", async () => {
  const React = await import("react");
  return {
    Streamdown: ({
      children,
      className,
    }: {
      children: React.ReactNode;
      className?: string;
    }) => React.createElement("div", { className }, children),
  };
});

vi.mock("@/lib/analytics", () => ({
  captureEvent: vi.fn(),
  captureException: vi.fn(),
}));

import { ChatPanel } from "./ChatPanel";

describe("ChatPanel page scope UI", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL = "https://convex.example";
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("sends the visible current page only after the user selects page scope", async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBodies.push(
        JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      );
      const stream = [
        `data: ${JSON.stringify({
          type: "meta",
          conversationId: "conversation-page-scope",
          assistantMessageId: "assistant-new",
          isNew: false,
        })}`,
        `data: ${JSON.stringify({ type: "token", token: "Scoped answer" })}`,
        `data: ${JSON.stringify({
          type: "done",
          content: "Scoped answer",
          citations: [],
        })}`,
        "",
      ].join("\n\n");
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <div className="h-[820px] w-[520px]">
        <ChatPanel
          currentPage={2}
          document={{
            _id: "document-page-scope" as Id<"documents">,
            _creationTime: Date.now(),
            title: "Page-aware handbook",
            originalFilename: "handbook.pdf",
            status: "ready",
            pageCount: 3,
            storageSize: 1024,
            uploadCompletedAt: Date.now(),
            fileUrl: null,
          }}
        />
      </div>,
    );

    const scopeGroup = screen.getByRole("group", { name: "Question scope" });
    const documentScope = within(scopeGroup).getByRole("button", {
      name: "Document",
    });
    const pageScope = within(scopeGroup).getByRole("button", { name: "Page 2" });
    expect(documentScope.getAttribute("aria-pressed")).toBe("true");
    expect(pageScope.getAttribute("aria-pressed")).toBe("false");

    await user.click(pageScope);
    expect(pageScope.getAttribute("aria-pressed")).toBe("true");
    await user.type(
      screen.getByPlaceholderText("Ask about this document…"),
      "What is unique here?",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(requestBodies[0]).toMatchObject({
      documentId: "document-page-scope",
      conversationId: "conversation-page-scope",
      content: "What is unique here?",
      pageNumber: 2,
    });
  });

  test("renders document scope by default, explicit current-page scope, and persisted page scope in history", async () => {
    const markup = renderToStaticMarkup(
      <div className="h-[820px] w-[520px]">
        <ChatPanel
          currentPage={2}
          document={{
            _id: "document-page-scope" as Id<"documents">,
            _creationTime: Date.now(),
            title: "Page-aware handbook",
            originalFilename: "handbook.pdf",
            status: "ready",
            pageCount: 3,
            storageSize: 1024,
            uploadCompletedAt: Date.now(),
            fileUrl: null,
          }}
        />
      </div>,
    );

    expect(markup).toContain('aria-label="Question scope"');
    expect(markup).toMatch(/<button aria-pressed="true"[^>]*>Document<\/button>/);
    expect(markup).toMatch(/<button aria-pressed="false"[^>]*>Page 2<\/button>/);
    expect(markup).toContain("Explain the beta evidence on this page");
    expect(markup.match(/Page 2/g)).toHaveLength(2);

    const evidenceDir = process.env.NO_MISTAKES_EVIDENCE_DIR;
    if (evidenceDir) {
      await mkdir(evidenceDir, { recursive: true });
      const css = await postcss([tailwindcss()]).process(
        '@import "tailwindcss";\n@source "./src/components/dashboard/ChatPanel.tsx";',
        { from: path.join(process.cwd(), "chat-panel-evidence.css") },
      );
      const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ChatPDF page-aware questioning evidence</title>
    <style>${css.css}
      html, body { margin: 0; min-height: 100%; background: #050505; }
      body { display: grid; place-items: center; padding: 32px; color-scheme: dark; }
      .surface-raised { background: #080808; border: 1px solid rgba(255,255,255,.07); border-radius: 16px; }
      .chat-scroll-area { scrollbar-color: rgba(255,255,255,.12) transparent; }
    </style>
  </head>
  <body>${markup}</body>
</html>`;
      await writeFile(
        path.join(evidenceDir, "chat-panel-page-scope.html"),
        html,
        "utf8",
      );
    }
  });
});
