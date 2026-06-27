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
              <p>
                One row per uploaded PDF, tracking its lifecycle and artifacts.
              </p>
              <FieldTable
                rows={[
                  {
                    name: "ownerTokenIdentifier",
                    type: "string",
                    description:
                      "Authenticated owner; every query filters on it.",
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
                    name: "fileStorageId / sha256 / storageSize",
                    type: "string · number",
                    description:
                      "Convex storage id, content hash, and byte size of the stored file.",
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
                full-text <code>search_text</code> index. Hybrid retrieval
                queries both and fuses the results.
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
                  description:
                    "The message text (assistant answers are stored).",
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
                  purpose:
                    "Deployment slug used by Convex CLI tooling (e.g. dev:my-project-123). Set automatically by npx convex dev.",
                },
                {
                  name: "NEXT_PUBLIC_CONVEX_URL",
                  purpose:
                    "WebSocket/HTTP URL for the Convex deployment. Used by the browser client and must be publicly reachable.",
                },
                {
                  name: "NEXT_PUBLIC_CONVEX_SITE_URL",
                  purpose:
                    "Base URL for Convex HTTP actions (e.g. the SSE chat endpoint). Distinct from the query/mutation URL.",
                },
              ]}
            />
          ),
        },
        {
          id: "clerk",
          title: "Clerk",
          body: (
            <>
              <EnvTable
                rows={[
                  {
                    name: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
                    purpose:
                      "Clerk publishable key embedded in the browser bundle. Safe to expose — starts with pk_.",
                  },
                  {
                    name: "CLERK_SECRET_KEY",
                    purpose:
                      "Server-side Clerk secret key. Never expose this in a NEXT_PUBLIC_ variable. Starts with sk_.",
                  },
                  {
                    name: "CLERK_JWT_ISSUER_DOMAIN",
                    purpose:
                      "Issuer URL from the Clerk JWT template named convex. Convex verifies incoming tokens against this domain in auth.config.ts.",
                  },
                  {
                    name: "NEXT_PUBLIC_CLERK_SIGN_IN_URL",
                    purpose:
                      "Path Clerk redirects to for sign-in. Set to /sign-in.",
                  },
                  {
                    name: "NEXT_PUBLIC_CLERK_SIGN_UP_URL",
                    purpose:
                      "Path Clerk redirects to for sign-up. Also /sign-in since sign-up is colocated.",
                  },
                  {
                    name: "NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL",
                    purpose:
                      "Where Clerk sends the user after sign-in when no redirectUrl param is present. Set to /dashboard.",
                  },
                  {
                    name: "NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL",
                    purpose:
                      "Where Clerk sends the user after sign-up when no redirectUrl param is present. Set to /dashboard.",
                  },
                ]}
              />
              <BulletList
                items={[
                  "Use dev keys (pk_test_ / sk_test_) for local development.",
                  "Switch to live keys (pk_live_ / sk_live_) for production. The JWT template must also be configured in the production Clerk instance.",
                ]}
              />
            </>
          ),
        },
        {
          id: "site-urls",
          title: "Site URLs",
          body: (
            <EnvTable
              rows={[
                {
                  name: "SITE_URL",
                  purpose:
                    "Server-side canonical origin (e.g. http://localhost:3000). Used in server-only code and must not be prefixed NEXT_PUBLIC_.",
                },
                {
                  name: "NEXT_PUBLIC_SITE_URL",
                  purpose:
                    "Browser-readable canonical origin. Must match SITE_URL. Clerk callback URLs and the Convex site URL must also match this value.",
                },
              ]}
            />
          ),
        },
        {
          id: "mistral",
          title: "Mistral (OCR)",
          body: (
            <EnvTable
              rows={[
                {
                  name: "MISTRAL_API_KEY",
                  purpose:
                    "Mistral API key used to call the OCR endpoint. Every PDF upload triggers an OCR job that uses this key.",
                },
                {
                  name: "MISTRAL_OCR_MODEL",
                  purpose:
                    "OCR model identifier. Default is mistral-ocr-4-0. Change only if Mistral releases a newer model you want to test.",
                },
              ]}
            />
          ),
        },
        {
          id: "openai",
          title: "OpenAI",
          body: (
            <EnvTable
              rows={[
                {
                  name: "OPENAI_API_KEY",
                  purpose:
                    "OpenAI API key for both embedding and chat generation. Used in Convex server functions — never exposed to the browser.",
                },
                {
                  name: "OPENAI_EMBEDDING_MODEL",
                  purpose:
                    "Model for creating 1536-dim chunk embeddings. Default is text-embedding-3-small.",
                },
                {
                  name: "OPENAI_CHAT_MODEL",
                  purpose:
                    "Model for routing, per-page summaries, document summaries, and grounded answer generation. Default is gpt-5.4-mini.",
                },
              ]}
            />
          ),
        },
        {
          id: "analytics",
          title: "Analytics (optional)",
          body: (
            <EnvTable
              rows={[
                {
                  name: "NEXT_PUBLIC_POSTHOG_KEY",
                  purpose:
                    "PostHog project API key. Omit to disable analytics entirely.",
                  required: false,
                },
                {
                  name: "NEXT_PUBLIC_POSTHOG_HOST",
                  purpose:
                    "PostHog ingest endpoint. Default is https://us.i.posthog.com.",
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
                  question: "Sign-in fails or redirects loop",
                  answer: (
                    <BulletList
                      items={[
                        "Verify NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY are the correct keys for your Clerk application (dev vs. live).",
                        "Check that the Clerk JWT template named convex exists and has your Convex deployment URL as its audience.",
                        "Confirm CLERK_JWT_ISSUER_DOMAIN matches the issuer URL shown in the Clerk JWT template.",
                        "Check that OAuth callback URLs in Clerk match the current SITE_URL (localhost:3000 for local, production domain for prod).",
                        "Verify NEXT_PUBLIC_CLERK_SIGN_IN_URL, NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL, and NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL are set.",
                      ]}
                    />
                  ),
                },
                {
                  question: "Dashboard shows no data after sign-in",
                  answer: (
                    <BulletList
                      items={[
                        "Run npx convex dev in a second terminal — the dashboard requires live Convex functions.",
                        "Confirm NEXT_PUBLIC_CONVEX_URL points to a running deployment.",
                        "Check the Convex dashboard logs for auth errors — a missing or mis-configured JWT template causes silent identity failures.",
                      ]}
                    />
                  ),
                },
                {
                  question: "Uploads or OCR processing fail",
                  answer: (
                    <BulletList
                      items={[
                        "Verify MISTRAL_API_KEY is valid — OCR is the first step after upload.",
                        "Confirm MISTRAL_OCR_MODEL is set (default: mistral-ocr-4-0).",
                        "Confirm the document is 100 pages or fewer — larger files are rejected before OCR starts.",
                        "Check OpenAI credentials if embedding or summary steps fail after OCR succeeds.",
                        "Inspect Convex logs for the exact failing step and retry count.",
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
