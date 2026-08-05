/**
 * Mermaid diagram definitions for the docs.
 *
 * These are grounded in the real backend:
 * - convex/documentProcessing.ts  (ingestion: always-OCR, embeddings)
 * - convex/documentChunking.ts     (structure-aware chunk assembly)
 * - convex/chatHelpers.ts          (routing, hybrid retrieval, RRF, citations)
 * - convex/chatStream.ts           (SSE streaming chat HTTP action)
 * - convex/schema.ts               (data model + vector/text indexes)
 */

const OK_NODE = "classDef okNode fill:#0e1f15,stroke:#34d399,color:#d1fae5;";
const BAD_NODE = "classDef badNode fill:#23100f,stroke:#f87171,color:#fecaca;";

export const ingestionPipelineDiagram = `flowchart TB
  U(["PDF uploaded"]) --> S["Stored in Convex file storage<br/>+ document record created"]
  S --> O["Mistral OCR 4<br/>OCR · every PDF within upload limits"]
  O --> X["Extract page text<br/>from OCR output"]
  O --> C["Build retrieval chunks<br/>preserve structure · exact page spans"]
  C --> E["Embed chunks<br/>text-embedding-3-small · 1536-dim"]
  X --> P["Per-page summaries<br/>LLM"]
  P --> D["Document summary<br/>LLM"]
  E --> R(["Ready for chat"])
  D --> R
  O -. "transient error" .-> RT{"Retry?<br/>≤ 3 attempts"}
  RT -. "yes · 15s / 60s backoff" .-> O
  RT -. "no" .-> F(["Failed"])
  class R okNode
  class F badNode
  ${OK_NODE}
  ${BAD_NODE}`;

export const retrievalFlowDiagram = `flowchart TB
  Q(["User question"]) --> RT["LLM query routing<br/>standalone query + mode"]
  RT --> SC{"Explicit page scope?"}
  SC -->|"yes"| PG["Indexed page-overlap query<br/>bounded to 24 candidates"]
  SC -->|"no · summaries mode"| SUM["Document + page summaries"]
  SC -->|"no · chunks mode"| EMB["Embed query"]
  SC -->|"no · chunks mode"| L
  subgraph HY["Hybrid retrieval"]
    direction LR
    V["Vector search<br/>chunk embeddings · top 24"]
    L["Full-text search<br/>keyword terms · top 24"]
  end
  EMB --> V
  V --> RF["Reciprocal Rank Fusion<br/>vector 0.65 · lexical 0.35 · k = 60"]
  L --> RF
  RF --> TOP["Top 10 chunks<br/>+ nearby context"]
  TOP --> GEN["LLM answer<br/>structured JSON · streamed over SSE"]
  PG --> GEN
  SUM --> GEN
  GEN --> CV["Citation validation<br/>verbatim quote · page-resolved · ≤ 4"]
  CV --> A(["Grounded, cited answer"])
  class A okNode
  ${OK_NODE}`;

export const systemArchitectureDiagram = `flowchart LR
  subgraph client["Browser"]
    NX["Next.js App Router<br/>landing · docs · dashboard"]
  end
  subgraph backend["Convex backend"]
    FN["Queries · mutations · actions"]
    HTTP["HTTP action<br/>SSE chat stream"]
    DB[("Database<br/>vector + text search indexes")]
    JOB["Scheduler<br/>OCR jobs · retries"]
  end
  NX <-->|"reactive queries"| FN
  NX <-->|"POST · stream"| HTTP
  FN --> DB
  HTTP --> DB
  JOB --> DB
  CL["Clerk<br/>Google · GitHub"] --- NX
  CL --- FN
  JOB --> MOCR["Mistral OCR 4"]
  JOB --> FS["Convex file storage"]
  FN --> OAI["OpenAI<br/>embeddings · chat"]
  HTTP --> OAI
  NX -. "events" .-> PH["PostHog"]`;

export const chatSequenceDiagram = `sequenceDiagram
  autonumber
  participant UI as Dashboard
  participant CV as Convex HTTP action
  participant DB as Convex DB
  participant AI as OpenAI
  UI->>CV: POST question + auth token + optional page
  CV->>CV: verify identity · owned ready document · page range
  CV->>DB: save user message + optional page scope
  CV->>AI: route query → mode + standalone query
  alt current-page scope
    CV->>DB: bounded indexed page-overlap query
    DB-->>CV: page chunks (at most 24 candidates)
  else document scope · chunks mode
    CV->>AI: embed query
    CV->>DB: vector + full-text search
    DB-->>CV: candidate chunks
    CV->>CV: rank fusion → top 10 + neighbors
  else document scope · summaries mode
    CV->>DB: load document + page summaries
  end
  CV->>AI: stream structured answer
  AI-->>CV: token deltas
  CV-->>UI: SSE tokens (live)
  CV->>DB: save message + validated citations
  CV-->>UI: done + citations`;

export const authBoundariesDiagram = `flowchart TB
  V(["Visitor"]) --> Q{"Authenticated session?"}
  Q -->|"no"| PUB["Public<br/>landing · docs · sign-in"]
  Q -->|"yes"| PROT["Protected<br/>dashboard · documents · chat"]
  PUB -. "sign in · Google / GitHub" .-> CL["Clerk"]
  CL --> ID["Convex identity<br/>tokenIdentifier"]
  ID --> PROT
  PROT --> CHK["Server-side checks<br/>ownerTokenIdentifier on every read"]
  class PROT okNode
  ${OK_NODE}`;

export const dataModelDiagram = `erDiagram
  documents {
    id _id PK
    string ownerTokenIdentifier "auth scope"
    string title
    string status "lifecycle"
    string sha256 "content hash"
    id fileStorageId FK "_storage"
    string documentSummary
    number pageCount
  }
  documentPages {
    id _id PK
    id documentId FK
    string ownerTokenIdentifier
    number pageNumber
    string extractedText "OCR"
    string summary
    vector embedding "1536-dim"
  }
  documentChunks {
    id _id PK
    id documentId FK
    string ownerTokenIdentifier
    number chunkIndex
    string text "retrieval unit"
    object pageSpans "citation offsets"
    vector embedding "1536-dim"
  }
  conversations {
    id _id PK
    id documentId FK
    string ownerTokenIdentifier
    string title
  }
  messages {
    id _id PK
    id conversationId FK
    string role "user or assistant"
    string content
    number pageNumber "optional question scope"
    object citations "chunkId refs"
  }
  documents ||--o{ documentPages : "1 : N  pages"
  documents ||--o{ documentChunks : "1 : N  chunks"
  documents ||--o{ conversations : "1 : N  chats"
  conversations ||--o{ messages : "1 : N  turns"
  documentChunks |o..o{ messages : "cited by"`;
