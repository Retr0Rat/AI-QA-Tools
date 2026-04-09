"""
Tests for ETL markdown parsing in process.py.
Stubs out google-cloud-storage and python-frontmatter so tests
run without real GCP credentials or file I/O.
"""
import sys
from unittest.mock import MagicMock

# Stub heavy deps before importing process
sys.modules.setdefault("frontmatter", MagicMock())
sys.modules.setdefault("google.cloud", MagicMock())
sys.modules.setdefault("google.cloud.storage", MagicMock())

from process import _list_items  # noqa: E402


TOOLS_HEADING = """\
## Tools
- Python
- TensorFlow
- scikit-learn
"""

TOOLS_AND_TECHNOLOGIES_HEADING = """\
## Tools & Technologies
- Python
- TensorFlow
- scikit-learn
"""


def test_tools_heading_parsed():
    result = _list_items(TOOLS_HEADING, "Tools")
    assert result == ["Python", "TensorFlow", "scikit-learn"]


def test_tools_and_technologies_heading_parsed():
    result = _list_items(TOOLS_AND_TECHNOLOGIES_HEADING, "Tools & Technologies")
    assert result == ["Python", "TensorFlow", "scikit-learn"]


def test_tools_heading_does_not_match_tools_and_technologies():
    """'## Tools' section should not bleed into '## Tools & Technologies' queries."""
    result = _list_items(TOOLS_HEADING, "Tools & Technologies")
    assert result == []


def test_tools_and_technologies_heading_does_not_match_tools():
    """'## Tools & Technologies' section should not be returned for a plain 'Tools' query."""
    result = _list_items(TOOLS_AND_TECHNOLOGIES_HEADING, "Tools")
    assert result == []
