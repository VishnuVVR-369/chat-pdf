# ChatPDF

ChatPDF is a customer-facing web application for uploading PDFs and chatting with them through a Retrieval-Augmented Generation workflow. The system is designed to answer questions using only the contents of uploaded documents, with citations that point back to the original source pages.

## What the Project Does

- Upload text-based and scanned PDFs
- Process documents asynchronously into searchable chunks
- Retrieve relevant context with hybrid search
- Generate grounded answers with citations
- Chat with a document across multiple saved conversations
- Open cited pages in a PDF viewer and highlight the referenced text

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
- Clerk for authentication
- Convex file storage for uploaded PDFs and OCR artifacts

### AI and Processing

- OpenAI for answer generation and embeddings
- Mistral OCR 4 for OCR
- `pdfjs-dist` for PDF parsing

### Analytics

- PostHog

## High-Level Architecture

### Document flow

1. A user uploads a PDF.
2. The file and document metadata are stored.
3. A background ingestion pipeline runs Mistral OCR to extract page text.
4. The document is split into pages and chunks.
5. Embeddings are generated and stored for retrieval.

### Chat flow

1. A user asks a question about the selected document, using the default
   document scope or explicitly choosing the current PDF page.
2. Document-scoped questions use automatic routing between summaries and
   hybrid chunk retrieval; page-scoped questions use only chunks that overlap
   the selected page.
3. The selected context is sent to the model.
4. The answer is streamed back with citations.
5. Citations link back to document pages and the highlighted source text.

## Main Features

- Google and GitHub authentication
- Protected dashboard experience
- PDF upload with document management (rename, delete, retry failed processing)
- Async OCR ingestion pipeline with automatic retries
- Hybrid retrieval (vector + full-text) with query routing
- Streaming RAG chat with stop, regenerate, and copy controls
- Multiple conversations per document (rename, delete)
- Citation rendering with in-PDF text highlighting
- PDF page navigation
- PostHog event tracking

## Environment Variables

Copy `.env.example` to `.env.local` and provide values for:

- `CONVEX_DEPLOYMENT`
- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_CONVEX_SITE_URL`
- `SITE_URL`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_JWT_ISSUER_DOMAIN`
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL`
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL`
- `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`
- `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL`
- `OPENAI_API_KEY`
- `OPENAI_EMBEDDING_MODEL`
- `OPENAI_CHAT_MODEL`
- `OPENAI_CHAT_REASONING_EFFORT`
- `MISTRAL_API_KEY`
- `MISTRAL_OCR_MODEL`
- `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`
- `NEXT_PUBLIC_POSTHOG_HOST`

`NEXT_PUBLIC_POSTHOG_KEY` is still supported as a fallback alias for existing
local environments.

### Clerk JWT template

Convex authenticates requests using a Clerk JWT template named **`convex`**. In
the Clerk dashboard, create a JWT template called `convex` (the Convex preset),
and set `CLERK_JWT_ISSUER_DOMAIN` to the template's issuer URL. This matches
`applicationID: "convex"` in `convex/auth.config.ts` and the
`getToken({ template: "convex" })` call used by the chat stream. Without it,
authenticated Convex queries and the `/api/chat/stream` endpoint return 401.

> `OPENAI_CHAT_MODEL` defaults to a GPT-5-class model, which only accepts the
> default sampling `temperature`. The code automatically omits `temperature` for
> `gpt-5*`/`o*` models; older models (e.g. `gpt-4.1-mini`) still receive it.

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
