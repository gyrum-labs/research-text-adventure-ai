#!/usr/bin/env bash
# Proportional smoke test for the docs viewer. Boots serve.sh on a random high
# port, curls the index page, and asserts the HTML contains the markers the
# viewer needs for the page to actually function. This test exists as a
# reviewable artefact showing the viewer boots — it is deliberately not wired
# into pre-push.sh or review-pr.sh, because the viewer is a leaf template and
# the enforced gate for devtools itself is elsewhere.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VIEWER_DIR="$(dirname "$SCRIPT_DIR")"

if ! command -v python3 >/dev/null 2>&1; then
  echo "smoke: python3 not available; skipping" >&2
  exit 0
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "smoke: curl not available; skipping" >&2
  exit 0
fi

# Pick a random high port to avoid collisions with whatever else is running.
PORT=$(( (RANDOM % 10000) + 40000 ))
URL="http://127.0.0.1:${PORT}/docs-viewer/"
INDEX_URL="http://127.0.0.1:${PORT}/docs-viewer/_index.json"

echo "smoke: booting serve.sh on port ${PORT}"
bash "${VIEWER_DIR}/serve.sh" "${PORT}" >/tmp/docs-viewer-smoke.log 2>&1 &
SERVER_PID=$!

cleanup() {
  if kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Wait up to ~3s for the server to accept connections.
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if curl -sSf "${URL}" -o /tmp/docs-viewer-smoke.html 2>/dev/null; then
    break
  fi
  sleep 0.2
done

STATUS=$(curl -s -o /tmp/docs-viewer-smoke.html -w "%{http_code}" "${URL}")
if [ "${STATUS}" != "200" ]; then
  echo "smoke: expected HTTP 200 for viewer, got ${STATUS}" >&2
  cat /tmp/docs-viewer-smoke.log >&2 || true
  exit 1
fi

fail() {
  echo "smoke: $1" >&2
  exit 1
}

grep -q '<nav id="tree"' /tmp/docs-viewer-smoke.html || fail "missing <nav id=\"tree\"> marker"
grep -q '<title>Documentation</title>' /tmp/docs-viewer-smoke.html || fail "missing title marker"
grep -q 'viewer.js' /tmp/docs-viewer-smoke.html || fail "missing viewer.js script tag"
grep -q 'marked' /tmp/docs-viewer-smoke.html || fail "missing marked script reference"
grep -q 'id="search"' /tmp/docs-viewer-smoke.html || fail "missing search box marker (warp#16326)"
grep -q 'id="search-mode"' /tmp/docs-viewer-smoke.html || fail "missing search mode selector marker (warp#16326)"

INDEX_STATUS=$(curl -s -o /tmp/docs-viewer-smoke.json -w "%{http_code}" "${INDEX_URL}")
if [ "${INDEX_STATUS}" != "200" ]; then
  fail "expected HTTP 200 for _index.json, got ${INDEX_STATUS}"
fi
grep -q '"tree"' /tmp/docs-viewer-smoke.json || fail "_index.json missing tree field"

echo "smoke: OK"
