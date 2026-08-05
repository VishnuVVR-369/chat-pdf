import type { OCRPageObject } from "@mistralai/mistralai/models/components";
import { describe, expect, test } from "vitest";
import type { Id } from "./_generated/dataModel";
import {
  buildValidatedChunkCitations,
  resolveCitationPageQuote,
  type RankedChunk,
} from "./chatHelpers";
import { buildDocumentChunks } from "./documentChunking";

type OcrBlock = NonNullable<OCRPageObject["blocks"]>[number];
type OcrTable = NonNullable<OCRPageObject["tables"]>[number];

function block(type: OcrBlock["type"], content: string): OcrBlock {
  return {
    type,
    content,
    topLeftX: 0,
    topLeftY: 0,
    bottomRightX: 100,
    bottomRightY: 100,
    ...(type === "image" ? { imageId: "image-1" } : {}),
  } as OcrBlock;
}

function page(
  index: number,
  markdown: string,
  blocks?: OCRPageObject["blocks"],
  tables?: OCRPageObject["tables"],
): OCRPageObject {
  return {
    index,
    markdown,
    images: [],
    dimensions: null,
    ...(blocks === undefined ? {} : { blocks }),
    ...(tables === undefined ? {} : { tables }),
  };
}

function table(id: string, content: string): OcrTable {
  return { id, content, format: "markdown" };
}

describe("buildDocumentChunks", () => {
  test("preserves OCR block structure and keeps a Markdown table intact", () => {
    const table = [
      "| Metric | Value |",
      "| --- | ---: |",
      "| Revenue | $42 |",
      "| Margin | 18% |",
    ].join("\n");
    const chunks = buildDocumentChunks(
      [
        page(0, "unused fallback", [
          block("title", "# Quarterly results"),
          block("text", "Revenue grew year over year.\nMargins stayed stable."),
          block("table", table),
          block("list", "- First observation\n- Second observation"),
        ]),
      ],
      1,
      { targetWords: 100, overlapWords: 10 },
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toBe(
      [
        "# Quarterly results",
        "Revenue grew year over year.\nMargins stayed stable.",
        table,
        "- First observation\n- Second observation",
      ].join("\n\n"),
    );
    expect(chunks[0]?.text).toContain("| --- | ---: |\n| Revenue | $42 |");
  });

  test("emits an oversized table as its own unsplit chunk", () => {
    const table = [
      "| Header A | Header B |",
      "| --- | --- |",
      "| row one | value one |",
      "| row two | value two |",
    ].join("\n");
    const chunks = buildDocumentChunks(
      [
        page(0, "unused", [
          block("text", "Short introduction."),
          block("table", table),
          block("text", "Short conclusion."),
        ]),
      ],
      1,
      { targetWords: 5, overlapWords: 2 },
    );

    expect(chunks.map((chunk) => chunk.text)).toEqual([
      "Short introduction.",
      table,
      "Short conclusion.",
    ]);
  });

  test("uses Markdown-aware fallback when OCR blocks are absent", () => {
    const table = [
      "| Name | Score |",
      "| :--- | ---: |",
      "| Ada | 98 |",
      "| Linus | 95 |",
    ].join("\n");
    const markdown = [
      "# Evaluation",
      "",
      "The scores are listed below.",
      "",
      table,
      "",
      "- Checked manually",
      "- Approved",
    ].join("\n");
    const chunks = buildDocumentChunks([page(0, markdown)], 1, {
      targetWords: 100,
      overlapWords: 10,
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toContain(table);
    expect(chunks[0]?.text).toContain("- Checked manually\n- Approved");
    expect(chunks[0]?.text).not.toContain("| Name | Score | | :--- | ---: |");
  });

  test("resolves separately extracted table placeholders in fallback Markdown", () => {
    const tableContent = [
      "| Metric | Value |",
      "| - | :-: |",
      "| Revenue | $42 |",
    ].join("\n");
    const chunks = buildDocumentChunks(
      [
        page(
          0,
          [
            "Before the table.",
            "",
            "[tbl-0.md](tbl-0.md)",
            "",
            "After it.",
          ].join("\n"),
          undefined,
          [table("tbl-0.md", tableContent)],
        ),
      ],
      1,
      { targetWords: 100, overlapWords: 10 },
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toBe(
      ["Before the table.", tableContent, "After it."].join("\n\n"),
    );
    expect(chunks[0]?.text).not.toContain("[tbl-0.md](tbl-0.md)");
  });

  test("keeps single-column tables with short aligned delimiters intact", () => {
    const singleColumnTable = [
      "| Status |",
      "| :-: |",
      "| waiting for customer confirmation |",
      "| ready for final approval |",
    ].join("\n");
    const chunks = buildDocumentChunks([page(0, singleColumnTable)], 1, {
      targetWords: 3,
      overlapWords: 1,
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toBe(singleColumnTable);
  });

  test("keeps provider and fallback non-prose blocks atomic", () => {
    const code = "const total = values.reduce((sum, value) => sum + value, 0);";
    const equation = "E = m c squared with additional explanatory symbols";
    const providerChunks = buildDocumentChunks(
      [page(0, "unused", [block("code", code), block("equation", equation)])],
      1,
      { targetWords: 3, overlapWords: 1 },
    );
    const fencedCode = [
      "```ts",
      "const first = one two three four;",
      "const second = five six seven eight;",
      "```",
    ].join("\n");
    const displayEquation = ["$$", "a b c d e f g h", "$$"].join("\n");
    const fallbackChunks = buildDocumentChunks(
      [page(0, [fencedCode, "", displayEquation].join("\n"))],
      1,
      { targetWords: 3, overlapWords: 1 },
    );

    expect(providerChunks.map((chunk) => chunk.text)).toEqual([code, equation]);
    expect(fallbackChunks.map((chunk) => chunk.text)).toEqual([
      fencedCode,
      displayEquation,
    ]);
  });

  test("splits oversized prose at sentences and overlaps whole sentences", () => {
    const chunks = buildDocumentChunks(
      [
        page(0, "unused", [
          block("text", "One two three. Four five six. Seven eight nine."),
        ]),
      ],
      1,
      { targetWords: 6, overlapWords: 3 },
    );

    expect(chunks.map((chunk) => chunk.text)).toEqual([
      "One two three.\n\n Four five six.",
      " Four five six.\n\n Seven eight nine.",
    ]);
  });

  test("falls back to a hard word cut for one oversized sentence", () => {
    const chunks = buildDocumentChunks(
      [page(0, "one two three four five six seven")],
      1,
      { targetWords: 3, overlapWords: 0 },
    );

    expect(chunks.map((chunk) => chunk.text)).toEqual([
      "one two three",
      "four five six",
      "seven",
    ]);
  });

  test("retains overlap while advancing past single-unit prose chunks", () => {
    const chunks = buildDocumentChunks(
      [page(0, "one two three four five six seven eight nine")],
      1,
      { targetWords: 4, overlapWords: 2 },
    );

    expect(chunks.map((chunk) => chunk.text)).toEqual([
      "one two three four",
      "three four\n\nfive six seven eight",
      "seven eight\n\nnine",
    ]);
  });

  test("tracks exact page spans and resolves a quote crossing a page boundary", () => {
    const chunks = buildDocumentChunks(
      [
        page(0, "unused", [block("text", "Alpha ending.")]),
        page(1, "unused", [block("text", "Beta beginning.")]),
      ],
      2,
      { targetWords: 100, overlapWords: 10 },
    );
    const chunk = chunks[0]!;

    expect(chunk.text).toBe("Alpha ending.\n\nBeta beginning.");
    expect(chunk.pageSpans).toEqual([
      { pageNumber: 1, startOffset: 0, endOffset: "Alpha ending.".length },
      {
        pageNumber: 2,
        startOffset: "Alpha ending.\n\n".length,
        endOffset: chunk.text.length,
      },
    ]);
    for (const span of chunk.pageSpans) {
      expect(
        chunk.text.slice(span.startOffset, span.endOffset).trim(),
      ).not.toBe("");
    }

    const quote = "ending.\n\nBeta";
    const quoteStartOffset = chunk.text.indexOf(quote);
    const rankedChunk: RankedChunk = {
      ...chunk,
      _id: "chunk-id" as Id<"documentChunks">,
      hybridScore: 1,
      sourceId: "S1",
    };
    expect(
      resolveCitationPageQuote(
        rankedChunk,
        quoteStartOffset,
        quoteStartOffset + quote.length,
      ),
    ).toMatchObject({
      pageNumber: 1,
      pageQuote: "ending.",
    });
    expect(
      buildValidatedChunkCitations(
        [{ sourceId: "S1", quote: "ending. Beta" }],
        [rankedChunk],
      ),
    ).toEqual([
      expect.objectContaining({
        pageNumber: 1,
        pageQuote: "ending.",
        quote: "ending. Beta",
      }),
    ]);
  });

  test("keeps the existing placeholder for empty OCR output", () => {
    const chunks = buildDocumentChunks([page(0, "", [])], 3);

    expect(chunks).toEqual([
      {
        chunkIndex: 0,
        startPageNumber: 1,
        endPageNumber: 3,
        text: "[No extractable text found in this PDF.]",
        tokenCount: 7,
        pageSpans: [
          {
            pageNumber: 1,
            startOffset: 0,
            endOffset: 40,
          },
        ],
      },
    ]);
  });
});
