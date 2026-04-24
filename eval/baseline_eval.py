"""
Baseline evaluation — no retrieval.

Runs the same 7 cases as run_eval.py but passes the question to Claude
with only the BASE_SYSTEM prompt and NO retrieved course context.
This is the comparison point: how much does retrieval actually help?

Saves results to eval/baseline_results.json.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env.local", override=True)

import anthropic

sys.path.insert(0, str(Path(__file__).parent))
from _rag import BASE_SYSTEM

EVAL_DIR = Path(__file__).parent
CASES_FILE = EVAL_DIR / "cases.json"
RESULTS_FILE = EVAL_DIR / "baseline_results.json"

PASS_THRESHOLD = 0.6


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

    with open(CASES_FILE) as f:
        cases = json.load(f)

    results = []

    for case in cases:
        question = case["question"]
        expected_topics = case["expected_topics"]

        # No retrieval — only BASE_SYSTEM, empty courses block
        system_prompt = BASE_SYSTEM + "\n\n<courses>\n</courses>"

        print(f"Running (baseline) [{case['id']}] ...", end=" ", flush=True)
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
            "retrieved_chunks": [],
            "score": score,
            "passed": passed,
            "response": response_text,
        })

    with open(RESULTS_FILE, "w") as f:
        json.dump(results, f, indent=2)

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
