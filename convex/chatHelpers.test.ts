import { describe, expect, test } from "vitest";
import type { Id } from "./_generated/dataModel";
import {
  buildChunkSystemPrompt,
  buildValidatedChunkCitations,
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
