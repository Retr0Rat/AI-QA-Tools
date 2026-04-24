# Data Pipeline — DC AI Program Q&A Tool

This document describes the full end-to-end flow from raw course files to a streamed answer in the user's browser.

---

## Raw Input

**What:** Markdown files with YAML front-matter, one file per course.

**Where they live:**
```
data/courses/semester1/   AIDI-1000.md  AIDI-1001.md  AIDI-1002.md
                          AIDI-1003.md  AIDI-1100.md  MATH-1111.md
data/courses/semester2/   AIDI-2000.md  AIDI-2001.md  AIDI-2002.md
                          AIDI-2003.md  AIDI-2004.md  AIDI-2005.md
```

**File format:**
```markdown
---
code: AIDI-2000
name: Deep Learning and Neural Networks
semester: 2
credits: 3
description: Comprehensive study of deep learning architectures...
---

## Overview
...

## Tools & Technologies
- TensorFlow 2.x / Keras
- PyTorch
...

## Topics
- Artificial Neural Networks (ANNs)
...

## Projects & Capstone

### Project 1: Image Classifier with CNN
...

## Prerequisites
- AIDI-1001: Machine Learning Fundamentals
```

---

## Bronze — ETL Extraction

**Script:** `etl/process.py`

**Trigger:** GitHub Actions (`.github/workflows/etl.yml`) fires automatically on any push to `main` that changes files under `data/courses/**` or `etl/**`. Can also be dispatched manually.

**What the ETL does:**

1. Iterates over all `*.md` files in `data/courses/semester{1,2}/`.
2. Parses YAML front-matter using `python-frontmatter` to extract structured fields.
3. Runs regex-based section parsers on the markdown body:
   - `_list_items(content, heading)` — extracts bullet list items from a `##` section.
   - `_section_body(content, heading)` — returns raw text of a `##` section.
   - `_projects(content)` — extracts `###` sub-sections from the "Projects" or "Projects & Capstone" heading into structured project objects.
4. Assembles a Python dict per course.
5. Uploads each dict as a JSON blob to GCS.

---

## Silver — Cleaning and Normalization

Cleaning happens inline during ETL extraction (no separate Silver storage tier):

- Course code defaults to the filename stem if the front-matter `code` field is missing.
- Credits cast to `int`.
- Tool and topic bullet text is stripped of leading/trailing whitespace.
- Project type is inferred: `"capstone"` if the word "capstone" appears in the project name, otherwise `"assignment"`.
- `raw_content` field stores the full markdown body for downstream use.

---

## Gold — Final JSON Chunks

**Storage:** Google Cloud Storage bucket at `gs://<GCP_BUCKET_NAME>/courses/<CODE>.json`

**One JSON file per course.** Example structure:

```json
{
  "code": "AIDI-2000",
  "name": "Deep Learning and Neural Networks",
  "semester": 2,
  "credits": 3,
  "description": "Comprehensive study of deep learning architectures...",
  "tools": [
    "Python 3.x",
    "TensorFlow 2.x / Keras",
    "PyTorch",
    "CUDA / cuDNN (GPU acceleration)",
    "Hugging Face Transformers (introductory)",
    "Weights & Biases (W&B)",
    "Google Colab (GPU runtimes)",
    "TensorBoard",
    "ONNX (model export)",
    "NumPy",
    "Matplotlib / Seaborn"
  ],
  "topics": [
    "Artificial Neural Networks (ANNs): architecture and backpropagation",
    "Convolutional Neural Networks (CNNs) and image classification",
    "..."
  ],
  "projects": [
    {
      "name": "Project 1: Image Classifier with CNN",
      "description": "Students design and train a CNN...",
      "type": "assignment"
    },
    {
      "name": "Final Project: Custom Deep Learning Solution",
      "description": "Students independently define a real-world problem...",
      "type": "capstone"
    }
  ],
  "prerequisites": [
    "AIDI-1001: Machine Learning Fundamentals",
    "AIDI-1003: Mathematics for Machine Learning"
  ],
  "raw_content": "## Overview\n..."
}
```

**All fields and their metadata:**

| Field | Type | Source |
|---|---|---|
| `code` | string | YAML front-matter |
| `name` | string | YAML front-matter |
| `semester` | int | Inferred from directory (semester1 → 1) |
| `credits` | int | YAML front-matter |
| `description` | string | YAML front-matter |
| `tools` | string[] | Bullet list under `## Tools` or `## Tools & Technologies` |
| `topics` | string[] | Bullet list under `## Topics` |
| `projects` | Project[] | Sub-sections under `## Projects` or `## Projects & Capstone` |
| `prerequisites` | string[] | Bullet list under `## Prerequisites` |
| `raw_content` | string | Full markdown body after front-matter |

---

## Retrieval

**Module:** `lib/rag.ts` — `findRelevantCourses(question, courses, topK=4)`

**How it works:**

1. `fetchCourses()` (`lib/gcp.ts`) loads all course JSON objects from GCS. Results are cached in memory for 5 minutes to avoid hammering GCS on every request.
2. Each course is scored against the question with `scoreRelevance()`:
   - Both the question and the course corpus (code + name + description + tools + topics + project names/descriptions) are tokenized into lowercase word sets with stop words removed.
   - Score = count of tokens in the question that also appear in the course corpus.
   - **Code bonus:** +20 points if the course code (e.g. `AIDI-2000`) appears verbatim in the question (case-insensitive).
3. Courses are ranked by score descending.
4. Any course whose code was explicitly mentioned in the question is always included, regardless of rank.
5. Top-K courses are returned (default **k = 4**).

**Embedding model:** None — retrieval is token-based (no vector embeddings or semantic similarity).

**Similarity threshold:** None — all courses are scored and ranked; no minimum score cutoff.

---

## Prompt Construction

**Module:** `lib/prompts.ts` — `buildSystemPrompt(coursesBlock)`

The system prompt template structure:

```
[BASE_SYSTEM — persona and guidelines]

You are a knowledgeable assistant for Durham College's AIDI post-graduate certificate program.
...

Out-of-scope handling:
- If the user asks about grades...
- If the user asks about tuition or fees...
...

[COURSES BLOCK — injected by ragPipeline()]

<courses>
{
  "code": "AIDI-2000",
  "name": "Deep Learning and Neural Networks",
  ...
}

---

{
  "code": "AIDI-2004",
  ...
}
</courses>
```

The user message is the raw question text. Prior conversation turns (if any) are passed as the `messages` array for multi-turn support.

---

## Claude API Call

**Module:** `app/api/ask/route.ts`

| Parameter | Value |
|---|---|
| Model | `claude-opus-4-6` |
| Max tokens | `1024` |
| Stream | Yes — `anthropic.messages.stream()` |
| System | Assembled system prompt (BASE_SYSTEM + courses block) |
| Messages | Prior history + current user question |

The route uses the Anthropic TypeScript SDK's streaming interface. Each `content_block_delta` event with `text_delta` type is forwarded immediately as a Server-Sent Event chunk.

---

## Response Handling

The API route wraps the Claude stream in a `ReadableStream` and returns it with headers:

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

Each SSE frame:
```
data: {"text": "The "}

data: {"text": "course "}

data: [DONE]
```

On error, a single frame with `{"error": "..."}` is sent before closing the stream.

---

## UI Rendering

**Component:** `components/ChatInterface.tsx`

1. User types a question and clicks Send (or selects a suggestion button).
2. User message appears immediately in a blue bubble (right-aligned).
3. An assistant bubble appears with animated loading dots.
4. The frontend opens a `fetch()` to `POST /api/ask` and reads the SSE stream.
5. As each `data:` frame arrives, the assistant bubble updates in real-time.
6. When `[DONE]` is received, loading state is cleared.
7. The chat scrolls to the bottom after each update.
8. If a frame contains `{"error": "..."}`, the error text is displayed in the assistant bubble.

---

## Debugging Information

The following fields are logged to the server console on every request (added in `app/api/ask/route.ts`):

| Field | When logged |
|---|---|
| Timestamp (ISO 8601) | Request received |
| Query text | Request received |
| History length | Request received |
| Retrieved course codes | After RAG ranking |
| System prompt length (chars) | After prompt assembly |
| Model name and max_tokens | Before streaming |
| Total latency (ms) | After stream completes |

**What is not yet logged (future work):**

- Full prompt text (useful for debugging retrieval failures; omitted to avoid log bloat)
- Similarity scores per retrieved course
- Raw API response token counts
- Per-request GCS cache hit/miss status
