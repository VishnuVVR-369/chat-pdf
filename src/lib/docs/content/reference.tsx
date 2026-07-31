import {
  BubbleChatIcon,
  File01Icon,
  FileEditIcon,
  Layers01Icon,
  QuoteDownIcon,
} from "@hugeicons/core-free-icons";
import Link from "next/link";

import {
  Accordion,
  BulletList,
  Callout,
  Diagram,
  EnvTable,
  FieldTable,
  SchemaDiagram,
} from "@/components/docs/mdx";
import type { SchemaRelation, SchemaTable } from "@/components/docs/mdx";
import { dataModelDiagram } from "../diagrams";
import type { DocsGroup } from "../types";

const schemaTables: SchemaTable[] = [
  {
    name: "documents",
    icon: File01Icon,
    summary: "One row per uploaded PDF; tracks its lifecycle and artifacts.",
    columns: [
      { name: "_id", type: "id", badges: ["pk"] },
      {
        name: "ownerTokenIdentifier",
        type: "string",
        badges: ["owner", "index"],
      },
      { name: "title", type: "string" },
      { name: "originalFilename", type: "string" },
      { name: "sha256", type: "string" },
      {
        name: "fileStorageId",
        type: "id",
        ref: "_storage",
        badges: ["fk"],
        optional: true,
      },
      { name: "status", type: "union", badges: ["index"] },
      { name: "pageCount", type: "number", optional: true },
      { name: "documentSummary", type: "string" },
      { name: "processingError", type: "string", optional: true },
      { name: "lastProcessedAt", type: "number", optional: true },
      { name: "embeddedChunkCount", type: "number", optional: true },
    ],
  },
  {
    name: "documentPages",
    icon: FileEditIcon,
    summary: "OCR text and a summary for a single page of a document.",
    columns: [
      { name: "_id", type: "id", badges: ["pk"] },
      {
        name: "documentId",
        type: "id",
        ref: "documents",
        badges: ["fk", "index"],
      },
      {
        name: "ownerTokenIdentifier",
        type: "string",
        badges: ["owner", "index"],
      },
      { name: "pageNumber", type: "number", badges: ["index"] },
      { name: "extractedText", type: "string" },
      { name: "summary", type: "string" },
      {
        name: "embedding",
        type: "float64[1536]",
        badges: ["vector"],
        optional: true,
      },
    ],
  },
  {
    name: "documentChunks",
    icon: Layers01Icon,
    summary: "The retrieval unit — overlapping text windows with page spans.",
    columns: [
      { name: "_id", type: "id", badges: ["pk"] },
      {
        name: "documentId",
        type: "id",
        ref: "documents",
        badges: ["fk", "index"],
      },
      {
        name: "ownerTokenIdentifier",
        type: "string",
        badges: ["owner", "index"],
      },
      { name: "chunkIndex", type: "number", badges: ["index"] },
      { name: "startPageNumber", type: "number" },
      { name: "endPageNumber", type: "number" },
      { name: "text", type: "string", badges: ["search"] },
      { name: "tokenCount", type: "number" },
      { name: "pageSpans", type: "object[]" },
      { name: "embedding", type: "float64[1536]", badges: ["vector"] },
    ],
  },
  {
    name: "conversations",
    icon: BubbleChatIcon,
    summary: "A chat thread scoped to a single document.",
    columns: [
      { name: "_id", type: "id", badges: ["pk"] },
      {
        name: "documentId",
        type: "id",
        ref: "documents",
        badges: ["fk", "index"],
      },
      {
        name: "ownerTokenIdentifier",
        type: "string",
        badges: ["owner", "index"],
      },
      { name: "title", type: "string" },
    ],
  },
  {
    name: "messages",
    icon: QuoteDownIcon,
    summary: "A single turn in a conversation, with validated citations.",
    columns: [
      { name: "_id", type: "id", badges: ["pk"] },
      {
        name: "conversationId",
        type: "id",
        ref: "conversations",
        badges: ["fk", "index"],
      },
      { name: "role", type: "union" },
      { name: "content", type: "string" },
      { name: "status", type: "union", optional: true },
      {
        name: "citations",
        type: "object[]",
        ref: "documentChunks",
        optional: true,
      },
    ],
  },
];

const schemaRelations: SchemaRelation[] = [
  {
    from: "documents",
    to: "documentPages",
    cardinality: "1 : N",
    label: "each page of the PDF",
  },
  {
    from: "documents",
    to: "documentChunks",
    cardinality: "1 : N",
    label: "retrieval windows",
  },
  {
    from: "documents",
    to: "conversations",
    cardinality: "1 : N",
    label: "chats about the doc",
  },
  {
    from: "conversations",
    to: "messages",
    cardinality: "1 : N",
    label: "turns in a thread",
  },
  {
    from: "documentChunks",
    to: "messages",
    cardinality: "0 : N",
    label: "cited by (citations[].chunkId)",
    soft: true,
  },
];

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
        { label: "Relations", value: "5 foreign keys" },
        { label: "Embeddings", value: "1536-dim" },
        { label: "Indexes", value: "Vector + text" },
      ],
      sections: [
        {
          id: "schema",
          title: "Schema at a glance",
          body: (
            <>
              <p>
                Five tables back the product. A <code>documents</code> row owns
                its extracted <code>documentPages</code> and{" "}
                <code>documentChunks</code>, plus every{" "}
                <code>conversations</code> thread started against it; each
                thread owns its <code>messages</code>. Foreign keys are Convex
                document IDs (<code>v.id(&quot;table&quot;)</code>), and every
                content row also carries an <code>ownerTokenIdentifier</code>{" "}
                that authorization filters on for every read.
              </p>
              <SchemaDiagram
                caption="Trimmed to the columns that carry weight — see “Columns trimmed from the design” below for what was removed and why."
                relations={schemaRelations}
                tables={schemaTables}
              />
            </>
          ),
        },
        {
          id: "relationships",
          title: "Entity relationships",
          body: (
            <>
              <p>
                The same model as an entity-relationship diagram. Solid edges
                are hard foreign keys; the dashed edge is a soft reference — a
                message&apos;s <code>citations</code> point back at the{" "}
                <code>documentChunks</code> they quote.
              </p>
              <Diagram
                caption="documents is the aggregate root; conversations → messages is the chat hierarchy. Owner tokens are omitted for readability."
                chart={dataModelDiagram}
              />
            </>
          ),
        },
        {
          id: "indexes-fields",
          title: "Indexes & citation fields",
          body: (
            <>
              <Callout type="note" title="Indexes that power retrieval">
                <code>documentChunks</code> carries a vector index{" "}
                <code>by_embedding</code> (1536-dim, filtered by{" "}
                <code>documentId</code>) and a full-text{" "}
                <code>search_text</code> index. Hybrid retrieval queries both
                and fuses the results; <code>documentPages</code> keeps its own
                vector index for page-level search.
              </Callout>
              <p className="mt-5">
                Two composite fields do the heavy lifting for grounded answers:
              </p>
              <FieldTable
                rows={[
                  {
                    name: "documentChunks.pageSpans",
                    type: "object[]",
                    description:
                      "{ pageNumber, startOffset, endOffset } — maps any position in a chunk back to a page, so a quote resolves to the page it came from.",
                  },
                  {
                    name: "messages.citations",
                    type: "object[]?",
                    description:
                      "Validated citations: pageNumber, snippet, chunkId (→ documentChunks), verbatim quote, and its character offsets.",
                  },
                ]}
              />
            </>
          ),
        },
        {
          id: "trimmed",
          title: "Columns trimmed from the design",
          body: (
            <>
              <p>
                The live schema stores extra provenance the design above leaves
                out. These are safe candidates to drop — they duplicate
                information already available from <code>status</code>,{" "}
                <code>_creationTime</code>, or environment config:
              </p>
              <BulletList
                items={[
                  <>
                    <code>documents</code>: per-stage timestamps (
                    <code>uploadCompletedAt</code>,{" "}
                    <code>processingStartedAt</code>,{" "}
                    <code>ocrCompletedAt</code>,{" "}
                    <code>embeddingsCompletedAt</code>) collapse into{" "}
                    <code>_creationTime</code> + <code>lastProcessedAt</code> +{" "}
                    <code>status</code>.
                  </>,
                  <>
                    <code>documents</code>: model / provider strings (
                    <code>summaryModel</code>, <code>embeddingModel</code>,{" "}
                    <code>ocrModel</code>, <code>ocrMethod</code>,{" "}
                    <code>ocrProvider</code>) and vendor handles (
                    <code>mistralFileId</code>, <code>ocrResultStorageId</code>,{" "}
                    <code>storageContentType</code>,{" "}
                    <code>processingAttemptCount</code>) are config- or
                    log-level detail, not query inputs.
                  </>,
                  <>
                    <code>documentPages</code> / <code>documentChunks</code>:{" "}
                    <code>extractionMethod</code> and per-row{" "}
                    <code>embeddingModel</code> /{" "}
                    <code>embeddingTokenCount</code> are constant or derivable;{" "}
                    <code>ownerDocumentKey</code> duplicates{" "}
                    <code>ownerTokenIdentifier</code> + <code>documentId</code>.
                  </>,
                  <>
                    <code>conversations</code> / <code>messages</code>: explicit{" "}
                    <code>createdAt</code> duplicates Convex&apos;s built-in{" "}
                    <code>_creationTime</code>.
                  </>,
                ]}
              />
              <Callout type="warning" title="Documentation only">
                This page shows the trimmed design. The trims are{" "}
                <strong>not</strong> yet applied to{" "}
                <code>convex/schema.ts</code> — removing a column also means
                updating every mutation and query that writes or reads it.
              </Callout>
            </>
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
                {
                  name: "OPENAI_CHAT_REASONING_EFFORT",
                  purpose:
                    "Reasoning effort for chat answers on reasoning models (minimal | low | medium | high). Lower effort makes tokens start streaming sooner; clamped to what the model supports. Default is low.",
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
                  name: "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN",
                  purpose:
                    "PostHog project token. Omit to disable analytics entirely. NEXT_PUBLIC_POSTHOG_KEY is supported as a fallback alias.",
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
                        <>
                          Confirm the document meets the current limits in{" "}
                          <Link href="/docs/using-chatpdf/uploading-pdfs#supported-files">
                            Supported files
                          </Link>
                          .
                        </>,
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
