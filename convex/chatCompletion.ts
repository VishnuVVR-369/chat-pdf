import {
  modelSupportsTemperature,
  resolveChatReasoningEffort,
} from "./modelCapabilities";
import {
  createAnswerExtractor,
  summaryAnswerFormat,
  structuredAnswerFormat,
} from "./chatHelpers";
import { MAX_CHAT_COMPLETION_TOKENS } from "../src/constants/chat";

export type StructuredResponseFormat =
  | typeof structuredAnswerFormat
  | typeof summaryAnswerFormat;

export type ChatCompletionUsage = {
  promptTokens: number;
  /** Subset of promptTokens served from the prompt cache and billed at the cached rate. */
  cachedPromptTokens: number;
  completionTokens: number;
  /** Subset of completionTokens spent on hidden reasoning. Billed at the output rate. */
  reasoningTokens: number;
  totalTokens: number;
};

export function getChatConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  const model = process.env.OPENAI_CHAT_MODEL ?? "gpt-5.6-luna";
  return { apiKey, model };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export async function streamStructuredAnswer(args: {
  apiKey: string;
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature: number;
  responseFormat: StructuredResponseFormat;
  signal?: AbortSignal;
  onToken: (token: string) => void;
}) {
  const reasoningEffort = resolveChatReasoningEffort(args.model);

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: args.signal,
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: args.model,
      messages: args.messages,
      ...(modelSupportsTemperature(args.model)
        ? { temperature: args.temperature }
        : {}),
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      max_completion_tokens: MAX_CHAT_COMPLETION_TOKENS,
      response_format: args.responseFormat,
      stream: true,
      stream_options: { include_usage: true },
    }),
  });

  if (!openaiRes.ok || !openaiRes.body) {
    const detail = await openaiRes.text().catch(() => "");
    throw new Error(
      `OpenAI API error: ${openaiRes.status}${detail ? ` ${detail}` : ""}`,
    );
  }

  const extractor = createAnswerExtractor();
  const reader = openaiRes.body.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = "";
  let aborted = false;
  let finishReason: string | null = null;
  let usage: ChatCompletionUsage | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      sseBuffer += decoder.decode(value, { stream: true });

      const lines = sseBuffer.split("\n");
      sseBuffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice("data: ".length).trim();
        if (raw === "[DONE]") break;
        let parsed: {
          choices?: Array<{
            delta?: { content?: string };
            finish_reason?: string | null;
          }>;
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
            prompt_tokens_details?: { cached_tokens?: number } | null;
            completion_tokens_details?: { reasoning_tokens?: number } | null;
          } | null;
        };
        try {
          parsed = JSON.parse(raw) as typeof parsed;
        } catch {
          continue;
        }
        if (parsed.usage) {
          const promptTokens = parsed.usage.prompt_tokens ?? 0;
          usage = {
            promptTokens,
            // Clamp: a cached count above the prompt total would make the
            // non-cached remainder negative and understate cost.
            cachedPromptTokens: Math.min(
              promptTokens,
              Math.max(
                0,
                parsed.usage.prompt_tokens_details?.cached_tokens ?? 0,
              ),
            ),
            completionTokens: parsed.usage.completion_tokens ?? 0,
            reasoningTokens: Math.max(
              0,
              parsed.usage.completion_tokens_details?.reasoning_tokens ?? 0,
            ),
            totalTokens: parsed.usage.total_tokens ?? 0,
          };
        }
        const choice = parsed.choices?.[0];
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        const delta = choice?.delta?.content ?? "";
        if (!delta) continue;
        const decoded = extractor.feed(delta);
        if (decoded) args.onToken(decoded);
      }
    }
  } catch (error) {
    if (!isAbortError(error)) throw error;
    aborted = true;
  }

  if (!aborted && finishReason === "length") {
    throw new Error("OpenAI completion reached its token limit");
  }

  return {
    rawBuffer: extractor.rawBuffer,
    complete: extractor.complete,
    aborted,
    usage,
    finishReason,
  };
}
