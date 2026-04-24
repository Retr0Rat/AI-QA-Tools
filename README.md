# DC AI Program Q&A Tool

A Retrieval-Augmented Generation (RAG) Q&A application for Durham College's Artificial Intelligence Analysis and Design (AIDI) post-graduate certificate program.

## Overview

Students and prospects ask natural-language questions about AIDI courses. The system retrieves the most relevant course data from a Google Cloud Storage bucket and passes it as context to Claude, which generates a grounded, accurate answer. Responses stream back to the user in real-time via Server-Sent Events.

## Tech Stack

- **Frontend:** Next.js 15, React 19, TailwindCSS
- **Backend:** Next.js API route (Node.js runtime)
- **LLM:** Anthropic Claude (`claude-opus-4-6`) via streaming SDK
- **Storage:** Google Cloud Storage (GCS) — course JSON files
- **ETL:** Python + `python-frontmatter` — markdown → JSON → GCS
- **CI/CD:** GitHub Actions — auto-runs ETL on course data changes
- **Tests:** Vitest (unit), Playwright (E2E)

## Architecture

### Classification

This is a **Retrieval-first / RAG** system. All course data is indexed in GCS. At query time the system retrieves only the most relevant course objects and injects them into the model context before generation.

### Why RAG

The course PDF/markdown corpus cannot fit in a single context window as the program grows. Retrieval ensures only the 4 most relevant courses (~4 JSON objects) reach the model on every query. As more courses, electives, or semesters are added the system scales without increasing per-query token cost or hitting context limits.

### Why Not Prompt-First

Passing the entire 12-course corpus on every query is three times more expensive per call, hits context limits as data grows, and gives the model no selectivity — it must reason over irrelevant material. Retrieval-first is the correct default for any corpus that will grow beyond a handful of documents.

### Capability Not Implemented — Tool Calling

Tool calling would allow dynamic lookups: live course schedules, current seat availability, or real-time intake dates. This capability is **not implemented** because the current use case is satisfied entirely by static course content. Adding it would require routing logic (classify whether a question needs live data), tool definitions and JSON schemas, error handling for failed tool calls, and a second model turn to incorporate tool results. It is worth adding in the future if the app needs to query live systems such as a student portal, course registration API, or admissions database.

### Tradeoff Table

| Factor | RAG choice | Prompt-first alternative |
|---|---|---|
| Data volume | 12 courses today; grows without limit | All courses fit now, breaks as corpus grows |
| Context window | Top-4 courses injected (~4 KB) | Full corpus injected (~12 KB and rising) |
| Retrieval needs | Token-scoring selects relevant courses | No selection — model sees everything |
| Determinism | Same question → same ranked chunks | Same question → same full context, more noise |
| Cost per query | ~4 course objects in prompt | ~12 course objects in prompt (3× tokens) |
| Operational overhead | GCS fetch + cache + ranking step needed | Simpler — no retrieval layer |
| Performance | Cache hit is fast; ranking is O(n) | Simpler code path, no cache needed |
| Debugging ease | Inspect retrieved chunks to trace errors | Inspect full prompt — harder with large corpus |

---

## Data Pipeline

See [docs/pipeline.md](docs/pipeline.md) for the full end-to-end data flow.

## Setup

### Prerequisites

- Node.js 20+
- Python 3.11+
- Anthropic API key
- Google Cloud project with a GCS bucket and a service account JSON key

### Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```
ANTHROPIC_API_KEY=sk-ant-...
GCP_BUCKET_NAME=your-bucket-name
GCP_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
```

### Install and Run

```bash
npm install
npm run dev        # http://localhost:3000
```

### Run ETL Locally

```bash
pip install -r etl/requirements.txt
GCP_BUCKET_NAME=your-bucket python etl/process.py
```

### Run Tests

```bash
npm test                    # Vitest unit tests
npm run test:e2e            # Playwright E2E
```

### Run Evaluation

```bash
pip install -r eval/requirements.txt
python eval/run_eval.py
python eval/baseline_eval.py
python eval/retrieval_eval.py
```

---

## Improvement

### What Failed

Evaluation revealed that **"What courses are in Semester 1?" scored 0.50 (FAIL)**. Expected 6 course codes but the response mentioned only 3. Root cause: the token-based retrieval returned top-4 courses, and one of them was AIDI-2005 (a semester-2 course) because its prerequisites section contains the phrase "All Semester 1 and Semester 2 courses", creating false token overlap. Only 3 of the 6 semester-1 courses made it into the context, so the model's answer was incomplete.

### Evidence (Scores Before Fix)

| Case | Score | Passed |
|---|---|---|
| `rep-semester1-courses` | 0.50 | NO |
| Overall average | 0.77 | 5/7 |

### What Changed

Added semester-aware retrieval to `lib/rag.ts` (and `eval/_rag.py`): when a question contains the phrase "semester N" the system now includes **all courses whose `semester` field equals N**, regardless of their token overlap score. This means a question about Semester 1 always returns all 6 semester-1 courses, not just the top-4 ranked ones.

Also added explicit `fees` and `intake` out-of-scope categories to `lib/prompts.ts` to harden refusal for tuition and intake-date questions.

### What Improved

| Case | Score Before | Score After |
|---|---|---|
| `rep-semester1-courses` | 0.50 | 1.00 |
| Overall average | 0.77 | 0.85 |
| Cases passing | 5/7 | 6/7 |

### What Remains Weak

- **Vague questions** (`failure-vague`: "What do students study in the AIDI program?") still score 0.50 because no specific course code or semester number is mentioned. Token-based retrieval selects only 4 of 12 courses and cannot infer the user wants a full program overview.
- Retrieval is keyword-based with no semantic similarity. Synonyms, paraphrases, and conceptual questions can miss relevant courses. Switching to vector embeddings (e.g. Sentence Transformers + cosine similarity) would address this.
