"""
ETL: Process AIDI course markdown files → cleaned JSON → GCP bucket.

Usage:
    GCP_BUCKET_NAME=my-bucket python etl/process.py

The script reads all *.md files under data/courses/semester{1,2}/,
parses their YAML front-matter and markdown sections, and uploads one
JSON file per course to gs://<bucket>/courses/<CODE>.json.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any

import frontmatter
from google.cloud import storage


# ---------------------------------------------------------------------------
# Markdown section parsers
# ---------------------------------------------------------------------------

def _section_body(content: str, heading: str) -> str:
    """Return the raw body of a ## heading section, or ''."""
    pattern = rf"## {re.escape(heading)}\s*\n(.*?)(?=\n## |\Z)"
    m = re.search(pattern, content, re.DOTALL | re.IGNORECASE)
    return m.group(1).strip() if m else ""


def _list_items(content: str, heading: str) -> list[str]:
    """Extract a bullet list from a ## heading section."""
    body = _section_body(content, heading)
    return [item.strip() for item in re.findall(r"^[-*]\s+(.+)$", body, re.MULTILINE)]


def _projects(content: str) -> list[dict[str, str]]:
    """Extract ### sub-sections from 'Projects & Capstone' or 'Projects'."""
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
# Course parser
# ---------------------------------------------------------------------------

def parse_course(path: Path, semester: int) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as fh:
        post = frontmatter.load(fh)

    content: str = post.content

    return {
        "code": str(post.get("code", path.stem)),
        "name": str(post.get("name", "")),
        "semester": semester,
        "credits": int(post.get("credits", 3)),
        "description": str(post.get("description", "")),
        "tools": _list_items(content, "Tools & Technologies"),
        "topics": _list_items(content, "Topics"),
        "projects": _projects(content),
        "prerequisites": _list_items(content, "Prerequisites"),
        "raw_content": content,
    }


# ---------------------------------------------------------------------------
# GCP upload
# ---------------------------------------------------------------------------

def upload(client: storage.Client, bucket_name: str, blob_name: str, data: dict) -> None:
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(blob_name)
    blob.upload_from_string(
        json.dumps(data, ensure_ascii=False, indent=2),
        content_type="application/json",
    )
    print(f"  uploaded → gs://{bucket_name}/{blob_name}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    bucket_name = os.environ.get("GCP_BUCKET_NAME", "").strip()
    if not bucket_name:
        print("ERROR: GCP_BUCKET_NAME environment variable is not set.", file=sys.stderr)
        sys.exit(1)

    repo_root = Path(__file__).parent.parent
    data_dir = repo_root / "data" / "courses"

    gcs = storage.Client()
    processed = 0

    for semester in (1, 2):
        sem_dir = data_dir / f"semester{semester}"
        if not sem_dir.is_dir():
            print(f"  [skip] {sem_dir} does not exist")
            continue

        for md_path in sorted(sem_dir.glob("*.md")):
            print(f"Processing {md_path.name} ...")
            course = parse_course(md_path, semester)
            blob_name = f"courses/{course['code']}.json"
            upload(gcs, bucket_name, blob_name, course)
            processed += 1

    print(f"\nDone. {processed} course(s) uploaded to gs://{bucket_name}/courses/")


if __name__ == "__main__":
    main()
