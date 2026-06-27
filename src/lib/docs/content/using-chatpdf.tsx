import Link from "next/link";
import {
  BubbleChatIcon,
  File01Icon,
  Layers01Icon,
  QuoteDownIcon,
  Route01Icon,
} from "@hugeicons/core-free-icons";

import {
  Accordion,
  BulletList,
  Callout,
  Diagram,
  InfoGrid,
  StepList,
  Tabs,
} from "@/components/docs/mdx";
import { ingestionPipelineDiagram } from "../diagrams";
import type { DocsGroup } from "../types";

export const usingChatPdfGroup: DocsGroup = {
  title: "Using ChatPDF",
  pages: [
    {
      slug: "using-chatpdf/dashboard",
      group: "Using ChatPDF",
      eyebrow: "Workspace",
      title: "Dashboard",
      description:
        "The protected workspace for uploads, document selection, PDF preview, and chat.",
      sections: [
        {
          id: "layout",
          title: "Workspace layout",
          body: (
            <>
              <p>
                The dashboard is organized around the document library, the
                active PDF, and the chat panel. Source material and generated
                answers stay close together so citations can be checked without
                losing context.
              </p>
              <InfoGrid
                items={[
                  {
                    title: "Document sidebar",
                    icon: File01Icon,
                    description:
                      "Browse uploaded PDFs, search the library, and choose the active document.",
                  },
                  {
                    title: "PDF viewer",
                    icon: Layers01Icon,
                    description:
                      "Open the original file, move between pages, and inspect citation targets.",
                  },
                  {
                    title: "Chat panel",
                    icon: BubbleChatIcon,
                    description:
                      "Ask questions, receive streamed answers, and inspect citations as they appear.",
                  },
                  {
                    title: "Pipeline status",
                    icon: Route01Icon,
                    description:
                      "Track upload, OCR, chunking, embedding, and ready states per document.",
                  },
                ]}
              />
            </>
          ),
        },
        {
          id: "protected",
          title: "Protected access",
          body: (
            <p>
              Dashboard routes require an authenticated session. Public users
              can see the landing page and docs, while document data stays
              behind Clerk and Convex authorization checks. See{" "}
              <Link href="/docs/platform/authentication">Authentication</Link>{" "}
              for the boundary details.
            </p>
          ),
        },
      ],
    },
    {
      slug: "using-chatpdf/uploading-pdfs",
      group: "Using ChatPDF",
      eyebrow: "Documents",
      title: "Uploading PDFs",
      description:
        "How PDF files enter the system and become searchable, citable documents.",
      sections: [
        {
          id: "supported-files",
          title: "Supported files",
          body: (
            <>
              <BulletList
                items={[
                  "Text-based PDFs and scanned PDFs — both are accepted.",
                  "Up to 100 pages per document in this OCR pipeline.",
                  "Research papers, contracts, manuals, financial reports, and other long-form documents.",
                ]}
              />
              <Callout type="warning" title="Every PDF is OCR'd">
                Unlike many PDF tools, ChatPDF does not read embedded text
                directly. <strong>All</strong> uploads — including text-based
                PDFs — are processed through Mistral OCR 4. This keeps one
                consistent extraction path for scanned and native PDFs.
              </Callout>
            </>
          ),
        },
        {
          id: "processing",
          title: "Processing states",
          body: (
            <>
              <p>
                After upload, a background Convex action runs the full pipeline.
                The document status moves from <code>uploaded</code> to{" "}
                <code>processing</code> to <code>ready</code> — or{" "}
                <code>failed</code> if it cannot complete.
              </p>
              <StepList
                items={[
                  {
                    title: "Upload",
                    description:
                      "The file is stored in Convex file storage and connected to a document record.",
                  },
                  {
                    title: "OCR",
                    description:
                      "Mistral OCR 4 extracts page markdown from the PDF.",
                  },
                  {
                    title: "Chunk",
                    description:
                      "Text is split into ~450-word chunks with 75-word overlap, keeping page spans for citations.",
                  },
                  {
                    title: "Embed & summarize",
                    description:
                      "Chunks are embedded (1536-dim), and per-page plus document summaries are generated.",
                  },
                  {
                    title: "Ready",
                    description:
                      "The document can be selected for grounded chat and citation lookup.",
                  },
                ]}
              />
              <Diagram
                caption="The full ingestion pipeline, including the retry path. Transient failures retry up to 3 times before the document is marked failed."
                chart={ingestionPipelineDiagram}
              />
            </>
          ),
        },
        {
          id: "failure-handling",
          title: "Failure handling",
          body: (
            <>
              <p>
                Transient errors (timeouts, rate limits, 5xx responses) are
                retried automatically — up to three attempts with 15s and 60s
                backoff. Persistent failures stop the pipeline and surface an
                error on the document.
              </p>
              <Callout type="note" title="First places to check">
                If a document lands in <code>failed</code>, verify service
                credentials: the Convex deployment, Clerk keys, OpenAI key, and
                Mistral API key are the most common causes.
              </Callout>
            </>
          ),
        },
      ],
    },
    {
      slug: "using-chatpdf/asking-questions",
      group: "Using ChatPDF",
      eyebrow: "Chat",
      title: "Asking questions",
      description:
        "Get useful answers by asking questions that match the evidence available in your PDFs.",
      sections: [
        {
          id: "question-style",
          title: "Question style",
          body: (
            <>
              <p>
                ChatPDF is strongest when questions are specific enough for
                retrieval to find evidence. Ask for named concepts, clauses,
                dates, comparisons, or summaries tied to the uploaded document.
              </p>
              <Tabs
                items={[
                  {
                    label: "Effective questions",
                    content: (
                      <BulletList
                        items={[
                          "What are the warranty exclusions in this agreement?",
                          "Which pages mention revenue concentration?",
                          "Summarize the evaluation metrics and cite the source pages.",
                        ]}
                      />
                    ),
                  },
                  {
                    label: "Questions to avoid",
                    content: (
                      <BulletList
                        items={[
                          "Tell me everything.",
                          "What should I do next?",
                          "Use your general knowledge about this topic.",
                        ]}
                      />
                    ),
                  },
                ]}
              />
            </>
          ),
        },
        {
          id: "answer-modes",
          title: "How questions get routed",
          body: (
            <>
              <p>
                Before retrieval, a lightweight router rewrites your question
                into a standalone query and picks one of two modes. You never
                choose this manually — it is inferred from the question.
              </p>
              <InfoGrid
                items={[
                  {
                    title: "Chunks mode",
                    icon: QuoteDownIcon,
                    description:
                      "Precise, evidence-seeking questions. Uses hybrid retrieval over chunks and returns verbatim quotes.",
                  },
                  {
                    title: "Summaries mode",
                    icon: Layers01Icon,
                    description:
                      "Broad, document-wide synthesis (overviews, key findings). Uses page and document summaries.",
                  },
                ]}
              />
              <Callout type="tip" title="Want the details?">
                The full routing, hybrid search, and ranking logic is documented
                on{" "}
                <Link href="/docs/platform/retrieval-ranking">
                  Retrieval ranking
                </Link>
                .
              </Callout>
            </>
          ),
        },
        {
          id: "weak-evidence",
          title: "When evidence is weak",
          body: (
            <Callout type="note">
              If retrieval cannot find supporting evidence, ChatPDF says so
              rather than guessing. Treat a “not enough evidence” reply or
              missing citations as a signal to refine the question or upload a
              better source.
            </Callout>
          ),
        },
      ],
    },
    {
      slug: "using-chatpdf/citations",
      group: "Using ChatPDF",
      eyebrow: "Traceability",
      title: "Citations and sources",
      description:
        "Use citations to verify where an answer came from and whether it is actually supported.",
      sections: [
        {
          id: "what-citations-mean",
          title: "What citations mean",
          body: (
            <>
              <p>
                Citations point to the source passages selected by the retrieval
                pipeline. They are the verification layer for every answer,
                especially when a question spans long or technical documents.
              </p>
              <Callout
                type="check"
                title="Citations are validated, not trusted"
              >
                In chunks mode, each quote the model returns must be a verbatim,
                contiguous substring of its cited chunk. Quotes that do not
                match are dropped, and the citing page is resolved from the
                chunk’s page spans. Up to four citations are attached per
                answer.
              </Callout>
            </>
          ),
        },
        {
          id: "checking",
          title: "How to check an answer",
          body: (
            <StepList
              items={[
                {
                  title: "Open the citation",
                  description:
                    "Jump from the answer to the referenced page in the PDF viewer.",
                },
                {
                  title: "Read around the passage",
                  description:
                    "Check surrounding paragraphs so the answer is not missing important qualifiers.",
                },
                {
                  title: "Ask a follow-up",
                  description:
                    "If a citation looks incomplete, ask for the exact clause, table, or page context.",
                },
              ]}
            />
          ),
        },
        {
          id: "limits",
          title: "Limits",
          body: (
            <p>
              Citations do not make the model infallible — they make the answer
              auditable. When a decision matters, review the cited source text
              directly in the viewer.
            </p>
          ),
        },
      ],
    },
    {
      slug: "using-chatpdf/scanned-pdfs",
      group: "Using ChatPDF",
      eyebrow: "OCR",
      title: "Scanned PDFs",
      description:
        "What to expect from OCR quality on scanned and image-heavy documents.",
      sections: [
        {
          id: "always-ocr",
          title: "OCR runs for every document",
          body: (
            <p>
              ChatPDF sends every upload through Mistral OCR 4 — not only
              scanned files. For clean, text-based PDFs this is transparent. For
              scanned or image-based PDFs, OCR quality becomes the main factor
              in how well retrieval and citations work.
            </p>
          ),
        },
        {
          id: "quality",
          title: "Quality expectations",
          body: (
            <BulletList
              items={[
                "Clean scans produce better chunks and stronger retrieval.",
                "Skewed, low-resolution, handwritten, or table-heavy pages may need manual review.",
                "OCR output should be treated as extracted evidence, not a perfect copy of the source.",
              ]}
            />
          ),
        },
        {
          id: "faq",
          title: "Common questions",
          body: (
            <Accordion
              items={[
                {
                  question: "Why was my text-based PDF still OCR'd?",
                  answer:
                    "By design. A single OCR path keeps text extraction and citation offsets consistent across every document, regardless of how the PDF was produced.",
                },
                {
                  question: "What is the page limit?",
                  answer:
                    "The OCR pipeline supports up to 100 pages per document. Larger files are rejected before processing starts.",
                },
                {
                  question: "A scanned table came out garbled — what now?",
                  answer:
                    "Ask narrower, page-specific questions and verify against the cited page. Very dense tables are the hardest case for OCR and may need manual review.",
                },
              ]}
            />
          ),
        },
        {
          id: "configuration",
          title: "Required configuration",
          body: (
            <p>
              OCR depends on a Mistral API key. Uploaded PDFs and OCR JSON
              artifacts are stored in Convex file storage. See{" "}
              <Link href="/docs/self-hosting/configuration">Configuration</Link>
              .
            </p>
          ),
        },
      ],
    },
  ],
};
