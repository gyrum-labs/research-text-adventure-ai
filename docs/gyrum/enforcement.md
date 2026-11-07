<!-- gyrum-enforcement-detail-v11 — managed by gyrum-setup; companion to the Enforcement gates section in CLAUDE.md. Do not hand-edit; edit the devtools template and re-sync. -->
# Enforcement gates — full mechanics, worked examples & rule rationale

Companion to the **Enforcement gates** section in `CLAUDE.md`. Read the relevant part when a trigger fires (inspecting a 412, scaffolding a smoke spec, hitting a canon-tier / manifest-flip / single-prop-render refusal, proposing an architecture fix, or deploying a just-merged change). The imperatives are in `CLAUDE.md`; the *Why* and *mechanics* are here.

<!-- doc-truth: ignore-next -->
Enforcement gates shipped under epic [warp #273](https://warp.gyrum.ai/items/273), extended on 2026-05-12 with canon-tier ([warp #2399](https://warp.gyrum.ai/items/2399)) and manifest-flip-on-delete ([warp #2452](https://warp.gyrum.ai/items/2452)). They are LOAD-BEARING — each makes one failure mode structurally impossible (UI nobody clicked, pipelines nobody ran, deps nobody checked, `.svelte` duplicating canon, manifest entries pointing at deleted files).

## depends_on + claim 412

Warp items declare `depends_on: [<uuid>, ...]` and (for `kind: pipeline` items) `health_check_url`. `POST /api/v1/items/{id}/claim` walks deps and refuses with `412 Precondition Failed` if any is not `done` (tickets) or not health-passing within the freshness window (pipelines). The error body names the failing upstream.

Inspect a 412 verbatim:

    curl -sS -X POST -H "Authorization: Bearer $WARP_TOKEN" \
      "$WARP_URL/api/v1/items/<id>/claim" | jq .

## First-use smoke gate

Every PR touching `src/routes/**` or `src/lib/components/**` MUST include a Playwright smoke at `e2e/<feature>.spec.ts`. Scaffold with `gyrum-feature-smoke-init <route>` — the template requires four assertions in order: `nav-from-root`, `primary-action`, `outcome`, `failure-path`. Use `test.fail` for known bugs; the contract self-promotes when fixed (no `it.skip` rot).

Per-PR scoping via `// @covers: <glob>` (warp#2258): specs declare their scope, the matcher unions declared globs with the default slug matcher — spec fires if either matches. Audited override: `gyrum-review-pr --skip-smoke "<reason>"` (logged to `~/.gyrum/findings/findings.jsonl`).

## Pipeline-items (`kind: pipeline`)

`kind: pipeline` items represent shipping product surfaces — their lifecycle is "is the surface healthy right now?", not "is the work done?". They carry `health_check_url`, are fed by playbook runs POSTing `{passed, evidence, ts}` to `/api/v1/items/{id}/health`, stay `ready` (a standing claim that the surface still works), and are the canonical `depends_on` target for downstream tickets.

## `gyrum-warp deps` CLI — preflight before claim

`gyrum-warp deps <id-or-#NNN>` prints the `depends_on` tree with traffic-light status (●/○/✕) so you predict whether `/claim` will 412 BEFORE calling it. Red nodes end with `(blocks claim)`. `--json` for machine-readable; `--depth N` caps recursion (default 5). Exit `0` regardless of red/green — the tree IS the answer.

## Canon-tier gate (enforce)

Every PR touching `.svelte` under `src/lib/components/`, canon-source paths (`packages/components/src/(atoms|molecules|organisms|templates)/`), or `+page.svelte` is gated against the canon-tier rule. Promoted advisory→enforce on 2026-05-12.

<!-- doc-truth: ignore-next -->
Canonical rule (carry verbatim into every output surface): _Components live in canon. Before adding a `.svelte` to `ai-frontend/src/lib/components/`, fetch `canon.gyrum.ai/registry.json` and name-match. If a primitive exists, consume `@gyrum-labs/svelte`'s adapter — do not fork. If close-but-different, extend the canon primitive in `gyrum-ui/packages/components/` + add to `packages/svelte/`. If genuinely novel, register it in the same PR. Tier composition: atom imports nothing; molecule imports atoms; organism imports molecules+atoms; template imports organisms+molecules+atoms; page imports exactly one template. Cross-tier imports fail this gate._

<!-- doc-truth: ignore-next -->
The gate refuses on three pattern classes: **duplicate-of-canon** (basename matches a registry entry; consume `Gy<Name>` from `@gyrum-labs/svelte`), **cross-tier import** (file at tier-N imports tier-M where M ≥ N; refactor or move), **unregistered tier-2+ candidate** (`.svelte` under `src/lib/components/`, not in registry, >100 LOC, composing other components — canonicalise via `gyrum-ui`'s `canon-manifest.yaml`).

Audited override: `gyrum-review-pr --skip-canon-tier "<reason ≥ 10 chars>"` (logged + emits friction finding). Use ONLY when the class genuinely doesn't fit; file a canon-add ticket in the same PR body. Registry-unreachable degrades to soft advisory.

## manifest-flip-on-delete

<!-- doc-truth: ignore-next -->
Sister-gate to canon-tier. Any PR deleting a `.svelte` declared in the repo-root `canon-manifest.yaml`'s `lifts[]` MUST flip that entry's `lift_state` to `retired` in the same diff — otherwise the manifest silently diverges from source. The gate walks `--diff-filter=D` paths, converts deleted basenames PascalCase → kebab (`EmptyState` → `empty-state`), and queries `canon-manifest.yaml lifts[].name`; a match whose `lift_state` is anything other than `retired` refuses the merge.

<!-- doc-truth: ignore-next -->
Audited override: `gyrum-review-pr --skip-manifest-flip "<reason ≥ 10 chars>"`. Use ONLY for genuine no-canon-lift cases (e.g. coincidental kebab-stem). Repos without `canon-manifest.yaml` degrade to soft advisory.

## single-prop-render gate (advisory v1)

Member of the **canon-extension-discipline gate family** — structural gates that enforce documentary canon rules at PR-time so reviewer judgement is the second line of defence, not the first. Family members:

- `canon-tier-gate` (warp#2399) — components live in canon; tier composition rules; enforced
- `canon-extension-discipline` (validate-canon-adoption.sh) — refuse bespoke CSS variants of canon classes; enforced
- `canon-page-shape-gate` (warp#3707) — `+page.svelte` roots in `<GyPage>`; advisory v1
- `canon-url-resolves-gate` (warp#3722) — canon URLs in PR diff resolve 200; advisory v1
- **`single-prop-render-gate` (warp#3831, this entry) — a canon component renders each prop exactly once per breakpoint; advisory v1**

The gate walks every `.svelte` file in PR diff, parses the template body, and flags when the same `{expr}` Mustache interpolation appears as leaf-text in 2+ distinct DOM positions. Catches the original ProjectCard.svelte tagline duplicate-render bug structurally; documentary rule at `canon.gyrum.ai/guidelines/single-prop-render` (V100, canon#101). Attribute bindings (`class={status}`), control-flow expressions (`{#if cond}`), and renders inside `{#each}` bodies are excluded — only leaf-text duplicates count.

Audited override: `gyrum-review-pr --skip-single-prop-render "<reason ≥ 30 chars>"`. Use ONLY for legitimate semantic-mirror cases (a11y duplicate for screen-reader, responsive show/hide pair gated by media-query classes). v1 ships ADVISORY (visible row, non-blocking); enforce flip rides a follow-up ticket once false-positive shape settles. Flip locally via `SINGLE_PROP_RENDER_ENFORCE=1`.

## Verify API + system behaviour BEFORE proposing architectural fixes (warp#2992)

**Rule:** Any time you propose a fix that depends on how an API, service, queue, supervisor, or external system actually behaves — do a live probe FIRST and paste the response into your analysis. Don't infer behaviour from code reading alone.

**Why:** Operator (jon, 2026-05-16) flagged that an agent proposed "supervisors race for tickets because gyrum-warp ready returns the same list to all" without checking. Live probe of `/api/v1/items?status=ready` showed the list is already filtered server-side (`claimed_by: null, lease_expires_at: null`). The proposed cross-supervisor pre-poll-filtering fix was unnecessary; the real bug was a single-supervisor re-claim loop (warp#2969), a completely different shape. Time cost of probe < 30s; time cost of operator catching an unverified fix > 5min + token budget burned on the wrong implementation. The probe is always cheaper.

**How to apply:**
- API behaviour claim → `curl -sS … | jq`. Paste actual response in analysis.
- Service behaviour claim → check journal/logs/state file. Paste actual content.
- Supervisor/agent behaviour claim → grep the script + check the function definition. Paste actual lines.
- If you can't probe (no access / no test fixture available) — flag it: "untested assumption: <X>; need verification before proceeding".
- Sister behavioural-hygiene catches: cluster-detection (warp#2980), the actual re-claim-loop fix (warp#2969).

## Verify your merge is in the deploy tag BEFORE deploying

**Rule:** When deploying a version to make a just-merged change "live", do NOT assume the latest tag contains your merge. Confirm first: `git merge-base --is-ancestor <merge-sha> <deploy-tag> && echo "tag HAS my merge" || echo "MISSING — pick a later tag"`.

**Why:** Operator (jon, 2026-05-25, warp#4307) — a /runners feature was merged then deployed at the newest tag, but that tag had been cut from an EARLIER merge and PRE-DATED the feature; it shipped in the next tag (still building at deploy time). Caught only because the post-deploy live probe came back false. The release pipeline tags incrementally and asynchronously, so "latest tag" ≠ "tag with my change" — the assumption silently deploys the wrong binary.

**How to apply:**
- Find the tag that contains YOUR SHA, not the newest: `for t in $(git tag --sort=-creatordate | head -8); do git merge-base --is-ancestor <merge-sha> "$t" && echo "$t HAS it"; done`. Deploy that tag.
- After deploying, run a LIVE probe asserting the new behaviour is present (an API call, a rendered field) — image-tag-changed ≠ feature-live.
- Each distinct prod version deploy needs its own explicit operator authorization; a general "deploy it" does not authorize a different version number than the one named.

## obs-logs gate — correct + covered structured logging (warp#9358, Phase A advisory)

**Rule:** A deployable backend — a repo whose gyrum-catalog `manifests/<repo>.deploy.yaml` declares a `role:web|internal` service — must, at HEAD, log CORRECTLY and with COVERAGE. **Correctness:** (a) use the canonical gyrum-go `pkg/observ` structured logger (the slog-JSON logger whose `LoggerFor` wires the `ts`/`level`/`msg`/`service` schema AND value-redaction) rather than bare `fmt.Println`/`log.Printf`/`println` for application logging; (b) mount the request logging middleware (`observ.Access()`) so handler logs are request-scoped and carry `trace_id` — the correlation join key a trace uses to link to its request's logs; (c) keep value-redaction ON (guaranteed by the canonical `LoggerFor`, so a hand-rolled handler without the redactor is the risk). **Coverage:** (d) do not silently swallow errors — every `if err != nil {}` block returns or logs; (e) level discipline — error-class events surface at the `error` level, not buried at info; (f) the canonical log schema (`ts`/`level`/`msg`/`service`/`trace_id`), structurally guaranteed once (a)+(b) hold.

**Why:** The fleet runs three observability pillars — metrics, logs, traces. The metrics (obs-metrics, warp#8947) and traces (obs-tracing, warp#9210) pillars already have a PR-time gate; logging had none. So the most basic correctness failures shipped invisibly: bare prints (no level, no `trace_id`, unparseable by Loki), errors swallowed on a path that neither returns nor logs (the failure vanishes), or secrets leaked into log values because the redact handler was never wired. The parent EPIC's metric↔trace↔log correlation loop depends on every log carrying a `trace_id` — a log without it cannot be linked from a trace. obs-logs closes that asymmetry, completing the three-pillar PR-time gate family (parent warp#3340 / ADR-218).

**Phase A is ADVISORY** — every `✗` renders as a `⚠` and `check_obs_logs_gate` ALWAYS exits 0; no PR is blocked. The hardening (`✗` that blocks) lands behind `OBS_LOGS_ENFORCE=1` in a Phase-B follow-on, exactly like the metrics + tracing Phase-B seams. A repo with no manifest, or no web/internal service (worker/static repos), renders a single not-logs-capable advisory and is never flagged.

**How to apply:**
- Log via `observ.LoggerFor`/`observ.Logger`/`observ.FromContext` (gyrum-go `pkg/observ`); mount `observ.Access()` at the HTTP boundary; drop bare `fmt.Println`/`log.Printf`/`println` for app logging.
- Ensure every error path returns OR logs at the `error` level; never `_ = err` and fall through.
- Override (audited, narrow): `gyrum-review-pr --skip-obs-logs "<reason ≥ 20 chars>"` — the legitimate case is narrative ("logger adoption + middleware land in companion PR #NNNN"); the skip logs to `~/.gyrum/admin-overrides.log` and removes only the warn-row, so the gap still ships. Fix the logging, don't skip the row.

## Rubric-gated parent — don't trap a mergeable child under a pending epic (warp#9344)

**Rule:** Do NOT parent a child that has an open PR / is `in_progress` under a `kind:epic` that is still `rubric-review:pending`. That combination SILENTLY gates the child's merge: `POST /api/v1/items/{child}/claim` returns `409 rubric_review_required` while the parent epic's rubric is unapproved, so the `gyrum-review-pr` → `gyrum-complete-pr` reclaim-and-merge ABORTS and an already-green, approved PR sits unmergeable. The ONLY unblock is `gyrum-warp approve-rubric <epic>` — a senior/operator action: agent-scoped tokens 403 on approve, and the auto-mode classifier blocks an agent self-approving the epic it filed.

**Why:** On 2026-06-28 three finished, approved migration PRs (warp#9312 / #9316 / #9317) were parented under EPIC warp#9320 whose rubric was still pending; all three stalled for hours, and the blocked-merge retries spawned a review-process storm. Nothing warned at parent-assignment time, and the only symptom was a raw `409 rubric_review_required` at complete-pr. Sibling of the warp#6293 create-time epic-rubric notice (which fires when an EPIC is *created*); this closes the asymmetry one tier later — when a child is *parented under* a pending epic.

**Mechanics:** `gyrum-labs/devtools/lib/rubric-parent-guard.sh` exposes `rubric_parent_guard <child> <parent>`. It fires a LOUD, NON-FATAL advisory to stderr when the parent is `kind:epic` + carries the `rubric-review:pending` tag AND the child is `in_progress` or has a non-empty `pr_url` — naming the gating EPIC and the exact operator-only `gyrum-warp approve-rubric <epic>` unblock. It NEVER blocks (decision pin "warn, don't refuse" — parenting-for-tracking is legitimate; the operator just needs to KNOW the merge is now gated). `gyrum-complete-pr` runs this re-check before the heartbeat reclaim + merge, so the cause is diagnosed at the source instead of read off a raw 409. A first-class re-parent verb (which would call the same guard at reparent time) is tracked at warp#8743; the guard is ready for that call-site.

**How to apply:**
- Parent a child under an epic for tracking only once that epic's rubric is `approved` — or accept that the child's merge stays gated until an operator runs `gyrum-warp approve-rubric <epic>`.
- Hit the advisory at complete-pr? The fix is the operator command above, NOT a `--skip`/`--admin` bypass — the gate is doing its job (senior sign-off before the epic's children proceed).
- Document→enforce lineage: warp#3036 / warp#3100 (rule lifted into the CLAUDE.md cascade); warp#6293 (the create-time sibling notice).
