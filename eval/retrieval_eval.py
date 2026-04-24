"""
Retrieval quality evaluation.

For each of the 5 representative cases, checks whether the top-3 retrieved
courses contain at least one chunk relevant to the question. Relevance is
defined by the presence of at least one expected_relevant_keyword in the
retrieved course's name, description, tools, or topics fields.

Saves results to eval/retrieval_results.json and prints the hit rate.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _rag import load_courses, find_relevant_courses

EVAL_DIR = Path(__file__).parent
RESULTS_FILE = EVAL_DIR / "retrieval_results.json"

# Per-case relevance keywords checked against retrieved course text.
# Only representative cases are included (failure cases are excluded because
# they deliberately lack a single "correct" course to retrieve).
RETRIEVAL_CASES = [
    {
        "id": "rep-tools-aidi2000",
        "question": "What tools does AIDI-2000 use?",
        "expected_relevant_keywords": ["TensorFlow", "PyTorch", "CUDA"],
        "expected_course_code": "AIDI-2000",
    },
    {
        "id": "rep-capstone-deliverables",
        "question": "What are the deliverables for the AIDI-2005 capstone project?",
        "expected_relevant_keywords": ["technical report", "poster", "presentation"],
        "expected_course_code": "AIDI-2005",
    },
    {
        "id": "rep-semester-aidi2003",
        "question": "What semester is AIDI-2003 offered in?",
        "expected_relevant_keywords": ["MLOps", "production", "pipeline"],
        "expected_course_code": "AIDI-2003",
    },
    {
        "id": "rep-semester1-courses",
        "question": "What courses are in Semester 1 of the AIDI program?",
        "expected_relevant_keywords": ["AIDI-1000", "AIDI-1001", "AIDI-1002"],
        "expected_course_code": None,  # No single expected course; checking any sem-1 course is retrieved
    },
    {
        "id": "rep-prerequisites-aidi2004",
        "question": "What are the prerequisites for AIDI-2004?",
        "expected_relevant_keywords": ["LangChain", "RAG", "fine-tuning", "LLM"],
        "expected_course_code": "AIDI-2004",
    },
]


def course_text(course: dict) -> str:
    """Flatten a course dict into a single string for keyword search."""
    parts = [
        course["code"],
        course["name"],
        course["description"],
        *course["tools"],
        *course["topics"],
        *[p["name"] + " " + p["description"] for p in course["projects"]],
    ]
    return " ".join(parts)


def has_relevant_chunk(retrieved: list[dict], keywords: list[str]) -> bool:
    for course in retrieved:
        text = course_text(course).lower()
        if any(kw.lower() in text for kw in keywords):
            return True
    return False


def run():
    courses = load_courses()
    results = []

    print(f"{'ID':<35} {'Hit?':>5} {'Retrieved codes'}")
    print("-" * 70)

    for case in RETRIEVAL_CASES:
        relevant = find_relevant_courses(case["question"], courses, top_k=4)
        top3 = relevant[:3]
        retrieved_codes = [c["code"] for c in top3]

        hit = has_relevant_chunk(top3, case["expected_relevant_keywords"])

        # If an expected_course_code is specified, also check it was retrieved in top-3
        if case["expected_course_code"]:
            code_hit = case["expected_course_code"] in retrieved_codes
        else:
            code_hit = hit  # fall back to keyword check only

        final_hit = hit and code_hit

        print(f"{case['id']:<35} {'YES' if final_hit else 'NO':>5}  {retrieved_codes}")

        results.append({
            "id": case["id"],
            "question": case["question"],
            "retrieved_codes": retrieved_codes,
            "keyword_hit": hit,
            "code_hit": code_hit,
            "hit": final_hit,
        })

    hit_rate = sum(1 for r in results if r["hit"]) / len(results)
    print("-" * 70)
    print(f"Hit rate: {hit_rate:.0%} ({sum(r['hit'] for r in results)}/{len(results)})")

    with open(RESULTS_FILE, "w") as f:
        json.dump(
            {"hit_rate": round(hit_rate, 3), "cases": results},
            f,
            indent=2,
        )

    print(f"\nResults saved to {RESULTS_FILE}")


if __name__ == "__main__":
    run()
