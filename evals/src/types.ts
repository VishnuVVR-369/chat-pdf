export type CorpusDocument = {
  key: string;
  title: string;
  filename: string;
  sourceUrl: string;
  publicationDate: string;
  pageCount: number;
  sizeBytes: number;
  sha256: string;
};

export type CorpusManifest = {
  version: string;
  downloadedAt: string;
  documents: CorpusDocument[];
};

export type Evidence = {
  pageNumber: number;
  quote: string;
};

export type EvaluationCase = {
  id: string;
  documentKey: string;
  type: "single_turn" | "page_scoped" | "unanswerable";
  question: string;
  pageNumber: number | null;
  answerability: "answerable" | "unanswerable";
  referenceAnswer: string;
  requiredFacts: string[];
  evidence: Evidence[];
  tags: string[];
  difficulty: "easy" | "medium" | "hard";
  authorModel: string;
  verifierModel: string;
};

export type RetrievedChunk = {
  _id: string;
  chunkIndex: number;
  startPageNumber: number;
  endPageNumber: number;
  text: string;
  tokenCount: number;
  pageSpans: Array<{
    pageNumber: number;
    startOffset: number;
    endOffset: number;
  }>;
};

export type RankedChunk = RetrievedChunk & {
  hybridScore: number;
  sourceId: string;
};

export type EvaluationTrace = {
  document: {
    documentId: string;
    title: string;
    originalFilename: string;
    sha256: string;
  };
  routing: {
    retrievalMode: "chunks" | "summaries";
    standaloneQuery: string;
    source: "heuristic" | "llm";
    latencyMs: number;
  };
  retrieval: {
    query: string;
    pageNumber?: number;
    vectorCandidates: Array<{
      chunkId: string;
      rank: number;
      score?: number;
    }>;
    lexicalCandidates: Array<{ chunkId: string; rank: number }>;
    selectedChunks: RankedChunk[];
    neighborChunks: RetrievedChunk[];
    finalChunks: RankedChunk[];
    embedding: {
      model: string;
      promptTokens: number;
      totalTokens: number;
      latencyMs: number;
    } | null;
    latencyMs: number;
  };
  generation: {
    answer: string;
    rawResponse: string;
    rawCitations: Array<{ sourceId: string; quote: string }>;
    validatedCitations: Array<{
      pageNumber: number;
      snippet: string;
      chunkId: string;
      startPageNumber: number;
      endPageNumber: number;
      quote: string;
      quoteStartOffset: number;
      quoteEndOffset: number;
      pageQuote: string;
      pageQuoteRatio: number;
    }>;
    model: string;
    latencyMs: number;
    usage: TokenUsage | null;
    finishReason: string | null;
    promptCharacters: number;
    contextChunkCount: number;
    contextTokenCount: number;
  };
};

export type TokenUsage = {
  promptTokens: number;
  /** Subset of promptTokens served from cache and billed at the cached rate. */
  cachedPromptTokens: number;
  completionTokens: number;
  /** Subset of completionTokens spent on hidden reasoning; billed at the output rate. */
  reasoningTokens: number;
  totalTokens: number;
};

export const EMPTY_USAGE: TokenUsage = {
  promptTokens: 0,
  cachedPromptTokens: 0,
  completionTokens: 0,
  reasoningTokens: 0,
  totalTokens: 0,
};

/**
 * Tolerates traces written before a field existed, and clamps values that would
 * make the non-cached remainder negative.
 */
export function normalizeUsage(
  usage: Partial<TokenUsage> | null | undefined,
): TokenUsage {
  if (!usage) return { ...EMPTY_USAGE };
  const promptTokens = Math.max(0, usage.promptTokens ?? 0);
  const completionTokens = Math.max(0, usage.completionTokens ?? 0);
  return {
    promptTokens,
    cachedPromptTokens: Math.min(
      promptTokens,
      Math.max(0, usage.cachedPromptTokens ?? 0),
    ),
    completionTokens,
    reasoningTokens: Math.min(
      completionTokens,
      Math.max(0, usage.reasoningTokens ?? 0),
    ),
    totalTokens: Math.max(
      0,
      usage.totalTokens ?? promptTokens + completionTokens,
    ),
  };
}

export type ModelCallStage =
  | "embedding"
  | "answer"
  | "judge_retrieval"
  | "judge_answer"
  | "adjudication";

/**
 * One billable API call. Every token, latency and cost figure in the report is
 * derived from a case's ledger of these, so nothing is counted twice or missed.
 */
export type ModelCall = {
  stage: ModelCallStage;
  model: string;
  usage: TokenUsage;
  latencyMs: number;
  /** 1 when the call succeeded first try; higher after 429/5xx retries. */
  attempts: number;
  /** Milliseconds spent sleeping on retry backoff. */
  retryWaitMs: number;
  /** False when the API returned no usage block, so its tokens are unknown rather than zero. */
  usageReported: boolean;
};

export type RetrievalJudgment = {
  chunkGrades: Array<{
    sourceId: string;
    relevance: number;
    rationale: string;
  }>;
  contextSufficiency: number;
  evidenceCoverage: number;
  contextNoise: number;
  pageScopeCompliant: boolean;
  missingEvidence: string[];
  overallPass: boolean;
  rationale: string;
};

export type AnswerJudgment = {
  correctness: number;
  completeness: number;
  groundedness: number;
  citationCorrectness: number;
  citationCompleteness: number;
  relevance: number;
  abstention: "correct" | "incorrect" | "not_applicable";
  overallPass: boolean;
  rationale: string;
};

export type JudgePass = {
  retrieval: RetrievalJudgment;
  answer: AnswerJudgment;
  model: string;
  usage: TokenUsage;
  calls: ModelCall[];
};

export type FinalJudgment = {
  retrieval: RetrievalJudgment;
  answer: AnswerJudgment;
  passes: JudgePass[];
  adjudicated: boolean;
  agreement: boolean;
  adjudicatorUsage?: TokenUsage;
  adjudicatorCall?: ModelCall;
};

export type EvaluationResult = {
  caseId: string;
  status: "complete" | "error";
  startedAt: string;
  completedAt: string;
  durationMs: number;
  evaluationCase: EvaluationCase;
  trace?: EvaluationTrace;
  judgment?: FinalJudgment;
  error?: string;
  /** Which stage the case died in, when status is "error". */
  errorStage?: "retrieval_or_answer" | "judging";
  /** Every billable call made for this case, including those made before a failure. */
  modelCalls: ModelCall[];
  /** Wall-clock the case occupied, which under concurrency exceeds the sum of its calls. */
  wallClockMs: number;
};

export type RunManifest = {
  runId: string;
  startedAt: string;
  completedAt?: string;
  gitSha: string;
  dirtyWorktree: boolean;
  datasetVersion: string;
  datasetSha256: string;
  corpusVersion: string;
  corpusSha256: string;
  convexDeployment: string;
  answerModel: string;
  embeddingModel: string;
  judgeModel: string;
  judgePasses: number;
  caseCount: number;
  caseIds: string[];
  promptSha256: Record<string, string>;
  calibration?: {
    passed: boolean;
    usage: TokenUsage;
    calls?: ModelCall[];
  };
  /** Wall-clock of the whole run, and the concurrency it was executed at. */
  concurrency?: number;
};

export type CorpusPage = {
  pageNumber: number;
  extractedText: string;
  summary: string;
};
