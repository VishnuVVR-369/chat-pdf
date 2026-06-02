import {
  Accordion,
  BulletList,
  Callout,
  Diagram,
  EnvTable,
  FieldTable,
} from "@/components/docs/mdx";
import { dataModelDiagram } from "../diagrams";
import type { DocsGroup } from "../types";

export const referenceGroup: DocsGroup = {
  title: "Reference",
  pages: [
    {
      slug: "reference/data-model",
      group: "Reference",
      eyebrow: "Reference",
      title: "Data model",
      description:
        "The Convex tables that back documents, their extracted content, and conversations — plus the indexes that power retrieval.",
      quickFacts: [
        { label: "Tables", value: "5 core" },
        { label: "Embeddings", value: "1536-dim" },
        { label: "Indexes", value: "Vector + text" },
      ],
      sections: [
        {
          id: "relationships",
          title: "Relationships",
          body: (
            <>
              <p>
                A document owns its extracted pages and chunks, and any
                conversations started against it. Messages belong to a
                conversation and can reference the chunks they cite.
              </p>
              <Diagram
                caption="Core tables and their relationships. Every row also carries an owner token for authorization."
                chart={dataModelDiagram}
              />
            </>
          ),
        },
        {
          id: "documents",
          title: "documents",
          body: (
            <>
              <p>One row per uploaded PDF, tracking its lifecycle and artifacts.</p>
              <FieldTable
                rows={[
                  {
                    name: "ownerTokenIdentifier",
                    type: "string",
                    description: "Authenticated owner; every query filters on it.",
                  },
                  {
                    name: "status",
                    type: "union",
                    description:
                      "uploading · uploaded · processing · ready · failed.",
                  },
                  {
                    name: "title / originalFilename",
                    type: "string",
                    description: "Display title and the uploaded file name.",
                  },
                  {
                    name: "documentSummary",
                    type: "string",
                    description: "LLM document summary used in summaries mode.",
                  },
                  {
                    name: "sha256 / storageSize",
                    type: "string · number",
                    description: "Content hash and byte size of the stored file.",
                  },
                  {
                    name: "pageCount",
                    type: "number?",
                    description: "Detected page count (≤ 100 to process).",
                  },
                  {
                    name: "embeddedChunkCount",
                    type: "number?",
                    description: "Chunks embedded once processing succeeds.",
                  },
                ]}
                caption="Abbreviated — OCR provenance and timing fields (ocr*, *CompletedAt, processingAttemptCount) are also stored."
              />
            </>
          ),
        },
        {
          id: "pages-chunks",
          title: "documentPages & documentChunks",
          body: (
            <>
              <p>
                Pages hold the OCR text and a summary per page. Chunks are the
                retrieval unit — overlapping windows of text with the page spans
                needed to resolve citations.
              </p>
              <FieldTable
                rows={[
                  {
                    name: "documentPages.extractedText",
                    type: "string",
                    description: "OCR text for a single page.",
                  },
                  {
                    name: "documentPages.summary",
                    type: "string",
                    description: "Per-page LLM summary (summaries mode).",
                  },
                  {
                    name: "documentChunks.text",
                    type: "string",
                    description: "~450-word chunk with 75-word overlap.",
                  },
                  {
                    name: "documentChunks.pageSpans",
                    type: "object[]",
                    description:
                      "Page number + character offsets, used to resolve a quote to a page.",
                  },
                  {
                    name: "embedding",
                    type: "float64[1536]",
                    description: "Vector for semantic search (both tables).",
                  },
                ]}
              />
              <Callout type="note" title="Indexes that power retrieval">
                <code>documentChunks</code> has a vector index{" "}
                <code>by_embedding</code> (1536-dim, filtered by document) and a
                full-text <code>search_text</code> index. Hybrid retrieval queries
                both and fuses the results.
              </Callout>
            </>
          ),
        },
        {
          id: "conversations-messages",
          title: "conversations & messages",
          body: (
            <FieldTable
              rows={[
                {
                  name: "conversations.documentId",
                  type: "id",
                  description: "The document this conversation is scoped to.",
                },
                {
                  name: "messages.role",
                  type: "union",
                  description: "user or assistant.",
                },
                {
                  name: "messages.content",
                  type: "string",
                  description: "The message text (assistant answers are stored).",
                },
                {
                  name: "messages.citations",
                  type: "object[]?",
                  description:
                    "Validated citations: pageNumber, snippet, chunkId, quote, and offsets.",
                },
              ]}
            />
          ),
        },
      ],
    },
    {
      slug: "reference/environment-variables",
      group: "Reference",
      eyebrow: "Reference",
      title: "Environment variables",
      description: "The variables from .env.example, grouped by service.",
      sections: [
        {
          id: "convex",
          title: "Convex",
          body: (
            <EnvTable
              rows={[
                {
                  name: "CONVEX_DEPLOYMENT",
                  purpose: "Deployment identifier used by Convex tooling.",
                },
                {
                  name: "NEXT_PUBLIC_CONVEX_URL",
                  purpose: "Browser-readable Convex URL used by the frontend.",
                },
                {
                  name: "NEXT_PUBLIC_CONVEX_SITE_URL",
                  purpose: "Convex site URL used by auth and server integration.",
                },
              ]}
            />
          ),
        },
        {
          id: "auth",
          title: "Auth and site URLs",
          body: (
            <EnvTable
              rows={[
                { name: "SITE_URL", purpose: "Server-side canonical app URL." },
                {
                  name: "NEXT_PUBLIC_SITE_URL",
                  purpose: "Browser-readable canonical app URL.",
                },
                {
                  name: "BETTER_AUTH_SECRET",
                  purpose: "Secret used by Better Auth.",
                },
                { name: "GOOGLE_CLIENT_ID", purpose: "Google OAuth client ID." },
                {
                  name: "GOOGLE_CLIENT_SECRET",
                  purpose: "Google OAuth client secret.",
                },
                { name: "GITHUB_CLIENT_ID", purpose: "GitHub OAuth client ID." },
                {
                  name: "GITHUB_CLIENT_SECRET",
                  purpose: "GitHub OAuth client secret.",
                },
              ]}
            />
          ),
        },
        {
          id: "document-ai",
          title: "Google Document AI",
          body: (
            <EnvTable
              rows={[
                {
                  name: "GOOGLE_DOCUMENTAI_SERVICE_ACCOUNT_JSON",
                  purpose:
                    "Service account JSON with access to Document AI and Cloud Storage.",
                },
                {
                  name: "GOOGLE_DOCUMENTAI_PROJECT_ID",
                  purpose: "Google Cloud project that owns the processor.",
                },
                {
                  name: "GOOGLE_DOCUMENTAI_LOCATION",
                  purpose: "Processor location, such as asia-south1.",
                },
                {
                  name: "GOOGLE_DOCUMENTAI_PROCESSOR_ID",
                  purpose: "Document AI processor ID.",
                },
                {
                  name: "GOOGLE_DOCUMENTAI_GCS_BUCKET",
                  purpose: "Cloud Storage bucket for OCR input and output.",
                },
                {
                  name: "GOOGLE_DOCUMENTAI_GCS_INPUT_PREFIX",
                  purpose: "Cloud Storage prefix for OCR input files.",
                },
                {
                  name: "GOOGLE_DOCUMENTAI_GCS_OUTPUT_PREFIX",
                  purpose: "Cloud Storage prefix for OCR output files.",
                },
              ]}
            />
          ),
        },
        {
          id: "ai-analytics",
          title: "AI, analytics, and Redis",
          body: (
            <EnvTable
              rows={[
                {
                  name: "OPENAI_API_KEY",
                  purpose: "OpenAI API key for embeddings and generation.",
                },
                {
                  name: "OPENAI_EMBEDDING_MODEL",
                  purpose:
                    "Embedding model, defaulting to text-embedding-3-small.",
                },
                {
                  name: "NEXT_PUBLIC_POSTHOG_KEY",
                  purpose: "Browser-readable PostHog project key.",
                  required: false,
                },
                {
                  name: "NEXT_PUBLIC_POSTHOG_HOST",
                  purpose: "PostHog ingest host.",
                  required: false,
                },
                {
                  name: "UPSTASH_REDIS_REST_URL",
                  purpose: "Upstash Redis REST endpoint.",
                  required: false,
                },
                {
                  name: "UPSTASH_REDIS_REST_TOKEN",
                  purpose: "Upstash Redis REST token.",
                  required: false,
                },
              ]}
            />
          ),
        },
      ],
    },
    {
      slug: "reference/troubleshooting",
      group: "Reference",
      eyebrow: "Reference",
      title: "Troubleshooting",
      description:
        "Diagnose the most common local development, auth, upload, OCR, and build failures.",
      sections: [
        {
          id: "common-issues",
          title: "Common issues",
          body: (
            <Accordion
              items={[
                {
                  question: "Sign-in fails",
                  answer: (
                    <BulletList
                      items={[
                        "Confirm OAuth callback URLs match the current SITE_URL.",
                        "Check that Google and GitHub client secrets are present in the environment where Next.js runs.",
                        "Verify BETTER_AUTH_SECRET is set and stable.",
                      ]}
                    />
                  ),
                },
                {
                  question: "Uploads or processing fail",
                  answer: (
                    <BulletList
                      items={[
                        "Run Convex locally when testing backend-backed dashboard behavior.",
                        "Check OpenAI credentials before debugging embedding failures.",
                        "Verify Document AI project, location, processor, service account JSON, bucket, and prefixes.",
                        "Confirm the document is 100 pages or fewer.",
                      ]}
                    />
                  ),
                },
                {
                  question: "Answers look weak",
                  answer: (
                    <BulletList
                      items={[
                        "Ask a narrower question that names the clause, section, table, or concept you expect.",
                        "Confirm the document actually contains the source material.",
                        "Inspect citations and page text to distinguish retrieval gaps from source gaps.",
                      ]}
                    />
                  ),
                },
                {
                  question: "Build or typecheck fails",
                  answer: (
                    <BulletList
                      items={[
                        "Run the checks in repo order and fix the first failure first.",
                        "format:check → lint → typecheck → build.",
                        "Refresh Convex generated bindings if schema or function signatures changed.",
                      ]}
                    />
                  ),
                },
              ]}
            />
          ),
        },
      ],
    },
  ],
};
