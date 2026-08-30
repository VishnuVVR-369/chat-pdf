import { readFile } from "node:fs/promises";
import path from "node:path";
import { PROMPTS_DIR, requiredEnv } from "./config";
import { structuredCompletion, type JsonSchema } from "./openai";
import {
  EMPTY_USAGE,
  type AnswerJudgment,
  type EvaluationCase,
  type EvaluationTrace,
  type FinalJudgment,
  type JudgePass,
  type ModelCall,
  type ModelCallStage,
  type RetrievalJudgment,
  type TokenUsage,
} from "./types";

const retrievalSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    chunkGrades: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          sourceId: { type: "string" },
          relevance: { type: "integer", minimum: 0, maximum: 3 },
          rationale: { type: "string" },
        },
        required: ["sourceId", "relevance", "rationale"],
      },
    },
    contextSufficiency: { type: "integer", minimum: 0, maximum: 4 },
    evidenceCoverage: { type: "integer", minimum: 0, maximum: 4 },
    contextNoise: { type: "integer", minimum: 0, maximum: 4 },
    pageScopeCompliant: { type: "boolean" },
    missingEvidence: { type: "array", items: { type: "string" } },
    overallPass: { type: "boolean" },
    rationale: { type: "string" },
  },
  required: [
    "chunkGrades",
    "contextSufficiency",
    "evidenceCoverage",
    "contextNoise",
    "pageScopeCompliant",
    "missingEvidence",
    "overallPass",
    "rationale",
  ],
};

const answerSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    correctness: { type: "integer", minimum: 0, maximum: 4 },
    completeness: { type: "integer", minimum: 0, maximum: 4 },
    groundedness: { type: "integer", minimum: 0, maximum: 4 },
    citationCorrectness: { type: "integer", minimum: 0, maximum: 4 },
    citationCompleteness: { type: "integer", minimum: 0, maximum: 4 },
    relevance: { type: "integer", minimum: 0, maximum: 4 },
    abstention: {
      type: "string",
      enum: ["correct", "incorrect", "not_applicable"],
    },
    overallPass: { type: "boolean" },
    rationale: { type: "string" },
  },
  required: [
    "correctness",
    "completeness",
    "groundedness",
    "citationCorrectness",
    "citationCompleteness",
    "relevance",
    "abstention",
    "overallPass",
    "rationale",
  ],
};

const adjudicationSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    retrieval: retrievalSchema,
    answer: answerSchema,
  },
  required: ["retrieval", "answer"],
};

const numericRetrievalKeys = [
  "contextSufficiency",
  "evidenceCoverage",
  "contextNoise",
] as const;
const numericAnswerKeys = [
  "correctness",
  "completeness",
  "groundedness",
  "citationCorrectness",
  "citationCompleteness",
  "relevance",
] as const;

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    cachedPromptTokens: a.cachedPromptTokens + b.cachedPromptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    reasoningTokens: a.reasoningTokens + b.reasoningTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

function toModelCall(
  stage: ModelCallStage,
  model: string,
  completion: {
    usage: TokenUsage;
    latencyMs: number;
    attempts: number;
    retryWaitMs: number;
    usageReported: boolean;
  },
): ModelCall {
  return {
    stage,
    model,
    usage: completion.usage,
    latencyMs: completion.latencyMs,
    attempts: completion.attempts,
    retryWaitMs: completion.retryWaitMs,
    usageReported: completion.usageReported,
  };
}

function judgePayload(evaluationCase: EvaluationCase, trace: EvaluationTrace) {
  const sourceIdByChunkId = new Map(
    trace.retrieval.finalChunks.map((chunk) => [chunk._id, chunk.sourceId]),
  );
  return {
    case: {
      type: evaluationCase.type,
      question: evaluationCase.question,
      pageNumber: evaluationCase.pageNumber,
      answerability: evaluationCase.answerability,
      referenceAnswer: evaluationCase.referenceAnswer,
      requiredFacts: evaluationCase.requiredFacts,
      goldEvidence: evaluationCase.evidence,
    },
    retrievedChunks: trace.retrieval.finalChunks.map((chunk) => ({
      sourceId: chunk.sourceId,
      startPageNumber: chunk.startPageNumber,
      endPageNumber: chunk.endPageNumber,
      pageNumbers: [...new Set(chunk.pageSpans.map((span) => span.pageNumber))],
      selectedByRetriever: chunk.hybridScore > 0,
      text: chunk.text,
    })),
    answer: trace.generation.answer,
    rawCitations: trace.generation.rawCitations,
    validatedCitations: trace.generation.validatedCitations.map((citation) => ({
      sourceId: sourceIdByChunkId.get(citation.chunkId) ?? "unknown",
      pageNumber: citation.pageNumber,
      quote: citation.quote,
      snippet: citation.snippet,
    })),
  };
}

async function runJudgePass(
  evaluationCase: EvaluationCase,
  trace: EvaluationTrace,
  model: string,
): Promise<JudgePass> {
  const [retrievalPrompt, answerPrompt] = await Promise.all([
    readFile(path.join(PROMPTS_DIR, "retrieval-judge.md"), "utf8"),
    readFile(path.join(PROMPTS_DIR, "answer-judge.md"), "utf8"),
  ]);
  const payload = judgePayload(evaluationCase, trace);
  const [retrieval, answer] = await Promise.all([
    structuredCompletion<RetrievalJudgment>({
      model,
      schemaName: "retrieval_quality_judgment",
      schema: retrievalSchema,
      messages: [
        { role: "system", content: retrievalPrompt },
        { role: "user", content: JSON.stringify(payload) },
      ],
    }),
    structuredCompletion<AnswerJudgment>({
      model,
      schemaName: "answer_quality_judgment",
      schema: answerSchema,
      messages: [
        { role: "system", content: answerPrompt },
        { role: "user", content: JSON.stringify(payload) },
      ],
    }),
  ]);
  return {
    retrieval: retrieval.output,
    answer: answer.output,
    model,
    usage: addUsage(retrieval.usage, answer.usage),
    calls: [
      toModelCall("judge_retrieval", model, retrieval),
      toModelCall("judge_answer", model, answer),
    ],
  };
}

function passesAgree(a: JudgePass, b: JudgePass) {
  if (
    a.retrieval.overallPass !== b.retrieval.overallPass ||
    a.answer.overallPass !== b.answer.overallPass ||
    a.retrieval.pageScopeCompliant !== b.retrieval.pageScopeCompliant ||
    a.answer.abstention !== b.answer.abstention
  ) {
    return false;
  }
  return (
    numericRetrievalKeys.every(
      (key) => Math.abs(a.retrieval[key] - b.retrieval[key]) <= 1,
    ) &&
    numericAnswerKeys.every(
      (key) => Math.abs(a.answer[key] - b.answer[key]) <= 1,
    )
  );
}

function average(values: number[]) {
  return (
    Math.round(
      (values.reduce((sum, value) => sum + value, 0) / values.length) * 10,
    ) / 10
  );
}

function mergeAgreedPasses(passes: JudgePass[]) {
  const first = passes[0]!;
  const retrieval: RetrievalJudgment = {
    ...first.retrieval,
    contextSufficiency: average(
      passes.map((pass) => pass.retrieval.contextSufficiency),
    ),
    evidenceCoverage: average(
      passes.map((pass) => pass.retrieval.evidenceCoverage),
    ),
    contextNoise: average(passes.map((pass) => pass.retrieval.contextNoise)),
    overallPass: passes.every((pass) => pass.retrieval.overallPass),
    rationale: passes
      .map((pass, index) => `Judge ${index + 1}: ${pass.retrieval.rationale}`)
      .join("\n"),
  };
  const answer: AnswerJudgment = {
    ...first.answer,
    correctness: average(passes.map((pass) => pass.answer.correctness)),
    completeness: average(passes.map((pass) => pass.answer.completeness)),
    groundedness: average(passes.map((pass) => pass.answer.groundedness)),
    citationCorrectness: average(
      passes.map((pass) => pass.answer.citationCorrectness),
    ),
    citationCompleteness: average(
      passes.map((pass) => pass.answer.citationCompleteness),
    ),
    relevance: average(passes.map((pass) => pass.answer.relevance)),
    overallPass: passes.every((pass) => pass.answer.overallPass),
    rationale: passes
      .map((pass, index) => `Judge ${index + 1}: ${pass.answer.rationale}`)
      .join("\n"),
  };
  return { retrieval, answer };
}

export async function judgeEvaluationCase(
  evaluationCase: EvaluationCase,
  trace: EvaluationTrace,
): Promise<FinalJudgment> {
  const model = requiredEnv("EVAL_JUDGE_MODEL", "gpt-5.6-luna");
  const passCount = Math.max(1, Number(process.env.EVAL_JUDGE_PASSES ?? "2"));
  const passes: JudgePass[] = [];
  for (let index = 0; index < passCount; index += 1) {
    passes.push(await runJudgePass(evaluationCase, trace, model));
  }
  const agreement = passes
    .slice(1)
    .every((pass) => passesAgree(passes[0]!, pass));
  if (agreement || passes.length === 1) {
    return {
      ...mergeAgreedPasses(passes),
      passes,
      adjudicated: false,
      agreement: true,
    };
  }

  const adjudicatorPrompt = (
    await Promise.all(
      ["adjudicator.md", "retrieval-judge.md", "answer-judge.md"].map(
        (filename) => readFile(path.join(PROMPTS_DIR, filename), "utf8"),
      ),
    )
  ).join("\n\n---\n\n");
  const adjudicated = await structuredCompletion<{
    retrieval: RetrievalJudgment;
    answer: AnswerJudgment;
  }>({
    model,
    schemaName: "evaluation_adjudication",
    schema: adjudicationSchema,
    messages: [
      { role: "system", content: adjudicatorPrompt },
      {
        role: "user",
        content: JSON.stringify({
          ...judgePayload(evaluationCase, trace),
          independentJudgments: passes.map((pass) => ({
            retrieval: pass.retrieval,
            answer: pass.answer,
          })),
        }),
      },
    ],
    maxCompletionTokens: 10_000,
  });
  return {
    retrieval: adjudicated.output.retrieval,
    answer: adjudicated.output.answer,
    passes,
    adjudicated: true,
    agreement: false,
    adjudicatorUsage: adjudicated.usage,
    adjudicatorCall: toModelCall("adjudication", model, adjudicated),
  };
}

export async function verifyJudgeCalibration() {
  const baseCase: EvaluationCase = {
    id: "calibration",
    documentKey: "calibration",
    type: "single_turn",
    question: "What color is the signal?",
    pageNumber: null,
    answerability: "answerable",
    referenceAnswer: "The signal is green.",
    requiredFacts: ["The signal is green."],
    evidence: [{ pageNumber: 1, quote: "The signal is green." }],
    tags: ["calibration"],
    difficulty: "easy",
    authorModel: "fixture",
    verifierModel: "fixture",
  };
  const makeTrace = (answer: string): EvaluationTrace => ({
    document: {
      documentId: "calibration-document",
      title: "Calibration",
      originalFilename: "calibration.pdf",
      sha256: "calibration",
    },
    routing: {
      retrievalMode: "chunks",
      standaloneQuery: baseCase.question,
      source: "heuristic",
      latencyMs: 0,
    },
    retrieval: {
      query: baseCase.question,
      vectorCandidates: [],
      lexicalCandidates: [],
      selectedChunks: [],
      neighborChunks: [],
      finalChunks: [
        {
          _id: "calibration-chunk",
          chunkIndex: 0,
          startPageNumber: 1,
          endPageNumber: 1,
          text: "The signal is green.",
          tokenCount: 4,
          pageSpans: [{ pageNumber: 1, startOffset: 0, endOffset: 20 }],
          hybridScore: 1,
          sourceId: "S1",
        },
      ],
      embedding: null,
      latencyMs: 0,
    },
    generation: {
      answer,
      rawResponse: "",
      rawCitations: [{ sourceId: "S1", quote: "The signal is green." }],
      validatedCitations: [
        {
          pageNumber: 1,
          snippet: "The signal is green.",
          chunkId: "calibration-chunk",
          startPageNumber: 1,
          endPageNumber: 1,
          quote: "The signal is green.",
          quoteStartOffset: 0,
          quoteEndOffset: 20,
          pageQuote: "The signal is green.",
          pageQuoteRatio: 0,
        },
      ],
      model: "fixture",
      latencyMs: 0,
      usage: null,
      finishReason: "stop",
      promptCharacters: 0,
      contextChunkCount: 1,
      contextTokenCount: 4,
    },
  });
  const [good, bad] = await Promise.all([
    judgeEvaluationCase(baseCase, makeTrace("The signal is green.")),
    judgeEvaluationCase(baseCase, makeTrace("The signal is red.")),
  ]);
  if (!good.answer.overallPass || bad.answer.overallPass) {
    throw new Error(
      "Judge calibration failed: the judge did not distinguish the supported and contradicted anchors.",
    );
  }
  const calls = [good, bad].flatMap((judgment) => [
    ...judgment.passes.flatMap((pass) => pass.calls),
    ...(judgment.adjudicatorCall ? [judgment.adjudicatorCall] : []),
  ]);
  return {
    usage: calls.reduce<TokenUsage>(
      (total, call) => addUsage(total, call.usage),
      { ...EMPTY_USAGE },
    ),
    calls,
  };
}
