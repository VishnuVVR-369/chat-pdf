# ChatPDF

ChatPDF is a customer-facing web application for uploading PDFs and chatting with them through a Retrieval-Augmented Generation workflow. The system is designed to answer questions using only the contents of uploaded documents, with citations that point back to the original source pages.

## What the Project Does

- Upload text-based and scanned PDFs
- Process documents asynchronously into searchable chunks
- Retrieve relevant context with hybrid search
- Generate grounded answers with citations
- Support single-document and multi-document chat
- Open cited pages in a PDF viewer and highlight referenced content

## Core Product Goals

- Accurate answers grounded in uploaded documents
- Clear citations for traceability
- Streaming chat experience
- Support for both standard PDFs and OCR-based scanned PDFs
- Reliable behavior when evidence is weak or missing

## Tech Stack

### Frontend

- Next.js App Router
- React
- Tailwind CSS
- Vercel AI SDK

### Backend

- Convex for database, functions, and background jobs
- Better Auth for authentication

### AI and Processing

- OpenAI for answer generation and embeddings
- Google Document AI for OCR
- `pdfjs-dist` for PDF parsing

### Analytics

- PostHog

## High-Level Architecture

### Document flow

1. A user uploads a PDF.
2. The file and document metadata are stored.
3. A background ingestion pipeline extracts text or runs OCR.
4. The document is split into pages and chunks.
5. Embeddings are generated and stored for retrieval.

### Chat flow

1. A user asks a question about one or more selected documents.
2. The system runs hybrid retrieval over the indexed chunks.
3. Relevant context is sent to the model.
4. The answer is streamed back with citations.
5. Citations link back to document pages and highlighted text when available.

## Main Features

- Google and GitHub authentication
- Protected dashboard experience
- PDF upload and document management
- Async ingestion pipeline
- Hybrid retrieval
- Streaming RAG chat
- Citation rendering
- PDF page navigation and highlighting
- PostHog event tracking

## Environment Variables

Copy `.env.example` to `.env.local` and provide values for:

- `CONVEX_DEPLOYMENT`
- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_CONVEX_SITE_URL`
- `SITE_URL`
- `NEXT_PUBLIC_SITE_URL`
- `BETTER_AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GOOGLE_DOCUMENTAI_SERVICE_ACCOUNT_JSON`
- `GOOGLE_DOCUMENTAI_PROJECT_ID`
- `GOOGLE_DOCUMENTAI_LOCATION`
- `GOOGLE_DOCUMENTAI_PROCESSOR_ID`
- `GOOGLE_DOCUMENTAI_GCS_BUCKET`
- `GOOGLE_DOCUMENTAI_GCS_INPUT_PREFIX`
- `GOOGLE_DOCUMENTAI_GCS_OUTPUT_PREFIX`
- `OPENAI_API_KEY`
- `OPENAI_EMBEDDING_MODEL`
- `NEXT_PUBLIC_POSTHOG_KEY`
- `NEXT_PUBLIC_POSTHOG_HOST`

## Local Development

Install dependencies:

```bash
pnpm install
```

Use the repo Node version:

```bash
nvm use
```

Start Next.js:

```bash
pnpm dev
```

Start Convex when backend development is needed:

```bash
npx convex dev
```

Run checks:

```bash
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
```

## Deployment

The project is configured for Vercel via [vercel.json](/Users/vishnu/Desktop/Coding/Projects/chat-pdf/vercel.json). Set the same environment variables in Vercel before deploying.
