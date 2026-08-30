import { describe, expect, test } from "vitest";
import type { Id } from "./_generated/dataModel";
import {
  buildChunkSystemPrompt,
  buildValidatedChunkCitations,
  createAnswerExtractor,
  parseStructuredAssistantResponse,
  type RankedChunk,
} from "./chatHelpers";

const chunk: RankedChunk = {
  _id: "chunk-id" as Id<"documentChunks">,
  chunkIndex: 0,
  startPageNumber: 2,
  endPageNumber: 2,
  text: "The Agreement renews automatically for one additional year.",
  tokenCount: 9,
  pageSpans: [
    {
      pageNumber: 2,
      startOffset: 0,
      endOffset: "The Agreement renews automatically for one additional year."
        .length,
    },
  ],
  hybridScore: 1,
  sourceId: "S1",
};

describe("buildChunkSystemPrompt", () => {
  test("separates document background from the only citable sources", () => {
    const documentSummary =
      "This is a commercial lease between Northstar LLC and Acme Ltd.";
    const prompt = buildChunkSystemPrompt("Commercial Lease", documentSummary, [
      chunk,
    ]);

    const backgroundHeading =
      "Document background (context only, never cite this):";
    expect(prompt).toContain(backgroundHeading);
    expect(prompt).toContain(documentSummary);
    expect(prompt).toContain("Sources:\n[S1] page 2\n");
    expect(prompt.indexOf(backgroundHeading)).toBeLessThan(
      prompt.indexOf("Sources:"),
    );
    expect(prompt).toContain(
      "never quote, cite, or treat the document background as evidence",
    );
    expect(prompt).toContain(
      "each quote must be copied verbatim as one contiguous substring from a numbered source, never from the document background",
    );
  });

  test("keeps summary-only quotes outside the citation trust boundary", () => {
    const citations = buildValidatedChunkCitations(
      [
        {
          sourceId: "S1",
          quote:
            "This is a commercial lease between Northstar LLC and Acme Ltd.",
        },
      ],
      [chunk],
    );

    expect(citations).toEqual([]);
  });
});

describe("createAnswerExtractor", () => {
  test("buffers the whole structured response so citations survive", () => {
    const extractor = createAnswerExtractor();
    const deltas = [
      '{"answer":"The Agreement renews ',
      'automatically.","cit',
      'ations":[{"sourceId":"S1","quote":"renews automatically"}]}',
    ];
    const emitted = deltas.map((delta) => extractor.feed(delta)).join("");

    expect(emitted).toBe("The Agreement renews automatically.");
    expect(extractor.complete).toBe(true);

    const parsed = parseStructuredAssistantResponse(extractor.rawBuffer);
    expect(parsed).not.toBeNull();
    expect(parsed?.citations).toEqual([
      { sourceId: "S1", quote: "renews automatically" },
    ]);
  });

  test("emits the answer once and never leaks citation text into the stream", () => {
    const extractor = createAnswerExtractor();
    const emitted = ['{"answer":"Done."', ',"citations":[]}']
      .map((delta) => extractor.feed(delta))
      .join("");

    expect(emitted).toBe("Done.");
    expect(JSON.parse(extractor.rawBuffer)).toEqual({
      answer: "Done.",
      citations: [],
    });
  });

  test("decodes escapes split across delta boundaries", () => {
    const extractor = createAnswerExtractor();
    const emitted = [
      '{"answer":"He said \\',
      '"hi\\" to me."',
      ',"citations":[]}',
    ]
      .map((delta) => extractor.feed(delta))
      .join("");

    expect(emitted).toBe('He said "hi" to me.');
    expect(parseStructuredAssistantResponse(extractor.rawBuffer)?.answer).toBe(
      'He said "hi" to me.',
    );
  });
});
