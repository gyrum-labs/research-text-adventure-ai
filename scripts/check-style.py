#!/usr/bin/env python3
"""Prose gate for this repository: the em-dash rule and the AI-tell list.

Both rules come from the house style used in `the-rented-codebase`, which
proved the point on a published manuscript: an em-dash-heavy page reads as
AI-drafted even when the content is entirely human-grounded. This project is
the same kind of artefact, so it carries the same rule.

What this script checks:

1. **Em-dashes (U+2014)** outside fenced code blocks. The em-dash is
   replaced with a period, a comma, a colon, a hyphen, or a restructured
   sentence. En-dashes (U+2013) are correct for ranges and stay.
2. **AI tells** - the Tier 1 single-word giveaways, the Tier 2 corporate
   register, and the Tier 3 structural patterns that a regex can catch.

Usage:

    python3 scripts/check-style.py            # check every prose file
    python3 scripts/check-style.py --fix      # report only; never edits

Exit status is 0 when clean, 1 when a rule was broken.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Prose files. Fenced code inside them is exempt from the em-dash rule.
PROSE_GLOBS = (
    "SPEC.md",
    "README.md",
    "AGENT_BRIEF.md",
    "TASKS.md",
    "docs/*.md",
    "experiments/**/*.md",
)

# Files whose content is quoted from a source rather than authored here.
EXEMPT = {"docs/REFERENCES.md"}

# --------------------------------------------------------------------------
# Rule 1: the em-dash
# --------------------------------------------------------------------------

EM_DASH = "—"

# --------------------------------------------------------------------------
# Rule 2: AI tells
# --------------------------------------------------------------------------

# Tier 1 - load-bearing giveaways. Zero tolerance.
TIER1_WORDS = [
    "delve", "delves", "delving", "delved",
    "tapestry",
    "embark", "embarks", "embarked", "embarking",
    "foster", "fosters", "fostered", "fostering",
    "vibrant",
    "bustling",
    "holistic",
    "synergy", "synergies", "synergistic", "synergise", "synergize",
    "spearhead", "spearheads", "spearheaded", "spearheading",
    "unveil", "unveils", "unveiled", "unveiling",
    "empower", "empowers", "empowered", "empowering",
    "multifaceted",
    "showcase",
    "realm",
    "navigate the",
    "ever-evolving",
    "seamless",
    "robust",
    "leverage",
    "utilise", "utilize",
    "cutting-edge",
    "state-of-the-art",
]

# Tier 2 - corporate-AI register: phrases that read as filler.
TIER2_PHRASES = [
    "it's important to note that",
    "it is important to note that",
    "it's worth noting that",
    "it is worth noting that",
    "it is interesting to note that",
    "it's interesting to note that",
    "in this post",
    "in this article",
    "in this section, we will",
    "we've covered",
    "we have covered",
    "now let's move on to",
    "as we mentioned earlier",
    "as mentioned earlier",
    "this is where it gets interesting",
    "what this is saying is",
    "you might be wondering",
    "let's dive into",
    "let's dive deep",
    "let's delve into",
    "in short, we've",
    "in summary, we've",
    "first, let's",
    "first of all",
    "not only",
    "at the end of the day",
    "it goes without saying",
    "needless to say",
    "a testament to",
    "pave the way for",
    "the world of",
    "in today's fast-paced",
    "in today's digital",
    "when it comes to",
]

# Tier 3 - structural patterns that a regex can reach.
TIER3_PATTERNS = [
    (r"\bfirst\b[^.\n]{0,80}\bsecond\b[^.\n]{0,80}\bthird\b", "First... Second... Third..."),
    (r"\bfirst\b[^.\n]{0,80}\bsecond\b[^.\n]{0,80}\bthird\b[^.\n]{0,80}\bfinally\b",
     "First... Second... Third... Finally..."),
    (r"\bon the one hand\b[^.\n]{0,120}\bon the other hand\b", "On one hand... on the other hand"),
    (r"\bnot only\b[^.\n]{0,120}\bbut also\b", "Not only X but also Y"),
    (r"\bthis means that\b", "This means that (filler restatement)"),
    (r"\bin order to\b", "In order to (prefer 'to')"),
    (r"\bplays a (crucial|vital|pivotal|key) role\b", "plays a crucial role (say what it does)"),
    (r"\bat its core\b", "at its core (filler)"),
    (r"\bthe fact of the matter\b", "the fact of the matter (filler)"),
]


def prose_files() -> list[Path]:
    files: list[Path] = []
    for pattern in PROSE_GLOBS:
        files.extend(sorted(ROOT.glob(pattern)))
    return [f for f in files if f.is_file() and f.relative_to(ROOT).as_posix() not in EXEMPT]


def strip_code_blocks(text: str) -> list[tuple[int, str]]:
    """Return (line_number, line) for every line outside fenced code blocks."""
    out: list[tuple[int, str]] = []
    in_fence = False
    fence_marker = ""
    for number, line in enumerate(text.split("\n"), start=1):
        stripped = line.lstrip()
        if stripped.startswith("```"):
            if not in_fence:
                in_fence = True
                fence_marker = stripped[:3]
            elif stripped.startswith(fence_marker):
                in_fence = False
            continue
        if in_fence:
            continue
        out.append((number, line))
    return out


def check_em_dashes(path: Path, lines: list[tuple[int, str]]) -> list[str]:
    problems = []
    for number, line in lines:
        if EM_DASH in line:
            problems.append(f"{path.relative_to(ROOT)}:{number}: em-dash (U+2014) - use a period, comma, colon or hyphen")
    return problems


def check_ai_tells(path: Path, lines: list[tuple[int, str]]) -> list[str]:
    problems = []
    for number, line in lines:
        lowered = line.lower()
        # Strip inline code so a banned word inside a code span is not a hit.
        scrubbed = re.sub(r"`[^`]*`", "", lowered)
        # Strip quoted spans. A source's own wording is not an AI tell of ours:
        # "the paper calls these state-of-the-art models" is the paper's phrase.
        scrubbed = re.sub(r'"[^"]*"', " ", scrubbed)
        scrubbed = re.sub(r"\*\"[^\"]*\"\*", " ", scrubbed)
        for word in TIER1_WORDS:
            if re.search(rf"\b{re.escape(word)}\b", scrubbed):
                problems.append(f"{path.relative_to(ROOT)}:{number}: AI tell '{word}'")
        for phrase in TIER2_PHRASES:
            if phrase in scrubbed:
                problems.append(f"{path.relative_to(ROOT)}:{number}: AI-tell phrase '{phrase}'")
        for pattern, label in TIER3_PATTERNS:
            if re.search(pattern, scrubbed):
                problems.append(f"{path.relative_to(ROOT)}:{number}: AI-tell pattern '{label}'")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--quiet", action="store_true", help="print only the verdict")
    args = parser.parse_args()

    problems: list[str] = []
    checked = 0
    for path in prose_files():
        lines = strip_code_blocks(path.read_text(encoding="utf-8"))
        checked += 1
        problems.extend(check_em_dashes(path, lines))
        problems.extend(check_ai_tells(path, lines))

    if problems:
        print(f"style: {len(problems)} problem(s) across {checked} file(s)\n")
        for problem in problems:
            print(f"  {problem}")
        print("\nThe em-dash is replaced with a period, a comma, a colon or a hyphen.")
        print("En-dashes (U+2013) are correct for ranges and stay.")
        return 1

    if not args.quiet:
        print(f"style: {checked} prose file(s) clean")
    return 0


if __name__ == "__main__":
    sys.exit(main())
