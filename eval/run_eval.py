"""
Full RAG evaluation.

For each case in eval/cases.json:
  1. Load courses from local markdown files (no GCS).
  2. Run retrieval to get top-3 relevant courses.
  3. Build the system prompt with the retrieved context.
  4. Call Claude and capture the response.
  5. Score by keyword overlap against expected_topics.
  6. Save results to eval/results.json and print a summary table.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

# Load .env.local so ANTHROPIC_API_KEY is available when running locally
load_dotenv(Path(__file__).parent.parent / ".env.local", override=True)

import anthropic

sys.path.insert(0, str(Path(__file__).parent))
from _rag import load_courses, find_relevant_courses, build_context, build_system_prompt, rag_pipeline

EVAL_DIR = Path(__file__).parent
CASES_FILE = EVAL_DIR / "cases.json"
RESULTS_FILE = EVAL_DIR / "results.json"

PASS_THRESHOLD = 0.6
TOP_K = 4


def score_response(response: str, expected_topics: list[str]) -> float:
    if not expected_topics:
        return 0.0
    response_lower = response.lower()
    hits = sum(1 for topic in expected_topics if topic.lower() in response_lower)
    return round(hits / len(expected_topics), 3)


def run():
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY not set.", file=sys.stderr)
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)
    courses = load_courses()

    with open(CASES_FILE) as f:
        cases = json.load(f)

    results = []

    for case in cases:
        question = case["question"]
        expected_topics = case["expected_topics"]

        courses_block, relevant = rag_pipeline(question, courses, TOP_K)
        system_prompt = build_system_prompt(courses_block)

        retrieved_chunks = [
            {"code": c["code"], "name": c["name"]}
            for c in relevant[:3]
        ]

        print(f"Running [{case['id']}] ...", end=" ", flush=True)
        start = time.time()

        message = client.messages.create(
            model="claude-opus-4-6",
            max_tokens=1024,
            system=system_prompt,
            messages=[{"role": "user", "content": question}],
        )
        response_text = message.content[0].text
        latency_ms = round((time.time() - start) * 1000)

        score = score_response(response_text, expected_topics)
        passed = score >= PASS_THRESHOLD

        print(f"score={score:.2f} {'PASS' if passed else 'FAIL'} ({latency_ms}ms)")

        results.append({
            "id": case["id"],
            "category": case["category"],
            "question": question,
            "retrieved_chunks": retrieved_chunks,
            "score": score,
            "passed": passed,
            "response": response_text,
        })

    with open(RESULTS_FILE, "w") as f:
        json.dump(results, f, indent=2)

    # Summary table
    print("\n" + "=" * 70)
    print(f"{'ID':<35} {'Cat':<16} {'Score':>6} {'Pass':>5}")
    print("-" * 70)
    for r in results:
        print(
            f"{r['id']:<35} {r['category']:<16} {r['score']:>6.2f} {'YES' if r['passed'] else 'NO':>5}"
        )

    avg = sum(r["score"] for r in results) / len(results)
    passed = sum(1 for r in results if r["passed"])
    print("=" * 70)
    print(f"Average score: {avg:.2f}  |  Passed: {passed}/{len(results)}")
    print(f"\nResults saved to {RESULTS_FILE}")


if __name__ == "__main__":
    run()
