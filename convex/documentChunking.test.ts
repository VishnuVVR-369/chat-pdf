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
): OCRPageObject {
  return {
    index,
    markdown,
    images: [],
    dimensions: null,
    ...(blocks === undefined ? {} : { blocks }),
  };
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
