"use node";

import OpenAI from "openai";

function getRequiredEnv(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;

  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }

  return value;
}

export function loadOpenAiEmbeddingConfig() {
  return {
    apiKey: getRequiredEnv("OPENAI_API_KEY"),
    embeddingModel: getRequiredEnv(
      "OPENAI_EMBEDDING_MODEL",
      "text-embedding-3-small",
    ),
  };
}

export function loadOpenAiChatConfig() {
  return {
    apiKey: getRequiredEnv("OPENAI_API_KEY"),
    chatModel: getRequiredEnv("OPENAI_CHAT_MODEL", "gpt-5.4-mini"),
  };
}

export function createOpenAiEmbeddingClient() {
  const config = loadOpenAiEmbeddingConfig();

  return {
    ...config,
    client: new OpenAI({
      apiKey: config.apiKey,
    }),
  };
}

export function createOpenAiChatClient() {
  const config = loadOpenAiChatConfig();

  return {
    ...config,
    client: new OpenAI({
      apiKey: config.apiKey,
    }),
  };
}
