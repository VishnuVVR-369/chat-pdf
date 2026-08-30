import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  FAILURE_BUCKETS,
  STAGE_LABEL,
  costOfCall,
  pricingFor,
  summarizeResults,
  type CaseOutcome,
  type Distribution,
  type EvaluationSummary,
  type FailureBucket,
  type RateWithInterval,
  type StageRollup,
} from "./metrics";
import type {
  EvaluationResult,
  ModelCallStage,
  RunManifest,
  TokenUsage,
} from "./types";

/** Small money values need more precision than large ones. */
function money(value: number | null | undefined) {
  if (value === null || value === undefined) return "n/a";
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(5)}`;
  if (value < 1) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function ms(value: number | null | undefined) {
  if (value === null || value === undefined) return "n/a";
  if (value < 1_000) return `${Math.round(value)} ms`;
  if (value < 60_000) return `${(value / 1_000).toFixed(1)} s`;
  const minutes = Math.floor(value / 60_000);
  return `${minutes}m ${Math.round((value % 60_000) / 1_000)}s`;
}

function tokens(value: number | null | undefined) {
  if (value === null || value === undefined) return "n/a";
  if (value < 1_000) return String(value);
  if (value < 1_000_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${(value / 1_000_000).toFixed(2)}M`;
}

function integer(value: number) {
  return value.toLocaleString("en-US");
}

function percent(value: number | null) {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function score(value: number | null) {
  return value === null ? "n/a" : value.toFixed(2);
}

function rateText(rate: RateWithInterval) {
  if (rate.value === null) return "n/a";
  const interval = rate.interval
    ? ` (95% CI ${percent(rate.interval.low)}-${percent(rate.interval.high)})`
    : "";
  return `${percent(rate.value)}${interval}, n=${rate.total}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const BUCKET_LABEL = new Map(
  FAILURE_BUCKETS.map((bucket) => [bucket.key, bucket.label]),
);

/* ─── Markdown summary ───────────────────────────────────────────── */

type GroupMetrics = {
  count: number;
  retrievalPassRate: number | null;
  contentPassRate: number | null;
  citationPassRate: number | null;
  endToEndPassRate: number | null;
};

function groupTable(groups: Record<string, GroupMetrics>) {
  return Object.entries(groups)
    .map(([name, metrics]) =>
      [
        `| ${name}`,
        `${metrics.count}`,
        percent(metrics.retrievalPassRate),
        percent(metrics.contentPassRate),
        percent(metrics.citationPassRate),
        `${percent(metrics.endToEndPassRate)} |`,
      ].join(" | "),
    )
    .join("\n");
}

function markdownReport(
  manifest: RunManifest,
  summary: EvaluationSummary,
  costLine: string,
  totalRecordedTokens: number,
) {
  const failureRows = FAILURE_BUCKETS.filter(
    ({ key }) => summary.failureCounts[key] > 0,
  )
    .sort((a, b) => summary.failureCounts[b.key] - summary.failureCounts[a.key])
    .map(
      ({ key, label, description }) =>
        `| ${label} | ${summary.failureCounts[key]} | ${description} |`,
    )
    .join("\n");

  const failingCases = summary.outcomes.filter(
    (outcome) => outcome.failureBucket !== null,
  );

  return `# Evaluation run ${manifest.runId}

Started: ${manifest.startedAt}
Completed: ${manifest.completedAt ?? "in progress"}
Git SHA: ${manifest.gitSha}${manifest.dirtyWorktree ? " (dirty worktree)" : ""}
Dataset: ${manifest.datasetVersion} (${manifest.caseCount} cases)
Convex deployment: ${manifest.convexDeployment}
Answer model: ${manifest.answerModel}
Judge model: ${manifest.judgeModel} (${manifest.judgePasses} passes)

## Quality gates

Each gate is derived independently from the judge's dimension scores, so one
broken subsystem cannot collapse the whole scoreboard.

| Gate | Rate |
| --- | --- |
| Retrieval | ${rateText(summary.retrievalPassRate)} |
| Content | ${rateText(summary.contentPassRate)} |
| Citations | ${rateText(summary.citationPassRate)} |
| Behavior | ${rateText(summary.behaviorPassRate)} |
| **End-to-end** | **${rateText(summary.endToEndPassRate)}** |

Completed ${summary.completedCases}/${summary.requestedCases} cases, ${summary.errorCases} system errors.

## Where the failures are

${
  failureRows
    ? `| Bucket | Cases | What it means |\n| --- | ---: | --- |\n${failureRows}`
    : "No failures."
}

## Judge dimension averages

| Dimension | Score | Direction |
| --- | ---: | --- |
| Retrieval sufficiency | ${score(summary.averageRetrievalSufficiency)}/4 | higher is better |
| Evidence coverage | ${score(summary.averageEvidenceCoverage)}/4 | higher is better |
| Context noise | ${score(summary.averageContextNoise)}/4 | **lower is better** |
| Answer correctness | ${score(summary.averageAnswerCorrectness)}/4 | higher is better |
| Completeness | ${score(summary.averageCompleteness)}/4 | higher is better |
| Groundedness | ${score(summary.averageGroundedness)}/4 | higher is better |
| Citation correctness | ${score(summary.averageCitationCorrectness)}/4 | higher is better |

## Citation behavior

| Metric | Value |
| --- | ---: |
| Cases that emitted any citation | ${rateText(summary.casesEmittingCitations)} |
| Citations emitted | ${summary.rawCitationCount} |
| Citations that survived deterministic validation | ${summary.validatedCitationCount} |
| Validation rate | ${percent(summary.citationValidationRate)} |

## Behavior checks

| Metric | Value |
| --- | ---: |
| Page-scope compliance | ${percent(summary.pageScopeComplianceRate)} |
| Unanswerable abstention accuracy | ${percent(summary.unanswerableAbstentionAccuracy)} |
| Judge agreement | ${percent(summary.judgeAgreementRate)} |
| Adjudication rate | ${percent(summary.adjudicationRate)} |

## By case type

| Type | Cases | Retrieval | Content | Citations | End-to-end |
| --- | ---: | ---: | ---: | ---: | ---: |
${groupTable(summary.byType)}

## By document

| Document | Cases | Retrieval | Content | Citations | End-to-end |
| --- | ---: | ---: | ---: | ---: | ---: |
${groupTable(summary.byDocument)}

## By difficulty

| Difficulty | Cases | Retrieval | Content | Citations | End-to-end |
| --- | ---: | ---: | ---: | ---: | ---: |
${groupTable(summary.byDifficulty)}

## Run economics

| Metric | Value |
| --- | ---: |
| Total cost | ${costLine} |
| Cost per case (mean / p50 / p95) | ${money(summary.costPerCase.mean)} / ${money(summary.costPerCase.p50)} / ${money(summary.costPerCase.p95)} |
| Tokens (total) | ${integer(totalRecordedTokens)} |
| Fresh input / cached input | ${integer(summary.ledgerUsage.promptTokens - summary.ledgerUsage.cachedPromptTokens)} / ${integer(summary.ledgerUsage.cachedPromptTokens)} |
| Hidden reasoning / visible output | ${integer(summary.ledgerUsage.reasoningTokens)} / ${integer(summary.ledgerUsage.completionTokens - summary.ledgerUsage.reasoningTokens)} |
| Billable API calls | ${integer(summary.totalCalls)} |

### Cost and tokens by stage

| Stage | Calls | Input | Cached | Reasoning | Output | Cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${summary.stageRollups
  .map(
    (rollup) =>
      `| ${rollup.label} | ${rollup.calls} | ${integer(rollup.usage.promptTokens)} | ${integer(rollup.usage.cachedPromptTokens)} | ${integer(rollup.usage.reasoningTokens)} | ${integer(rollup.usage.completionTokens)} | ${rollup.hasUnpriced ? "unpriced" : money(rollup.costUsd)} |`,
  )
  .join("\n")}

${
  summary.unpricedModels.length
    ? `Unpriced models (tokens counted, cost excluded): ${summary.unpricedModels.join(", ")}.`
    : ""
}${
    summary.unverifiedModels.length
      ? `\nUnverified rates: ${summary.unverifiedModels.join(", ")}.`
      : ""
  }

## Latency

| Phase | n | mean | p50 | p95 | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| Retrieval | ${summary.retrievalLatency.count} | ${ms(summary.retrievalLatency.mean)} | ${ms(summary.retrievalLatency.p50)} | ${ms(summary.retrievalLatency.p95)} | ${ms(summary.retrievalLatency.max)} |
| Answer generation | ${summary.answerLatency.count} | ${ms(summary.answerLatency.mean)} | ${ms(summary.answerLatency.p50)} | ${ms(summary.answerLatency.p95)} | ${ms(summary.answerLatency.max)} |
| Judging (per case) | ${summary.judgeLatency.count} | ${ms(summary.judgeLatency.mean)} | ${ms(summary.judgeLatency.p50)} | ${ms(summary.judgeLatency.p95)} | ${ms(summary.judgeLatency.max)} |
| Case wall-clock | ${summary.wallClockPerCase.count} | ${ms(summary.wallClockPerCase.mean)} | ${ms(summary.wallClockPerCase.p50)} | ${ms(summary.wallClockPerCase.p95)} | ${ms(summary.wallClockPerCase.max)} |

## Reliability

| Metric | Value |
| --- | ---: |
| Calls that needed a retry | ${integer(summary.totalRetries)} |
| Time lost to rate-limit backoff | ${ms(summary.totalRetryWaitMs)} |
| Calls with no usage reported | ${integer(summary.missingUsageCallCount)} |

## Failing cases

${
  failingCases
    .map(
      (outcome) =>
        `- **${outcome.caseId}** (${BUCKET_LABEL.get(outcome.failureBucket!) ?? outcome.failureBucket}): ` +
        `${outcome.result.error ?? outcome.result.judgment?.answer.rationale ?? "failed"}`,
    )
    .join("\n") || "None."
}
`;
}

/* ─── Economics, latency and reliability ─────────────────────────── */

const STAGE_COLORS: Record<ModelCallStage, string> = {
  embedding: "#64748b",
  answer: "#0ea5e9",
  judge_retrieval: "#8b5cf6",
  judge_answer: "#a855f7",
  adjudication: "#f59e0b",
};

function stageStyles() {
  return Object.entries(STAGE_COLORS)
    .map(
      ([key, color]) =>
        `.sseg-${key}{background:${color}}.sdot-${key}{background:${color}}`,
    )
    .join("");
}

/** A proportional stacked bar. Segments below 1.5% still get a visible sliver. */
function stackedBar(
  segments: Array<{
    key: string;
    label: string;
    value: number;
    className: string;
  }>,
) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (total <= 0) return `<div class="stack empty-stack"></div>`;
  return `<div class="stack">${segments
    .filter((segment) => segment.value > 0)
    .map(
      (segment) =>
        `<span class="seg ${segment.className}" style="width:${Math.max(
          1.5,
          (segment.value / total) * 100,
        ).toFixed(2)}%" title="${escapeHtml(segment.label)}"></span>`,
    )
    .join("")}</div>`;
}

function distributionRow(
  label: string,
  distribution: Distribution,
  format: (value: number | null) => string,
) {
  return `<tr>
    <td>${escapeHtml(label)}</td>
    <td class="num">${distribution.count}</td>
    <td class="num">${format(distribution.mean)}</td>
    <td class="num">${format(distribution.p50)}</td>
    <td class="num strong">${format(distribution.p95)}</td>
    <td class="num">${format(distribution.max)}</td>
  </tr>`;
}

function usageComposition(usage: TokenUsage) {
  const fresh = usage.promptTokens - usage.cachedPromptTokens;
  const output = usage.completionTokens - usage.reasoningTokens;
  return stackedBar([
    {
      key: "fresh",
      label: `Fresh input ${integer(fresh)}`,
      value: fresh,
      className: "tok-fresh",
    },
    {
      key: "cached",
      label: `Cached input ${integer(usage.cachedPromptTokens)}`,
      value: usage.cachedPromptTokens,
      className: "tok-cached",
    },
    {
      key: "reasoning",
      label: `Reasoning ${integer(usage.reasoningTokens)}`,
      value: usage.reasoningTokens,
      className: "tok-reasoning",
    },
    {
      key: "output",
      label: `Visible output ${integer(output)}`,
      value: output,
      className: "tok-output",
    },
  ]);
}

function economicsSection(summary: EvaluationSummary) {
  const rollups: StageRollup[] = summary.stageRollups;
  const totalCost = summary.totalCostUsd ?? 0;
  const bar = stackedBar(
    rollups.map((rollup) => ({
      key: rollup.stage,
      label: `${rollup.label} ${money(rollup.costUsd)}`,
      value: rollup.costUsd ?? 0,
      className: `sseg-${rollup.stage}`,
    })),
  );
  const rows = rollups
    .map((rollup) => {
      const share =
        rollup.costUsd === null || totalCost === 0
          ? null
          : rollup.costUsd / totalCost;
      return `<tr>
        <td><span class="dot sdot-${rollup.stage}"></span>${escapeHtml(rollup.label)}</td>
        <td class="num">${integer(rollup.calls)}</td>
        <td class="num">${tokens(rollup.usage.promptTokens)}</td>
        <td class="num">${tokens(rollup.usage.cachedPromptTokens)}</td>
        <td class="num">${tokens(rollup.usage.reasoningTokens)}</td>
        <td class="num">${tokens(rollup.usage.completionTokens)}</td>
        <td class="num strong">${rollup.hasUnpriced ? "unpriced" : money(rollup.costUsd)}</td>
        <td class="num">${share === null ? "-" : percent(share)}</td>
      </tr>`;
    })
    .join("");

  const caveats: string[] = [];
  if (summary.unpricedModels.length) {
    caveats.push(
      `No published rate for ${summary.unpricedModels.join(", ")}: their tokens are counted but contribute $0 to the total.`,
    );
  }
  if (summary.unverifiedModels.length) {
    caveats.push(
      `Rates for ${summary.unverifiedModels.join(", ")} are carried over from the previous table and are not confirmed.`,
    );
  }
  if (summary.missingUsageCallCount > 0) {
    caveats.push(
      `${summary.missingUsageCallCount} call(s) returned no usage block, so their tokens are unknown rather than zero and the total is a floor.`,
    );
  }

  return `<div class="panel">
    <div class="econ-head">
      <div><div class="econ-label">Total run cost</div><div class="econ-value">${money(summary.totalCostUsd)}</div></div>
      <div><div class="econ-label">Per case (mean)</div><div class="econ-value">${money(summary.costPerCase.mean)}</div></div>
      <div><div class="econ-label">Per case (p95)</div><div class="econ-value">${money(summary.costPerCase.p95)}</div></div>
      <div><div class="econ-label">Tokens</div><div class="econ-value">${tokens(summary.ledgerUsage.totalTokens)}</div></div>
      <div><div class="econ-label">API calls</div><div class="econ-value">${integer(summary.totalCalls)}</div></div>
    </div>
    ${bar}
    <table class="econ-table">
      <thead><tr>
        <th>Stage</th><th class="num">Calls</th><th class="num">Input</th>
        <th class="num">Cached</th><th class="num">Reasoning</th><th class="num">Output</th>
        <th class="num">Cost</th><th class="num">Share</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="composition">
      <div class="comp-title">Token composition across the run</div>
      ${usageComposition(summary.ledgerUsage)}
      <div class="legend">
        <span><i class="sw tok-fresh"></i>Fresh input ${tokens(summary.ledgerUsage.promptTokens - summary.ledgerUsage.cachedPromptTokens)}</span>
        <span><i class="sw tok-cached"></i>Cached input ${tokens(summary.ledgerUsage.cachedPromptTokens)}</span>
        <span><i class="sw tok-reasoning"></i>Hidden reasoning ${tokens(summary.ledgerUsage.reasoningTokens)}</span>
        <span><i class="sw tok-output"></i>Visible output ${tokens(summary.ledgerUsage.completionTokens - summary.ledgerUsage.reasoningTokens)}</span>
      </div>
    </div>
    ${caveats.length ? `<ul class="caveats">${caveats.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>` : ""}
  </div>`;
}

function latencySection(summary: EvaluationSummary) {
  const stageRows = summary.stageRollups
    .map((rollup) => distributionRow(rollup.label, rollup.latency, ms))
    .join("");
  return `<div class="panel">
    <table>
      <thead><tr><th>Phase</th><th class="num">n</th><th class="num">mean</th><th class="num">p50</th><th class="num">p95</th><th class="num">max</th></tr></thead>
      <tbody>
        ${distributionRow("Retrieval (hybrid search)", summary.retrievalLatency, ms)}
        ${distributionRow("Answer generation", summary.answerLatency, ms)}
        ${distributionRow("Judging (all calls per case)", summary.judgeLatency, ms)}
        <tr class="divider"><td colspan="6">Per API call</td></tr>
        ${stageRows}
        <tr class="divider"><td colspan="6">Per case</td></tr>
        ${distributionRow("Sum of API latencies", summary.apiLatencyPerCase, ms)}
        ${distributionRow("Wall-clock (includes queueing)", summary.wallClockPerCase, ms)}
        ${distributionRow("Context sent to the model (tokens)", summary.contextTokens, (v) => (v === null ? "n/a" : integer(Math.round(v))))}
      </tbody>
    </table>
    <p class="note">Wall-clock exceeds the sum of API latencies because cases run concurrently and queue behind one another.</p>
  </div>`;
}

function reliabilitySection(summary: EvaluationSummary) {
  return `<div class="panel grid-2">
    <table>
      <tr><td>API calls made</td><td class="num">${integer(summary.totalCalls)}</td></tr>
      <tr><td>Calls that needed a retry</td><td class="num">${integer(summary.totalRetries)}</td></tr>
      <tr><td>Time lost to rate-limit backoff</td><td class="num">${ms(summary.totalRetryWaitMs)}</td></tr>
      <tr><td>Calls with no usage reported</td><td class="num">${integer(summary.missingUsageCallCount)}</td></tr>
    </table>
    <table>
      <tr><td>Cases completed</td><td class="num">${summary.completedCases}/${summary.requestedCases}</td></tr>
      <tr><td>System errors</td><td class="num">${summary.errorCases}</td></tr>
      <tr><td>Judge agreement</td><td class="num">${percent(summary.judgeAgreementRate)}</td></tr>
      <tr><td>Adjudications triggered</td><td class="num">${percent(summary.adjudicationRate)}</td></tr>
    </table>
  </div>`;
}

/** The N most expensive cases, as a ranked bar chart. */
function costRanking(summary: EvaluationSummary, limit = 12) {
  const ranked = [...summary.outcomes]
    .filter((outcome) => outcome.economics.costUsd !== null)
    .sort((a, b) => (b.economics.costUsd ?? 0) - (a.economics.costUsd ?? 0))
    .slice(0, limit);
  if (ranked.length === 0) return `<p class="empty">No priced cases.</p>`;
  const max = ranked[0]!.economics.costUsd ?? 1;
  return `<div class="panel">
    ${ranked
      .map(
        (outcome) => `<div class="rank-row">
        <span class="rank-id">${escapeHtml(outcome.caseId)}</span>
        <span class="rank-track"><span class="rank-fill ${outcome.failureBucket ? "bad" : "good"}" style="width:${(((outcome.economics.costUsd ?? 0) / max) * 100).toFixed(1)}%"></span></span>
        <span class="rank-value">${money(outcome.economics.costUsd)}</span>
        <span class="rank-meta">${tokens(outcome.economics.usage.totalTokens)} tok · ${ms(outcome.economics.wallClockMs)}</span>
      </div>`,
      )
      .join("")}
    <p class="note">Cost is dominated by judge reasoning tokens, so the most expensive cases are usually the most contested ones, not the hardest questions.</p>
  </div>`;
}

/* ─── HTML report ────────────────────────────────────────────────── */

function gateCard(label: string, hint: string, rate: RateWithInterval) {
  const value = rate.value;
  const tone =
    value === null
      ? "muted"
      : value >= 0.8
        ? "good"
        : value >= 0.5
          ? "warn"
          : "bad";
  const barWidth = value === null ? 0 : value * 100;
  const interval =
    rate.interval && value !== null
      ? `<div class="ci"><span class="ci-track"><span class="ci-span" style="left:${(
          rate.interval.low * 100
        ).toFixed(
          1,
        )}%;width:${((rate.interval.high - rate.interval.low) * 100).toFixed(1)}%"></span><span class="ci-point" style="left:${barWidth.toFixed(1)}%"></span></span>
        <span class="ci-text">95% CI ${percent(rate.interval.low)}-${percent(rate.interval.high)}</span></div>`
      : "";
  return `<div class="card ${tone}">
    <div class="card-label">${escapeHtml(label)}</div>
    <div class="card-value">${percent(value)}</div>
    <div class="card-hint">${escapeHtml(hint)} · n=${rate.total}</div>
    ${interval}
  </div>`;
}

function failureChart(summary: EvaluationSummary) {
  const buckets = FAILURE_BUCKETS.filter(
    ({ key }) => summary.failureCounts[key] > 0,
  ).sort((a, b) => summary.failureCounts[b.key] - summary.failureCounts[a.key]);
  const failures = buckets.reduce(
    (sum, { key }) => sum + summary.failureCounts[key],
    0,
  );
  if (failures === 0) {
    return `<p class="empty">Every completed case passed all four gates.</p>`;
  }
  const segments = buckets
    .map(
      ({ key, label }) =>
        `<span class="seg seg-${key}" style="width:${(
          (summary.failureCounts[key] / failures) *
          100
        ).toFixed(
          2,
        )}%" title="${escapeHtml(label)}: ${summary.failureCounts[key]}"></span>`,
    )
    .join("");
  const rows = buckets
    .map(
      ({ key, label, description }) => `<tr>
        <td><span class="dot dot-${key}"></span>${escapeHtml(label)}</td>
        <td class="num">${summary.failureCounts[key]}</td>
        <td class="num">${((summary.failureCounts[key] / failures) * 100).toFixed(0)}%</td>
        <td class="desc">${escapeHtml(description)}</td>
      </tr>`,
    )
    .join("");
  return `<div class="stack">${segments}</div>
    <table class="bucket-table">
      <thead><tr><th>Bucket</th><th class="num">Cases</th><th class="num">Share</th><th>What it means</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function dimensionBar(
  label: string,
  value: number | null,
  lowerIsBetter = false,
) {
  if (value === null) {
    return `<div class="dim"><div class="dim-head"><span>${escapeHtml(label)}</span><span class="dim-value">n/a</span></div></div>`;
  }
  const goodness = lowerIsBetter ? 1 - value / 4 : value / 4;
  const tone = goodness >= 0.75 ? "good" : goodness >= 0.5 ? "warn" : "bad";
  return `<div class="dim">
    <div class="dim-head">
      <span>${escapeHtml(label)}${lowerIsBetter ? ' <em class="polarity">lower is better</em>' : ""}</span>
      <span class="dim-value">${value.toFixed(2)}<small>/4</small></span>
    </div>
    <div class="dim-track"><div class="dim-fill ${tone}" style="width:${((value / 4) * 100).toFixed(1)}%"></div></div>
  </div>`;
}

function breakdownTable(title: string, groups: Record<string, GroupMetrics>) {
  const rows = Object.entries(groups)
    .map(([name, metrics]) => {
      if (metrics.count === 0) {
        return `<tr class="muted-row"><td>${escapeHtml(name)}</td><td class="num">0</td><td class="num" colspan="4">not measured</td></tr>`;
      }
      const cell = (value: number | null) =>
        `<td class="num ${value !== null && value >= 0.8 ? "good-text" : value !== null && value < 0.5 ? "bad-text" : ""}">${percent(value)}</td>`;
      return `<tr>
        <td>${escapeHtml(name)}</td>
        <td class="num">${metrics.count}</td>
        ${cell(metrics.retrievalPassRate)}
        ${cell(metrics.contentPassRate)}
        ${cell(metrics.citationPassRate)}
        ${cell(metrics.endToEndPassRate)}
      </tr>`;
    })
    .join("");
  return `<div class="breakdown">
    <h3>${escapeHtml(title)}</h3>
    <table>
      <thead><tr><th>${escapeHtml(title)}</th><th class="num">Cases</th><th class="num">Retrieval</th><th class="num">Content</th><th class="num">Citations</th><th class="num">End-to-end</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function costOfCallSafe(call: Parameters<typeof costOfCall>[0]) {
  return costOfCall(call);
}

function gatePill(label: string, passed: boolean) {
  return `<span class="pill ${passed ? "pill-pass" : "pill-fail"}">${escapeHtml(label)}</span>`;
}

function caseCard(outcome: CaseOutcome) {
  const { result, evaluationCase } = outcome;
  const trace = result.trace;
  const judgment = result.judgment;
  const bucket = outcome.failureBucket;
  const status = bucket === null ? "pass" : "fail";

  const evidenceList =
    evaluationCase.evidence.length === 0
      ? `<p class="empty">No supporting evidence: this question is expected to be unanswerable.</p>`
      : evaluationCase.evidence
          .map(
            (item) =>
              `<blockquote><span class="page">p.${item.pageNumber}</span>${escapeHtml(item.quote)}</blockquote>`,
          )
          .join("");

  const requiredFacts = evaluationCase.requiredFacts.length
    ? `<ul>${evaluationCase.requiredFacts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join("")}</ul>`
    : `<p class="empty">None.</p>`;

  const gradeBySource = new Map(
    (judgment?.retrieval.chunkGrades ?? []).map((grade) => [
      grade.sourceId,
      grade,
    ]),
  );
  const goldPages = new Set(
    evaluationCase.evidence.map((item) => item.pageNumber),
  );

  const chunks = (trace?.retrieval.finalChunks ?? [])
    .map((chunk) => {
      const grade = gradeBySource.get(chunk.sourceId);
      const relevance = grade?.relevance ?? 0;
      const pages = [
        ...new Set(chunk.pageSpans.map((span) => span.pageNumber)),
      ];
      const hitsGold = pages.some((page) => goldPages.has(page));
      return `<div class="chunk rel-${relevance}${hitsGold ? " gold-hit" : ""}">
        <div class="chunk-head">
          <span class="src">${escapeHtml(chunk.sourceId)}</span>
          <span class="pages">p.${chunk.startPageNumber}${chunk.endPageNumber !== chunk.startPageNumber ? `-${chunk.endPageNumber}` : ""}</span>
          ${hitsGold ? '<span class="badge badge-gold">gold page</span>' : ""}
          <span class="badge badge-rel">relevance ${relevance}/3</span>
          <span class="badge">${chunk.hybridScore > 0 ? `score ${chunk.hybridScore.toFixed(3)}` : "neighbor"}</span>
        </div>
        ${grade ? `<div class="chunk-note">${escapeHtml(grade.rationale)}</div>` : ""}
        <details><summary>chunk text</summary><pre>${escapeHtml(chunk.text)}</pre></details>
      </div>`;
    })
    .join("");

  const rawCitations = trace?.generation.rawCitations ?? [];
  const validated = trace?.generation.validatedCitations ?? [];
  const validatedQuotes = new Set(validated.map((citation) => citation.quote));
  const citationBlock = rawCitations.length
    ? rawCitations
        .map((citation) => {
          const ok = validatedQuotes.has(citation.quote);
          return `<blockquote class="${ok ? "cite-ok" : "cite-bad"}">
            <span class="page">${escapeHtml(citation.sourceId)}</span>
            ${escapeHtml(citation.quote)}
            <span class="badge ${ok ? "badge-ok" : "badge-bad"}">${ok ? "verified against source text" : "did not match any source"}</span>
          </blockquote>`;
        })
        .join("")
    : `<p class="empty">The model returned no citations.</p>`;

  const dimensions = judgment
    ? `<table class="dims">
        <tr><th>Correctness</th><td>${judgment.answer.correctness}/4</td>
            <th>Completeness</th><td>${judgment.answer.completeness}/4</td></tr>
        <tr><th>Groundedness</th><td>${judgment.answer.groundedness}/4</td>
            <th>Relevance</th><td>${judgment.answer.relevance}/4</td></tr>
        <tr><th>Citation correctness</th><td>${judgment.answer.citationCorrectness}/4</td>
            <th>Citation completeness</th><td>${judgment.answer.citationCompleteness}/4</td></tr>
        <tr><th>Context sufficiency</th><td>${judgment.retrieval.contextSufficiency}/4</td>
            <th>Evidence coverage</th><td>${judgment.retrieval.evidenceCoverage}/4</td></tr>
        <tr><th>Context noise <em class="polarity">lower is better</em></th><td>${judgment.retrieval.contextNoise}/4</td>
            <th>Abstention</th><td>${escapeHtml(judgment.answer.abstention)}</td></tr>
      </table>`
    : "";

  const econ = outcome.economics;
  const econStrip = `<div class="econ-strip">
    <span title="Total cost of every API call this case made"><b>${money(econ.costUsd)}</b> cost</span>
    <span title="Prompt + completion tokens across all calls"><b>${tokens(econ.usage.totalTokens)}</b> tokens</span>
    <span title="Hidden reasoning tokens, billed at the output rate"><b>${tokens(econ.usage.reasoningTokens)}</b> reasoning</span>
    <span title="Prompt tokens served from cache"><b>${tokens(econ.usage.cachedPromptTokens)}</b> cached</span>
    <span title="Number of billable API calls"><b>${econ.calls}</b> calls</span>
    <span title="Retrieval latency"><b>${ms(econ.retrievalLatencyMs)}</b> retrieval</span>
    <span title="Answer generation latency"><b>${ms(econ.answerLatencyMs)}</b> generation</span>
    <span title="Total judging latency"><b>${ms(econ.judgeLatencyMs)}</b> judging</span>
    <span title="Wall-clock including time queued behind other cases"><b>${ms(econ.wallClockMs)}</b> wall-clock</span>
    ${econ.retries > 0 ? `<span class="warn-chip" title="Rate-limit retries"><b>${econ.retries}</b> retries (${ms(econ.retryWaitMs)} waiting)</span>` : ""}
  </div>`;

  const callRows = (result.modelCalls ?? [])
    .map(
      (mc) => `<tr>
      <td><span class="dot sdot-${mc.stage}"></span>${escapeHtml(STAGE_LABEL[mc.stage])}</td>
      <td class="mono-cell">${escapeHtml(mc.model)}</td>
      <td class="num">${integer(mc.usage.promptTokens)}</td>
      <td class="num">${integer(mc.usage.cachedPromptTokens)}</td>
      <td class="num">${integer(mc.usage.reasoningTokens)}</td>
      <td class="num">${integer(mc.usage.completionTokens)}</td>
      <td class="num">${ms(mc.latencyMs)}</td>
      <td class="num">${mc.attempts > 1 ? `${mc.attempts}x` : "-"}</td>
      <td class="num">${pricingFor(mc.model) ? money(costOfCallSafe(mc)) : "unpriced"}</td>
    </tr>`,
    )
    .join("");

  const searchText = escapeHtml(
    `${evaluationCase.id} ${evaluationCase.question} ${evaluationCase.documentKey} ${evaluationCase.tags.join(" ")}`.toLowerCase(),
  );

  return `<article class="case ${status}"
      data-status="${status}"
      data-bucket="${bucket ?? "none"}"
      data-type="${escapeHtml(evaluationCase.type)}"
      data-document="${escapeHtml(evaluationCase.documentKey)}"
      data-search="${searchText}"
      data-cost="${econ.costUsd ?? 0}"
      data-tokens="${econ.usage.totalTokens}"
      data-latency="${econ.wallClockMs}">
    <header class="case-head">
      <button class="case-toggle" type="button" aria-expanded="false">
        <span class="chev" aria-hidden="true">▸</span>
        <span class="case-id">${escapeHtml(evaluationCase.id)}</span>
        <span class="case-question">${escapeHtml(evaluationCase.question)}</span>
      </button>
      <div class="case-tags">
        <span class="tag">${escapeHtml(evaluationCase.type)}</span>
        <span class="tag">${escapeHtml(evaluationCase.difficulty)}</span>
        ${bucket ? `<span class="tag tag-bucket dot-bg-${bucket}">${escapeHtml(BUCKET_LABEL.get(bucket) ?? bucket)}</span>` : '<span class="tag tag-pass">pass</span>'}
      </div>
      <div class="case-gates">
        ${gatePill("retrieval", outcome.retrievalPass)}
        ${gatePill("content", outcome.contentPass)}
        ${gatePill("citations", outcome.citationPass)}
        ${gatePill("behavior", outcome.behaviorPass)}
      </div>
    </header>
    ${econStrip}
    <div class="case-body" hidden>
      ${result.error ? `<div class="error-box"><strong>System error</strong><pre>${escapeHtml(result.error)}</pre></div>` : ""}
      <div class="columns">
        <section class="col">
          <h4>Expected</h4>
          <p class="label">Reference answer</p>
          <p class="prose">${escapeHtml(evaluationCase.referenceAnswer)}</p>
          <p class="label">Required facts</p>
          ${requiredFacts}
          <p class="label">Gold evidence</p>
          ${evidenceList}
        </section>
        <section class="col">
          <h4>Retrieved <span class="count">${trace?.retrieval.finalChunks.length ?? 0} chunks</span></h4>
          <p class="label">Query sent to retrieval</p>
          <p class="prose mono">${escapeHtml(trace?.retrieval.query ?? "n/a")}</p>
          ${judgment ? `<p class="label">Retrieval verdict</p><p class="prose">${escapeHtml(judgment.retrieval.rationale)}</p>` : ""}
          ${judgment && judgment.retrieval.missingEvidence.length ? `<p class="label">Missing evidence</p><ul>${judgment.retrieval.missingEvidence.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
          <p class="label">Context window</p>
          ${chunks || '<p class="empty">Nothing was retrieved.</p>'}
        </section>
        <section class="col">
          <h4>Produced</h4>
          <p class="label">Answer</p>
          <p class="prose">${escapeHtml(trace?.generation.answer ?? "n/a")}</p>
          <p class="label">Citations</p>
          ${citationBlock}
          ${judgment ? `<p class="label">Answer verdict</p><p class="prose">${escapeHtml(judgment.answer.rationale)}</p>` : ""}
          <p class="label">Judge scores</p>
          ${dimensions}
        </section>
      </div>
      <div class="calls">
        <p class="label">Billable calls for this case</p>
        <table class="call-table">
          <thead><tr><th>Stage</th><th>Model</th><th class="num">Input</th><th class="num">Cached</th><th class="num">Reasoning</th><th class="num">Output</th><th class="num">Latency</th><th class="num">Tries</th><th class="num">Cost</th></tr></thead>
          <tbody>${callRows || '<tr><td colspan="9" class="empty">No calls recorded.</td></tr>'}</tbody>
        </table>
      </div>
      <details class="raw"><summary>Raw trace JSON</summary><pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre></details>
    </div>
  </article>`;
}

const BUCKET_COLORS: Record<FailureBucket, string> = {
  system_error: "#6b7280",
  page_scope_violation: "#a855f7",
  retrieval_miss: "#dc2626",
  abstention_failure: "#f97316",
  grounding_failure: "#eab308",
  content_failure: "#0ea5e9",
  citation_failure: "#14b8a6",
};

function bucketStyles() {
  return Object.entries(BUCKET_COLORS)
    .map(
      ([key, color]) =>
        `.seg-${key}{background:${color}}.dot-${key}{background:${color}}.dot-bg-${key}{background:${color}22;border-color:${color}}`,
    )
    .join("");
}

function htmlReport(
  manifest: RunManifest,
  summary: EvaluationSummary,
  costLine: string,
  totalRecordedTokens: number,
) {
  const filterButtons = [
    `<button class="filter active" data-filter="all">All (${summary.outcomes.length})</button>`,
    `<button class="filter" data-filter="fail">Failing (${summary.outcomes.filter((outcome) => outcome.failureBucket).length})</button>`,
    `<button class="filter" data-filter="pass">Passing (${summary.outcomes.filter((outcome) => !outcome.failureBucket).length})</button>`,
    ...FAILURE_BUCKETS.filter(({ key }) => summary.failureCounts[key] > 0).map(
      ({ key, label }) =>
        `<button class="filter" data-filter="bucket:${key}"><span class="dot dot-${key}"></span>${escapeHtml(label)} (${summary.failureCounts[key]})</button>`,
    ),
  ].join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Evaluation ${escapeHtml(manifest.runId)}</title>
<style>
:root{
  color-scheme:light dark;
  --bg:#fbfbfa; --panel:#fff; --ink:#1a1a19; --muted:#6b6b66; --line:#e4e4e0;
  --good:#15803d; --warn:#b45309; --bad:#b91c1c;
  --good-bg:#15803d14; --warn-bg:#b4530914; --bad-bg:#b91c1c14;
  --mono:ui-monospace,SFMono-Regular,Menlo,monospace;
}
@media (prefers-color-scheme:dark){:root{
  --bg:#16161a; --panel:#1e1e23; --ink:#ececf0; --muted:#9a9aa4; --line:#32323a;
  --good:#4ade80; --warn:#fbbf24; --bad:#f87171;
  --good-bg:#4ade8018; --warn-bg:#fbbf2418; --bad-bg:#f8717118;
}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
  font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:1500px;margin:0 auto;padding:32px 24px 80px}
h1{font-size:26px;margin:0 0 4px;letter-spacing:-.02em}
h2{font-size:17px;margin:44px 0 14px;letter-spacing:-.01em}
h3{font-size:14px;margin:0 0 10px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.06em}
h4{font-size:13px;margin:0 0 12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.meta{color:var(--muted);font-size:13px;margin:0 0 6px}
.meta code{font-family:var(--mono);font-size:12px}
.banner{margin:18px 0 0;padding:12px 14px;border-radius:9px;border:1px solid var(--line);
  background:var(--warn-bg);color:var(--ink);font-size:13.5px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:18px 0 0}
.card{background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:15px 16px}
.card.good{border-left:3px solid var(--good)} .card.warn{border-left:3px solid var(--warn)}
.card.bad{border-left:3px solid var(--bad)} .card.muted{border-left:3px solid var(--line)}
.card-label{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.card-value{font-size:31px;font-weight:680;letter-spacing:-.03em;margin:5px 0 2px}
.card.good .card-value{color:var(--good)} .card.warn .card-value{color:var(--warn)} .card.bad .card-value{color:var(--bad)}
.card-hint{font-size:12px;color:var(--muted)}
.ci{margin-top:9px}
.ci-track{position:relative;display:block;height:4px;background:var(--line);border-radius:3px}
.ci-span{position:absolute;height:4px;background:currentColor;opacity:.32;border-radius:3px}
.ci-point{position:absolute;width:2px;height:8px;top:-2px;background:currentColor;border-radius:1px}
.card.good .ci-track{color:var(--good)} .card.warn .ci-track{color:var(--warn)} .card.bad .ci-track{color:var(--bad)}
.ci-text{font-size:11px;color:var(--muted);display:block;margin-top:5px;font-variant-numeric:tabular-nums}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:18px 20px}
.stack{display:flex;height:15px;border-radius:5px;overflow:hidden;margin-bottom:16px}
.seg{display:block}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:7px;vertical-align:middle}
table{border-collapse:collapse;width:100%;font-size:13.5px}
th,td{border-bottom:1px solid var(--line);padding:8px 10px;text-align:left}
th{font-weight:600;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.05em}
.num{text-align:right;font-variant-numeric:tabular-nums}
.desc{color:var(--muted)}
.good-text{color:var(--good)} .bad-text{color:var(--bad)}
.muted-row td{color:var(--muted);font-style:italic}
.grid-2{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px}
.dim{margin-bottom:13px}
.dim-head{display:flex;justify-content:space-between;align-items:baseline;font-size:13px;margin-bottom:5px}
.dim-value{font-variant-numeric:tabular-nums;font-weight:640}
.dim-value small{color:var(--muted);font-weight:400}
.dim-track{height:6px;background:var(--line);border-radius:4px;overflow:hidden}
.dim-fill{height:6px;border-radius:4px}
.dim-fill.good{background:var(--good)} .dim-fill.warn{background:var(--warn)} .dim-fill.bad{background:var(--bad)}
.polarity{font-style:normal;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;
  color:var(--warn);background:var(--warn-bg);padding:1px 6px;border-radius:4px;margin-left:6px}
.controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:14px 0 16px}
.filter{font:inherit;font-size:12.5px;padding:6px 12px;border-radius:99px;cursor:pointer;
  border:1px solid var(--line);background:var(--panel);color:var(--ink)}
.filter:hover{border-color:var(--muted)}
.filter.active{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.filter.active .dot{outline:1px solid var(--bg)}
#search{font:inherit;font-size:13px;padding:7px 12px;border-radius:8px;border:1px solid var(--line);
  background:var(--panel);color:var(--ink);min-width:250px;margin-left:auto}
.case{background:var(--panel);border:1px solid var(--line);border-radius:11px;margin-bottom:9px;overflow:hidden}
.case.fail{border-left:3px solid var(--bad)}
.case.pass{border-left:3px solid var(--good)}
.case-head{display:grid;grid-template-columns:1fr auto auto;gap:12px;align-items:center;padding:11px 14px}
.case-toggle{display:flex;align-items:baseline;gap:9px;background:none;border:0;padding:0;cursor:pointer;
  color:inherit;font:inherit;text-align:left;min-width:0}
.chev{color:var(--muted);font-size:11px;transition:transform .12s;flex:none}
.case-toggle[aria-expanded="true"] .chev{transform:rotate(90deg)}
.case-id{font-family:var(--mono);font-size:12px;color:var(--muted);flex:none}
.case-question{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13.5px}
.case-tags{display:flex;gap:6px;flex:none}
.tag{font-size:11px;padding:2px 8px;border-radius:5px;border:1px solid var(--line);color:var(--muted)}
.tag-bucket{color:var(--ink);border-width:1px;border-style:solid}
.tag-pass{color:var(--good);border-color:var(--good)}
.case-gates{display:flex;gap:4px;flex:none}
.pill{font-size:10.5px;padding:2px 7px;border-radius:5px;font-weight:600;letter-spacing:.02em}
.pill-pass{background:var(--good-bg);color:var(--good)}
.pill-fail{background:var(--bad-bg);color:var(--bad)}
.case-body{border-top:1px solid var(--line);padding:16px 14px}
.columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px}
.col{min-width:0}
.count{text-transform:none;letter-spacing:0;font-weight:400}
.label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:14px 0 5px;font-weight:600}
.col > .label:first-of-type{margin-top:0}
.prose{margin:0;font-size:13.5px}
.mono{font-family:var(--mono);font-size:12px;color:var(--muted)}
.col ul{margin:0;padding-left:18px;font-size:13px}
.col li{margin-bottom:3px}
blockquote{margin:0 0 7px;padding:8px 10px;border-left:2px solid var(--line);
  background:var(--bg);border-radius:0 6px 6px 0;font-size:12.5px}
.page{font-family:var(--mono);font-size:11px;color:var(--muted);margin-right:7px}
.cite-ok{border-left-color:var(--good)} .cite-bad{border-left-color:var(--bad)}
.chunk{border:1px solid var(--line);border-radius:8px;padding:9px 10px;margin-bottom:7px;background:var(--bg)}
.chunk.rel-2,.chunk.rel-3{border-color:var(--good);background:var(--good-bg)}
.chunk.gold-hit{box-shadow:inset 3px 0 0 var(--good)}
.chunk-head{display:flex;gap:7px;align-items:center;flex-wrap:wrap;font-size:11.5px}
.src{font-family:var(--mono);font-weight:700}
.pages{color:var(--muted);font-family:var(--mono)}
.badge{font-size:10.5px;padding:1px 6px;border-radius:4px;background:var(--line);color:var(--muted)}
.badge-gold{background:var(--good-bg);color:var(--good);font-weight:600}
.badge-ok{background:var(--good-bg);color:var(--good)}
.badge-bad{background:var(--bad-bg);color:var(--bad)}
.chunk-note{font-size:12px;color:var(--muted);margin-top:6px}
.chunk details{margin-top:6px}
summary{cursor:pointer;font-size:12px;color:var(--muted)}
pre{white-space:pre-wrap;word-break:break-word;max-height:340px;overflow:auto;
  font-family:var(--mono);font-size:11.5px;background:var(--bg);padding:9px;border-radius:6px;margin:6px 0 0}
.dims{font-size:12.5px;margin-top:4px}
.dims th{text-transform:none;letter-spacing:0;font-size:12px;font-weight:500;color:var(--muted)}
.dims td{font-variant-numeric:tabular-nums;font-weight:640;width:56px}
.empty{color:var(--muted);font-style:italic;font-size:13px;margin:0}
.error-box{background:var(--bad-bg);border:1px solid var(--bad);border-radius:8px;padding:11px;margin-bottom:14px;font-size:13px}
.raw{margin-top:16px}
.no-match{color:var(--muted);font-style:italic;padding:24px;text-align:center}
${bucketStyles()}
${stageStyles()}
.econ-head{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:14px;margin-bottom:16px}
.econ-label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.econ-value{font-size:23px;font-weight:680;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.econ-table{margin-top:14px}
.strong{font-weight:680}
.empty-stack{background:var(--line)}
.composition{margin-top:20px}
.comp-title{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:8px;font-weight:600}
.legend{display:flex;flex-wrap:wrap;gap:14px;margin-top:9px;font-size:12px;color:var(--muted)}
.legend .sw{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:middle}
.tok-fresh{background:#0ea5e9}.tok-cached{background:#22c55e}.tok-reasoning{background:#f59e0b}.tok-output{background:#8b5cf6}
.caveats{margin:16px 0 0;padding-left:18px;font-size:12.5px;color:var(--warn)}
.caveats li{margin-bottom:4px}
.note{font-size:12px;color:var(--muted);margin:12px 0 0;font-style:italic}
tr.divider td{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);
  background:var(--bg);font-weight:600;padding-top:12px}
.rank-row{display:grid;grid-template-columns:230px 1fr 74px 150px;gap:11px;align-items:center;
  font-size:12.5px;margin-bottom:6px}
.rank-id{font-family:var(--mono);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rank-track{background:var(--line);height:9px;border-radius:5px;overflow:hidden}
.rank-fill{display:block;height:9px;border-radius:5px}
.rank-fill.good{background:var(--good)}.rank-fill.bad{background:var(--bad)}
.rank-value{text-align:right;font-variant-numeric:tabular-nums;font-weight:640}
.rank-meta{color:var(--muted);font-variant-numeric:tabular-nums;font-size:11.5px}
.econ-strip{display:flex;flex-wrap:wrap;gap:6px 16px;padding:8px 14px;border-top:1px solid var(--line);
  background:var(--bg);font-size:11.5px;color:var(--muted)}
.econ-strip b{color:var(--ink);font-variant-numeric:tabular-nums;font-weight:640}
.warn-chip{color:var(--warn)}
.calls{margin-top:18px}
.call-table{font-size:12px}
.call-table th{font-size:10.5px}
.mono-cell{font-family:var(--mono);font-size:11px}
.sortbar{margin-top:-6px}
.sort-label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:600}
.sort{font:inherit;font-size:12.5px;padding:5px 11px;border-radius:99px;cursor:pointer;
  border:1px solid var(--line);background:var(--panel);color:var(--ink)}
.sort.active{background:var(--ink);color:var(--bg);border-color:var(--ink)}
@media(max-width:760px){.rank-row{grid-template-columns:1fr 60px}.rank-track,.rank-meta{display:none}}
@media(max-width:900px){.case-head{grid-template-columns:1fr}.case-gates,.case-tags{flex-wrap:wrap}}
</style></head>
<body><div class="wrap">

<h1>Evaluation ${escapeHtml(manifest.runId)}</h1>
<p class="meta">
  <code>${escapeHtml(manifest.gitSha.slice(0, 10))}</code>${manifest.dirtyWorktree ? " (dirty worktree)" : ""}
  · answer <code>${escapeHtml(manifest.answerModel)}</code>
  · judge <code>${escapeHtml(manifest.judgeModel)}</code> ×${manifest.judgePasses}
  · dataset <code>${escapeHtml(manifest.datasetVersion)}</code>
  · corpus <code>${escapeHtml(manifest.corpusVersion)}</code>
  · <code>${escapeHtml(manifest.convexDeployment)}</code>
  · ${escapeHtml(manifest.completedAt ?? "in progress")}
</p>
<p class="meta">Completed ${summary.completedCases}/${summary.requestedCases} cases · ${summary.errorCases} system errors · ${totalRecordedTokens.toLocaleString("en-US")} tokens · ${escapeHtml(costLine)}</p>
${
  manifest.dirtyWorktree
    ? `<div class="banner">This run was produced from a dirty worktree, so <code>${escapeHtml(manifest.gitSha.slice(0, 10))}</code> does not fully describe the code under test.</div>`
    : ""
}

<h2>Quality gates</h2>
<p class="meta">Each gate is derived independently from the judge's dimension scores, so one broken subsystem cannot collapse the whole scoreboard. End-to-end is the conjunction of all four.</p>
<div class="cards">
${gateCard("Retrieval", "evidence reached the context", summary.retrievalPassRate)}
${gateCard("Content", "answer is correct and grounded", summary.contentPassRate)}
${gateCard("Citations", "claims are attributable", summary.citationPassRate)}
${gateCard("Behavior", "abstention and page scope", summary.behaviorPassRate)}
${gateCard("End-to-end", "all four gates", summary.endToEndPassRate)}
</div>

<h2>Where the failures are</h2>
<div class="panel">${failureChart(summary)}</div>

<h2>Run economics</h2>
<p class="meta">Every figure below is derived from a per-case ledger of billable API calls, so nothing is double-counted and errored cases still contribute the spend they incurred.</p>
${economicsSection(summary)}

<h2>Most expensive cases</h2>
${costRanking(summary)}

<h2>Latency</h2>
${latencySection(summary)}

<h2>Reliability</h2>
${reliabilitySection(summary)}

<h2>Judge dimension averages</h2>
<div class="panel grid-2">
<div>
${dimensionBar("Retrieval sufficiency", summary.averageRetrievalSufficiency)}
${dimensionBar("Evidence coverage", summary.averageEvidenceCoverage)}
${dimensionBar("Context noise", summary.averageContextNoise, true)}
</div>
<div>
${dimensionBar("Answer correctness", summary.averageAnswerCorrectness)}
${dimensionBar("Completeness", summary.averageCompleteness)}
${dimensionBar("Groundedness", summary.averageGroundedness)}
${dimensionBar("Citation correctness", summary.averageCitationCorrectness)}
</div>
</div>

<h2>Citation and behavior checks</h2>
<div class="panel grid-2">
<div>
<h3>Citations</h3>
<table>
<tr><td>Cases that emitted any citation</td><td class="num">${rateText(summary.casesEmittingCitations)}</td></tr>
<tr><td>Citations emitted</td><td class="num">${summary.rawCitationCount}</td></tr>
<tr><td>Survived deterministic validation</td><td class="num">${summary.validatedCitationCount}</td></tr>
<tr><td>Validation rate</td><td class="num">${percent(summary.citationValidationRate)}</td></tr>
</table>
</div>
<div>
<h3>Behavior and judging</h3>
<table>
<tr><td>Page-scope compliance</td><td class="num">${percent(summary.pageScopeComplianceRate)}</td></tr>
<tr><td>Unanswerable abstention accuracy</td><td class="num">${percent(summary.unanswerableAbstentionAccuracy)}</td></tr>
<tr><td>Judge agreement</td><td class="num">${percent(summary.judgeAgreementRate)}</td></tr>
<tr><td>Adjudication rate</td><td class="num">${percent(summary.adjudicationRate)}</td></tr>
<tr><td>Avg retrieval / generation latency</td><td class="num">${Math.round(summary.averageRetrievalLatencyMs)} / ${Math.round(summary.averageGenerationLatencyMs)} ms</td></tr>
</table>
</div>
</div>

<h2>Breakdowns</h2>
<div class="panel grid-2">
${breakdownTable("Type", summary.byType)}
${breakdownTable("Difficulty", summary.byDifficulty)}
${breakdownTable("Document", summary.byDocument)}
</div>

<h2>Cases</h2>
<div class="controls">${filterButtons}<input id="search" type="search" placeholder="Search question, id, document, tag..." aria-label="Search cases"></div>
<div class="controls sortbar">
  <span class="sort-label">Sort</span>
  <button class="sort active" data-sort="default">Dataset order</button>
  <button class="sort" data-sort="cost">Most expensive</button>
  <button class="sort" data-sort="tokens">Most tokens</button>
  <button class="sort" data-sort="latency">Slowest</button>
</div>
<div id="cases">
${summary.outcomes.map((outcome) => caseCard(outcome)).join("\n")}
</div>
<p id="no-match" class="no-match" hidden>No cases match this filter.</p>

</div>
<script>
(function(){
  var cases = Array.prototype.slice.call(document.querySelectorAll('.case'));
  var filters = Array.prototype.slice.call(document.querySelectorAll('.filter'));
  var search = document.getElementById('search');
  var noMatch = document.getElementById('no-match');
  var active = 'all';

  function matches(el){
    if (active === 'fail' && el.dataset.status !== 'fail') return false;
    if (active === 'pass' && el.dataset.status !== 'pass') return false;
    if (active.indexOf('bucket:') === 0 && el.dataset.bucket !== active.slice(7)) return false;
    var q = search.value.trim().toLowerCase();
    return !q || el.dataset.search.indexOf(q) !== -1;
  }

  function apply(){
    var shown = 0;
    cases.forEach(function(el){
      var ok = matches(el);
      el.hidden = !ok;
      if (ok) shown++;
    });
    noMatch.hidden = shown !== 0;
  }

  filters.forEach(function(button){
    button.addEventListener('click', function(){
      filters.forEach(function(other){ other.classList.remove('active'); });
      button.classList.add('active');
      active = button.dataset.filter;
      apply();
    });
  });
  search.addEventListener('input', apply);

  var container = document.getElementById('cases');
  var order = cases.slice();
  Array.prototype.slice.call(document.querySelectorAll('.sort')).forEach(function(button){
    button.addEventListener('click', function(){
      document.querySelectorAll('.sort').forEach(function(o){ o.classList.remove('active'); });
      button.classList.add('active');
      var key = button.dataset.sort;
      var sorted = key === 'default'
        ? order.slice()
        : order.slice().sort(function(a, b){
            return Number(b.dataset[key]) - Number(a.dataset[key]);
          });
      sorted.forEach(function(el){ container.appendChild(el); });
    });
  });

  document.querySelectorAll('.case-toggle').forEach(function(toggle){
    toggle.addEventListener('click', function(){
      var open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      toggle.closest('.case').querySelector('.case-body').hidden = open;
    });
  });
})();
</script>
</body></html>`;
}

export async function writeReports(
  runDir: string,
  manifest: RunManifest,
  results: EvaluationResult[],
) {
  const summary = summarizeResults(results);
  // Judge calibration runs once per run, outside any case, so its spend is
  // added on top of the per-case ledger rather than hidden inside it.
  const calibrationCalls = manifest.calibration?.calls ?? [];
  const calibrationCost = calibrationCalls.reduce<number | null>(
    (total, call) => {
      const cost = costOfCall(call);
      return cost === null || total === null ? total : total + cost;
    },
    0,
  );
  const calibrationTokens = manifest.calibration?.usage?.totalTokens ?? 0;
  const totalRecordedTokens = summary.totalTokens + calibrationTokens;
  const totalCost =
    summary.totalCostUsd === null
      ? null
      : summary.totalCostUsd + (calibrationCost ?? 0);
  const costLine =
    totalCost === null ? "not priced" : `${money(totalCost)} USD`;

  await Promise.all([
    writeFile(
      path.join(runDir, "summary.md"),
      markdownReport(manifest, summary, costLine, totalRecordedTokens),
    ),
    writeFile(
      path.join(runDir, "report.html"),
      htmlReport(manifest, summary, costLine, totalRecordedTokens),
    ),
  ]);
}
