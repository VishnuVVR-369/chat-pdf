/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const OWNER = "https://issuer.example|user-owner";
const OUTSIDER = "https://issuer.example|user-outsider";
const EMBEDDING = Array.from({ length: 1536 }, () => 0.01);

function createTestBackend() {
  return convexTest(schema, modules);
}

type TestBackend = ReturnType<typeof createTestBackend>;

type SeedOptions = {
  ownerTokenIdentifier?: string;
  pageCount?: number;
  status?: "uploading" | "uploaded" | "processing" | "ready" | "failed";
};

async function seedDocument(t: TestBackend, options: SeedOptions = {}) {
  const ownerTokenIdentifier = options.ownerTokenIdentifier ?? OWNER;
  const pageCount = options.pageCount ?? 3;
  const status = options.status ?? "ready";

  return await t.run(async (ctx) => {
    return await ctx.db.insert("documents", {
      ownerTokenIdentifier,
      title: "Page-aware handbook",
      originalFilename: "handbook.pdf",
      documentSummary: "The handbook explains alpha, beta, and gamma.",
      summaryModel: "test-summary-model",
      storageSize: 1024,
      sha256: "test-sha",
      status,
      pageCount,
      uploadCompletedAt: Date.now(),
    });
  });
}

async function seedReadyDocumentWithEvidence(t: TestBackend) {
  const documentId = await seedDocument(t);

  await t.run(async (ctx) => {
    for (let pageNumber = 1; pageNumber <= 3; pageNumber += 1) {
      await ctx.db.insert("documentPages", {
        ownerTokenIdentifier: OWNER,
        ownerDocumentKey: `${OWNER}:${documentId}`,
        documentId,
        pageNumber,
        extractedText: `Page ${pageNumber} extracted text`,
        summary: `Summary for page ${pageNumber}`,
        extractionMethod: "ocr",
      });
    }

    const texts = [
      "Page one contains alpha evidence for the handbook.",
      "Page two contains beta-only evidence for scoped retrieval.",
      "Page three contains gamma evidence for the handbook.",
    ];
    for (let index = 0; index < texts.length; index += 1) {
      const pageNumber = index + 1;
      const text = texts[index]!;
      await ctx.db.insert("documentChunks", {
        ownerTokenIdentifier: OWNER,
        ownerDocumentKey: `${OWNER}:${documentId}`,
        documentId,
        chunkIndex: index,
        startPageNumber: pageNumber,
        endPageNumber: pageNumber,
        text,
        tokenCount: text.split(/\s+/).length,
        pageSpans: [{ pageNumber, startOffset: 0, endOffset: text.length }],
        embedding: EMBEDDING,
        embeddingModel: "test-embedding-model",
      });
    }
  });

  return documentId;
}

function parseSse(text: string) {
  return text
    .split("\n\n")
    .map((block) => block.trim())
    .filter((block) => block.startsWith("data: "))
    .map((block) => block.slice("data: ".length))
    .filter((data) => data !== "[DONE]")
    .map((data) => JSON.parse(data) as Record<string, unknown>);
}

function mockOpenAi(options: { chunkCitationQuote?: string } = {}) {
  const requestBodies: Array<Record<string, unknown>> = [];
  const fetchMock = vi.fn(
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<
        string,
        unknown
      >;
      requestBodies.push(body);

      if (Array.isArray(body.input)) {
        throw new Error("Unexpected batch embedding request");
      }
      if (typeof body.input === "string") {
        return Response.json({ data: [{ embedding: EMBEDDING }] });
      }

      const responseFormat = body.response_format as
        | { json_schema?: { name?: string } }
        | undefined;
      const schemaName = responseFormat?.json_schema?.name;
      const messages = body.messages;
      const systemPrompt = Array.isArray(messages)
        ? ((
            messages.find(
              (message) =>
                typeof message === "object" &&
                message !== null &&
                (message as { role?: unknown }).role === "system",
            ) as { content?: unknown } | undefined
          )?.content ?? "")
        : "";
      const pageTwoSourceId =
        typeof systemPrompt === "string"
          ? systemPrompt.match(
              /\[(S\d+)] page 2\nPage two contains beta-only evidence/,
            )?.[1]
          : undefined;
      const structured =
        schemaName === "chat_pdf_summary_answer"
          ? {
              answer: "Document-wide summary answer.",
              citations: [{ sourceId: "P2" }],
            }
          : {
              answer: "Evidence-grounded chunk answer.",
              citations: [
                {
                  sourceId: pageTwoSourceId ?? "S1",
                  quote:
                    options.chunkCitationQuote ??
                    "Page two contains beta-only evidence for scoped retrieval.",
                },
              ],
            };
      const stream = [
        `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(structured) } }] })}`,
        "data: [DONE]",
        "",
      ].join("\n\n");
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream" },
      });
    },
  );

  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, requestBodies };
}

function answerSystemPrompts(requestBodies: Array<Record<string, unknown>>) {
  return requestBodies.flatMap((body) => {
    const messages = body.messages;
    if (!Array.isArray(messages)) return [];
    const system = messages.find(
      (message) =>
        typeof message === "object" &&
        message !== null &&
        (message as { role?: unknown }).role === "system",
    ) as { content?: unknown } | undefined;
    return typeof system?.content === "string" ? [system.content] : [];
  });
}

describe("page-aware questioning", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.OPENAI_CHAT_MODEL = "gpt-4o-mini";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("uses a bounded indexed query and returns only chunks overlapping the page", async () => {
    const t = createTestBackend();
    const documentId = await seedDocument(t);

    await t.run(async (ctx) => {
      for (let index = 0; index < 30; index += 1) {
        const text = `Page two evidence chunk ${index}`;
        await ctx.db.insert("documentChunks", {
          ownerTokenIdentifier: OWNER,
          ownerDocumentKey: `${OWNER}:${documentId}`,
          documentId,
          chunkIndex: index,
          startPageNumber: 2,
          endPageNumber: 2,
          text,
          tokenCount: 5,
          pageSpans: [
            { pageNumber: 2, startOffset: 0, endOffset: text.length },
          ],
          embedding: EMBEDDING,
          embeddingModel: "test",
        });
      }

      const wrongPageText = "Page one evidence that must not leak";
      await ctx.db.insert("documentChunks", {
        ownerTokenIdentifier: OWNER,
        ownerDocumentKey: `${OWNER}:${documentId}`,
        documentId,
        chunkIndex: 100,
        startPageNumber: 1,
        endPageNumber: 1,
        text: wrongPageText,
        tokenCount: 7,
        pageSpans: [
          { pageNumber: 1, startOffset: 0, endOffset: wrongPageText.length },
        ],
        embedding: EMBEDDING,
        embeddingModel: "test",
      });

      const wrongOwnerText = "Another owner's page two evidence";
      await ctx.db.insert("documentChunks", {
        ownerTokenIdentifier: OUTSIDER,
        ownerDocumentKey: `${OUTSIDER}:${documentId}`,
        documentId,
        chunkIndex: 101,
        startPageNumber: 2,
        endPageNumber: 2,
        text: wrongOwnerText,
        tokenCount: 6,
        pageSpans: [
          { pageNumber: 2, startOffset: 0, endOffset: wrongOwnerText.length },
        ],
        embedding: EMBEDDING,
        embeddingModel: "test",
      });
    });

    const chunks = await t.query(internal.chatData.getDocumentChunksForPage, {
      documentId,
      ownerTokenIdentifier: OWNER,
      pageNumber: 2,
    });

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.length).toBeLessThanOrEqual(24);
    expect(
      chunks.every((chunk) => chunk.pageSpans.some((s) => s.pageNumber === 2)),
    ).toBe(true);
    expect(chunks.every((chunk) => !chunk.text.includes("must not leak"))).toBe(
      true,
    );
    expect(
      chunks.every((chunk) => !chunk.text.includes("Another owner's")),
    ).toBe(true);
  });

  test("rejects unauthenticated, unowned, unready, and out-of-range scoped requests", async () => {
    const t = createTestBackend();
    const readyDocumentId = await seedReadyDocumentWithEvidence(t);
    const processingDocumentId = await seedDocument(t, {
      status: "processing",
    });

    const request = (documentId: Id<"documents">, pageNumber: number) => ({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId,
        content: "Explain this page",
        pageNumber,
      }),
    });

    const unauthenticated = await t.fetch(
      "/api/chat/stream",
      request(readyDocumentId, 2),
    );
    expect(unauthenticated.status).toBe(401);

    const unowned = await t
      .withIdentity({ tokenIdentifier: OUTSIDER })
      .fetch("/api/chat/stream", request(readyDocumentId, 2));
    expect(unowned.status).toBe(404);

    const unready = await t
      .withIdentity({ tokenIdentifier: OWNER })
      .fetch("/api/chat/stream", request(processingDocumentId, 2));
    expect(unready.status).toBe(400);

    const outOfRange = await t
      .withIdentity({ tokenIdentifier: OWNER })
      .fetch("/api/chat/stream", request(readyDocumentId, 4));
    expect(outOfRange.status).toBe(400);
    await expect(outOfRange.json()).resolves.toEqual({
      error: "Invalid pageNumber",
    });
  });

  test("streams a page-scoped answer, persists its scope, shows it in history, and regenerates with the same page", async () => {
    const t = createTestBackend();
    const documentId = await seedReadyDocumentWithEvidence(t);
    const { requestBodies } = mockOpenAi();
    const authed = t.withIdentity({ tokenIdentifier: OWNER });

    const response = await authed.fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId,
        content: "Explain the beta evidence on this page",
        pageNumber: 2,
      }),
    });
    expect(response.status).toBe(200);
    const firstEvents = parseSse(await response.text());
    expect(firstEvents.map((event) => event.type)).toEqual(
      expect.arrayContaining(["meta", "token", "done"]),
    );
    const firstDone = firstEvents.find((event) => event.type === "done");
    expect(firstDone?.citations).toEqual([
      expect.objectContaining({ pageNumber: 2 }),
    ]);

    const meta = firstEvents.find((event) => event.type === "meta");
    const conversationId = meta?.conversationId as Id<"conversations">;
    const assistantMessageId = meta?.assistantMessageId as Id<"messages">;
    const firstMessages = await authed.query(
      api.chatData.getConversationMessages,
      { conversationId },
    );
    expect(firstMessages).toEqual([
      expect.objectContaining({
        role: "user",
        content: "Explain the beta evidence on this page",
        pageNumber: 2,
      }),
      expect.objectContaining({
        role: "assistant",
        status: "complete",
      }),
    ]);

    const firstPrompt = answerSystemPrompts(requestBodies).at(-1)!;
    expect(firstPrompt).toContain("Page two contains beta-only evidence");
    expect(firstPrompt).not.toContain("Page one contains alpha evidence");
    expect(firstPrompt).not.toContain("Page three contains gamma evidence");

    const regenerateResponse = await authed.fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId,
        conversationId,
        regenerate: true,
        expectedAssistantMessageId: assistantMessageId,
      }),
    });
    expect(regenerateResponse.status).toBe(200);
    const regenerateEvents = parseSse(await regenerateResponse.text());
    expect(regenerateEvents.some((event) => event.type === "done")).toBe(true);

    const regeneratedPrompt = answerSystemPrompts(requestBodies).at(-1)!;
    expect(regeneratedPrompt).toContain(
      "Page two contains beta-only evidence for scoped retrieval.",
    );
    expect(regeneratedPrompt).not.toContain("Page one contains alpha evidence");
    expect(regeneratedPrompt).not.toContain(
      "Page three contains gamma evidence",
    );

    const regeneratedMessages = await authed.query(
      api.chatData.getConversationMessages,
      { conversationId },
    );
    expect(
      regeneratedMessages.filter((message) => message.role === "user"),
    ).toEqual([expect.objectContaining({ pageNumber: 2 })]);
  });

  test("keeps document-wide summaries as the default when no page scope is sent", async () => {
    const t = createTestBackend();
    const documentId = await seedReadyDocumentWithEvidence(t);
    const { requestBodies } = mockOpenAi();
    const authed = t.withIdentity({ tokenIdentifier: OWNER });

    const response = await authed.fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId,
        content: "Summarize this document",
      }),
    });
    expect(response.status).toBe(200);
    const events = parseSse(await response.text());
    const done = events.find((event) => event.type === "done");
    expect(done?.content).toBe("Document-wide summary answer.");
    expect(done?.citations).toEqual([
      expect.objectContaining({ pageNumber: 2 }),
    ]);

    const prompt = answerSystemPrompts(requestBodies).at(-1)!;
    expect(prompt).toContain("The handbook explains alpha, beta, and gamma.");
    expect(prompt).toContain("Summary for page 1");
    expect(prompt).toContain("Summary for page 3");

    const meta = events.find((event) => event.type === "meta");
    const messages = await authed.query(api.chatData.getConversationMessages, {
      conversationId: meta?.conversationId as Id<"conversations">,
    });
    expect(messages[0]).toMatchObject({
      role: "user",
      content: "Summarize this document",
    });
    expect(messages[0]).not.toHaveProperty("pageNumber");
  });

  test("keeps hybrid retrieval and chunk citations for unscoped precise questions", async () => {
    const t = createTestBackend();
    const documentId = await seedReadyDocumentWithEvidence(t);
    const { requestBodies } = mockOpenAi();
    const authed = t.withIdentity({ tokenIdentifier: OWNER });

    const response = await authed.fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId,
        content: "Where is the beta-only evidence?",
      }),
    });
    expect(response.status).toBe(200);
    const events = parseSse(await response.text());
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["meta", "token", "done"]),
    );
    const done = events.find((event) => event.type === "done");
    expect(done?.citations).toEqual([
      expect.objectContaining({ pageNumber: 2 }),
    ]);
    expect(requestBodies.some((body) => typeof body.input === "string")).toBe(
      true,
    );
    const prompt = answerSystemPrompts(requestBodies).at(-1)!;
    expect(prompt).toContain(
      "Document background (context only, never cite this):",
    );
    expect(prompt).toContain("The handbook explains alpha, beta, and gamma.");
    expect(prompt).toContain(
      "Page two contains beta-only evidence for scoped retrieval.",
    );
  });

  test("rejects a summary-only quote from chunk-mode HTTP stream citations", async () => {
    const t = createTestBackend();
    const documentId = await seedReadyDocumentWithEvidence(t);
    const summaryOnlyQuote = "The handbook explains alpha, beta, and gamma.";
    const { requestBodies } = mockOpenAi({
      chunkCitationQuote: summaryOnlyQuote,
    });
    const authed = t.withIdentity({ tokenIdentifier: OWNER });

    const response = await authed.fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId,
        content: "Where is the beta-only evidence?",
      }),
    });

    expect(response.status).toBe(200);
    const events = parseSse(await response.text());
    const done = events.find((event) => event.type === "done");
    expect(done).toMatchObject({
      type: "done",
      content: "Evidence-grounded chunk answer.",
      citations: [],
    });

    const meta = events.find((event) => event.type === "meta");
    const messages = await authed.query(api.chatData.getConversationMessages, {
      conversationId: meta?.conversationId as Id<"conversations">,
    });
    expect(messages.at(-1)).toMatchObject({
      role: "assistant",
      content: "Evidence-grounded chunk answer.",
      status: "complete",
      citations: [],
    });

    const prompt = answerSystemPrompts(requestBodies).at(-1)!;
    expect(prompt).toContain(
      `Document background (context only, never cite this):\n${summaryOnlyQuote}`,
    );
    expect(prompt).toContain(
      "Sources:\n[S1] page 1\nPage one contains alpha evidence for the handbook.",
    );
  });
});
