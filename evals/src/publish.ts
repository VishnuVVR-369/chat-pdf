import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  FAILURE_BUCKETS,
  STAGE_LABEL,
  costOfCall,
  summarizeResults,
  type EvaluationSummary,
} from "./metrics";
import { ROOT_DIR, RUNS_DIR, readCorpusManifest } from "./config";
import type { EvaluationResult, RunManifest } from "./types";

/**
 * Public snapshot consumed by the /eval page. Deliberately small and derived:
 * it carries aggregates and per-document rows, never chunk text, answers, or
 * anything that would make the committed file large or sensitive.
 */
export type EvalSnapshot = ReturnType<typeof buildSnapshot>;

const SNAPSHOT_PATH = path.join(ROOT_DIR, "src", "data", "eval-snapshot.json");

function round(value: number | null, places = 4) {
  return value === null ? null : Number(value.toFixed(places));
}

function buildSnapshot(
  manifest: RunManifest,
  summary: EvaluationSummary,
  results: EvaluationResult[],
) {
  const corpus = readCorpusManifest();
  const gate = (
    label: string,
    key:
      | "retrievalPassRate"
      | "contentPassRate"
      | "citationPassRate"
      | "behaviorPassRate"
      | "endToEndPassRate",
    blurb: string,
  ) => {
    const rate = summary[key];
    return {
      label,
      blurb,
      value: round(rate.value),
      low: round(rate.interval?.low ?? null),
      high: round(rate.interval?.high ?? null),
      passed: rate.successes,
      total: rate.total,
    };
  };

  const groupRows = (
    groups: Record<string, { count: number } & Record<string, unknown>>,
  ) =>
    Object.entries(groups)
      .filter(([, metrics]) => metrics.count > 0)
      .map(([name, metrics]) => ({
        name,
        count: metrics.count,
        retrieval: round(metrics.retrievalPassRate as number | null),
        content: round(metrics.contentPassRate as number | null),
        citations: round(metrics.citationPassRate as number | null),
        endToEnd: round(metrics.endToEndPassRate as number | null),
      }));

  const durations = results
    .map((result) => result.wallClockMs ?? 0)
    .filter((value) => value > 0);

  // Judge calibration runs once per suite. It is folded into cost, tokens and
  // call count together so every economics figure sits on the same basis.
  const calibrationCalls = manifest.calibration?.calls ?? [];
  const calibrationCostUsd = calibrationCalls.reduce(
    (total, call) => total + (costOfCall(call) ?? 0),
    0,
  );
  const calibrationUsage = manifest.calibration?.usage;

  return {
    generatedAt: new Date().toISOString(),
    run: {
      id: manifest.runId,
      completedAt: manifest.completedAt ?? manifest.startedAt,
      datasetVersion: manifest.datasetVersion,
      corpusVersion: manifest.corpusVersion,
      answerModel: manifest.answerModel,
      judgeModel: manifest.judgeModel,
      embeddingModel: manifest.embeddingModel,
      judgePasses: manifest.judgePasses,
      casesEvaluated: summary.completedCases,
      casesTotal: manifest.caseCount,
      wallClockMs:
        durations.length > 0
          ? new Date(manifest.completedAt ?? manifest.startedAt).getTime() -
            new Date(manifest.startedAt).getTime()
          : 0,
    },
    corpus: {
      documentCount: corpus.documents.length,
      pageCount: corpus.documents.reduce(
        (sum, document) => sum + document.pageCount,
        0,
      ),
      documents: corpus.documents.map((document) => ({
        key: document.key,
        title: document.title,
        pageCount: document.pageCount,
        publicationDate: document.publicationDate,
      })),
    },
    gates: [
      gate(
        "Retrieval",
        "retrievalPassRate",
        "The evidence needed to answer reached the model's context window.",
      ),
      gate(
        "Content",
        "contentPassRate",
        "The answer is correct, complete, and faithful to the retrieved sources.",
      ),
      gate(
        "Citations",
        "citationPassRate",
        "Every claim is attributable to a quote that exists in the document.",
      ),
      gate(
        "Behaviour",
        "behaviorPassRate",
        "The system abstains when it should and respects page scoping.",
      ),
      gate(
        "End to end",
        "endToEndPassRate",
        "All four gates passed on the same question.",
      ),
    ],
    failures: FAILURE_BUCKETS.filter(
      ({ key }) => summary.failureCounts[key] > 0,
    ).map(({ key, label, description }) => ({
      key,
      label,
      description,
      count: summary.failureCounts[key],
    })),
    dimensions: [
      {
        label: "Groundedness",
        value: round(summary.averageGroundedness, 2),
        lowerIsBetter: false,
      },
      {
        label: "Answer correctness",
        value: round(summary.averageAnswerCorrectness, 2),
        lowerIsBetter: false,
      },
      {
        label: "Citation correctness",
        value: round(summary.averageCitationCorrectness, 2),
        lowerIsBetter: false,
      },
      {
        label: "Retrieval sufficiency",
        value: round(summary.averageRetrievalSufficiency, 2),
        lowerIsBetter: false,
      },
      {
        label: "Evidence coverage",
        value: round(summary.averageEvidenceCoverage, 2),
        lowerIsBetter: false,
      },
      {
        label: "Completeness",
        value: round(summary.averageCompleteness, 2),
        lowerIsBetter: false,
      },
      {
        label: "Context noise",
        value: round(summary.averageContextNoise, 2),
        lowerIsBetter: true,
      },
    ],
    citations: {
      emitted: summary.rawCitationCount,
      validated: summary.validatedCitationCount,
      validationRate: round(summary.citationValidationRate),
      casesWithCitations: round(summary.casesEmittingCitations.value),
    },
    byType: groupRows(summary.byType),
    byDocument: groupRows(summary.byDocument),
    byDifficulty: groupRows(summary.byDifficulty),
    economics: {
      // Includes the one-off judge-calibration calls so this figure matches the
      // internal run report rather than quietly excluding harness overhead.
      totalCostUsd: round(
        summary.totalCostUsd === null
          ? null
          : summary.totalCostUsd + calibrationCostUsd,
        4,
      ),
      perCaseMeanUsd: round(summary.costPerCase.mean, 5),
      perCaseP95Usd: round(summary.costPerCase.p95, 5),
      totalTokens:
        summary.ledgerUsage.totalTokens + (calibrationUsage?.totalTokens ?? 0),
      freshInputTokens:
        summary.ledgerUsage.promptTokens -
        summary.ledgerUsage.cachedPromptTokens +
        ((calibrationUsage?.promptTokens ?? 0) -
          (calibrationUsage?.cachedPromptTokens ?? 0)),
      cachedInputTokens:
        summary.ledgerUsage.cachedPromptTokens +
        (calibrationUsage?.cachedPromptTokens ?? 0),
      reasoningTokens:
        summary.ledgerUsage.reasoningTokens +
        (calibrationUsage?.reasoningTokens ?? 0),
      outputTokens:
        summary.ledgerUsage.completionTokens -
        summary.ledgerUsage.reasoningTokens +
        ((calibrationUsage?.completionTokens ?? 0) -
          (calibrationUsage?.reasoningTokens ?? 0)),
      totalCalls: summary.totalCalls + calibrationCalls.length,
      stages: summary.stageRollups.map((rollup) => ({
        key: rollup.stage,
        label: STAGE_LABEL[rollup.stage],
        calls: rollup.calls,
        costUsd: round(rollup.costUsd, 5),
        inputTokens: rollup.usage.promptTokens,
        cachedTokens: rollup.usage.cachedPromptTokens,
        reasoningTokens: rollup.usage.reasoningTokens,
        outputTokens: rollup.usage.completionTokens,
      })),
    },
    latency: {
      retrieval: {
        p50: round(summary.retrievalLatency.p50, 0),
        p95: round(summary.retrievalLatency.p95, 0),
      },
      generation: {
        p50: round(summary.answerLatency.p50, 0),
        p95: round(summary.answerLatency.p95, 0),
      },
      judging: {
        p50: round(summary.judgeLatency.p50, 0),
        p95: round(summary.judgeLatency.p95, 0),
      },
    },
  };
}

export async function publishSnapshot(runIdOrPrefix?: string) {
  const directories = (await readdir(RUNS_DIR)).sort();
  const match = runIdOrPrefix
    ? directories.find(
        (directory) =>
          directory === runIdOrPrefix || directory.startsWith(runIdOrPrefix),
      )
    : directories.at(-1);
  if (!match) {
    throw new Error(
      runIdOrPrefix
        ? `Could not find run ${runIdOrPrefix}`
        : "No runs found to publish",
    );
  }

  const runDir = path.join(RUNS_DIR, match);
  const manifest = JSON.parse(
    await readFile(path.join(runDir, "run.json"), "utf8"),
  ) as RunManifest;
  const seen = new Map<string, EvaluationResult>();
  for (const line of (
    await readFile(path.join(runDir, "results.jsonl"), "utf8")
  )
    .split("\n")
    .filter(Boolean)) {
    const result = JSON.parse(line) as EvaluationResult;
    seen.set(result.caseId, result);
  }
  const results = [...seen.values()];
  const snapshot = buildSnapshot(manifest, summarizeResults(results), results);

  await mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true });
  await writeFile(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Published ${match} -> ${SNAPSHOT_PATH}`);
}
