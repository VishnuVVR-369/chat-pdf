import { execFile } from "node:child_process";
import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  CORPUS_DIR,
  DATASET_DIR,
  PROMPTS_DIR,
  ROOT_DIR,
  RUNS_DIR,
  getRunConfig,
  readCorpusManifest,
  readDataset,
  sha256File,
  storageSha256ToHex,
  validateCorpus,
} from "./config";
import { convexRun } from "./convex-cli";
import { judgeEvaluationCase, verifyJudgeCalibration } from "./judge";
import { writeReports } from "./report";
import {
  normalizeUsage,
  type EvaluationResult,
  type EvaluationTrace,
  type FinalJudgment,
  type ModelCall,
  type RunManifest,
} from "./types";

/**
 * Flattens everything billable for one case into a single ordered ledger.
 * Tolerates a partial case: a run that died while judging still reports the
 * embedding and answer calls it already paid for.
 */
function collectModelCalls(
  trace: EvaluationTrace | undefined,
  judgment: FinalJudgment | undefined,
): ModelCall[] {
  const calls: ModelCall[] = [];

  const embedding = trace?.retrieval.embedding;
  if (embedding) {
    calls.push({
      stage: "embedding",
      model: embedding.model,
      usage: normalizeUsage({
        promptTokens: embedding.promptTokens,
        totalTokens: embedding.totalTokens,
      }),
      latencyMs: embedding.latencyMs,
      attempts: 1,
      retryWaitMs: 0,
      usageReported: embedding.totalTokens > 0,
    });
  }

  if (trace) {
    calls.push({
      stage: "answer",
      model: trace.generation.model,
      usage: normalizeUsage(trace.generation.usage),
      latencyMs: trace.generation.latencyMs,
      attempts: 1,
      retryWaitMs: 0,
      usageReported: trace.generation.usage !== null,
    });
  }

  if (judgment) {
    for (const pass of judgment.passes) calls.push(...(pass.calls ?? []));
    if (judgment.adjudicatorCall) calls.push(judgment.adjudicatorCall);
  }

  return calls;
}

const execFileAsync = promisify(execFile);

type RunOptions = {
  limit?: number;
  caseId?: string;
  resume?: string;
  skipCalibration?: boolean;
  concurrency?: number;
};

// Answer and judge calls share the Luna TPM budget. One case at a time keeps a
// default-tier project below that ceiling; higher-tier accounts can still opt in
// to more parallelism with `--concurrency`.
const DEFAULT_CONCURRENCY = 2;

/**
 * Runs tasks with bounded concurrency, preserving input order in the output.
 * Cases are independent, so the only ordering that matters is the order results
 * are written, which `serialize` below keeps stable.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from(
    { length: Math.min(Math.max(1, limit), items.length) },
    async () => {
      while (true) {
        const index = next++;
        if (index >= items.length) return;
        results[index] = await worker(items[index]!, index);
      }
    },
  );
  await Promise.all(runners);
  return results;
}

/** Chains async writes so concurrent cases never interleave in results.jsonl. */
function createWriteQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return (task: () => Promise<unknown>) => {
    const queued = tail.then(task, task);
    tail = queued.catch(() => undefined);
    return queued;
  };
}

async function gitInfo() {
  const [{ stdout: sha }, { stdout: status }] = await Promise.all([
    execFileAsync("git", ["rev-parse", "HEAD"], { cwd: ROOT_DIR }),
    execFileAsync("git", ["status", "--porcelain"], { cwd: ROOT_DIR }),
  ]);
  return { sha: sha.trim(), dirty: status.trim().length > 0 };
}

/**
 * results.jsonl is append-only, so a case retried on resume appears more than
 * once. The last entry for a case wins.
 */
async function loadExistingResults(runDir: string) {
  try {
    const contents = await readFile(path.join(runDir, "results.jsonl"), "utf8");
    const byCaseId = new Map<string, EvaluationResult>();
    for (const line of contents.split("\n").filter(Boolean)) {
      const result = JSON.parse(line) as EvaluationResult;
      byCaseId.set(result.caseId, result);
    }
    return [...byCaseId.values()];
  } catch {
    return [];
  }
}

async function resolveRunDirectory(options: RunOptions, gitSha: string) {
  if (options.resume) {
    const exact = path.join(RUNS_DIR, options.resume);
    const directories = await readdir(RUNS_DIR);
    const match = directories.find(
      (directory) =>
        directory === options.resume || directory.startsWith(options.resume!),
    );
    if (!match) throw new Error(`Could not find run ${options.resume}`);
    return match === options.resume ? exact : path.join(RUNS_DIR, match);
  }
  const timestamp = new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replaceAll(".", "-");
  return path.join(RUNS_DIR, `${timestamp}-${gitSha.slice(0, 7)}`);
}

export async function runEvaluation(options: RunOptions = {}) {
  await validateCorpus();
  let cases = readDataset();
  if (cases.length === 0) {
    throw new Error("The v1 dataset is empty. Run `pnpm eval:dataset` first.");
  }
  if (options.caseId) {
    cases = cases.filter(
      (evaluationCase) => evaluationCase.id === options.caseId,
    );
    if (cases.length === 0)
      throw new Error(`Unknown case ID ${options.caseId}`);
  }
  if (options.limit !== undefined) cases = cases.slice(0, options.limit);

  const git = await gitInfo();
  const runDir = await resolveRunDirectory(options, git.sha);
  await mkdir(path.join(runDir, "cases"), { recursive: true });
  const manifestPath = path.join(runDir, "run.json");
  let manifest: RunManifest;
  if (options.resume) {
    manifest = JSON.parse(await readFile(manifestPath, "utf8")) as RunManifest;
  } else {
    const config = getRunConfig(cases.length);
    const promptFilenames = [
      "retrieval-judge.md",
      "answer-judge.md",
      "adjudicator.md",
    ];
    manifest = {
      ...config,
      runId: path.basename(runDir),
      startedAt: new Date().toISOString(),
      gitSha: git.sha,
      dirtyWorktree: git.dirty,
      datasetSha256: await sha256File(path.join(DATASET_DIR, "cases.jsonl")),
      corpusSha256: await sha256File(path.join(CORPUS_DIR, "manifest.json")),
      caseIds: cases.map((evaluationCase) => evaluationCase.id),
      promptSha256: Object.fromEntries(
        await Promise.all(
          promptFilenames.map(async (filename) => [
            filename,
            await sha256File(path.join(PROMPTS_DIR, filename)),
          ]),
        ),
      ),
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  if (options.resume) {
    if (manifest.caseIds?.length) {
      const selectedIds = new Set(manifest.caseIds);
      cases = cases.filter((evaluationCase) =>
        selectedIds.has(evaluationCase.id),
      );
    } else if (!options.caseId && options.limit === undefined) {
      // Compatibility for local runs created before case IDs were recorded.
      cases = cases.slice(0, manifest.caseCount);
    }
  }

  const remoteDocuments = await convexRun<
    Array<{ originalFilename: string; sha256: string; status: string }>
  >("evaluationData:listCorpusDocuments", {}, { push: !options.resume });
  for (const document of readCorpusManifest().documents) {
    const remote = remoteDocuments.find(
      (candidate) => candidate.originalFilename === document.filename,
    );
    if (
      !remote ||
      remote.status !== "ready" ||
      storageSha256ToHex(remote.sha256) !== document.sha256
    ) {
      throw new Error(`Corpus is not ready in Convex: ${document.filename}`);
    }
  }

  if (!options.skipCalibration && !options.resume) {
    console.log("calibrate judge");
    const calibration = await verifyJudgeCalibration();
    manifest.calibration = {
      passed: true,
      usage: calibration.usage,
      calls: calibration.calls,
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  // Errored cases are retried on resume: a 429 or a transient deployment
  // failure should not permanently exclude a case from the run.
  const previousResults = await loadExistingResults(runDir);
  const results = previousResults.filter(
    (result) => result.status === "complete",
  );
  const completedIds = new Set(results.map((result) => result.caseId));
  const retrying = previousResults.length - results.length;
  if (options.resume && retrying > 0) {
    console.log(`retrying ${retrying} previously errored cases`);
  }
  const documentsByKey = new Map(
    readCorpusManifest().documents.map((document) => [document.key, document]),
  );

  const pending = cases.filter(
    (evaluationCase) => !completedIds.has(evaluationCase.id),
  );
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const enqueueWrite = createWriteQueue();
  let finished = 0;

  if (pending.length > 0) {
    console.log(
      `evaluating ${pending.length} cases with concurrency ${concurrency}`,
    );
  }

  await mapWithConcurrency(pending, concurrency, async (evaluationCase) => {
    const startedAt = new Date();
    let result: EvaluationResult;
    let partialTrace: EvaluationTrace | undefined;
    try {
      const document = documentsByKey.get(evaluationCase.documentKey);
      if (!document)
        throw new Error(`Unknown document ${evaluationCase.documentKey}`);
      const trace = await convexRun<EvaluationTrace>("evaluations:runCase", {
        originalFilename: document.filename,
        question: evaluationCase.question,
        ...(evaluationCase.pageNumber !== null
          ? { pageNumber: evaluationCase.pageNumber }
          : {}),
      });
      partialTrace = trace;
      const judgment = await judgeEvaluationCase(evaluationCase, trace);
      result = {
        caseId: evaluationCase.id,
        status: "complete",
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
        wallClockMs: Date.now() - startedAt.getTime(),
        evaluationCase,
        trace,
        judgment,
        modelCalls: collectModelCalls(trace, judgment),
      };
    } catch (error) {
      // A case that failed while judging already paid for its embedding and
      // answer calls; those stay in the ledger so run cost is not understated.
      result = {
        caseId: evaluationCase.id,
        status: "error",
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
        wallClockMs: Date.now() - startedAt.getTime(),
        evaluationCase,
        error:
          error instanceof Error
            ? (error.stack ?? error.message)
            : String(error),
        errorStage: partialTrace ? "judging" : "retrieval_or_answer",
        ...(partialTrace ? { trace: partialTrace } : {}),
        modelCalls: collectModelCalls(partialTrace, undefined),
      };
    }

    await enqueueWrite(async () => {
      results.push(result);
      completedIds.add(result.caseId);
      finished += 1;
      console.log(
        `[${finished}/${pending.length}] ${result.caseId} ${result.status}` +
          `${result.status === "error" ? ` - ${result.error?.split("\n")[0] ?? ""}` : ""}`,
      );
      await appendFile(
        path.join(runDir, "results.jsonl"),
        `${JSON.stringify(result)}\n`,
      );
      await writeFile(
        path.join(runDir, "cases", `${result.caseId}.json`),
        `${JSON.stringify(result, null, 2)}\n`,
      );
      await writeReports(runDir, manifest, results);
    });
  });

  // Report in dataset order regardless of the order cases finished.
  const orderByCaseId = new Map(cases.map((item, index) => [item.id, index]));
  results.sort(
    (a, b) =>
      (orderByCaseId.get(a.caseId) ?? 0) - (orderByCaseId.get(b.caseId) ?? 0),
  );

  manifest.completedAt = new Date().toISOString();
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeReports(runDir, manifest, results);
  console.log(`Report: ${path.join(runDir, "report.html")}`);
}

/** Re-renders summary.md and report.html for an existing run, without re-running it. */
export async function renderRunReports(runIdOrPrefix: string) {
  const directories = await readdir(RUNS_DIR);
  const match = directories.find(
    (directory) =>
      directory === runIdOrPrefix || directory.startsWith(runIdOrPrefix),
  );
  if (!match) throw new Error(`Could not find run ${runIdOrPrefix}`);
  const runDir = path.join(RUNS_DIR, match);
  const manifest = JSON.parse(
    await readFile(path.join(runDir, "run.json"), "utf8"),
  ) as RunManifest;
  const results = await loadExistingResults(runDir);
  await writeReports(runDir, manifest, results);
  console.log(`Report: ${path.join(runDir, "report.html")}`);
}
