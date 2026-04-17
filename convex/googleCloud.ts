"use node";

import { createPrivateKey } from "node:crypto";
import { Storage } from "@google-cloud/storage";
import { v1 as documentai } from "@google-cloud/documentai";

export type ServiceAccountCredentials = {
  client_email?: string;
  private_key?: string;
  project_id?: string;
};

function getRequiredEnv(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}

function parseServiceAccountCredentials(
  rawValue: string,
): ServiceAccountCredentials {
  const parseJson = (value: string) =>
    JSON.parse(value) as ServiceAccountCredentials;

  let credentials: ServiceAccountCredentials;

  try {
    credentials = parseJson(rawValue);
  } catch {
    try {
      credentials = parseJson(
        Buffer.from(rawValue, "base64").toString("utf-8"),
      );
    } catch {
      throw new Error(
        "GOOGLE_DOCUMENTAI_SERVICE_ACCOUNT_JSON must be valid service-account JSON or a base64-encoded JSON string.",
      );
    }
  }

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error(
      "GOOGLE_DOCUMENTAI_SERVICE_ACCOUNT_JSON must include client_email and private_key.",
    );
  }

  credentials.private_key = credentials.private_key
    .replace(/\\n/g, "\n")
    .trim();

  try {
    createPrivateKey({
      key: credentials.private_key,
      format: "pem",
    });
  } catch {
    throw new Error(
      "The Google service-account private key is invalid. Use the original PEM from the service-account JSON and preserve newline formatting, or provide the full JSON as base64.",
    );
  }

  return credentials;
}

export function loadGoogleCloudConfig() {
  const serviceAccountJson = getRequiredEnv(
    "GOOGLE_DOCUMENTAI_SERVICE_ACCOUNT_JSON",
  );
  const credentials = parseServiceAccountCredentials(serviceAccountJson);

  const projectId = getRequiredEnv(
    "GOOGLE_DOCUMENTAI_PROJECT_ID",
    credentials.project_id,
  );
  const location = getRequiredEnv("GOOGLE_DOCUMENTAI_LOCATION", "asia-south1");
  const processorId = getRequiredEnv("GOOGLE_DOCUMENTAI_PROCESSOR_ID");
  const bucketName = getRequiredEnv("GOOGLE_DOCUMENTAI_GCS_BUCKET");
  const inputPrefix = process.env.GOOGLE_DOCUMENTAI_GCS_INPUT_PREFIX ?? "input";
  const outputPrefix =
    process.env.GOOGLE_DOCUMENTAI_GCS_OUTPUT_PREFIX ?? "output";

  return {
    credentials,
    projectId,
    location,
    processorId,
    bucketName,
    inputPrefix,
    outputPrefix,
    apiEndpoint: `${location}-documentai.googleapis.com`,
    processorName: `projects/${projectId}/locations/${location}/processors/${processorId}`,
  };
}

export function createGoogleClients() {
  const config = loadGoogleCloudConfig();

  return {
    ...config,
    documentAiClient: new documentai.DocumentProcessorServiceClient({
      apiEndpoint: config.apiEndpoint,
      credentials: config.credentials,
      projectId: config.projectId,
    }),
    storageClient: new Storage({
      credentials: config.credentials,
      projectId: config.projectId,
    }),
  };
}
