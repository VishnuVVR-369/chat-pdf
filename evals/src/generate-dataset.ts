import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DATASET_DIR,
  PROMPTS_DIR,
  readCorpusManifest,
  requiredEnv,
} from "./config";
import { convexRun } from "./convex-cli";
import { structuredCompletion, type JsonSchema } from "./openai";
import type { CorpusDocument, CorpusPage, EvaluationCase } from "./types";

type CandidateCase = Omit<
  EvaluationCase,
  "id" | "documentKey" | "authorModel" | "verifierModel"
>;

const candidateCasesSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    cases: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: {
            type: "string",
            enum: ["single_turn", "page_scoped", "unanswerable"],
          },
          question: { type: "string" },
          pageNumber: { anyOf: [{ type: "number" }, { type: "null" }] },
          answerability: {
            type: "string",
            enum: ["answerable", "unanswerable"],
          },
          referenceAnswer: { type: "string" },
          requiredFacts: { type: "array", items: { type: "string" } },
          evidence: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                pageNumber: { type: "number" },
                quote: { type: "string" },
              },
              required: ["pageNumber", "quote"],
            },
          },
          tags: { type: "array", items: { type: "string" } },
          difficulty: {
            type: "string",
            enum: ["easy", "medium", "hard"],
          },
        },
        required: [
          "type",
          "question",
          "pageNumber",
          "answerability",
          "referenceAnswer",
          "requiredFacts",
          "evidence",
          "tags",
          "difficulty",
        ],
      },
    },
  },
  required: ["cases"],
};

const caseVerificationSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          index: { type: "number" },
          valid: { type: "boolean" },
          issues: { type: "array", items: { type: "string" } },
        },
        required: ["index", "valid", "issues"],
      },
    },
  },
  required: ["results"],
};

const absenceVerificationSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          index: { type: "number" },
          answerPresent: { type: "boolean" },
          pageNumbers: { type: "array", items: { type: "number" } },
          rationale: { type: "string" },
        },
        required: ["index", "answerPresent", "pageNumbers", "rationale"],
      },
    },
  },
  required: ["results"],
};

function evenlySample<T>(items: T[], count: number) {
  if (items.length <= count) return items;
  return Array.from({ length: count }, (_, index) => {
    const position = Math.round((index * (items.length - 1)) / (count - 1));
    return items[position]!;
  });
}

function pagePayload(pages: CorpusPage[], maxCharacters = 7_000) {
  return pages.map((page) => ({
    pageNumber: page.pageNumber,
    text: page.extractedText.slice(0, maxCharacters),
  }));
}

function normalizeForMatch(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

async function loadPrompt(name: string) {
  return await readFile(path.join(PROMPTS_DIR, name), "utf8");
}

async function generateCandidateBatch(args: {
  document: CorpusDocument;
  pages: CorpusPage[];
  type: "single_turn" | "page_scoped";
  count: number;
  model: string;
}) {
  const prompt = await loadPrompt("case-generator.md");
  const sampled = evenlySample(
    args.pages.filter((page) => page.extractedText.trim().length >= 300),
    args.type === "single_turn" ? 14 : 8,
  );
  const response = await structuredCompletion<{ cases: CandidateCase[] }>({
    model: args.model,
    schemaName: "evaluation_case_candidates",
    schema: candidateCasesSchema,
    reasoningEffort: "medium",
    maxCompletionTokens: 16_384,
    messages: [
      { role: "system", content: prompt },
      {
        role: "user",
        content: JSON.stringify({
          documentTitle: args.document.title,
          requestedType: args.type,
          requestedCount: args.count,
          requirements:
            args.type === "page_scoped"
              ? "Set pageNumber for every case and use evidence only from that page."
              : "Set pageNumber to null and use one or more supporting pages.",
          pages: pagePayload(sampled),
        }),
      },
    ],
  });
  return { candidates: response.output.cases, usage: response.usage, sampled };
}

async function verifyAnswerableBatch(
  candidates: CandidateCase[],
  pages: CorpusPage[],
  model: string,
) {
  const evidencePageNumbers = new Set(
    candidates.flatMap((candidate) =>
      candidate.evidence.map((evidence) => evidence.pageNumber),
    ),
  );
  const relevantPages = pages.filter((page) =>
    evidencePageNumbers.has(page.pageNumber),
  );
  const prompt = await loadPrompt("case-verifier.md");
  const response = await structuredCompletion<{
    results: Array<{ index: number; valid: boolean; issues: string[] }>;
  }>({
    model,
    schemaName: "evaluation_case_verification",
    schema: caseVerificationSchema,
    reasoningEffort: "medium",
    maxCompletionTokens: 12_000,
    messages: [
      { role: "system", content: prompt },
      {
        role: "user",
        content: JSON.stringify({
          cases: candidates.map((candidate, index) => ({
            index,
            ...candidate,
          })),
          pages: pagePayload(relevantPages, 12_000),
        }),
      },
    ],
  });

  const pagesByNumber = new Map(pages.map((page) => [page.pageNumber, page]));
  const validIndexes = new Set(
    response.output.results
      .filter((result) => result.valid)
      .map((result) => result.index),
  );
  return {
    valid: candidates.filter((candidate, index) => {
      if (!validIndexes.has(index)) return false;
      if (
        candidate.type === "page_scoped" &&
        (candidate.pageNumber === null ||
          candidate.evidence.some(
            (evidence) => evidence.pageNumber !== candidate.pageNumber,
          ))
      ) {
        return false;
      }
      if (candidate.type === "single_turn" && candidate.pageNumber !== null) {
        return false;
      }
      return candidate.evidence.every((evidence) => {
        const page = pagesByNumber.get(evidence.pageNumber);
        return (
          page !== undefined &&
          normalizeForMatch(page.extractedText).includes(
            normalizeForMatch(evidence.quote),
          )
        );
      });
    }),
    usage: response.usage,
  };
}

async function generateUnanswerableCandidates(args: {
  target: CorpusDocument;
  targetPages: CorpusPage[];
  source: CorpusDocument;
  sourcePages: CorpusPage[];
  model: string;
  count: number;
}) {
  const prompt = await loadPrompt("case-generator.md");
  const response = await structuredCompletion<{ cases: CandidateCase[] }>({
    model: args.model,
    schemaName: "unanswerable_case_candidates",
    schema: candidateCasesSchema,
    reasoningEffort: "medium",
    maxCompletionTokens: 16_384,
    messages: [
      { role: "system", content: prompt },
      {
        role: "user",
        content: JSON.stringify({
          targetDocument: args.target.title,
          targetPageSummaries: args.targetPages.map((page) => ({
            pageNumber: page.pageNumber,
            summary: page.summary,
          })),
          unrelatedSourceDocument: args.source.title,
          unrelatedSourcePages: pagePayload(evenlySample(args.sourcePages, 8)),
          requestedType: "unanswerable",
          requestedCount: args.count,
          requirements:
            "Create plausible questions whose requested facts are absent from the target document. Set pageNumber to null, answerability to unanswerable, requiredFacts and evidence to empty arrays, and explain the expected abstention in referenceAnswer.",
        }),
      },
    ],
  });
  return { candidates: response.output.cases, usage: response.usage };
}

async function verifyUnanswerableBatch(
  candidates: CandidateCase[],
  pages: CorpusPage[],
  model: string,
) {
  const prompt = await loadPrompt("case-verifier.md");
  const answerPresent = new Set<number>();
  let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  for (let start = 0; start < pages.length; start += 10) {
    const batch = pages.slice(start, start + 10);
    const response = await structuredCompletion<{
      results: Array<{
        index: number;
        answerPresent: boolean;
        pageNumbers: number[];
        rationale: string;
      }>;
    }>({
      model,
      schemaName: "unanswerable_case_verification",
      schema: absenceVerificationSchema,
      reasoningEffort: "medium",
      maxCompletionTokens: 12_000,
      messages: [
        { role: "system", content: prompt },
        {
          role: "user",
          content: JSON.stringify({
            task: "For every question, determine whether this page batch contains enough information to answer it.",
            questions: candidates.map((candidate, index) => ({
              index,
              question: candidate.question,
            })),
            pages: pagePayload(batch, 12_000),
          }),
        },
      ],
    });
    usage = {
      promptTokens: usage.promptTokens + response.usage.promptTokens,
      completionTokens:
        usage.completionTokens + response.usage.completionTokens,
      totalTokens: usage.totalTokens + response.usage.totalTokens,
    };
    for (const result of response.output.results) {
      if (result.answerPresent) answerPresent.add(result.index);
    }
  }

  return {
    valid: candidates.filter((_, index) => !answerPresent.has(index)),
    usage,
  };
}

async function generateVerifiedAnswerableCases(args: {
  document: CorpusDocument;
  pages: CorpusPage[];
  type: "single_turn" | "page_scoped";
  targetCount: number;
  authorModel: string;
  verifierModel: string;
}) {
  const valid: CandidateCase[] = [];
  const usage: Array<Record<string, unknown>> = [];
  for (
    let attempt = 0;
    attempt < 3 && valid.length < args.targetCount;
    attempt += 1
  ) {
    const generated = await generateCandidateBatch({
      document: args.document,
      pages: args.pages,
      type: args.type,
      count: args.targetCount * 2,
      model: args.authorModel,
    });
    const verified = await verifyAnswerableBatch(
      generated.candidates,
      args.pages,
      args.verifierModel,
    );
    for (const candidate of verified.valid) {
      if (
        !valid.some(
          (existing) =>
            normalizeForMatch(existing.question) ===
            normalizeForMatch(candidate.question),
        )
      ) {
        valid.push(candidate);
      }
    }
    usage.push({
      author: generated.usage,
      verifier: verified.usage,
      accepted: verified.valid.length,
    });
  }
  return { valid, usage };
}

function finalizeCases(args: {
  candidates: CandidateCase[];
  document: CorpusDocument;
  prefix: "st" | "ps" | "ua";
  count: number;
  authorModel: string;
  verifierModel: string;
}): EvaluationCase[] {
  if (args.candidates.length < args.count) {
    throw new Error(
      `${args.document.key} produced only ${args.candidates.length}/${args.count} valid ${args.prefix} cases`,
    );
  }
  return args.candidates.slice(0, args.count).map((candidate, index) => ({
    ...candidate,
    id: `${args.document.key}-${args.prefix}-${String(index + 1).padStart(2, "0")}`,
    documentKey: args.document.key,
    authorModel: args.authorModel,
    verifierModel: args.verifierModel,
  }));
}

export async function generateDataset() {
  const manifest = readCorpusManifest();
  const authorModel = requiredEnv(
    "EVAL_AUTHOR_MODEL",
    requiredEnv("EVAL_JUDGE_MODEL", "gpt-5.6-luna"),
  );
  const verifierModel = requiredEnv("EVAL_JUDGE_MODEL", "gpt-5.6-luna");
  const pagesByDocument = new Map<string, CorpusPage[]>();

  for (const document of manifest.documents) {
    const pages = await convexRun<CorpusPage[]>(
      "evaluationData:getCorpusPages",
      {
        originalFilename: document.filename,
      },
    );
    if (pages.length !== document.pageCount) {
      throw new Error(`Page count mismatch while generating ${document.key}`);
    }
    pagesByDocument.set(document.key, pages);
  }

  let cases: EvaluationCase[] = [];
  let generationLog: Array<Record<string, unknown>> = [];
  try {
    cases = (await readFile(path.join(DATASET_DIR, "cases.jsonl"), "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as EvaluationCase);
  } catch {
    cases = [];
  }
  try {
    generationLog = (
      await readFile(path.join(DATASET_DIR, "generation-log.jsonl"), "utf8")
    )
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  } catch {
    generationLog = [];
  }

  for (
    let documentIndex = 0;
    documentIndex < manifest.documents.length;
    documentIndex += 1
  ) {
    const document = manifest.documents[documentIndex]!;
    const pages = pagesByDocument.get(document.key)!;
    if (
      cases.filter((item) => item.documentKey === document.key).length === 12
    ) {
      console.log(`reuse generated cases for ${document.key}`);
      continue;
    }
    cases = cases.filter((item) => item.documentKey !== document.key);
    generationLog = generationLog.filter(
      (item) => item.documentKey !== document.key,
    );
    console.log(`generate ${document.key}`);

    const single = await generateVerifiedAnswerableCases({
      document,
      pages,
      type: "single_turn",
      targetCount: 6,
      authorModel,
      verifierModel,
    });
    cases.push(
      ...finalizeCases({
        candidates: single.valid,
        document,
        prefix: "st",
        count: 6,
        authorModel,
        verifierModel,
      }),
    );

    const scoped = await generateVerifiedAnswerableCases({
      document,
      pages,
      type: "page_scoped",
      targetCount: 3,
      authorModel,
      verifierModel,
    });
    cases.push(
      ...finalizeCases({
        candidates: scoped.valid,
        document,
        prefix: "ps",
        count: 3,
        authorModel,
        verifierModel,
      }),
    );

    const preferredSourceKey =
      document.key === "federal-reserve-economic-well-being-2024"
        ? "nist-csf-2.0"
        : "federal-reserve-economic-well-being-2024";
    const sourceCandidates = [
      manifest.documents.find((item) => item.key === preferredSourceKey)!,
      ...manifest.documents.filter(
        (item) => item.key !== document.key && item.key !== preferredSourceKey,
      ),
    ];
    const validUnanswerable: CandidateCase[] = [];
    const unanswerableUsage: Array<Record<string, unknown>> = [];
    for (
      let attempt = 0;
      attempt < 3 && validUnanswerable.length < 3;
      attempt += 1
    ) {
      const source = sourceCandidates[attempt]!;
      const unanswerable = await generateUnanswerableCandidates({
        target: document,
        targetPages: pages,
        source,
        sourcePages: pagesByDocument.get(source.key)!,
        model: authorModel,
        count: 8,
      });
      const verified = await verifyUnanswerableBatch(
        unanswerable.candidates,
        pages,
        verifierModel,
      );
      for (const candidate of verified.valid) {
        if (
          !validUnanswerable.some(
            (existing) =>
              normalizeForMatch(existing.question) ===
              normalizeForMatch(candidate.question),
          )
        ) {
          validUnanswerable.push(candidate);
        }
      }
      unanswerableUsage.push({
        sourceDocumentKey: source.key,
        author: unanswerable.usage,
        verifier: verified.usage,
        accepted: verified.valid.length,
      });
    }
    cases.push(
      ...finalizeCases({
        candidates: validUnanswerable,
        document,
        prefix: "ua",
        count: 3,
        authorModel,
        verifierModel,
      }),
    );

    generationLog.push({
      documentKey: document.key,
      generatedAt: new Date().toISOString(),
      authorModel,
      verifierModel,
      usage: {
        singleAttempts: single.usage,
        scopedAttempts: scoped.usage,
        unanswerableAttempts: unanswerableUsage,
      },
    });

    await writeFile(
      path.join(DATASET_DIR, "cases.jsonl"),
      `${cases.map((item) => JSON.stringify(item)).join("\n")}\n`,
    );
    await writeFile(
      path.join(DATASET_DIR, "generation-log.jsonl"),
      `${generationLog.map((item) => JSON.stringify(item)).join("\n")}\n`,
    );
    await writeFile(
      path.join(DATASET_DIR, "dataset.json"),
      `${JSON.stringify(
        {
          version: "1.0.0",
          status: "generating",
          generatedCaseCount: cases.length,
          targetCaseCount: 60,
          casesFile: "cases.jsonl",
        },
        null,
        2,
      )}\n`,
    );
  }

  if (cases.length !== 60) {
    throw new Error(`Expected 60 evaluation cases, generated ${cases.length}`);
  }

  await writeFile(
    path.join(DATASET_DIR, "cases.jsonl"),
    `${cases.map((item) => JSON.stringify(item)).join("\n")}\n`,
  );
  await writeFile(
    path.join(DATASET_DIR, "generation-log.jsonl"),
    `${generationLog.map((item) => JSON.stringify(item)).join("\n")}\n`,
  );
  await writeFile(
    path.join(DATASET_DIR, "dataset.json"),
    `${JSON.stringify(
      {
        version: "1.0.0",
        status: "ready",
        generatedAt: new Date().toISOString(),
        caseCount: cases.length,
        caseMix: {
          single_turn: cases.filter((item) => item.type === "single_turn")
            .length,
          page_scoped: cases.filter((item) => item.type === "page_scoped")
            .length,
          unanswerable: cases.filter((item) => item.type === "unanswerable")
            .length,
        },
        authorModel,
        verifierModel,
        casesFile: "cases.jsonl",
      },
      null,
      2,
    )}\n`,
  );
  console.log(`Generated ${cases.length} verified evaluation cases.`);
}
