<!-- AUTO-GENERATED from gyrum-labs/devtools docs/shared/fleet-standards.md. Do not edit directly. Run scripts/update-docs.sh to refresh. -->

# Fleet standards — the version-badge contract

Every Gyrum product is observable at a glance: which version is live, built when, and from which commit. Deploys are the single most common source of "why is this broken right now?", and the answer to that question almost always starts with "what actually shipped?" The version-badge contract is the fleet-wide answer: every product, regardless of stack, exposes the same structured build-identity on the same three surfaces, so an operator can triage any Gyrum service with the same three tools (curl, the browser footer, and the fleet widget) without relearning the conventions of each project. This document is the contract every product follows. It is written to be enforceable: a PR that claims to implement the contract but skips one of the three clauses below is incomplete.

## The contract

The contract has three clauses. All three are non-negotiable for any product that ships a runtime — library-only repos and pure-CLI tools are exempt, because they have no deployment to verify. Products that ship both a backend and a UI implement all three; backend-only products implement clauses (a) alone; any product with an HTML surface implements (b) and (c) on top of that.

### a. `GET /api/version` endpoint

Every product exposes an unauthenticated HTTP handler at `/api/version` returning JSON with exactly these five keys:

```json
{
  "sha": "abc1234",
  "sha_full": "abc1234def5678901234567890abcdef12345678",
  "branch": "main",
  "built_at": "2026-04-23T18:42:00Z",
  "version_tag": "v0.33.0"
}
```

Field shapes:

- `sha` — 7-char short SHA, matches what GitHub shows in commit lists.
- `sha_full` — 40-char full SHA, suitable for building a commit URL.
- `branch` — branch name the binary/bundle was built from (usually `main` in production).
- `built_at` — ISO8601 UTC timestamp of the build, e.g. `2026-04-23T18:42:00Z`.
- `version_tag` — `git describe --tags --always` output; produces a human-friendly marker like `v0.33.0` on tagged releases and a short SHA on untagged commits.

The endpoint is public by design. The same values are already embedded in the rendered HTML (clause c) and in startup logs, so the endpoint adds no new information disclosure — and requiring authentication to answer "what version is live?" is the wrong trade-off against the value of "anyone on the team can `curl /api/version` from their laptop in an incident".

When git was unavailable at build time (shallow CI clones, distroless containers, `go build ./...` without the Makefile), each field falls back to the literal string `"unknown"`. The endpoint still returns HTTP 200 and the same JSON shape — staleness is obvious rather than silent, and downstream tooling never has to distinguish "the endpoint is missing" from "the endpoint is there but the build was stale".

### b. Footer visible in any UI

Products with a UI surface render a small, muted footer at the bottom of the application shell showing `<short-sha> · <build-time-UTC>`. The entire footer is a clickable link to `https://github.com/gyrum-labs/<repo>/commit/<sha_full>`. Use existing design tokens for colour and spacing — `--text-muted` for the foreground, `--font-mono` for the typeface, the mode-tokens border colour for the top edge. No animation, no emoji, no background fill: the footer is calm reference furniture, not a notification.

The footer always renders, even when the injected values are `"unknown"`; the link target is still valid (it will 404 on GitHub, which is the correct signal that this build is not reproducible from a commit). A `data-testid="version-footer"` attribute is required so e2e tests can select it without relying on CSS class names that might churn.

### c. `<meta name="gyrum-sha">` in HTML head

Products serving HTML must include two meta tags in the document head:

```html
<meta name="gyrum-sha" content="abc1234" />
<meta name="gyrum-branch" content="main" />
```

The tags are the machine-readable hook for monitoring and fleet-wide scans. `curl -s https://<product>/ | grep gyrum-sha` is the canonical one-liner for "what SHA is this instance serving?" — it works without parsing JSON, without application auth, and without knowing the product's specific URL conventions. Every page the product serves must carry both tags; a tag that only appears on the landing page is a bug, because the grep will fail for anyone deep-linking into the app.

## Stack-specific implementation

The mechanism is whatever the framework provides. The shape — five JSON keys, the footer, the two meta tags — is identical across stacks so that a single fleet widget (see "Why this matters") can aggregate every product's build-identity without per-product adapters.

### SvelteKit + Vite

Reference implementation: [ai-frontend PR #141](https://github.com/gyrum-labs/ai-frontend/pull/141). Four files carry the entire contract.

`vite.config.ts` captures git values at build time and feeds them through Vite's `define` block as `VITE_*` build-time constants:

```ts
import { execSync } from 'node:child_process';

function git(cmd: string, fallback = 'unknown'): string {
  try {
    return execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return fallback;
  }
}

const GIT_SHA_FULL = git('rev-parse HEAD');
const GIT_SHA_SHORT = git('rev-parse --short HEAD');
const GIT_BRANCH = git('rev-parse --abbrev-ref HEAD');
const VERSION_TAG = git('describe --tags --always');
const BUILD_TIME = new Date().toISOString();

export default defineConfig({
  plugins: [sveltekit(), svelteTesting()],
  define: {
    'import.meta.env.VITE_GIT_SHA_FULL': JSON.stringify(GIT_SHA_FULL),
    'import.meta.env.VITE_GIT_SHA_SHORT': JSON.stringify(GIT_SHA_SHORT),
    'import.meta.env.VITE_GIT_BRANCH': JSON.stringify(GIT_BRANCH),
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(BUILD_TIME),
    'import.meta.env.VITE_VERSION_TAG': JSON.stringify(VERSION_TAG)
  }
});
```

<!-- consumer may not yet have src/lib/version.ts — example path for SvelteKit consumers implementing the badge contract -->
<!-- doc-truth: ignore-next -->
`src/lib/version.ts` re-exports the constants and a `versionSummary()` helper:

```ts
export const GIT_SHA_FULL: string = import.meta.env.VITE_GIT_SHA_FULL || 'unknown';
export const GIT_SHA_SHORT: string = import.meta.env.VITE_GIT_SHA_SHORT || 'unknown';
export const GIT_BRANCH: string = import.meta.env.VITE_GIT_BRANCH || 'unknown';
export const BUILD_TIME: string = import.meta.env.VITE_BUILD_TIME || 'unknown';
export const VERSION_TAG: string = import.meta.env.VITE_VERSION_TAG || 'unknown';

export function versionSummary(): string {
  return `${GIT_SHA_SHORT} · ${formatBuildTime()}`;
}
```

`src/routes/+layout.svelte` renders the two meta tags and the footer:

```svelte
<svelte:head>
  <meta name="gyrum-sha" content={GIT_SHA_SHORT} />
  <meta name="gyrum-branch" content={GIT_BRANCH} />
</svelte:head>

<footer class="version-footer" data-testid="version-footer">
  <a
    class="version-link"
    href="https://github.com/gyrum-labs/ai-frontend/commit/{GIT_SHA_FULL}"
    target="_blank"
    rel="noopener noreferrer"
    title="View commit {GIT_SHA_FULL} on GitHub"
  >
    {versionSummary()}
  </a>
</footer>
```

`src/routes/api/version/+server.ts` serves the JSON endpoint:

```ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GIT_SHA_FULL, GIT_SHA_SHORT, GIT_BRANCH, BUILD_TIME, VERSION_TAG } from '$lib/version.js';

export const GET: RequestHandler = () => {
  return json({
    sha: GIT_SHA_SHORT,
    sha_full: GIT_SHA_FULL,
    branch: GIT_BRANCH,
    built_at: BUILD_TIME,
    version_tag: VERSION_TAG
  });
};
```

### Go

Reference implementation: [ai-research PR #592](https://github.com/gyrum-labs/ai-research/pull/592). The pattern is `-ldflags -X` injection into an `internal/version` package, plus a handler registered on the service mux.

The `Makefile` captures git values and passes them to `-ldflags`:

```makefile
GIT_SHA        ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo unknown)
GIT_SHA_FULL   ?= $(shell git rev-parse HEAD 2>/dev/null || echo unknown)
GIT_BRANCH     ?= $(shell git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)
BUILD_TIME     ?= $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
VERSION_TAG    ?= $(shell git describe --tags --always 2>/dev/null || echo unknown)

LDFLAGS := -X gyrum.ai/<module>/internal/version.GitSHA=$(GIT_SHA) \
           -X gyrum.ai/<module>/internal/version.GitSHAFull=$(GIT_SHA_FULL) \
           -X gyrum.ai/<module>/internal/version.GitBranch=$(GIT_BRANCH) \
           -X gyrum.ai/<module>/internal/version.BuildTime=$(BUILD_TIME) \
           -X gyrum.ai/<module>/internal/version.VersionTag=$(VERSION_TAG)

build-server:
	@go build -ldflags "$(LDFLAGS)" -o bin/server ./cmd/server/
```

The variables are intentionally overridable from the environment (`?=`), so CI can pass known values for reproducible builds.

<!-- consumer may not yet have internal/version/version.go — example path for Go consumers implementing the badge contract -->
<!-- doc-truth: ignore-next -->
`internal/version/version.go` exposes the build-identity:

```go
// Package version exposes the build identity of the running binary.
// Every exported variable is populated at build time via -ldflags -X;
// defaults remain "unknown" when those flags are not supplied so
// staleness is obvious rather than silent.
package version

var (
    GitSHA     = "unknown"
    GitSHAFull = "unknown"
    GitBranch  = "unknown"
    BuildTime  = "unknown"
    VersionTag = "unknown"
)
```

<!-- consumer may not yet have cmd/server/api_version.go — example path for Go consumers implementing the badge contract -->
<!-- doc-truth: ignore-next -->
`cmd/server/api_version.go` registers the handler:

```go
type apiVersionResponse struct {
    SHA        string `json:"sha"`
    SHAFull    string `json:"sha_full"`
    Branch     string `json:"branch"`
    BuiltAt    string `json:"built_at"`
    VersionTag string `json:"version_tag"`
}

func apiVersionHandler(w http.ResponseWriter, _ *http.Request) {
    resp := apiVersionResponse{
        SHA:        version.GitSHA,
        SHAFull:    version.GitSHAFull,
        Branch:     version.GitBranch,
        BuiltAt:    version.BuildTime,
        VersionTag: version.VersionTag,
    }
    w.Header().Set("Content-Type", "application/json")
    _ = json.NewEncoder(w).Encode(resp)
}
```

And `main.go` wires it into the mux alongside any existing `/api/v1/version` route (the `/api/v1/version` path, if present, is a legacy alias that precedes this contract; new products register `/api/version` only).

### Future: Next.js, Remix, other frameworks

This section is reserved. When a new stack enters the fleet, it gets its own subsection here. The implementation mechanism will differ — Next.js will use `next.config.js` env injection, Remix will use loader-exposed env, a Python backend might use setuptools metadata — but the contract above does not change. Five JSON keys, one footer, two meta tags.

## Why this matters

Three reasons, in order of how often they come up in practice.

**Deploy verification.** Every release playbook ends with "did the deploy actually land what I expected?" With `/api/version` exposing the SHA in a known shape, the check is a single curl plus a string compare; without it, the answer requires reading deploy logs, checking container digests, or asking someone in Slack. The forthcoming `verify_deployment` playbook step (ADR-070) consumes exactly this endpoint — it fetches `/api/version`, diffs the `sha` field against the expected release SHA, and fails the playbook if they drift. Every product that implements the contract gets release verification for free.

**Triage.** When something breaks, step one is always "what version is running?" The footer answers that in the browser, the meta tags answer it for anyone scripting a fleet check, and the JSON endpoint answers it for dashboards. None of these require log access, deploy-system access, or knowledge of the product's specific rollout tooling — all of which are exactly the things a tired on-call engineer at 2am does not want to be spelunking through.

**Fleet visibility.** ai-frontend ships a `<FleetVersion>` widget (from PR #141) that fans out to every product's `/api/version`, aggregates the responses, and renders a single panel showing which SHA is live on each service, how fresh each build is, and whether any service is running a non-`main` branch. That widget only works because every product implements the same endpoint with the same shape — the contract is the coordination mechanism, and the widget is the payoff. Adding a new product to the widget is one config-line change once the product's `/api/version` exists.

## Verification checklist

Copy this into the PR description when implementing the contract in a new product:

- [ ] `curl https://<product>/api/version` returns 200 with the five canonical fields: `sha`, `sha_full`, `branch`, `built_at`, `version_tag`
- [ ] All five fields are strings; none are empty
- [ ] HTML response includes `<meta name="gyrum-sha">` and `<meta name="gyrum-branch">` on every page, not just the landing page
- [ ] UI footer shows `<short-sha> · <build-time-UTC>` using `--text-muted` and `--font-mono` tokens
- [ ] Footer is clickable and points at `https://github.com/gyrum-labs/<repo>/commit/<sha_full>`
- [ ] Footer element carries `data-testid="version-footer"` for e2e selection
- [ ] Build-time injection works in production builds (SHA is not `"unknown"`)
- [ ] Dev-mode graceful fallback: SHA is `"unknown"` in local dev and does not crash the UI or 500 the endpoint
- [ ] An e2e test asserts the meta tag shape (regex accepting `[a-f0-9]{7}` or `unknown`) and the JSON endpoint shape

## How new products get this

New products bootstrapped via `gyrum-create-repo` inherit the version-badge pattern automatically — the scaffolding drops the Vite/SvelteKit snippets or the Go Makefile/internal-version-package snippets into the new repo, wired to the correct module path. Existing products pick up the pattern by following the stack-specific section above. Two in-flight PRs carry the manual install for products that predate the scaffolding update: distill-gyrum-ai and buzzy; their PR descriptions both reference this document as the contract they are implementing.

## Related

- **ADR-053 — observability.** The version-badge contract is observability of the deploy itself (what shipped, from where, when). ADR-053 covers observability of the running system's behaviour (metrics, traces, logs). They are complementary: ADR-053 tells you what the running system is doing; the version-badge tells you which version is doing it.
- **ADR-070 — playbook UI contract.** The `verify_deployment` step of release-flow playbooks consumes `/api/version`. A product without the contract cannot be driven by a release playbook that includes deploy verification.
- **ai-frontend PR #141** — reference SvelteKit/Vite implementation.
- **ai-research PR #592** — reference Go/ldflags implementation.
