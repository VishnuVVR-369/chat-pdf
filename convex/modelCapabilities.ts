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
  return !/^(gpt-5|o\d)/i.test(model.trim());
}
