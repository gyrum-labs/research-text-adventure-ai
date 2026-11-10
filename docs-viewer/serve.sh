#!/usr/bin/env bash
# Start a local HTTP server rooted at the parent of docs-viewer/ so the viewer
# can fetch ../docs/ files under the same origin without CORS pain.
#
# Usage:
#   bash docs-viewer/serve.sh            # default port 8080
#   bash docs-viewer/serve.sh 9000       # custom port
#
# Open http://localhost:<PORT>/docs-viewer/ in your browser.
set -euo pipefail
PORT="${1:-8080}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PARENT_DIR"
echo "Serving $PARENT_DIR at http://localhost:$PORT/"
echo "Open: http://localhost:$PORT/docs-viewer/"
exec python3 -m http.server "$PORT"
