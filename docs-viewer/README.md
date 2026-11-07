# docs-viewer

A zero-build static browser for documentation folders. The viewer is a single HTML page, a JavaScript viewer with a search adapter, one CSS file, and a short shell script that starts a local HTTP server. Any repository that drops this directory in next to its `docs/` tree can browse its documentation in any modern browser without installing a toolchain, compiling anything, or running a Node process. The guiding idea is that documentation should be accessible with less ceremony than the code it describes: the reader opens a server, clicks a file, and reads it.

The viewer renders three kinds of files. Markdown is parsed by [marked](https://github.com/markedjs/marked) and shown as formatted prose, with Mermaid fenced code blocks rendered as diagrams and other fenced blocks syntax-highlighted by [highlight.js](https://github.com/highlightjs/highlight.js). Known source extensions (`.js`, `.ts`, `.json`, `.sh`, `.yml`, `.yaml`, `.css`, `.html`, and a few more) are rendered as syntax-highlighted code blocks. Anything else falls back to plain text inside a `<pre>` so the reader can still see the raw content. The viewer offers filename filtering and full-text search; it has no editing, authentication, or server-side logic. It is deliberately small, and the small size is the feature.

## Running it locally

For an arbitrary folder, the shared Devtools command is `pydocs .` or `pydocs "/path/to/docs"`. It builds the reader's navigation and search in memory, opens a loopback URL, and uses this viewer without copying files into the selected folder. See the [pydocs tutorial](../docs/HOWTO/pydocs.md). The repository-local server below remains available for a pre-generated docs-viewer folder.

Starting the viewer is one command. The `serve.sh` script boots a Python HTTP server rooted at the parent directory of `docs-viewer/`, which is the directory that typically contains both `docs/` and `docs-viewer/` side by side. The server has to be rooted at the parent rather than at `docs-viewer/` itself because the viewer fetches sibling files such as `../docs/shared/gate-stack.md`; the browser's same-origin policy would otherwise require CORS headers that a plain static server does not provide, so rooting one directory higher avoids the problem entirely rather than working around it.

```
bash docs-viewer/serve.sh
# Open http://localhost:8080/docs-viewer/ in your browser.
```

A custom port can be passed as the first argument (`bash docs-viewer/serve.sh 9000`). The script runs `python3 -m http.server` under the hood, so Python 3 is the only prerequisite beyond a browser.

When you open the page in devtools itself, the left sidebar lists `docs/shared/README.md`, `docs/shared/gate-stack.md`, and `docs/shared/workflow-boilerplate.md`. Clicking `gate-stack.md` renders the file with its Mermaid diagram drawn inline and its tables formatted — this is the smoke test of "does the viewer actually work against real content", and it is the shape a reader should see whenever the viewer is dropped into a consuming project.

## Search and generated updates

Run the consuming repository's `bash scripts/update-docs.sh` to refresh the tree, full-text index and pristine viewer assets; use `--check` to detect drift without writing. Operator-modified assets are preserved. Search indexes the same document paths as the tree and the first 50,000 characters of each source, before whitespace normalization. Generation uses the existing Python 3 tooling prerequisite in one bounded pass, preserving original line endings until after the prefix is taken. The generated compact JSON preserves indexed words and their order; phrase queries treat repeated spaces, tabs and pasted line breaks as a single space. Filename filtering keeps its existing behavior.

Generator regressions run with `bash test/update-docs.test.sh` in Devtools. Actual browser regressions run with `node test/docs-viewer-search-whitespace.test.cjs`, using Playwright and Chrome. Set `PLAYWRIGHT_MODULE` to an existing Playwright installation and `CHROME_BIN` if Chrome is elsewhere. The browser test serves a private temporary fixture on an available localhost port, uses the shipped library fallbacks offline, and closes only its own browser/server.

## How it finds files

The viewer reads one generated file to know what to show: `_index.json`. This file sits alongside `index.html` and lists the tree the viewer should render in the left sidebar. The structure has two top-level fields. `root` is the path prefix prepended to every file the viewer fetches, expressed relative to `docs-viewer/` itself — when the viewer lives next to `docs/`, the prefix is `".."` so that a file whose path is `docs/shared/gate-stack.md` resolves to `../docs/shared/gate-stack.md` under the server's document root. `tree` is a nested array of directory and file nodes that the viewer walks recursively to build the sidebar. Directories hold `children`; files hold a `path` that is joined with `root` at fetch time.

```json
{
  "root": "..",
  "tree": [
    {
      "type": "dir",
      "name": "docs",
      "children": [
        {
          "type": "dir",
          "name": "shared",
          "children": [
            { "type": "file", "name": "README.md", "path": "docs/shared/README.md" },
            { "type": "file", "name": "gate-stack.md", "path": "docs/shared/gate-stack.md" }
          ]
        }
      ]
    }
  ]
}
```

The committed `_index.json` in this directory is a baseline that matches devtools' own `docs/shared/` layout, so the smoke test and a local preview work without any extra step. Regenerating it by hand on every documentation change would be annoying, so a later devtools contribution — PR 3, which adds `update-docs.sh` — will regenerate the file automatically by scanning the project's `docs/` tree on every run. Until that script ships, updating `_index.json` is a manual edit when new files appear.

## Offline use

The viewer loads marked, highlight.js, and mermaid from `cdn.jsdelivr.net` by default, with specific pinned versions in `index.html`. Pinning is deliberate: a floating `@latest` tag would cause the viewer to drift as the libraries release new versions, and a drift that only bites in the browser is a drift that nobody notices until a diagram stops rendering. If the CDN is unreachable — because the machine is offline, firewalled, or behind a proxy that blocks jsdelivr — each library's load is followed by a short inline script that checks the global it was supposed to define and, if the global is missing, falls back to a sibling file in `lib/`. If both the CDN and the local fallback fail, the viewer still renders markdown as escaped plain text and shows a banner explaining the degraded mode so the reader can at least see the file content.

The `lib/` directory ships with placeholder files, not the real libraries, on purpose. Vendoring the actual minified builds into the repository would balloon every PR that touches the viewer with library noise, invite reviewer attention on code the devtools team does not own, and raise licensing-attribution questions in the diff. To use the viewer offline, download the libraries once and drop them into `lib/` locally — the placeholder files are overwritten and the fallback logic picks them up with no further change. Use the versions pinned in `index.html` (`marked@12.0.2`, `@highlightjs/cdn-assets@11.9.0`, `mermaid@10.9.0`) so the offline build matches what the online path loads:

```
curl -sSL https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js \
  -o docs-viewer/lib/marked.min.js
curl -sSL https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.9.0/highlight.min.js \
  -o docs-viewer/lib/highlight.min.js
curl -sSL https://cdn.jsdelivr.net/npm/mermaid@10.9.0/dist/mermaid.min.js \
  -o docs-viewer/lib/mermaid.min.js
```

## Testing

A single shell smoke test lives at `test/smoke.sh`. It starts `serve.sh` on a random high port, curls the viewer's index page and `_index.json`, and asserts that the HTTP response is 200 and that the HTML contains the structural markers the viewer needs — the `<nav id="tree">` element, the page title, and the script references. It tears the server down on exit via a trap. The test is proportional to what it is guarding: a zero-build static viewer does not need a JavaScript test framework, because there is no build to break, and the thing worth asserting is "the page serves and contains the parts that matter". Run it locally with `bash docs-viewer/test/smoke.sh`; it is intentionally not wired into `pre-push.sh` or `review-pr.sh`, because the viewer is a leaf template that consuming projects copy, not a runtime dependency of the devtools gate itself.

## Using it in a consuming project

The viewer lives in devtools as a template. After PR 3 of the devtools repo ships, `gyrum-setup` will copy `docs-viewer/` into every new project during bootstrap, and the project's `scripts/update-docs.sh` wrapper will regenerate that project's `_index.json` on every run so that adding a new markdown file under `docs/` is immediately visible in the sidebar. Until PR 3 lands, the viewer can be previewed against devtools' own `docs/shared/` directory — which is what the committed `_index.json` in this directory is configured for — and consuming projects can copy the directory by hand if they want to preview their own documentation in the meantime.

## Customising

The viewer is intentionally minimalist, and that shape is a design choice rather than a starting point. Projects that want a navigation search box, a dark-mode toggle, a brand header, or any other feature should fork the template rather than patching it in place. Keeping the template small and legible is what makes forking it cheap: a reader who has never seen this code before should be able to open `viewer.js` and understand the fetch-tree-render flow on first read, and that property degrades quickly if features are layered on without discipline. If a fork discovers something that every gyrum project would benefit from, the right move is a pull request against the template here so every consuming repository picks it up on its next bootstrap, not a one-off change that drifts away from the template and silently forks its behaviour.
## Bounded search publications

The supported viewer reads both existing `_search.json` arrays of `{path,text}` records and version 1 manifests. Normal `scripts/update-docs.sh` refreshes the reader and its `search-index.js` adapter; no new package or search framework is installed. Existing rendering, word/phrase matching, whitespace normalization, ranking and filename navigation stay in the existing viewer.

The internal ES module `./search-index.js` exports `loadSearchIndex(tree)`: a promise for the complete validated record array, rejecting unavailable or invalid publications. Legacy in-memory arrays from `pydocs` retain support above the tracked-file gate; their streamed response is bounded by the actual navigation inventory, the existing source prefix and worst-case JSON escaping. The 1 MiB manifest limit and 768 KiB shard limits remain separate.

Large corpora use `{version:1,documents:<total>,shards:[{path,sha256,documents}]}`. Each shard is an ordered array of the same legacy records; concatenation preserves the original entry order. Shards are at most 786432 encoded bytes, leaving 262144 bytes below the unchanged 1 MiB per-file gate. The manifest is separately bounded by that gate. Each leaf is `_search.<64lowercaseSHA256>.json` in this viewer directory, and its checksum binds its exact raw bytes. The original first 50,000 source-character cap, Unicode character counting and whitespace normalization remain unchanged.

The reader shares one lazy loading promise across queries, fetches at most two shards concurrently, bounds streamed bytes, verifies SHA-256/counts and compares every unique document path with the actual loaded documentation tree. It exposes no partial corpus. Malformed/unsupported manifests, unsafe references, missing/failed/corrupt shards, duplicate paths or inconsistent coverage produce the existing unavailable-index message; a valid search without matches remains a distinct empty result. Filename filtering and document browsing still work. Hash verification uses browser Web Crypto on the supported secure/loopback viewer origin.

Publication links complete chunks before atomically renaming the manifest. Separate bounded `_search-owned.json` producer state records exclusive creations; the reader manifest and identical foreign reuse grant no deletion ownership. Pending private candidates retain their file identity until recovery; interrupted creation, owned orphans and content drift make `--check` fail without writes. Refresh retries reconciliation from persistent ownership, removing only unchanged owned files and preserving unknown, similarly named or modified files. The old complete publication survives generation failure; a cleanup failure after the manifest switch is reported without claiming rollback. In-flight retired readers can fail closed and reload; no continuous-availability or physical power-loss claim is made. Customized viewer files remain preserved by normal refresh and need their own compatibility review.

Verify with `python3 test/docs-search-growth.test.py`, `bash test/update-docs.test.sh` and `node test/docs-viewer-search-whitespace.test.cjs`. Use an existing Playwright installation; the browser fixture adds no dependency.
