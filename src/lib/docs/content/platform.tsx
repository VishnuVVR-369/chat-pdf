import Link from "next/link";
import {
  AiMagicIcon,
  CpuIcon,
  Database01Icon,
  Key01Icon,
  Layers01Icon,
  QuoteDownIcon,
  Route01Icon,
  Shield01Icon,
} from "@hugeicons/core-free-icons";

import {
  BulletList,
  Callout,
  CodeBlock,
  Diagram,
  InfoGrid,
  ScoreBar,
  StepList,
} from "@/components/docs/mdx";
import {
  authBoundariesDiagram,
  chatSequenceDiagram,
  retrievalFlowDiagram,
  systemArchitectureDiagram,
} from "../diagrams";
import type { DocsGroup } from "../types";

export const platformGroup: DocsGroup = {
  title: "Platform",
  pages: [
    {
      slug: "platform/architecture",
      group: "Platform",
      eyebrow: "System design",
      title: "Architecture",
      description:
        "A map of the frontend, backend, ingestion, retrieval, and analytics pieces.",
      sections: [
        {
          id: "stack",
          title: "Stack",
          body: (
            <InfoGrid
              items={[
                {
                  title: "Next.js App Router",
                  icon: CpuIcon,
                  description:
                    "Public landing, docs, auth screens, the protected dashboard, and route handlers.",
                },
                {
                  title: "Convex",
                  icon: Database01Icon,
                  description:
                    "Database, server functions, auth integration, background OCR jobs, and the chat HTTP action.",
                },
                {
                  title: "Clerk",
                  icon: Shield01Icon,
                  description:
                    "Google and GitHub authentication for protected dashboard access.",
                },
                {
                  title: "AI services",
                  icon: AiMagicIcon,
                  description:
                    "OpenAI powers embeddings and answers. Mistral OCR 4 handles OCR.",
                },
              ]}
            />
          ),
        },
        {
          id: "system-map",
          title: "System map",
          body: (
            <>
              <p>
                The Next.js client subscribes to Convex queries and posts to a
                Convex HTTP action for streaming chat. Convex owns the database
                and calls external services — OpenAI and Mistral OCR — from
                server functions and scheduled jobs. Uploaded PDFs and OCR
                artifacts stay in Convex file storage.
              </p>
              <Diagram
                caption="Services and how they connect. Convex is the hub; external AI and storage are called from the backend, never the browser."
                chart={systemArchitectureDiagram}
              />
            </>
          ),
        },
        {
          id: "document-flow",
          title: "Document flow",
          body: (
            <StepList
              items={[
                {
                  title: "User uploads a PDF",
                  description:
                    "The dashboard stores the file in Convex file storage and creates the document record.",
                },
                {
                  title: "Background processing starts",
                  description:
                    "A Convex action runs OCR, chunking, embeddings, and summaries, with automatic retries.",
                },
                {
                  title: "Chunks become searchable",
                  description:
                    "Page-aware chunks are stored with embeddings and a full-text index for retrieval and citations.",
                },
              ]}
            />
          ),
        },
        {
          id: "chat-flow",
          title: "Chat flow",
          body: (
            <>
              <p>
                Chat runs through a Convex HTTP action that verifies the
                session, routes the question, retrieves evidence, and streams a
                structured answer back over Server-Sent Events.
              </p>
              <Diagram
                caption="A single chat request, end to end. Tokens stream to the UI while citations are validated and saved."
                chart={chatSequenceDiagram}
              />
            </>
          ),
        },
      ],
    },
    {
      slug: "platform/retrieval-pipeline",
      group: "Platform",
      eyebrow: "RAG",
      title: "Retrieval pipeline",
      description:
        "How uploaded documents become grounded context for answers.",
      sections: [
        {
          id: "indexing",
          title: "Indexing",
          body: (
            <p>
              Indexing transforms OCR-extracted pages into overlapping chunks,
              attaches page-span metadata, and creates embeddings. Page and
              document summaries are generated alongside the chunks. The goal is
              to preserve enough page context for citations while keeping
              retrieval precise.
            </p>
          ),
        },
        {
          id: "overview",
          title: "From question to answer",
          body: (
            <>
              <p>
                At query time the pipeline routes the question, retrieves
                evidence with hybrid search, fuses the rankings, and streams a
                cited answer. Each stage is shown below.
              </p>
              <Diagram
                caption="The retrieval pipeline. A router picks chunks or summaries; hybrid search and rank fusion select the final evidence."
                chart={retrievalFlowDiagram}
              />
            </>
          ),
        },
        {
          id: "hybrid-search",
          title: "Hybrid search",
          body: (
            <p>
              Hybrid retrieval combines semantic similarity with keyword
              matching. Vector search finds related meaning, while Convex
              full-text search protects exact terms such as clause names,
              product names, dates, and abbreviations. The{" "}
              <Link href="/docs/platform/retrieval-ranking">
                Retrieval ranking
              </Link>{" "}
              page covers the exact weights and fusion math.
            </p>
          ),
        },
        {
          id: "answering",
          title: "Answer generation",
          body: (
            <BulletList
              items={[
                "Retrieved chunks are passed to the model as bounded, labeled sources.",
                "The answer must stay inside the evidence provided by the document.",
                "Citations are validated against source text and keep the answer page-linked.",
              ]}
            />
          ),
        },
      ],
    },
    {
      slug: "platform/retrieval-ranking",
      group: "Platform",
      eyebrow: "Deep dive",
      title: "Retrieval ranking",
      description:
        "Routing, hybrid candidate generation, reciprocal rank fusion, and citation validation — the exact mechanics behind an answer.",
      quickFacts: [
        { label: "Vector weight", value: "0.65" },
        { label: "Lexical weight", value: "0.35" },
        { label: "Final chunks", value: "Top 6" },
      ],
      sections: [
        {
          id: "routing",
          title: "1 · Query routing",
          body: (
            <>
              <p>
                A fast LLM call rewrites the question into a standalone query
                (resolving references from recent history) and selects a
                retrieval mode. If the call fails, a heuristic fallback inspects
                the wording for summary-style intent.
              </p>
              <InfoGrid
                items={[
                  {
                    title: "chunks",
                    icon: QuoteDownIcon,
                    description:
                      "Page-specific, quote-seeking, or clause-seeking questions. Routed to hybrid chunk retrieval.",
                  },
                  {
                    title: "summaries",
                    icon: Layers01Icon,
                    description:
                      "Document-wide synthesis (overviews, key findings). Routed to page and document summaries.",
                  },
                ]}
              />
            </>
          ),
        },
        {
          id: "candidates",
          title: "2 · Candidate generation",
          body: (
            <>
              <p>
                In chunks mode, two retrievers run against the document and
                their results are unioned into a candidate set.
              </p>
              <BulletList
                items={[
                  "Vector search over chunk embeddings — top 12, filtered to the document.",
                  "Convex full-text search over chunk text using extracted keyword terms — top 12.",
                  "Results are merged by chunk id into a single candidate pool.",
                ]}
              />
              <Diagram
                caption="Routing and hybrid candidate generation feeding rank fusion."
                chart={retrievalFlowDiagram}
              />
            </>
          ),
        },
        {
          id: "fusion",
          title: "3 · Reciprocal rank fusion",
          body: (
            <>
              <p>
                Candidates are scored by their rank in each list using
                reciprocal rank fusion, with the vector list weighted more
                heavily. A small bonus rewards chunks that literally contain
                query terms.
              </p>
              <CodeBlock
                title="Scoring (per candidate)"
                language="ts"
              >{`score(chunk) =
    0.65 / (60 + vectorRank)     // semantic
  + 0.35 / (60 + lexicalRank)    // keyword
  + 0.10 * keywordOverlapRatio   // literal-term bonus

// k = 60, then keep the top 6 chunks`}</CodeBlock>
              <ScoreBar
                caption="Relative contribution of each retriever to the fused score (k = 60)."
                rows={[
                  { label: "Vector (semantic)", value: 0.65, display: "0.65" },
                  { label: "Lexical (keyword)", value: 0.35, display: "0.35" },
                  { label: "Literal bonus", value: 0.1, display: "0.10" },
                ]}
              />
            </>
          ),
        },
        {
          id: "validation",
          title: "4 · Citation validation",
          body: (
            <>
              <p>
                The top six chunks become labeled sources in the model prompt.
                The model returns a structured answer with quotes, and every
                quote is checked before it is shown.
              </p>
              <StepList
                items={[
                  {
                    title: "Verbatim match",
                    description:
                      "Each quote must be a contiguous substring of its cited chunk; non-matching quotes are dropped.",
                  },
                  {
                    title: "Resolve the page",
                    description:
                      "The citing page is derived from the chunk's page spans at the quote's offset.",
                  },
                  {
                    title: "Snippet and cap",
                    description:
                      "A ±100-character snippet is built, duplicates are removed, and at most four citations are kept.",
                  },
                ]}
              />
              <Callout type="check" title="Streaming, but verified">
                The answer streams token-by-token as the structured JSON
                arrives, while citations are validated from the complete
                response before being attached to the saved message.
              </Callout>
            </>
          ),
        },
        {
          id: "filtering",
          title: "Keyword extraction",
          body: (
            <p>
              The lexical query is built from extracted terms: the question is
              lowercased, tokenized, stripped of stop words and very short
              tokens, and capped at twelve terms. This keeps full-text search
              focused on meaningful, exact terms.
            </p>
          ),
        },
      ],
    },
    {
      slug: "platform/authentication",
      group: "Platform",
      eyebrow: "Security",
      title: "Authentication",
      description:
        "How Clerk sessions flow into Convex identity, and how public and protected routes are separated.",
      sections: [
        {
          id: "providers",
          title: "Sign-in providers",
          body: (
            <>
              <p>
                The app uses Clerk for authentication with Google and GitHub as
                social sign-in providers. Clerk handles OAuth flows, session
                management, and issues JWTs that Convex can verify.
              </p>
              <InfoGrid
                items={[
                  {
                    title: "Clerk",
                    icon: Shield01Icon,
                    description:
                      "Manages Google and GitHub OAuth, issues signed JWTs, and provides the sign-in UI components.",
                  },
                  {
                    title: "Convex integration",
                    icon: Key01Icon,
                    description:
                      "Convex verifies Clerk JWTs using the configured JWT issuer domain. The verified identity becomes the server-side owner token.",
                  },
                ]}
              />
              <Callout type="note" title="JWT template required">
                In your Clerk dashboard, create a JWT template named{" "}
                <code>convex</code>. Set the audience to your Convex deployment
                URL. The <code>CLERK_JWT_ISSUER_DOMAIN</code> env var must point
                to this template’s issuer so Convex can verify tokens.
              </Callout>
            </>
          ),
        },
        {
          id: "boundaries",
          title: "Route boundaries",
          body: (
            <>
              <InfoGrid
                items={[
                  {
                    title: "Public",
                    icon: Route01Icon,
                    description:
                      "Landing page, sign-in, sign-up, and documentation are reachable without a session.",
                  },
                  {
                    title: "Protected",
                    icon: Key01Icon,
                    description:
                      "The dashboard and all document data require a valid Clerk session. Unauthenticated requests are redirected to sign-in.",
                  },
                ]}
              />
              <Diagram
                caption="The auth boundary. Clerk issues a JWT; Convex verifies it and derives the owner token used to scope every data read."
                chart={authBoundariesDiagram}
              />
            </>
          ),
        },
        {
          id: "convex",
          title: "Convex identity",
          body: (
            <>
              <p>
                When a signed-in user calls a Convex function, the Clerk JWT is
                verified by Convex against the configured issuer domain. Convex
                derives a <code>tokenIdentifier</code> from the verified claims
                and passes it as the server-side identity. Every Convex query
                and mutation that touches document data filters on{" "}
                <code>ownerTokenIdentifier</code> — so users can only read and
                write their own documents.
              </p>
              <Callout type="warning" title="The backend is the source of truth">
                Client-side redirects improve the experience but are not the
                security layer. The Convex backend re-checks the authenticated
                identity on every request. Even if a client-side redirect is
                bypassed, the backend rejects unauthorized data access.
              </Callout>
            </>
          ),
        },
        {
          id: "sso-callback",
          title: "SSO callback",
          body: (
            <p>
              The <code>/sso-callback</code> route handles the OAuth redirect
              from Clerk after a social sign-in. Once Clerk completes the
              handshake, the user is forwarded to the dashboard. No additional
              configuration is needed beyond the Clerk callback URL matching
              your site URL.
            </p>
          ),
        },
      ],
    },
  ],
};
