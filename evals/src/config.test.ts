import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  DATASET_DIR,
  readCorpusManifest,
  readDataset,
  validateCorpus,
} from "./config";

describe("evaluation corpus", () => {
  test("contains five unique, bounded PDF snapshots with valid checksums", async () => {
    const manifest = await validateCorpus();
    expect(manifest.documents).toHaveLength(5);
    expect(
      new Set(manifest.documents.map((document) => document.key)).size,
    ).toBe(5);
    expect(
      manifest.documents.every(
        (document) =>
          document.filename.endsWith(".pdf") &&
          document.pageCount > 0 &&
          document.pageCount <= 100 &&
          /^[a-f0-9]{64}$/.test(document.sha256),
      ),
    ).toBe(true);
    expect(readCorpusManifest()).toEqual(manifest);
  });
});

describe("evaluation dataset", () => {
  test("has the locked 60-case distribution and internally consistent labels", () => {
    const cases = readDataset();
    expect(cases).toHaveLength(60);
    expect(new Set(cases.map((evaluationCase) => evaluationCase.id)).size).toBe(
      60,
    );
    // v1.1 moved five table-extraction cases out of `unanswerable`; see the
    // changelog in dataset.json for why each one was relabeled.
    expect(
      cases.filter((evaluationCase) => evaluationCase.type === "single_turn"),
    ).toHaveLength(35);
    expect(
      cases.filter((evaluationCase) => evaluationCase.type === "page_scoped"),
    ).toHaveLength(15);
    expect(
      cases.filter((evaluationCase) => evaluationCase.type === "unanswerable"),
    ).toHaveLength(10);

    for (const document of readCorpusManifest().documents) {
      expect(
        cases.filter(
          (evaluationCase) => evaluationCase.documentKey === document.key,
        ),
      ).toHaveLength(12);
    }

    for (const evaluationCase of cases) {
      if (evaluationCase.answerability === "unanswerable") {
        expect(evaluationCase.requiredFacts).toEqual([]);
        expect(evaluationCase.evidence).toEqual([]);
        expect(evaluationCase.pageNumber).toBeNull();
      } else {
        expect(evaluationCase.requiredFacts.length).toBeGreaterThan(0);
        expect(evaluationCase.evidence.length).toBeGreaterThan(0);
      }
      if (evaluationCase.type === "page_scoped") {
        expect(evaluationCase.pageNumber).not.toBeNull();
        expect(
          evaluationCase.evidence.every(
            (evidence) => evidence.pageNumber === evaluationCase.pageNumber,
          ),
        ).toBe(true);
      }
    }
  });

  test("every relabeled case is documented and internally consistent", () => {
    const metadata = JSON.parse(
      readFileSync(path.join(DATASET_DIR, "dataset.json"), "utf8"),
    ) as {
      version: string;
      caseCount: number;
      changelog?: Array<{ caseId: string }>;
    };
    const cases = readDataset();
    const byId = new Map(cases.map((item) => [item.id, item]));

    expect(metadata.caseCount).toBe(cases.length);
    const changelog = metadata.changelog ?? [];
    expect(changelog.length).toBeGreaterThan(0);

    for (const entry of changelog) {
      const relabeled = byId.get(entry.caseId);
      expect(relabeled, `${entry.caseId} is missing`).toBeDefined();
      // A relabeled case must now carry the evidence its new label implies.
      expect(relabeled!.answerability).toBe("answerable");
      expect(relabeled!.requiredFacts.length).toBeGreaterThan(0);
      expect(relabeled!.evidence.length).toBeGreaterThan(0);
      expect(relabeled!.referenceAnswer.length).toBeGreaterThan(40);
      expect(
        relabeled!.evidence.every((item) => item.quote.trim().length > 10),
      ).toBe(true);
    }
  });
});
