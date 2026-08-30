import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CorpusManifest, EvaluationCase, RunManifest } from "./types";

export const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export const EVALS_DIR = path.join(ROOT_DIR, "evals");
export const CORPUS_DIR = path.join(EVALS_DIR, "corpus");
/** Override with EVAL_DATASET to run an older dataset version. */
export const DATASET_VERSION = process.env.EVAL_DATASET ?? "v1.1";
export const DATASET_DIR = path.join(EVALS_DIR, "datasets", DATASET_VERSION);
export const RUNS_DIR = path.join(EVALS_DIR, "runs");
export const PROMPTS_DIR = path.join(EVALS_DIR, "prompts");

export function loadLocalEnvironment() {
  for (const filename of [".env", ".env.local"]) {
    const envPath = path.join(ROOT_DIR, filename);
    if (existsSync(envPath)) process.loadEnvFile(envPath);
  }
}

export function requiredEnv(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export async function sha256File(filename: string) {
  return createHash("sha256")
    .update(await readFile(filename))
    .digest("hex");
}

export function sha256Text(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function storageSha256ToHex(value: string) {
  return /^[a-f0-9]{64}$/i.test(value)
    ? value.toLowerCase()
    : Buffer.from(value, "base64").toString("hex");
}

export function readCorpusManifest(): CorpusManifest {
  const manifest = JSON.parse(
    readFileSync(path.join(CORPUS_DIR, "manifest.json"), "utf8"),
  ) as CorpusManifest;
  if (!manifest.version || !Array.isArray(manifest.documents)) {
    throw new Error("Invalid evaluation corpus manifest");
  }
  return manifest;
}

export async function validateCorpus() {
  const manifest = readCorpusManifest();
  for (const document of manifest.documents) {
    const filename = path.join(CORPUS_DIR, "documents", document.filename);
    if (!existsSync(filename))
      throw new Error(`Missing corpus PDF: ${filename}`);
    const stats = statSync(filename);
    if (stats.size !== document.sizeBytes) {
      throw new Error(`Corpus size mismatch for ${document.filename}`);
    }
    if ((await sha256File(filename)) !== document.sha256) {
      throw new Error(`Corpus checksum mismatch for ${document.filename}`);
    }
  }
  return manifest;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

export function assertEvaluationCase(
  value: unknown,
): asserts value is EvaluationCase {
  if (!value || typeof value !== "object")
    throw new Error("Case must be an object");
  const item = value as Partial<EvaluationCase>;
  if (
    typeof item.id !== "string" ||
    typeof item.documentKey !== "string" ||
    !["single_turn", "page_scoped", "unanswerable"].includes(item.type ?? "") ||
    typeof item.question !== "string" ||
    !(item.pageNumber === null || typeof item.pageNumber === "number") ||
    !["answerable", "unanswerable"].includes(item.answerability ?? "") ||
    typeof item.referenceAnswer !== "string" ||
    !isStringArray(item.requiredFacts) ||
    !Array.isArray(item.evidence) ||
    !item.evidence.every(
      (e) =>
        e &&
        typeof e === "object" &&
        typeof (e as { pageNumber?: unknown }).pageNumber === "number" &&
        typeof (e as { quote?: unknown }).quote === "string",
    ) ||
    !isStringArray(item.tags) ||
    !["easy", "medium", "hard"].includes(item.difficulty ?? "") ||
    typeof item.authorModel !== "string" ||
    typeof item.verifierModel !== "string"
  ) {
    throw new Error(`Invalid evaluation case ${item.id ?? "<unknown>"}`);
  }
}

export function readDataset(): EvaluationCase[] {
  const casesPath = path.join(DATASET_DIR, "cases.jsonl");
  const lines = readFileSync(casesPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const cases = lines.map((line) => {
    const value: unknown = JSON.parse(line);
    assertEvaluationCase(value);
    return value;
  });
  const ids = new Set<string>();
  for (const evaluationCase of cases) {
    if (ids.has(evaluationCase.id))
      throw new Error(`Duplicate case ID ${evaluationCase.id}`);
    ids.add(evaluationCase.id);
  }
  return cases;
}

export function getRunConfig(
  caseCount: number,
): Omit<
  RunManifest,
  | "runId"
  | "startedAt"
  | "gitSha"
  | "dirtyWorktree"
  | "datasetSha256"
  | "corpusSha256"
  | "promptSha256"
  | "caseIds"
> {
  const datasetMetadata = JSON.parse(
    readFileSync(path.join(DATASET_DIR, "dataset.json"), "utf8"),
  ) as { version?: string };
  const corpus = readCorpusManifest();
  return {
    datasetVersion: datasetMetadata.version ?? "unknown",
    corpusVersion: corpus.version,
    convexDeployment: requiredEnv("CONVEX_DEPLOYMENT"),
    answerModel: requiredEnv("OPENAI_CHAT_MODEL", "gpt-5.6-luna"),
    embeddingModel: requiredEnv(
      "OPENAI_EMBEDDING_MODEL",
      "text-embedding-3-small",
    ),
    judgeModel: requiredEnv("EVAL_JUDGE_MODEL", "gpt-5.6-luna"),
    judgePasses: Number(process.env.EVAL_JUDGE_PASSES ?? "2"),
    caseCount,
  };
}
