import {
  EMPTY_USAGE,
  type AnswerJudgment,
  type EvaluationCase,
  type EvaluationResult,
  type ModelCall,
  type ModelCallStage,
  type RetrievalJudgment,
  type TokenUsage,
} from "./types";

/* ─── Pricing ────────────────────────────────────────────────────── */

export type ModelPricing = {
  /** USD per 1M non-cached prompt tokens. */
  input: number;
  /** USD per 1M cached prompt tokens; null means bill them at the input rate. */
  cachedInput: number | null;
  /** USD per 1M completion tokens (reasoning tokens included). */
  output: number;
  /** False for rates carried over from the old table rather than confirmed. */
  verified: boolean;
};

export const MODEL_PRICING: Record<string, ModelPricing> = {
  "gpt-5.6-luna": {
    input: 0.2,
    cachedInput: 0.02,
    output: 1.2,
    verified: true,
  },
  "gpt-5.4": { input: 2.5, cachedInput: null, output: 15, verified: false },
  // text-embedding-3-small is deliberately absent: no confirmed rate, so its
  // tokens are counted and reported but never turned into a dollar figure.
};

export function pricingFor(model: string): ModelPricing | null {
  const exact = MODEL_PRICING[model];
  if (exact) return exact;
  const prefix = Object.keys(MODEL_PRICING)
    .sort((a, b) => b.length - a.length)
    .find((candidate) => model.startsWith(`${candidate}-`));
  return prefix ? (MODEL_PRICING[prefix] ?? null) : null;
}

/** Returns null when the model has no confirmed rate, never a misleading 0. */
export function costOfUsage(model: string, usage: TokenUsage): number | null {
  const pricing = pricingFor(model);
  if (!pricing) return null;
  const cached = Math.min(usage.cachedPromptTokens, usage.promptTokens);
  const fresh = usage.promptTokens - cached;
  const cachedRate = pricing.cachedInput ?? pricing.input;
  return (
    (fresh * pricing.input +
      cached * cachedRate +
      usage.completionTokens * pricing.output) /
    1_000_000
  );
}

export function costOfCall(call: ModelCall): number | null {
  return costOfUsage(call.model, call.usage);
}

/** A dimension score at or above this counts as passing that dimension. */
export const PASS_THRESHOLD = 3;

export type FailureBucket =
  | "system_error"
  | "page_scope_violation"
  | "retrieval_miss"
  | "abstention_failure"
  | "grounding_failure"
  | "content_failure"
  | "citation_failure";

export const FAILURE_BUCKETS: Array<{
  key: FailureBucket;
  label: string;
  description: string;
}> = [
  {
    key: "system_error",
    label: "System error",
    description: "The case never produced a judgeable answer.",
  },
  {
    key: "page_scope_violation",
    label: "Page-scope violation",
    description: "A page-scoped question retrieved chunks off the named page.",
  },
  {
    key: "retrieval_miss",
    label: "Retrieval miss",
    description:
      "The evidence needed to answer was never placed in the context window.",
  },
  {
    key: "abstention_failure",
    label: "Abstention failure",
    description:
      "Answered a question the document cannot support, or refused an answerable one.",
  },
  {
    key: "grounding_failure",
    label: "Grounding failure",
    description: "The evidence was retrieved but the answer departed from it.",
  },
  {
    key: "content_failure",
    label: "Content failure",
    description:
      "Grounded in the sources but incorrect, incomplete, or off-question.",
  },
  {
    key: "citation_failure",
    label: "Citation failure",
    description:
      "The answer itself is right; the citations are missing, wrong, or unverifiable.",
  },
];

/**
 * Independent quality gates.
 *
 * These are derived from the judge's numeric dimension scores rather than read
 * from its `overallPass` flag, so a single broken subsystem cannot collapse the
 * whole scoreboard to zero and hide every other signal.
 */
export type CaseGates = {
  retrievalPass: boolean;
  contentPass: boolean;
  citationPass: boolean;
  behaviorPass: boolean;
  endToEndPass: boolean;
};

export type CaseEconomics = {
  calls: number;
  usage: TokenUsage;
  costUsd: number | null;
  hasUnpriced: boolean;
  /** Sum of individual call latencies. */
  apiLatencyMs: number;
  /** Wall-clock the case occupied; exceeds apiLatencyMs under concurrency. */
  wallClockMs: number;
  retries: number;
  retryWaitMs: number;
  answerLatencyMs: number | null;
  retrievalLatencyMs: number | null;
  judgeLatencyMs: number;
  contextChunkCount: number | null;
  contextTokenCount: number | null;
};

export type CaseOutcome = CaseGates & {
  caseId: string;
  evaluationCase: EvaluationCase;
  status: EvaluationResult["status"];
  failureBucket: FailureBucket | null;
  result: EvaluationResult;
  economics: CaseEconomics;
};

function caseEconomics(result: EvaluationResult): CaseEconomics {
  const calls = result.modelCalls ?? [];
  const costs = calls.map((call) => costOfCall(call));
  const priced = costs.filter((cost): cost is number => cost !== null);
  const judgeCalls = calls.filter(
    (call) => call.stage.startsWith("judge_") || call.stage === "adjudication",
  );
  return {
    calls: calls.length,
    usage: sumUsage(calls.map((call) => call.usage)),
    costUsd:
      priced.length === 0 ? null : priced.reduce((sum, cost) => sum + cost, 0),
    hasUnpriced: costs.some((cost) => cost === null),
    apiLatencyMs: calls.reduce((sum, call) => sum + call.latencyMs, 0),
    wallClockMs: result.wallClockMs ?? result.durationMs ?? 0,
    retries: calls.reduce(
      (sum, call) => sum + Math.max(0, call.attempts - 1),
      0,
    ),
    retryWaitMs: calls.reduce((sum, call) => sum + call.retryWaitMs, 0),
    answerLatencyMs: result.trace?.generation.latencyMs ?? null,
    retrievalLatencyMs: result.trace?.retrieval.latencyMs ?? null,
    judgeLatencyMs: judgeCalls.reduce((sum, call) => sum + call.latencyMs, 0),
    contextChunkCount: result.trace?.generation.contextChunkCount ?? null,
    contextTokenCount: result.trace?.generation.contextTokenCount ?? null,
  };
}

function mean(values: number[]) {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function optionalMean(values: number[]) {
  return values.length === 0 ? null : mean(values);
}

/** Returns null rather than a misleading 0 when nothing was measured. */
function rate(numerator: number, denominator: number) {
  return denominator === 0 ? null : numerator / denominator;
}

/**
 * Wilson score interval. A 60-case pass rate carries roughly +/-12pp at 95%
 * confidence, so every headline rate is reported with its interval to stop
 * run-to-run noise reading as progress.
 */
export function wilsonInterval(
  successes: number,
  total: number,
  z = 1.96,
): { low: number; high: number } | null {
  if (total === 0) return null;
  const proportion = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = proportion + (z * z) / (2 * total);
  const spread =
    z *
    Math.sqrt(
      (proportion * (1 - proportion)) / total + (z * z) / (4 * total * total),
    );
  return {
    low: Math.max(0, (center - spread) / denominator),
    high: Math.min(1, (center + spread) / denominator),
  };
}

export type RateWithInterval = {
  value: number | null;
  successes: number;
  total: number;
  interval: { low: number; high: number } | null;
};

function rateWithInterval(successes: number, total: number): RateWithInterval {
  return {
    value: rate(successes, total),
    successes,
    total,
    interval: wilsonInterval(successes, total),
  };
}

export function sumUsage(usages: Array<TokenUsage | null | undefined>) {
  return usages.reduce<TokenUsage>(
    (total, usage) => ({
      promptTokens: total.promptTokens + (usage?.promptTokens ?? 0),
      cachedPromptTokens:
        total.cachedPromptTokens + (usage?.cachedPromptTokens ?? 0),
      completionTokens: total.completionTokens + (usage?.completionTokens ?? 0),
      reasoningTokens: total.reasoningTokens + (usage?.reasoningTokens ?? 0),
      totalTokens: total.totalTokens + (usage?.totalTokens ?? 0),
    }),
    { ...EMPTY_USAGE },
  );
}

/** Nearest-rank percentile. Returns null for an empty sample. */
export function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(fraction * sorted.length) - 1),
  );
  return sorted[index]!;
}

export type Distribution = {
  count: number;
  total: number;
  mean: number | null;
  p50: number | null;
  p95: number | null;
  max: number | null;
};

export function describe(values: number[]): Distribution {
  return {
    count: values.length,
    total: values.reduce((sum, value) => sum + value, 0),
    mean: values.length === 0 ? null : mean(values),
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: values.length === 0 ? null : Math.max(...values),
  };
}

export const CALL_STAGES: ModelCallStage[] = [
  "embedding",
  "answer",
  "judge_retrieval",
  "judge_answer",
  "adjudication",
];

export const STAGE_LABEL: Record<ModelCallStage, string> = {
  embedding: "Query embedding",
  answer: "Answer generation",
  judge_retrieval: "Judge: retrieval",
  judge_answer: "Judge: answer",
  adjudication: "Adjudication",
};

export type StageRollup = {
  stage: ModelCallStage;
  label: string;
  calls: number;
  usage: TokenUsage;
  costUsd: number | null;
  /** True when at least one call in the stage had no confirmed price. */
  hasUnpriced: boolean;
  latency: Distribution;
  models: string[];
};

export function rollupCalls(calls: ModelCall[]): StageRollup[] {
  return CALL_STAGES.map((stage) => {
    const stageCalls = calls.filter((call) => call.stage === stage);
    const costs = stageCalls.map((call) => costOfCall(call));
    const priced = costs.filter((cost): cost is number => cost !== null);
    return {
      stage,
      label: STAGE_LABEL[stage],
      calls: stageCalls.length,
      usage: sumUsage(stageCalls.map((call) => call.usage)),
      costUsd:
        priced.length === 0
          ? null
          : priced.reduce((sum, cost) => sum + cost, 0),
      hasUnpriced: costs.some((cost) => cost === null),
      latency: describe(stageCalls.map((call) => call.latencyMs)),
      models: [...new Set(stageCalls.map((call) => call.model))].sort(),
    };
  }).filter((rollup) => rollup.calls > 0);
}

export function computeGates(
  evaluationCase: EvaluationCase,
  retrieval: RetrievalJudgment,
  answer: AnswerJudgment,
): CaseGates {
  const unanswerable = evaluationCase.answerability === "unanswerable";
  const pageScopeOk =
    evaluationCase.type !== "page_scoped" || retrieval.pageScopeCompliant;

  // An unanswerable case has no required facts, so sufficiency and coverage are
  // undefined for it; the retrieval judge grades those cases holistically and
  // its verdict is used directly.
  const retrievalPass = unanswerable
    ? retrieval.overallPass
    : retrieval.contextSufficiency >= PASS_THRESHOLD &&
      retrieval.evidenceCoverage >= PASS_THRESHOLD &&
      pageScopeOk;

  const contentPass = unanswerable
    ? answer.abstention === "correct"
    : answer.correctness >= PASS_THRESHOLD &&
      answer.completeness >= PASS_THRESHOLD &&
      answer.relevance >= PASS_THRESHOLD &&
      answer.groundedness >= PASS_THRESHOLD;

  const citationPass =
    answer.citationCorrectness >= PASS_THRESHOLD &&
    answer.citationCompleteness >= PASS_THRESHOLD;

  const behaviorPass = answer.abstention !== "incorrect" && pageScopeOk;

  return {
    retrievalPass,
    contentPass,
    citationPass,
    behaviorPass,
    endToEndPass: retrievalPass && contentPass && citationPass && behaviorPass,
  };
}

/**
 * Assigns each failed case exactly one primary bucket, in root-cause order:
 * an upstream retrieval miss is reported as a retrieval miss, not as the
 * content failure it inevitably causes downstream.
 */
export function classifyFailure(
  result: EvaluationResult,
  gates: CaseGates,
): FailureBucket | null {
  if (result.status === "error" || !result.judgment) return "system_error";
  if (gates.endToEndPass) return null;

  const { retrieval, answer } = result.judgment;
  const { evaluationCase } = result;

  if (evaluationCase.type === "page_scoped" && !retrieval.pageScopeCompliant) {
    return "page_scope_violation";
  }
  // On an unanswerable case, a failed retrieval gate is usually an artifact of
  // the judge penalising context that contains the supposedly-absent answer.
  // The abstention behaviour is the real finding, so it is checked first.
  if (
    evaluationCase.answerability === "unanswerable" &&
    answer.abstention === "incorrect"
  ) {
    return "abstention_failure";
  }
  if (!gates.retrievalPass) return "retrieval_miss";
  if (answer.abstention === "incorrect") return "abstention_failure";
  if (answer.groundedness < PASS_THRESHOLD) return "grounding_failure";
  if (!gates.contentPass) return "content_failure";
  return "citation_failure";
}

export function buildOutcomes(results: EvaluationResult[]): CaseOutcome[] {
  return results.map((result) => {
    const gates: CaseGates = result.judgment
      ? computeGates(
          result.evaluationCase,
          result.judgment.retrieval,
          result.judgment.answer,
        )
      : {
          retrievalPass: false,
          contentPass: false,
          citationPass: false,
          behaviorPass: false,
          endToEndPass: false,
        };
    return {
      ...gates,
      caseId: result.caseId,
      evaluationCase: result.evaluationCase,
      status: result.status,
      failureBucket: classifyFailure(result, gates),
      result,
      economics: caseEconomics(result),
    };
  });
}

export function summarizeResults(results: EvaluationResult[]) {
  const outcomes = buildOutcomes(results);
  const completed = outcomes.filter(
    (outcome) =>
      outcome.status === "complete" &&
      outcome.result.judgment &&
      outcome.result.trace,
  );
  const total = completed.length;

  const citationCases = completed.filter(
    (outcome) =>
      (outcome.result.trace?.generation.rawCitations.length ?? 0) > 0,
  );
  const rawCitationCount = completed.reduce(
    (sum, outcome) =>
      sum + (outcome.result.trace?.generation.rawCitations.length ?? 0),
    0,
  );
  const validatedCitationCount = completed.reduce(
    (sum, outcome) =>
      sum + (outcome.result.trace?.generation.validatedCitations.length ?? 0),
    0,
  );
  // Cost aggregates span EVERY attempted case, including errored ones: a case
  // that died while judging still spent money on its embedding and answer.
  const allCalls = outcomes.flatMap(
    (outcome) => outcome.result.modelCalls ?? [],
  );
  const stageRollups = rollupCalls(allCalls);
  const allCosts = allCalls.map((call) => costOfCall(call));
  const pricedCosts = allCosts.filter((cost): cost is number => cost !== null);
  const totalCostUsd =
    pricedCosts.length === 0
      ? null
      : pricedCosts.reduce((sum, cost) => sum + cost, 0);
  const unpricedModels = [
    ...new Set(
      allCalls
        .filter((call) => costOfCall(call) === null)
        .map((call) => call.model),
    ),
  ].sort();
  const unverifiedModels = [
    ...new Set(
      allCalls
        .map((call) => call.model)
        .filter((model) => pricingFor(model)?.verified === false),
    ),
  ].sort();
  const missingUsageCalls = allCalls.filter((call) => !call.usageReported);
  const ledgerUsage = sumUsage(allCalls.map((call) => call.usage));
  const answerUsage = sumUsage(
    allCalls.filter((call) => call.stage === "answer").map((c) => c.usage),
  );
  const judgeUsage = sumUsage(
    allCalls
      .filter(
        (call) =>
          call.stage.startsWith("judge_") || call.stage === "adjudication",
      )
      .map((c) => c.usage),
  );
  const perCaseCosts = outcomes
    .map((outcome) => outcome.economics.costUsd)
    .filter((cost): cost is number => cost !== null);

  const groupMetrics = (subset: CaseOutcome[]) => ({
    count: subset.length,
    retrievalPassRate: rate(
      subset.filter((outcome) => outcome.retrievalPass).length,
      subset.length,
    ),
    contentPassRate: rate(
      subset.filter((outcome) => outcome.contentPass).length,
      subset.length,
    ),
    citationPassRate: rate(
      subset.filter((outcome) => outcome.citationPass).length,
      subset.length,
    ),
    endToEndPassRate: rate(
      subset.filter((outcome) => outcome.endToEndPass).length,
      subset.length,
    ),
  });

  const byType = Object.fromEntries(
    (["single_turn", "page_scoped", "unanswerable"] as const).map((type) => [
      type,
      groupMetrics(
        completed.filter((outcome) => outcome.evaluationCase.type === type),
      ),
    ]),
  );
  const byDocument = Object.fromEntries(
    [...new Set(completed.map((outcome) => outcome.evaluationCase.documentKey))]
      .sort()
      .map((documentKey) => [
        documentKey,
        groupMetrics(
          completed.filter(
            (outcome) => outcome.evaluationCase.documentKey === documentKey,
          ),
        ),
      ]),
  );
  const byDifficulty = Object.fromEntries(
    (["easy", "medium", "hard"] as const).map((difficulty) => [
      difficulty,
      groupMetrics(
        completed.filter(
          (outcome) => outcome.evaluationCase.difficulty === difficulty,
        ),
      ),
    ]),
  );

  const failureCounts = Object.fromEntries(
    FAILURE_BUCKETS.map(({ key }) => [
      key,
      outcomes.filter((outcome) => outcome.failureBucket === key).length,
    ]),
  ) as Record<FailureBucket, number>;

  const pageScoped = completed.filter(
    (outcome) => outcome.evaluationCase.type === "page_scoped",
  );
  const unanswerable = completed.filter(
    (outcome) => outcome.evaluationCase.type === "unanswerable",
  );

  const judgeScore = (
    pick: (judgment: NonNullable<EvaluationResult["judgment"]>) => number,
  ) =>
    optionalMean(
      completed.flatMap((outcome) =>
        outcome.result.judgment ? [pick(outcome.result.judgment)] : [],
      ),
    );

  return {
    outcomes,
    requestedCases: results.length,
    completedCases: total,
    errorCases: outcomes.filter((outcome) => outcome.status === "error").length,

    retrievalPassRate: rateWithInterval(
      completed.filter((outcome) => outcome.retrievalPass).length,
      total,
    ),
    contentPassRate: rateWithInterval(
      completed.filter((outcome) => outcome.contentPass).length,
      total,
    ),
    citationPassRate: rateWithInterval(
      completed.filter((outcome) => outcome.citationPass).length,
      total,
    ),
    behaviorPassRate: rateWithInterval(
      completed.filter((outcome) => outcome.behaviorPass).length,
      total,
    ),
    endToEndPassRate: rateWithInterval(
      completed.filter((outcome) => outcome.endToEndPass).length,
      total,
    ),

    averageRetrievalSufficiency: judgeScore(
      (judgment) => judgment.retrieval.contextSufficiency,
    ),
    averageEvidenceCoverage: judgeScore(
      (judgment) => judgment.retrieval.evidenceCoverage,
    ),
    averageContextNoise: judgeScore(
      (judgment) => judgment.retrieval.contextNoise,
    ),
    averageAnswerCorrectness: judgeScore(
      (judgment) => judgment.answer.correctness,
    ),
    averageCompleteness: judgeScore((judgment) => judgment.answer.completeness),
    averageGroundedness: judgeScore((judgment) => judgment.answer.groundedness),
    averageCitationCorrectness: judgeScore(
      (judgment) => judgment.answer.citationCorrectness,
    ),

    // Null, not 0, when the system emitted no citations at all: "none offered"
    // and "all offered were invalid" are different failures.
    citationValidationRate: rate(validatedCitationCount, rawCitationCount),
    casesEmittingCitations: rateWithInterval(citationCases.length, total),
    rawCitationCount,
    validatedCitationCount,

    judgeAgreementRate: rate(
      completed.filter((outcome) => outcome.result.judgment?.agreement).length,
      total,
    ),
    adjudicationRate: rate(
      completed.filter((outcome) => outcome.result.judgment?.adjudicated)
        .length,
      total,
    ),
    pageScopeComplianceRate: rate(
      pageScoped.filter(
        (outcome) => outcome.result.judgment?.retrieval.pageScopeCompliant,
      ).length,
      pageScoped.length,
    ),
    unanswerableAbstentionAccuracy: rate(
      unanswerable.filter(
        (outcome) => outcome.result.judgment?.answer.abstention === "correct",
      ).length,
      unanswerable.length,
    ),

    averageRetrievalLatencyMs: mean(
      completed.map(
        (outcome) => outcome.result.trace?.retrieval.latencyMs ?? 0,
      ),
    ),
    averageGenerationLatencyMs: mean(
      completed.map(
        (outcome) => outcome.result.trace?.generation.latencyMs ?? 0,
      ),
    ),
    answerUsage,
    judgeUsage,
    ledgerUsage,
    totalTokens: ledgerUsage.totalTokens,
    stageRollups,
    totalCostUsd,
    unpricedModels,
    unverifiedModels,
    missingUsageCallCount: missingUsageCalls.length,
    totalCalls: allCalls.length,
    totalRetries: allCalls.reduce(
      (sum, call) => sum + Math.max(0, call.attempts - 1),
      0,
    ),
    totalRetryWaitMs: allCalls.reduce((sum, call) => sum + call.retryWaitMs, 0),
    costPerCase: describe(perCaseCosts),
    wallClockPerCase: describe(
      outcomes.map((outcome) => outcome.economics.wallClockMs),
    ),
    apiLatencyPerCase: describe(
      outcomes.map((outcome) => outcome.economics.apiLatencyMs),
    ),
    answerLatency: describe(
      completed.flatMap((outcome) =>
        outcome.economics.answerLatencyMs === null
          ? []
          : [outcome.economics.answerLatencyMs],
      ),
    ),
    retrievalLatency: describe(
      completed.flatMap((outcome) =>
        outcome.economics.retrievalLatencyMs === null
          ? []
          : [outcome.economics.retrievalLatencyMs],
      ),
    ),
    judgeLatency: describe(
      completed.map((outcome) => outcome.economics.judgeLatencyMs),
    ),
    contextTokens: describe(
      completed.flatMap((outcome) =>
        outcome.economics.contextTokenCount === null
          ? []
          : [outcome.economics.contextTokenCount],
      ),
    ),
    failureCounts,
    byType,
    byDocument,
    byDifficulty,
  };
}

export type EvaluationSummary = ReturnType<typeof summarizeResults>;
