#!/usr/bin/env bash
# vale.sh - run the prose linter against the manuscript.
#
# Usage:
#   ./vale.sh              lint every prose file
#   ./vale.sh SPEC.md      lint one file
#
# Vale install:
#   go install github.com/vale-cli/vale/v3/cmd/vale@latest
#   or download the release binary from https://github.com/vale-cli/vale/releases
#
# The structural prose checks run first: the em-dash rule and the AI-tell
# list. They are fast and fail-fast, so Vale's slower pass is only worth
# running when the cheap gate is clean.

set -euo pipefail

cd "$(dirname "$0")"

if ! command -v vale >/dev/null 2>&1; then
    cat >&2 <<'MSG'
vale is not installed. Install via:
  go install github.com/vale-cli/vale/v3/cmd/vale@latest
  or download the release binary from https://github.com/vale-cli/vale/releases
MSG
    exit 2
fi

echo "[1/2] structural prose check (em-dash rule, AI tells)..."
python3 scripts/check-style.py

echo
echo "[2/2] vale prose lint..."
if [ "$#" -eq 0 ]; then
    set -- SPEC.md README.md AGENT_BRIEF.md TASKS.md docs/*.md experiments/README.md experiments/*/README.md
fi
vale --output=line "$@"
