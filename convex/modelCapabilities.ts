// GPT-5 and o-series are OpenAI reasoning models (as opposed to older chat models
// like gpt-4.1 / gpt-4o).
const REASONING_MODEL_PATTERN = /^(gpt-5|o\d)/i;

/**
 * GPT-5 and o-series are reasoning models: OpenAI locks their sampling
 * parameters, so the chat completions API rejects a custom `temperature` with a
 * 400 ("only the default (1) value is supported"). Older chat models
 * (gpt-4.1, gpt-4o, etc.) still accept it.
 *
 * Pure helper with no node-only imports so it can be shared by both the Node
 * action runtime and the default Convex runtime.
 */
export function modelSupportsTemperature(model: string): boolean {
  return !REASONING_MODEL_PATTERN.test(model.trim());
}

/**
 * Only reasoning models accept `reasoning_effort`; sending it to an older chat
 * model errors. This is the inverse of `modelSupportsTemperature`.
 */
export function modelSupportsReasoningEffort(model: string): boolean {
  return REASONING_MODEL_PATTERN.test(model.trim());
}

// All effort levels used across supported reasoning-model families, ascending.
// Individual families expose only a subset, which is enforced below.
const REASONING_EFFORT_ORDER = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;
export type ReasoningEffort = (typeof REASONING_EFFORT_ORDER)[number];

// `reasoning_effort` support differs by model family, and sending an unsupported
// value 400s. Special-case the known exceptions; treat every other reasoning model
// as supporting the full minimal→high range. Each list is ascending.
function supportedReasoningEfforts(model: string): ReasoningEffort[] {
  const m = model.trim().toLowerCase();
  // *-pro models only accept "high".
  if (m.includes("-pro")) return ["high"];
  // GPT-5.6 replaces "minimal" with "none" and adds two higher effort levels.
  if (m.startsWith("gpt-5.6"))
    return ["none", "low", "medium", "high", "xhigh", "max"];
  // o-series and the gpt-5.1 family don't accept "minimal".
  if (/^o\d/.test(m) || m.startsWith("gpt-5.1"))
    return ["low", "medium", "high"];
  return ["minimal", "low", "medium", "high"];
}

// Maps a desired effort to the nearest value the model actually supports: the
// lowest supported effort >= desired, or the model's max if desired exceeds all.
// Guarantees a value the API will accept.
function clampReasoningEffort(
  model: string,
  desired: ReasoningEffort,
): ReasoningEffort {
  const supported = supportedReasoningEfforts(model);
  if (supported.includes(desired)) return desired;
  const desiredRank = REASONING_EFFORT_ORDER.indexOf(desired);
  return (
    supported.find((e) => REASONING_EFFORT_ORDER.indexOf(e) >= desiredRank) ??
    supported[supported.length - 1]
  );
}

/**
 * Resolves the `reasoning_effort` for answer generation. Returns `undefined` for
 * non-reasoning models (which reject the param). Reads `OPENAI_CHAT_REASONING_EFFORT`
 * (default "low" — low enough to start streaming promptly, high enough for reliable
 * quote selection) and clamps it to what the configured model supports.
 */
export function resolveChatReasoningEffort(
  model: string,
): ReasoningEffort | undefined {
  if (!modelSupportsReasoningEffort(model)) return undefined;
  const raw = process.env.OPENAI_CHAT_REASONING_EFFORT?.trim().toLowerCase();
  const desired = (REASONING_EFFORT_ORDER as readonly string[]).includes(
    raw ?? "",
  )
    ? (raw as ReasoningEffort)
    : "low";
  return clampReasoningEffort(model, desired);
}

/**
 * Fastest valid nonzero `reasoning_effort` for lightweight routing, or
 * `undefined` for non-reasoning models. "minimal" where supported; clamps up to
 * "low" on GPT-5.6, GPT-5.1, and o-series, or "high" on *-pro models.
 */
export function resolveRoutingReasoningEffort(
  model: string,
): ReasoningEffort | undefined {
  if (!modelSupportsReasoningEffort(model)) return undefined;
  return clampReasoningEffort(model, "minimal");
}
