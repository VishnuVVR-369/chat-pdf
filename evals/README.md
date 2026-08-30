# Retrieval and answer evaluation harness

This harness evaluates the current ChatPDF configuration against the real cloud
Convex development deployment and real AI models. It does not create
conversations or messages. Corpus documents use the isolated synthetic owner
`https://eval.chat-pdf.local|eval-harness-v1`.

## Requirements

- The normal project environment variables for Convex, OpenAI, and Mistral.
- `CONVEX_DEPLOYMENT` must point to a development deployment.
- `EVAL_JUDGE_MODEL` grades the answers. It currently matches
  `OPENAI_CHAT_MODEL`, but judging runs at high reasoning effort while answering
  runs at the product default, so the grader still gets more thinking budget
  than the system under test.
- The five committed PDFs must match `corpus/manifest.json`.

The harness refuses production by default. Its local CLI invokes internal
evaluation functions through the authenticated Convex CLI, so no evaluation
endpoint is exposed publicly.

## 1. Seed and process the corpus

```bash
pnpm eval:seed
```

This validates every local PDF, uploads missing documents through the real
application upload path, and waits for OCR, summaries, chunks, and embeddings.
It reuses documents with matching filenames and SHA-256 checksums.

## 2. Generate the 60-case dataset

```bash
pnpm eval:dataset
```

The current v1.1 dataset contains 35 single-turn, 15 page-scoped, and 10
unanswerable cases. A separate verification pass checks exact evidence.
Unanswerable cases are checked against every OCR page in bounded batches. The
resulting versioned JSONL dataset and generation log are committed.

## 3. Run the evaluation

```bash
pnpm eval:run
pnpm eval:run -- --limit 5
pnpm eval:run -- --case nist-ai-rmf-1.0-st-01
pnpm eval:run -- --concurrency 2
pnpm eval:run -- --resume <run-id>
```

Runs default to concurrency 1 because answer and judge calls share the Luna TPM
budget. Accounts with more capacity can raise it explicitly.

Every new run creates an immutable directory under `evals/runs/` containing:

- `run.json`: Git, selected case IDs, dataset, deployment, model, and prompt provenance.
- `results.jsonl`: append-only case results for safe resume.
- `cases/*.json`: complete traces and judgments.
- `summary.md`: compact aggregate report.
- `report.html`: human-readable per-case drill-down.

Two independent retrieval and answer judgments are performed for every case.
Pass/fail disagreements or score differences above one point trigger a third
adjudication call. Each fresh run also checks supported and contradicted anchor
answers before evaluating the dataset.

Reports include token counts and an estimated standard API cost for GPT-5.6
Luna. The estimate excludes embedding, OCR, and Convex charges.

Run directories are intentionally ignored by Git. Copy a run elsewhere if it
must be preserved or shared.
