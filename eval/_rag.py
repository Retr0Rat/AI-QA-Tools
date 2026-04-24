"""
Shared RAG helpers for eval scripts.

Replicates the TypeScript logic from lib/rag.ts and lib/prompts.ts locally,
parsing course data from the markdown files in data/courses/ rather than
fetching from GCS. This keeps evals self-contained with no network dependency.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import frontmatter

# ---------------------------------------------------------------------------
# Markdown parsers (mirrors etl/process.py)
# ---------------------------------------------------------------------------

def _section_body(content: str, heading: str) -> str:
    pattern = rf"## {re.escape(heading)}\s*\n(.*?)(?=\n## |\Z)"
    m = re.search(pattern, content, re.DOTALL | re.IGNORECASE)
    return m.group(1).strip() if m else ""


def _list_items(content: str, heading: str) -> list[str]:
    body = _section_body(content, heading)
    return [item.strip() for item in re.findall(r"^[-*]\s+(.+)$", body, re.MULTILINE)]


def _projects(content: str) -> list[dict[str, str]]:
    for heading in ("Projects & Capstone", "Projects"):
        body = _section_body(content, heading)
        if body:
            break
    else:
        return []

    results = []
    for m in re.finditer(r"### (.+?)\n(.*?)(?=\n### |\Z)", body, re.DOTALL):
        name = m.group(1).strip()
        desc = m.group(2).strip()
        ptype = "capstone" if "capstone" in name.lower() else "assignment"
        results.append({"name": name, "description": desc, "type": ptype})
    return results


# ---------------------------------------------------------------------------
# Course loader
# ---------------------------------------------------------------------------

def load_courses() -> list[dict[str, Any]]:
    """Parse all markdown course files and return a list of course dicts."""
    repo_root = Path(__file__).parent.parent
    data_dir = repo_root / "data" / "courses"

    courses: list[dict[str, Any]] = []
    for semester in (1, 2):
        sem_dir = data_dir / f"semester{semester}"
        if not sem_dir.is_dir():
            continue
        for md_path in sorted(sem_dir.glob("*.md")):
            post = frontmatter.load(str(md_path))
            content: str = post.content
            course: dict[str, Any] = {
                "code": str(post.get("code", md_path.stem)),
                "name": str(post.get("name", "")),
                "semester": semester,
                "credits": int(post.get("credits", 3)),
                "description": str(post.get("description", "")),
                "tools": (
                    _list_items(content, "Tools") or
                    _list_items(content, "Tools & Technologies")
                ),
                "topics": _list_items(content, "Topics"),
                "projects": _projects(content),
                "prerequisites": _list_items(content, "Prerequisites"),
                "raw_content": content,
            }
            courses.append(course)
    return courses


# ---------------------------------------------------------------------------
# Retrieval (mirrors lib/rag.ts)
# ---------------------------------------------------------------------------

STOP_WORDS = {"the", "and", "for", "are", "this", "that", "with", "from", "have", "will"}


def token_set(text: str) -> set[str]:
    words = re.sub(r"[^a-z0-9\s-]", " ", text.lower()).split()
    return {w for w in words if len(w) > 2 and w not in STOP_WORDS}


def score_relevance(question: str, course: dict[str, Any]) -> int:
    q_tokens = token_set(question)
    code_bonus = 20 if course["code"] in question.upper() else 0

    corpus_parts = [
        course["code"],
        course["name"],
        course["description"],
        *course["tools"],
        *course["topics"],
        *[p["name"] + " " + p["description"] for p in course["projects"]],
    ]
    c_tokens = token_set(" ".join(corpus_parts))

    overlap = sum(1 for t in q_tokens if t in c_tokens)
    return code_bonus + overlap


def find_relevant_courses(
    question: str, courses: list[dict[str, Any]], top_k: int = 4
) -> list[dict[str, Any]]:
    q_upper = question.upper()
    explicit = [c for c in courses if c["code"] in q_upper]

    # If question references "semester N", include ALL courses of that semester
    sem_match = re.search(r"semester\s+(\d)", question, re.IGNORECASE)
    semester_explicit = (
        [c for c in courses if c["semester"] == int(sem_match.group(1))]
        if sem_match else []
    )

    ranked = sorted(courses, key=lambda c: score_relevance(question, c), reverse=True)

    seen: dict[str, dict[str, Any]] = {}
    for c in explicit + semester_explicit + ranked:
        seen.setdefault(c["code"], c)

    merged = list(seen.values())
    return merged[: max(top_k, len(explicit), len(semester_explicit))]


def build_context(courses: list[dict[str, Any]]) -> str:
    parts = []
    for c in courses:
        parts.append(
            json.dumps(
                {
                    "code": c["code"],
                    "name": c["name"],
                    "semester": c["semester"],
                    "credits": c["credits"],
                    "description": c["description"],
                    "tools": c["tools"],
                    "topics": c["topics"],
                    "projects": c["projects"],
                    "prerequisites": c["prerequisites"],
                },
                indent=2,
            )
        )
    return "\n\n---\n\n".join(parts)


def rag_pipeline(question: str, courses: list[dict[str, Any]], top_k: int = 4) -> str:
    relevant = find_relevant_courses(question, courses, top_k)
    context = build_context(relevant)
    return f"<courses>\n{context}\n</courses>", relevant


# ---------------------------------------------------------------------------
# Prompt (mirrors lib/prompts.ts — kept in sync manually)
# ---------------------------------------------------------------------------

OUT_OF_SCOPE_RESPONSES = {
    "grades": (
        "I can only answer questions about the DC AI program courses and curriculum. "
        "For grades or academic standing, please contact DC student services."
    ),
    "scheduling": (
        "I can only answer questions about course content and curriculum. "
        "For scheduling information, please visit the Durham College website or contact the registrar."
    ),
    "instructors": (
        "I don't have information about instructors. "
        "Please check the Durham College website or DC Connect for faculty information."
    ),
    "registration": (
        "For registration or enrollment questions, please contact Durham College admissions "
        "or visit durhamcollege.ca."
    ),
    "fees": (
        "I don't have information about tuition fees or program costs. "
        "Please visit durhamcollege.ca or contact Durham College admissions for fee information."
    ),
    "intake": (
        "I don't have information about intake dates or application deadlines. "
        "Please visit durhamcollege.ca or contact Durham College admissions for current intake information."
    ),
    "offTopic": (
        "I'm only able to answer questions about Durham College's AI post-graduate certificate program. "
        "Please ask me about courses, tools, topics, or projects in the AIDI program."
    ),
}

BASE_SYSTEM = f"""You are a knowledgeable assistant for Durham College's Artificial Intelligence Analysis and Design (AIDI) post-graduate certificate program.
You help students, prospects, and faculty answer questions about the program's courses, tools, topics, and projects.

Guidelines:
- Answer accurately using ONLY the course data provided in <courses>.
- When a course code is mentioned (e.g. AIDI-2000), focus on that course.
- For "what semester" questions, state the exact semester number.
- For "what tools" questions, list every tool from the course data.
- For project/capstone questions, describe the project in detail.
- If the data doesn't contain the answer, say so honestly instead of guessing.
- Keep answers clear and concise.

Out-of-scope handling:
- If the user asks about grades, GPA, or academic standing, respond: "{OUT_OF_SCOPE_RESPONSES['grades']}"
- If the user asks about class schedules, timetables, or room assignments, respond: "{OUT_OF_SCOPE_RESPONSES['scheduling']}"
- If the user asks about professor or instructor information, respond: "{OUT_OF_SCOPE_RESPONSES['instructors']}"
- If the user asks about registration, enrollment, or waitlists, respond: "{OUT_OF_SCOPE_RESPONSES['registration']}"
- If the user asks about tuition, fees, or program cost, respond: "{OUT_OF_SCOPE_RESPONSES['fees']}"
- If the user asks about intake dates, application deadlines, or when the program starts, respond: "{OUT_OF_SCOPE_RESPONSES['intake']}"
- If the user asks anything unrelated to the DC AI program (weather, general knowledge, other subjects), respond: "{OUT_OF_SCOPE_RESPONSES['offTopic']}"
"""


def build_system_prompt(courses_block: str) -> str:
    return f"{BASE_SYSTEM}\n\n{courses_block}"
