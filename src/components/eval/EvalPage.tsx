import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/button";
import snapshot from "@/data/eval-snapshot.json";
import {
  DimensionRadar,
  DocumentChart,
  FailureDonut,
  GateChart,
  StageCostChart,
} from "./EvalCharts";

const percent = (value: number | null, places = 1) =>
  value === null ? "n/a" : `${(value * 100).toFixed(places)}%`;

const compact = (value: number) =>
  value >= 1_000_000
    ? `${(value / 1_000_000).toFixed(2)}M`
    : value >= 1_000
      ? `${(value / 1_000).toFixed(1)}k`
      : String(value);

const seconds = (value: number | null) =>
  value === null
    ? "n/a"
    : value < 1000
      ? `${Math.round(value)}ms`
      : `${(value / 1000).toFixed(1)}s`;

function Section({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-stone-800/70 px-6 py-20 md:px-10">
      <div className="mx-auto max-w-6xl">
        <p className="font-mono text-xs tracking-[0.18em] text-amber-400/80 uppercase">
          {eyebrow}
        </p>
        <h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-tight text-white md:text-3xl">
          {title}
        </h2>
        {lede ? (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-stone-400">
            {lede}
          </p>
        ) : null}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

function Panel({
  title,
  hint,
  children,
  className = "",
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`min-w-0 rounded-2xl border border-stone-800/70 bg-[#0c0c0c] p-6 ${className}`}
    >
      <div className="mb-5">
        <h3 className="text-sm font-medium text-stone-100">{title}</h3>
        {hint ? <p className="mt-1 text-xs text-stone-500">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function EvalPage() {
  const { run, corpus, gates, failures, dimensions, citations, economics } =
    snapshot;
  const endToEnd = gates.find((gate) => gate.label === "End to end")!;
  const failureTotal = failures.reduce((sum, bucket) => sum + bucket.count, 0);
  const passedAllGates = run.casesEvaluated - failureTotal + 1; // system error is not a quality failure

  const documentLabels: Record<string, string> = {
    "nist-ai-rmf-1.0": "NIST AI RMF 1.0",
    "nist-csf-2.0": "NIST CSF 2.0",
    "cisa-zero-trust-maturity-model-2.0": "CISA Zero Trust 2.0",
    "federal-reserve-economic-well-being-2024": "Fed Economic Well-Being",
    "omb-circular-a-123-2026": "OMB Circular A-123",
  };

  const contextNoise = dimensions.find((dimension) => dimension.lowerIsBetter);

  const headline = [
    {
      value: percent(endToEnd.value),
      label: "answered end to end",
      hint: `${endToEnd.passed} of ${endToEnd.total} questions cleared every gate`,
    },
    {
      value: percent(citations.validationRate),
      label: "citations verified",
      hint: `${citations.validated} of ${citations.emitted} quotes matched the source text exactly`,
    },
    {
      value: seconds(snapshot.latency.generation.p50),
      label: "median answer time",
      hint: `${seconds(snapshot.latency.retrieval.p50)} to find the evidence`,
    },
    {
      value: `$${(economics.totalCostUsd ?? 0).toFixed(2)}`,
      label: "to run the suite",
      hint: `${compact(economics.totalTokens)} tokens across ${economics.totalCalls} API calls`,
    },
  ];

  return (
    <main className="min-h-screen overflow-x-clip bg-[#070707] text-stone-100 selection:bg-amber-500/30 selection:text-amber-200">
      {/* ── Nav ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-stone-800/70 bg-[#070707]/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 md:px-10">
          <Link href="/" className="flex items-center gap-2">
            <BrandLogo logoClassName="h-7 w-7" textClassName="text-sm" />
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/docs"
              className="hidden text-sm text-stone-400 transition hover:text-white sm:block"
            >
              Docs
            </Link>
            <Button
              asChild
              size="sm"
              className="rounded-full bg-amber-500 px-4 font-semibold text-[#070707] hover:bg-amber-400"
            >
              <Link href="/dashboard">Try it</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-6 pt-20 pb-16 md:px-10 md:pt-28">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_100%_at_50%_0%,rgba(245,158,11,0.13),transparent_70%)]"
        />
        <div className="relative mx-auto max-w-6xl">
          <h1 className="mt-6 max-w-3xl text-4xl leading-[1.08] font-semibold tracking-tight text-balance md:text-6xl">
            We measure whether the answers are
            <span className="text-amber-400"> actually right</span>.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-stone-400">
            Most document AI ships on vibes. ChatPDF is graded against a fixed
            set of {run.casesTotal} questions written from{" "}
            {corpus.documentCount} real public documents - {corpus.pageCount}{" "}
            pages of federal frameworks, financial reports and policy circulars
            - with every answer scored for correctness, grounding and citation
            accuracy.
          </p>

          <div className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-stone-800/70 bg-stone-800/70 lg:grid-cols-4">
            {headline.map((stat) => (
              <div key={stat.label} className="bg-[#0b0b0b] p-6">
                <p className="font-mono text-3xl font-semibold tracking-tight text-stone-100 tabular-nums md:text-4xl">
                  {stat.value}
                </p>
                <p className="mt-2 text-sm font-medium text-stone-200">
                  {stat.label}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-stone-500">
                  {stat.hint}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Gates ───────────────────────────────────────────── */}
      <Section
        eyebrow="How we score"
        title="Four independent gates, not one blended number"
        lede="A single accuracy score hides which part of the system failed. We grade retrieval, content, citations and behaviour separately, so a weakness in one never disguises itself as a weakness in another. End to end means all four passed on the same question."
      >
        <div className="grid min-w-0 gap-6 lg:grid-cols-[1.05fr_1fr]">
          <Panel
            title="Pass rate by gate"
            hint="Hover any bar for the 95% confidence interval."
          >
            <GateChart data={gates} />
          </Panel>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {gates
              .filter((gate) => gate.label !== "End to end")
              .map((gate) => (
                <div
                  key={gate.label}
                  className="rounded-xl border border-stone-800/70 bg-[#0c0c0c] p-4"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium text-stone-100">
                      {gate.label}
                    </p>
                    <p className="font-mono text-lg font-semibold text-amber-400 tabular-nums">
                      {percent(gate.value)}
                    </p>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-stone-500">
                    {gate.blurb}
                  </p>
                </div>
              ))}
          </div>
        </div>
      </Section>

      {/* ── Failures ────────────────────────────────────────── */}
      <Section
        eyebrow="Where it falls short"
        title="Every miss is classified by root cause"
        lede="When a question fails, it lands in exactly one bucket - attributed to the earliest stage responsible, so a retrieval problem is never mislabelled as a writing problem. This is the list we work from."
      >
        <div className="grid min-w-0 gap-6 lg:grid-cols-[1fr_1.1fr]">
          <Panel
            title="Outcome distribution"
            hint={`${run.casesTotal} questions in the set`}
          >
            <FailureDonut data={failures} passed={passedAllGates} />
          </Panel>
          <div className="min-w-0 space-y-3">
            <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] p-4">
              <span className="inline-block size-2.5 shrink-0 rounded-full bg-amber-500" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-stone-100">
                  Passed every gate
                </p>
                <p className="text-xs text-stone-400">
                  Correct, grounded, cited and behaving as intended.
                </p>
              </div>
              <p className="font-mono text-lg font-semibold text-amber-400 tabular-nums">
                {passedAllGates}
              </p>
            </div>
            {failures.map((bucket) => (
              <div
                key={bucket.key}
                className="flex items-center gap-3 rounded-xl border border-stone-800/70 bg-[#0c0c0c] p-4"
              >
                <span
                  className="inline-block size-2.5 shrink-0 rounded-full"
                  style={{ background: FAILURE_DOT[bucket.key] ?? "#64748b" }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-stone-100">
                    {bucket.label}
                  </p>
                  <p className="text-xs leading-relaxed text-stone-400">
                    {bucket.description}
                  </p>
                </div>
                <p className="font-mono text-lg font-semibold text-stone-300 tabular-nums">
                  {bucket.count}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Quality profile ─────────────────────────────────── */}
      <Section
        eyebrow="Answer quality"
        title="Graded on seven dimensions, not a thumbs up"
        lede="Two independent judge passes score every answer from 0 to 4 on each dimension. When they disagree, a third adjudication pass settles it. Further from the centre is better."
      >
        <div className="grid min-w-0 gap-6 lg:grid-cols-[1.15fr_1fr]">
          <Panel
            title="Quality profile"
            hint="Mean score across every evaluated question, out of 4."
          >
            <DimensionRadar data={dimensions} />
          </Panel>
          <div className="min-w-0 space-y-6">
            <Panel title="Citations that hold up">
              <div className="space-y-4">
                <div>
                  <div className="flex items-baseline justify-between">
                    <p className="text-sm text-stone-300">
                      Quotes matched to source text
                    </p>
                    <p className="font-mono text-sm font-semibold text-amber-400 tabular-nums">
                      {percent(citations.validationRate)}
                    </p>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-amber-500"
                      style={{
                        width: `${(citations.validationRate ?? 0) * 100}%`,
                      }}
                    />
                  </div>
                </div>
                <p className="text-xs leading-relaxed text-stone-500">
                  Every citation is checked deterministically against the
                  document text, not taken on the model&apos;s word.{" "}
                  {citations.validated} of {citations.emitted} quotes were found
                  verbatim in the source.
                </p>
              </div>
            </Panel>
            <Panel
              title="Context precision"
              hint="How much of what we retrieve is actually on-topic."
            >
              <div className="flex items-baseline justify-between">
                <p className="text-sm text-stone-300">
                  Irrelevant context in the window
                </p>
                <p className="font-mono text-sm font-semibold text-amber-400 tabular-nums">
                  {contextNoise?.value?.toFixed(2) ?? "n/a"}
                  <span className="text-stone-500"> / 4</span>
                </p>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-amber-500"
                  style={{
                    width: `${(1 - (contextNoise?.value ?? 0) / 4) * 100}%`,
                  }}
                />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-stone-500">
                Scored 0 to 4 where lower is better, so a wider bar means a
                tighter, less padded context window.
              </p>
            </Panel>
            <Panel title="Speed" hint="Median and 95th percentile.">
              <dl className="space-y-3">
                {[
                  ["Find the evidence", snapshot.latency.retrieval],
                  ["Write the answer", snapshot.latency.generation],
                ].map(([label, timing]) => {
                  const time = timing as {
                    p50: number | null;
                    p95: number | null;
                  };
                  return (
                    <div
                      key={label as string}
                      className="flex items-baseline justify-between border-b border-white/[0.06] pb-3 last:border-0 last:pb-0"
                    >
                      <dt className="text-sm text-stone-300">
                        {label as string}
                      </dt>
                      <dd className="font-mono text-sm tabular-nums">
                        <span className="text-stone-100">
                          {seconds(time.p50)}
                        </span>
                        <span className="text-stone-500">
                          {" "}
                          / {seconds(time.p95)} p95
                        </span>
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </Panel>
          </div>
        </div>
      </Section>

      {/* ── Corpus ──────────────────────────────────────────── */}
      <Section
        eyebrow="The test set"
        title="Real documents, not toy examples"
        lede={`${corpus.pageCount} pages across ${corpus.documentCount} public documents - dense tables, appendices, footnotes and multi-column layouts, the material that actually breaks document AI.`}
      >
        <div className="grid min-w-0 gap-6 lg:grid-cols-[1fr_1fr]">
          <Panel
            title="End-to-end pass rate by document"
            hint="Every document carries the same number of questions."
          >
            <DocumentChart data={snapshot.byDocument} labels={documentLabels} />
          </Panel>
          <Panel title="What's in the corpus">
            <ul className="divide-y divide-white/[0.06]">
              {corpus.documents.map((document) => (
                <li
                  key={document.key}
                  className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-stone-200">
                      {document.title}
                    </p>
                    <p className="text-xs text-stone-500">
                      Published {document.publicationDate}
                    </p>
                  </div>
                  <p className="shrink-0 font-mono text-xs text-stone-400 tabular-nums">
                    {document.pageCount} pp
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-stone-800/70 bg-stone-800/70">
              {snapshot.byType.map((row) => (
                <div key={row.name} className="bg-[#0b0b0b] p-3 text-center">
                  <p className="font-mono text-lg font-semibold text-stone-100 tabular-nums">
                    {percent(row.endToEnd, 0)}
                  </p>
                  <p className="mt-0.5 text-xs text-stone-500 capitalize">
                    {row.name.replace("_", " ")}
                  </p>
                  <p className="text-xs text-stone-600">
                    {row.count} questions
                  </p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </Section>

      {/* ── Economics ───────────────────────────────────────── */}
      <Section
        eyebrow="What it costs"
        title="Every token is accounted for"
        lede="The harness keeps a ledger of each billable API call, split by pipeline stage, so cost per answered question is a measured number rather than an estimate."
      >
        <div className="grid min-w-0 gap-6 lg:grid-cols-[1.1fr_1fr]">
          <Panel
            title="Cost by pipeline stage"
            hint="Grading an answer costs more than producing one, deliberately."
          >
            <StageCostChart data={economics.stages} />
          </Panel>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            {[
              {
                value: `$${(economics.perCaseMeanUsd ?? 0).toFixed(4)}`,
                label: "per question",
                hint: `$${(economics.perCaseP95Usd ?? 0).toFixed(4)} at p95`,
              },
              {
                value: compact(economics.totalTokens),
                label: "tokens used",
                hint: `${economics.totalCalls} API calls`,
              },
              {
                value: compact(economics.cachedInputTokens),
                label: "tokens served from cache",
                hint: `${percent(
                  economics.cachedInputTokens /
                    (economics.cachedInputTokens + economics.freshInputTokens),
                  0,
                )} of all input`,
              },
              {
                value: compact(economics.reasoningTokens),
                label: "reasoning tokens",
                hint: "hidden thinking, billed at output rate",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-stone-800/70 bg-[#0c0c0c] p-5"
              >
                <p className="font-mono text-2xl font-semibold tracking-tight text-stone-100 tabular-nums">
                  {stat.value}
                </p>
                <p className="mt-1.5 text-sm text-stone-300">{stat.label}</p>
                <p className="mt-0.5 text-xs text-stone-500">{stat.hint}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Method ──────────────────────────────────────────── */}
      <Section
        eyebrow="Method"
        title="How the grading works"
        lede="The harness runs against the real production pipeline on real models. Nothing is mocked."
      >
        <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            {
              step: "01",
              title: "Fixed corpus",
              body: `${corpus.documentCount} public documents are checksummed and pinned, so a change in results can only come from a change in the system.`,
            },
            {
              step: "02",
              title: "Authored questions",
              body: `${run.casesTotal} questions with reference answers and exact supporting quotes, each verified against the source text before entering the set.`,
            },
            {
              step: "03",
              title: "Real pipeline",
              body: "Each question runs through the same retrieval and generation path the product uses, capturing the full trace.",
            },
            {
              step: "04",
              title: "Independent judging",
              body: `${run.judgePasses} independent gradings by a stronger model, with a third adjudication pass whenever they disagree.`,
            },
          ].map((item) => (
            <li
              key={item.step}
              className="rounded-2xl border border-stone-800/70 bg-[#0c0c0c] p-6"
            >
              <p className="font-mono text-xs tracking-widest text-amber-400/70">
                {item.step}
              </p>
              <p className="mt-3 text-sm font-medium text-stone-100">
                {item.title}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-stone-400">
                {item.body}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl border border-stone-800/70 bg-[#0c0c0c] px-6 py-5 font-mono text-xs text-stone-500">
          <span>
            Answer model{" "}
            <span className="text-stone-300">{run.answerModel}</span>
          </span>
          <span>
            Judge <span className="text-stone-300">{run.judgeModel}</span>
          </span>
          <span>
            Embeddings{" "}
            <span className="text-stone-300">{run.embeddingModel}</span>
          </span>
          <span>
            Dataset{" "}
            <span className="text-stone-300">v{run.datasetVersion}</span>
          </span>
          <span>
            Run{" "}
            <span className="text-stone-300">
              {new Date(run.completedAt).toISOString().slice(0, 10)}
            </span>
          </span>
        </div>
      </Section>

      {/* ── CTA ─────────────────────────────────────────────── */}
      <section className="border-t border-stone-800/70 px-6 py-24 md:px-10">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            Ask your own documents the hard questions.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-stone-400">
            Every answer arrives with citations you can click straight through
            to the page it came from.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button
              asChild
              size="lg"
              className="rounded-full bg-amber-500 px-6 font-semibold text-[#070707] hover:bg-amber-400"
            >
              <Link href="/dashboard">Upload a PDF</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="ghost"
              className="rounded-full border border-stone-800 px-6 text-stone-300 hover:bg-stone-900/60 hover:text-stone-100"
            >
              <Link href="/docs">Read the docs</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-stone-800/70 px-6 py-8 md:px-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-xs text-stone-500 sm:flex-row">
          <BrandLogo
            className="opacity-40"
            logoClassName="h-5 w-5"
            textClassName="text-xs"
          />
          <p>
            Evaluation run {run.id.slice(0, 10)} · {run.casesEvaluated}{" "}
            questions graded
          </p>
        </div>
      </footer>
    </main>
  );
}

const FAILURE_DOT: Record<string, string> = {
  content_failure: "#38bdf8",
  citation_failure: "#2dd4bf",
  abstention_failure: "#fb923c",
  retrieval_miss: "#f87171",
  page_scope_violation: "#c084fc",
  grounding_failure: "#facc15",
  system_error: "#94a3b8",
};
