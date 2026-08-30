import { describe, expect, test } from "vitest";
import {
  classifyFailure,
  computeGates,
  costOfUsage,
  describe as describeStats,
  percentile,
  rollupCalls,
  summarizeResults,
} from "./metrics";
import {
  normalizeUsage,
  type AnswerJudgment,
  type EvaluationCase,
  type EvaluationResult,
  type ModelCall,
} from "./types";

const usage = (prompt: number, completion: number, cached = 0, reasoning = 0) =>
  normalizeUsage({
    promptTokens: prompt,
    cachedPromptTokens: cached,
    completionTokens: completion,
    reasoningTokens: reasoning,
    totalTokens: prompt + completion,
  });

const call = (over: Partial<ModelCall> = {}): ModelCall => ({
  stage: "answer",
  model: "gpt-5.6-luna",
  usage: usage(100, 50),
  latencyMs: 100,
  attempts: 1,
  retryWaitMs: 0,
  usageReported: true,
  ...over,
});

type Overrides = {
  id?: string;
  type?: EvaluationCase["type"];
  answerability?: EvaluationCase["answerability"];
  pageNumber?: number | null;
  retrieval?: Partial<
    EvaluationResult["judgment"] extends undefined
      ? never
      : NonNullable<EvaluationResult["judgment"]>["retrieval"]
  >;
  answer?: Partial<AnswerJudgment>;
  rawCitations?: Array<{ sourceId: string; quote: string }>;
  validatedCitationCount?: number;
  agreement?: boolean;
  modelCalls?: ModelCall[];
  status?: EvaluationResult["status"];
};

function result(overrides: Overrides = {}): EvaluationResult {
  const id = overrides.id ?? "case";
  const rawCitations = overrides.rawCitations ?? [
    { sourceId: "S1", quote: "Answer." },
  ];
  return {
    caseId: id,
    status: overrides.status ?? "complete",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 1_000,
    wallClockMs: 1_000,
    modelCalls: overrides.modelCalls ?? [
      call({ stage: "answer", model: "gpt-5.6-luna", usage: usage(5, 5) }),
    ],
    evaluationCase: {
      id,
      documentKey: "doc",
      type: overrides.type ?? "single_turn",
      question: "Question?",
      pageNumber: overrides.pageNumber ?? null,
      answerability: overrides.answerability ?? "answerable",
      referenceAnswer: "Answer.",
      requiredFacts: ["Answer."],
      evidence: [{ pageNumber: 1, quote: "Answer." }],
      tags: [],
      difficulty: "easy",
      authorModel: "author",
      verifierModel: "verifier",
    },
    trace: {
      document: {
        documentId: "document",
        title: "Document",
        originalFilename: "document.pdf",
        sha256: "sha",
      },
      routing: {
        retrievalMode: "chunks",
        standaloneQuery: "Question?",
        source: "heuristic",
        latencyMs: 1,
      },
      retrieval: {
        query: "Question?",
        vectorCandidates: [],
        lexicalCandidates: [],
        selectedChunks: [],
        neighborChunks: [],
        finalChunks: [],
        embedding: {
          model: "text-embedding-3-small",
          promptTokens: 12,
          totalTokens: 12,
          latencyMs: 5,
        },
        latencyMs: 10,
      },
      generation: {
        answer: "Answer.",
        rawResponse: "",
        rawCitations,
        validatedCitations: Array.from(
          { length: overrides.validatedCitationCount ?? 0 },
          () => ({
            pageNumber: 1,
            snippet: "Answer.",
            chunkId: "chunk",
            startPageNumber: 1,
            endPageNumber: 1,
            quote: "Answer.",
            quoteStartOffset: 0,
            quoteEndOffset: 7,
            pageQuote: "Answer.",
            pageQuoteRatio: 1,
          }),
        ),
        model: "answer",
        latencyMs: 20,
        usage: usage(5, 5),
        finishReason: "stop",
        promptCharacters: 100,
        contextChunkCount: 3,
        contextTokenCount: 900,
      },
    },
    judgment: {
      retrieval: {
        chunkGrades: [],
        contextSufficiency: 4,
        evidenceCoverage: 4,
        contextNoise: 1,
        pageScopeCompliant: true,
        missingEvidence: [],
        overallPass: true,
        rationale: "retrieval",
        ...overrides.retrieval,
      },
      answer: {
        correctness: 4,
        completeness: 4,
        groundedness: 4,
        citationCorrectness: 4,
        citationCompleteness: 4,
        relevance: 4,
        abstention: "not_applicable",
        overallPass: true,
        rationale: "answer",
        ...overrides.answer,
      },
      passes: [],
      adjudicated: !(overrides.agreement ?? true),
      agreement: overrides.agreement ?? true,
    },
  };
}

const gatesFor = (value: EvaluationResult) =>
  computeGates(
    value.evaluationCase,
    value.judgment!.retrieval,
    value.judgment!.answer,
  );

describe("computeGates", () => {
  test("a broken citation subsystem does not zero out content quality", () => {
    const broken = result({
      answer: { citationCorrectness: 0, citationCompleteness: 0 },
      rawCitations: [],
    });
    const gates = gatesFor(broken);

    expect(gates.retrievalPass).toBe(true);
    expect(gates.contentPass).toBe(true);
    expect(gates.citationPass).toBe(false);
    expect(gates.endToEndPass).toBe(false);
    expect(classifyFailure(broken, gates)).toBe("citation_failure");
  });

  test("an unanswerable case passes on abstention rather than coverage", () => {
    const abstained = result({
      type: "unanswerable",
      answerability: "unanswerable",
      retrieval: { contextSufficiency: 0, evidenceCoverage: 0 },
      answer: { abstention: "correct" },
    });

    expect(gatesFor(abstained).contentPass).toBe(true);
    expect(gatesFor(abstained).retrievalPass).toBe(true);

    const answeredAnyway = result({
      type: "unanswerable",
      answerability: "unanswerable",
      retrieval: { contextSufficiency: 0, evidenceCoverage: 0 },
      answer: { abstention: "incorrect" },
    });
    const gates = gatesFor(answeredAnyway);
    expect(gates.behaviorPass).toBe(false);
    expect(classifyFailure(answeredAnyway, gates)).toBe("abstention_failure");
  });

  test("page-scope violations outrank the retrieval miss they cause", () => {
    const violation = result({
      type: "page_scoped",
      pageNumber: 4,
      retrieval: { pageScopeCompliant: false, evidenceCoverage: 1 },
    });

    expect(classifyFailure(violation, gatesFor(violation))).toBe(
      "page_scope_violation",
    );
  });

  test("a retrieval miss is reported upstream of the content failure it causes", () => {
    const miss = result({
      retrieval: { contextSufficiency: 1, evidenceCoverage: 1 },
      answer: { correctness: 0, completeness: 0, groundedness: 1 },
    });

    expect(classifyFailure(miss, gatesFor(miss))).toBe("retrieval_miss");
  });

  test("a hallucination over good context is a grounding failure", () => {
    const ungrounded = result({ answer: { groundedness: 1, correctness: 1 } });

    expect(classifyFailure(ungrounded, gatesFor(ungrounded))).toBe(
      "grounding_failure",
    );
  });
});

describe("summarizeResults", () => {
  test("keeps the retrieval, content, citation, and end-to-end gates separate", () => {
    const summary = summarizeResults([
      result({ id: "one" }),
      result({
        id: "two",
        answer: { citationCorrectness: 0, citationCompleteness: 0 },
      }),
    ]);

    expect(summary.retrievalPassRate.value).toBe(1);
    expect(summary.contentPassRate.value).toBe(1);
    expect(summary.citationPassRate.value).toBe(0.5);
    expect(summary.endToEndPassRate.value).toBe(0.5);
    expect(summary.failureCounts.citation_failure).toBe(1);
    expect(summary.averageRetrievalLatencyMs).toBe(10);
    expect(summary.totalTokens).toBe(20);
  });

  test("reports every headline rate with a confidence interval", () => {
    const summary = summarizeResults([result({ id: "one" })]);
    const interval = summary.endToEndPassRate.interval!;

    expect(summary.endToEndPassRate.total).toBe(1);
    expect(interval.low).toBeGreaterThan(0);
    expect(interval.low).toBeLessThan(1);
    expect(interval.high).toBeLessThanOrEqual(1);
  });

  test("distinguishes 'no citations offered' from 'all citations invalid'", () => {
    const none = summarizeResults([result({ id: "none", rawCitations: [] })]);
    expect(none.citationValidationRate).toBeNull();
    expect(none.casesEmittingCitations.value).toBe(0);

    const invalid = summarizeResults([
      result({
        id: "invalid",
        rawCitations: [{ sourceId: "S1", quote: "made up" }],
        validatedCitationCount: 0,
      }),
    ]);
    expect(invalid.citationValidationRate).toBe(0);
  });

  test("reports empty groups as unmeasured instead of as zero", () => {
    const summary = summarizeResults([result({ id: "one" })]);

    expect(summary.byType.single_turn!.count).toBe(1);
    expect(summary.byType.page_scoped!.count).toBe(0);
    expect(summary.byType.page_scoped!.endToEndPassRate).toBeNull();
    expect(summary.byDifficulty.hard!.endToEndPassRate).toBeNull();
  });

  test("does not produce NaN for an empty or failed run", () => {
    const summary = summarizeResults([]);

    expect(summary.endToEndPassRate.value).toBeNull();
    expect(summary.endToEndPassRate.interval).toBeNull();
    expect(summary.citationValidationRate).toBeNull();
    expect(summary.pageScopeComplianceRate).toBeNull();
    expect(summary.unanswerableAbstentionAccuracy).toBeNull();
    expect(summary.averageGroundedness).toBeNull();
  });

  test("counts an errored case as a system error, not a quality failure", () => {
    const errored: EvaluationResult = {
      caseId: "boom",
      status: "error",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:01.000Z",
      durationMs: 1,
      evaluationCase: result().evaluationCase,
      error: "Convex exploded",
      errorStage: "judging",
      wallClockMs: 500,
      // A case that died while judging still paid for its answer call.
      modelCalls: [
        call({ stage: "answer", model: "gpt-5.6-luna", usage: usage(80, 20) }),
      ],
    };
    const summary = summarizeResults([result({ id: "ok" }), errored]);

    expect(summary.completedCases).toBe(1);
    expect(summary.errorCases).toBe(1);
    expect(summary.failureCounts.system_error).toBe(1);
    expect(summary.endToEndPassRate.value).toBe(1);
    expect(summary.endToEndPassRate.total).toBe(1);
  });
});

describe("cost model", () => {
  test("prices cached input separately from fresh input", () => {
    // 1M fresh @ $0.20 + 1M cached @ $0.02 + 1M output @ $1.20
    const cost = costOfUsage(
      "gpt-5.6-luna",
      usage(2_000_000, 1_000_000, 1_000_000),
    );

    expect(cost).toBeCloseTo(0.2 + 0.02 + 1.2, 6);
  });

  test("falls back to the input rate when a model has no cached rate", () => {
    // Historical gpt-5.4 pricing has cachedInput: null, so cached tokens use
    // the normal $2.50/M input rate.
    const cost = costOfUsage("gpt-5.4", usage(1_000_000, 0, 500_000));

    expect(cost).toBeCloseTo(2.5, 6);
  });

  test("returns null for an unpriced model instead of a misleading zero", () => {
    expect(costOfUsage("text-embedding-3-small", usage(1_000, 0))).toBeNull();
    expect(costOfUsage("some-future-model", usage(1_000, 0))).toBeNull();
  });

  test("counts reasoning tokens at the output rate, not as an extra charge", () => {
    const withReasoning = costOfUsage(
      "gpt-5.6-luna",
      usage(0, 1_000_000, 0, 900_000),
    );
    const withoutReasoning = costOfUsage("gpt-5.6-luna", usage(0, 1_000_000));

    expect(withReasoning).toBe(withoutReasoning);
  });

  test("clamps a cached count that exceeds the prompt total", () => {
    const cost = costOfUsage("gpt-5.6-luna", usage(1_000, 0, 999_999));

    expect(cost).toBeCloseTo((1_000 * 0.02) / 1_000_000, 9);
    expect(cost).toBeGreaterThan(0);
  });
});

describe("percentiles and rollups", () => {
  test("percentile is null for an empty sample and exact at the edges", () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([5], 0.95)).toBe(5);
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2);
    expect(percentile([1, 2, 3, 4], 1)).toBe(4);
  });

  test("describe reports nulls rather than NaN for no data", () => {
    const stats = describeStats([]);

    expect(stats.count).toBe(0);
    expect(stats.mean).toBeNull();
    expect(stats.p95).toBeNull();
    expect(stats.total).toBe(0);
  });

  test("rollup separates stages and flags unpriced ones", () => {
    const rollups = rollupCalls([
      call({ stage: "embedding", model: "text-embedding-3-small" }),
      call({ stage: "answer", model: "gpt-5.6-luna" }),
      call({ stage: "judge_answer", model: "gpt-5.6-luna" }),
    ]);

    expect(rollups.map((r) => r.stage)).toEqual([
      "embedding",
      "answer",
      "judge_answer",
    ]);
    expect(rollups[0]!.costUsd).toBeNull();
    expect(rollups[0]!.hasUnpriced).toBe(true);
    expect(rollups[2]!.costUsd).toBeGreaterThan(0);
    expect(rollups[2]!.hasUnpriced).toBe(false);
  });
});

describe("run economics", () => {
  test("includes spend from errored cases so run cost is not understated", () => {
    const errored: EvaluationResult = {
      caseId: "boom",
      status: "error",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:01.000Z",
      durationMs: 1,
      wallClockMs: 1,
      evaluationCase: result().evaluationCase,
      error: "judge exploded",
      errorStage: "judging",
      modelCalls: [
        call({
          stage: "answer",
          model: "gpt-5.6-luna",
          usage: usage(1_000_000, 0),
        }),
      ],
    };
    const summary = summarizeResults([errored]);

    expect(summary.completedCases).toBe(0);
    expect(summary.totalCostUsd).toBeCloseTo(0.2, 6);
    expect(summary.ledgerUsage.promptTokens).toBe(1_000_000);
  });

  test("surfaces unpriced and unverified models rather than hiding them", () => {
    const summary = summarizeResults([
      result({
        id: "one",
        modelCalls: [
          call({ stage: "embedding", model: "text-embedding-3-small" }),
          call({ stage: "answer", model: "gpt-5.4" }),
          call({ stage: "judge_answer", model: "gpt-5.6-luna" }),
        ],
      }),
    ]);

    expect(summary.unpricedModels).toEqual(["text-embedding-3-small"]);
    expect(summary.unverifiedModels).toEqual(["gpt-5.4"]);
  });

  test("counts retries and flags calls whose usage the API never reported", () => {
    const summary = summarizeResults([
      result({
        id: "one",
        modelCalls: [
          call({ attempts: 3, retryWaitMs: 3_000 }),
          call({
            stage: "judge_answer",
            model: "gpt-5.6-luna",
            usageReported: false,
          }),
        ],
      }),
    ]);

    expect(summary.totalRetries).toBe(2);
    expect(summary.totalRetryWaitMs).toBe(3_000);
    expect(summary.missingUsageCallCount).toBe(1);
    expect(summary.totalCalls).toBe(2);
  });

  test("tolerates a legacy result with no ledger", () => {
    const legacy = result({ id: "legacy" });
    delete (legacy as { modelCalls?: unknown }).modelCalls;
    const summary = summarizeResults([legacy]);

    expect(summary.totalCalls).toBe(0);
    expect(summary.totalCostUsd).toBeNull();
    expect(summary.endToEndPassRate.value).toBe(1);
  });
});
