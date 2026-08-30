import { normalizeUsage, type TokenUsage } from "./types";
import { requiredEnv } from "./config";

export type JsonSchema = Record<string, unknown>;

const MAX_ATTEMPTS = 5;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Judge calls run concurrently and are large, so a shared organisation TPM
 * ceiling is reached routinely. A 429 here is transient (the API reports a
 * retry-after under two seconds), and without a retry a one-second limit
 * permanently drops an otherwise healthy case from the run.
 */
function retryDelayMs(response: Response, attempt: number) {
  // Exponential floor with jitter: ~1s, 2s, 4s, 8s.
  const backoff = 2 ** attempt * 1_000 + Math.random() * 500;

  const header =
    response.headers.get("retry-after-ms") ??
    response.headers.get("retry-after");
  if (header) {
    const parsed = Number(header);
    if (Number.isFinite(parsed) && parsed > 0) {
      const advised = response.headers.get("retry-after-ms")
        ? parsed
        : parsed * 1_000;
      // Honour the server's advice, but never wait less than the exponential
      // floor: under sustained TPM pressure the API keeps advising the same
      // short delay, and retrying on that fixed interval burns every attempt
      // without ever letting the token window drain.
      return Math.max(advised, backoff);
    }
  }
  return backoff;
}

export async function structuredCompletion<T>(args: {
  model: string;
  schemaName: string;
  schema: JsonSchema;
  messages: Array<{ role: "system" | "user"; content: string }>;
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
  maxCompletionTokens?: number;
}): Promise<{
  output: T;
  usage: TokenUsage;
  latencyMs: number;
  attempts: number;
  retryWaitMs: number;
  usageReported: boolean;
}> {
  const body = JSON.stringify({
    model: args.model,
    messages: args.messages,
    ...(/^(gpt-5|o\d)/i.test(args.model)
      ? { reasoning_effort: args.reasoningEffort ?? "high" }
      : { temperature: 0 }),
    max_completion_tokens: args.maxCompletionTokens ?? 16_384,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: args.schemaName,
        strict: true,
        schema: args.schema,
      },
    },
  });

  const startedAt = Date.now();
  let attempts = 0;
  let retryWaitMs = 0;
  let response!: Response;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    attempts += 1;
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requiredEnv("OPENAI_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body,
    });
    if (response.ok) break;

    const retryable = response.status === 429 || response.status >= 500;
    const lastAttempt = attempt === MAX_ATTEMPTS - 1;
    if (!retryable || lastAttempt) {
      throw new Error(
        `OpenAI ${args.schemaName} failed: ${response.status} ${await response.text()}`,
      );
    }
    const delay = retryDelayMs(response, attempt);
    retryWaitMs += delay;
    await response.text().catch(() => undefined);
    console.warn(
      `OpenAI ${args.schemaName} ${response.status}; retrying in ${Math.round(delay)}ms ` +
        `(attempt ${attempt + 2}/${MAX_ATTEMPTS})`,
    );
    await sleep(delay);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      finish_reason?: string | null;
      message?: { content?: string | null; refusal?: string | null };
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      prompt_tokens_details?: { cached_tokens?: number } | null;
      completion_tokens_details?: { reasoning_tokens?: number } | null;
    } | null;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    const choice = payload.choices?.[0];
    throw new Error(
      `OpenAI ${args.schemaName} returned no content ` +
        `(finish=${choice?.finish_reason ?? "unknown"}, ` +
        `refusal=${choice?.message?.refusal ?? "none"})`,
    );
  }

  return {
    output: JSON.parse(content) as T,
    usage: normalizeUsage({
      promptTokens: payload.usage?.prompt_tokens ?? 0,
      cachedPromptTokens:
        payload.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      completionTokens: payload.usage?.completion_tokens ?? 0,
      reasoningTokens:
        payload.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
      totalTokens: payload.usage?.total_tokens ?? 0,
    }),
    latencyMs: Date.now() - startedAt,
    attempts,
    retryWaitMs,
    // Distinguishes "the API reported zero" from "the API reported nothing",
    // so a missing usage block cannot silently understate run cost.
    usageReported: Boolean(payload.usage),
  };
}
