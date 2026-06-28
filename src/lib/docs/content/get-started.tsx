import Link from "next/link";
import {
  BookOpen01Icon,
  CpuIcon,
  FileEditIcon,
  QuoteDownIcon,
  Rocket01Icon,
  Route01Icon,
} from "@hugeicons/core-free-icons";

import {
  BulletList,
  Callout,
  CardGrid,
  CodeBlock,
  Diagram,
  InfoGrid,
  StepList,
} from "@/components/docs/mdx";
import {
  ingestionPipelineDiagram,
  systemArchitectureDiagram,
} from "../diagrams";
import type { DocsGroup } from "../types";

export const getStartedGroup: DocsGroup = {
  title: "Get started",
  pages: [
    {
      slug: "overview",
      group: "Get started",
      eyebrow: "Documentation",
      title: "ChatPDF docs",
      description:
        "ChatPDF turns uploaded PDFs into searchable, cited conversations. This is how the product works and how to run it yourself.",
      quickFacts: [
        { label: "Frontend", value: "Next.js App Router" },
        { label: "Backend", value: "Convex" },
        { label: "Auth", value: "Clerk" },
      ],
      highlights: [
        {
          title: "Upload and index PDFs",
          description:
            "Follow a document from upload through OCR, chunking, and embeddings.",
          href: "/docs/using-chatpdf/uploading-pdfs",
        },
        {
          title: "Ask grounded questions",
          description:
            "Routed, hybrid retrieval returns answers backed by verifiable citations.",
          href: "/docs/using-chatpdf/asking-questions",
        },
        {
          title: "Self-host the app",
          description:
            "Wire up Convex, Clerk, OpenAI, Mistral OCR, and storage.",
          href: "/docs/self-hosting/configuration",
        },
      ],
      sections: [
        {
          id: "what-it-is",
          title: "What ChatPDF is",
          body: (
            <>
              <p>
                ChatPDF is a protected document workspace for uploading PDFs,
                indexing their contents, and asking questions against the
                evidence inside those files. Answers stay grounded in the
                uploaded documents instead of generic model knowledge, and every
                claim can be traced back to a page.
              </p>
              <InfoGrid
                items={[
                  {
                    title: "For readers",
                    icon: BookOpen01Icon,
                    description:
                      "Upload research papers, contracts, manuals, or reports and ask questions in natural language.",
                  },
                  {
                    title: "For builders",
                    icon: CpuIcon,
                    description:
                      "Run it on Next.js, Convex, Clerk, OpenAI, and Mistral OCR.",
                  },
                ]}
              />
            </>
          ),
        },
        {
          id: "core-loop",
          title: "The core loop",
          body: (
            <>
              <p>
                Every document moves through the same path: it is uploaded,
                processed into searchable evidence, and then queried with
                grounded, cited answers.
              </p>
              <StepList
                items={[
                  {
                    title: "Upload a PDF",
                    description:
                      "The dashboard accepts text-based and scanned PDFs up to 100 pages.",
                  },
                  {
                    title: "Process the document",
                    description:
                      "Every file is OCR'd with Mistral OCR 4, then chunked, embedded, and summarized.",
                  },
                  {
                    title: "Ask questions",
                    description:
                      "A router picks a retrieval strategy, hybrid search finds evidence, and the answer streams in.",
                  },
                  {
                    title: "Verify citations",
                    description:
                      "Each answer points back to verbatim, page-level source material in the PDF viewer.",
                  },
                ]}
              />
              <Diagram
                caption="The ingestion pipeline. Every PDF is OCR'd, chunked, embedded, and summarized before it becomes available for chat."
                chart={ingestionPipelineDiagram}
              />
            </>
          ),
        },
        {
          id: "architecture",
          title: "How it fits together",
          body: (
            <>
              <p>
                A Next.js frontend talks to a Convex backend that owns the
                database, server functions, background OCR jobs, and the
                streaming chat endpoint. External AI and storage services are
                called from Convex.
              </p>
              <Diagram
                caption="High-level architecture. Convex coordinates everything; OpenAI and Mistral OCR are called from the backend while PDFs stay in Convex storage."
                chart={systemArchitectureDiagram}
              />
            </>
          ),
        },
        {
          id: "where-to-go",
          title: "Where to go next",
          body: (
            <CardGrid
              items={[
                {
                  title: "Quickstart",
                  icon: Rocket01Icon,
                  description: "Install dependencies and run the app locally.",
                  href: "/docs/get-started/quickstart",
                },
                {
                  title: "Upload your first PDF",
                  icon: FileEditIcon,
                  description:
                    "Walk through a real upload, processing run, and question.",
                  href: "/docs/get-started/first-pdf",
                },
                {
                  title: "Retrieval ranking",
                  icon: Route01Icon,
                  description:
                    "Routing, hybrid search, rank fusion, and citation validation.",
                  href: "/docs/platform/retrieval-ranking",
                },
                {
                  title: "Citations and sources",
                  icon: QuoteDownIcon,
                  description: "How answers stay auditable and page-linked.",
                  href: "/docs/using-chatpdf/citations",
                },
              ]}
            />
          ),
        },
      ],
    },
    {
      slug: "get-started/quickstart",
      group: "Get started",
      eyebrow: "Start here",
      title: "Quickstart",
      description:
        "Install dependencies, configure the required services, and start the local app.",
      quickFacts: [
        { label: "Package manager", value: "pnpm 10" },
        { label: "Node", value: "24.10+" },
        { label: "Checks", value: "lint · typecheck · build" },
      ],
      sections: [
        {
          id: "prerequisites",
          title: "Prerequisites",
          body: (
            <>
              <p>
                The project expects a recent Node runtime, pnpm, and credentials
                for four external services.
              </p>
              <BulletList
                items={[
                  "Node 24.10 or newer.",
                  "pnpm matching the workspace package manager.",
                  "A Convex deployment — create one free at convex.dev.",
                  "A Clerk application with Google and/or GitHub social sign-in enabled, plus a JWT template named convex pointing to your Convex deployment URL.",
                  "An OpenAI API key for embeddings and answer generation.",
                  "A Mistral API key for OCR (mistral-ocr-4-0).",
                ]}
              />
              <Callout type="tip" title="Clerk JWT template">
                Before filling in the env file, go to your Clerk dashboard → JWT
                Templates and create a template named <code>convex</code> with
                your Convex deployment URL as the audience. Copy the issuer URL
                — that is your <code>CLERK_JWT_ISSUER_DOMAIN</code>.
              </Callout>
            </>
          ),
        },
        {
          id: "install",
          title: "Install and configure",
          body: (
            <>
              <CodeBlock title="Install">{`pnpm install
cp .env.example .env.local`}</CodeBlock>
              <p className="mt-4">
                Fill in the values in <code>.env.local</code>. Keep server
                secrets out of public variables unless the name already starts
                with <code>NEXT_PUBLIC_</code>.
              </p>
              <Callout type="note" title="Need the full list?">
                Every variable is documented on{" "}
                <Link href="/docs/reference/environment-variables">
                  Environment variables
                </Link>
                , grouped by service.
              </Callout>
            </>
          ),
        },
        {
          id: "run",
          title: "Run the app",
          body: (
            <>
              <CodeBlock title="Two terminals">{`pnpm dev
npx convex dev`}</CodeBlock>
              <Callout type="warning" title="Run Convex alongside Next.js">
                The docs section is fully static, but the dashboard depends on
                live Convex functions. Run <code>npx convex dev</code> in a
                second terminal whenever you exercise backend behavior.
              </Callout>
            </>
          ),
        },
        {
          id: "verify",
          title: "Verify your checkout",
          body: (
            <CodeBlock title="Repo checks">{`pnpm format:check
pnpm lint
pnpm typecheck
pnpm build`}</CodeBlock>
          ),
        },
      ],
    },
    {
      slug: "get-started/first-pdf",
      group: "Get started",
      eyebrow: "First workflow",
      title: "Upload your first PDF",
      description:
        "Walk through the first successful document upload, processing run, and grounded question.",
      sections: [
        {
          id: "choose-a-file",
          title: "Choose a file",
          body: (
            <>
              <p>
                Start with a PDF that has clear text, a small page count, and
                content you can verify manually. That makes it easy to confirm
                the ingestion and citation path before trying scanned or large
                files.
              </p>
              <Callout type="tip" title="Good first documents">
                A short contract, a single research paper, or a product manual
                section works well. Keep it under 100 pages — that is the OCR
                batch limit.
              </Callout>
            </>
          ),
        },
        {
          id: "upload",
          title: "Upload from the dashboard",
          body: (
            <StepList
              items={[
                {
                  title: "Sign in",
                  description:
                    "Use Google or GitHub to enter the protected dashboard.",
                },
                {
                  title: "Open upload",
                  description:
                    "Use the upload action and choose a PDF from your machine.",
                },
                {
                  title: "Wait for processing",
                  description:
                    "The document moves through uploaded, processing, and ready states as OCR, chunking, and embeddings complete.",
                },
              ]}
            />
          ),
        },
        {
          id: "ask",
          title: "Ask a checkable question",
          body: (
            <>
              <p>
                Ask a question whose answer appears clearly in the file. The
                best first test is not broad summarization — ask for a fact,
                definition, clause, or page-specific detail so you can confirm
                the citation.
              </p>
              <CodeBlock title="Try these">{`What does this document say about termination notice?
Which page defines the benchmark dataset?
Summarize the risk factors and cite the source pages.`}</CodeBlock>
            </>
          ),
        },
      ],
    },
  ],
};
