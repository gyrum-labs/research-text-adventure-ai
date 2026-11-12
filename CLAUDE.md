# Development Rules

## Workflow
1. Always create a feature branch and draft PR before starting work:
   `git start-work <feature-name>`
2. Commit and push regularly
3. When done: `git complete-pr` (runs checks, AI review, merge)

## Code Quality
- TDD: write tests first, always — structurally checked by the tdd-order gate (warp#1258): new test files must commit before the implementation or fail against the merge-base; `characterises_`-prefixed files pin current behaviour and are exempt. Phase-A warn-only; bypass with `--skip-tdd-order "<reason>"` (audited)
- Every exported symbol has a doc comment
- Functions do one thing — aim for ~20 lines, extract a helper if over 40
- Prefer fewer than 3 parameters per function
- Max 900 lines per file
- Max 800 lines changed per PR (and 20 files)

## Structural Checks (automatic on push)
- go build / npm run build
- go test / npm test
- Coverage ≥ 80%
- staticcheck / eslint
- gosec (security)
- Cyclomatic complexity ≤ 15 (new functions)
- File length ≤ 900 lines (new files only)
- Directory ≤ 30 source files

## Documentation
Shared explanatory snippets (the gate stack, the developer loop, anything
identical across every gyrum project) live under `docs/shared/` and are
generated from gyrum-labs/devtools. Refresh them with:

    scripts/update-docs.sh           # copy devtools/docs/shared/* into docs/shared/
                                     # and regenerate docs-viewer/_index.json
    scripts/update-docs.sh --check   # dry run — exit 1 if a generated file
                                     # has been hand-edited (suitable for CI)

Files under `docs/shared/` carry an AUTO-GENERATED header and must not be
edited directly — edit the source in ~/.gyrum/devtools/docs/shared/ instead.
The local docs browser lives in `docs-viewer/` — open with
`bash docs-viewer/serve.sh` then visit http://localhost:8080/docs-viewer/.

## Review
3-persona formal review + 1 advisory reviewer on merge to main:
- gyrum-priya: Security + YAGNI
- gyrum-marcus: Architecture + hex arch
- gyrum-lin: TDD + Go idioms
- gyrum-dana: Documentation clarity (advisory — posts PR comments, gates
  local `gyrum-review-pr` but does not count toward branch protection)
At least 2-of-3 formal approvals (Priya/Marcus/Lin) and zero formal rejections are required; Dana is advisory.

<!-- gyrum-template-governance-v3:START — managed by gyrum-setup; do not edit inside markers -->
## Template governance — DO NOT hand-edit gyrum-* markered blocks

Sections enclosed by `<!-- gyrum-*-vN:START --> ... <!-- gyrum-*-vN:END -->` markers are managed by `gyrum-setup`. Canonical source: `~/.gyrum/devtools/templates/CLAUDE-*.md`.

**To change a templated rule:** edit the source in `gyrum-labs/devtools/templates/`, bump `vN` → `vN+1` in both markers, land via the standard PR flow, then `gyrum-setup --sync-claudemd` in each consumer (or wait for the next routine pass).

**Hand-edits inside markers are CLOBBERED on next sync** — the awk-based sync drops everything between markers and inserts the current template body. **Hand-edits OUTSIDE markers are preserved** — that's the space for project-local rules.

<!-- doc-truth: ignore-next — the backticked CLAUDE.md here is generic prose ("whatever repo you are in"), not a path ref; repos with many same-named files (dark-factory scaffolds) would otherwise trip the basename-ambiguity check -->
**Why:** templated sections enforce fleet-wide rules; hand-editing in one repo creates drift the next agent reads as canonical. To propose a new fleet-wide rule, open a PR against `gyrum-labs/devtools/templates/`, not a project's `CLAUDE.md`.
<!-- gyrum-template-governance-v3:END -->

<!-- gyrum-devtools-section-v29:START detail=docs/gyrum/devtools.md@v28 — managed by gyrum-setup; do not edit inside markers -->
## Devtools

Gyrum devtools install at `~/.gyrum/devtools/`, on PATH via `~/.local/bin/gyrum-*`. Prefer these over hand-rolling — they own the workflow contract (hooks, review gates, finding journal, worktree isolation). The "simpler-looking" alternative bypasses every gate.

**Full command reference (all flags + exit codes), the always-on background-mechanism table (cadence/tunables), and the *Why* + mechanics behind every rule below live in [`docs/gyrum/devtools.md`](docs/gyrum/devtools.md).** Open it before: looking up a `gyrum-*` command's full flags or exit-codes, a background mechanism's cadence (`wip-checkpoint` / `heartbeat` / `agent-guard` / `deployed-sync`), or the rationale + recovery path behind a STRICT rule you're about to bypass.

### Core commands

| Command | When to use |
|---|---|
| `gyrum-start-work <name> --ticket warp#NNN` | Start a feature: isolates into a fresh sibling clone, creates branch + draft PR. Final stdout line `WORKTREE: <abs-path>` — non-interactive callers `cd` there before the next command. |
| `gyrum-review-pr` / `gyrum-complete-pr` | Local 3-persona review, then pre-PR checks + merge. Review IS the review; no external step. |
| `gyrum-pre-flight` | Forced attestation (3-digit pin) before `gyrum-review-pr`; use after >15 min autonomous work. |
| `gyrum-recover` | After non-zero `gyrum-review-pr`: prints the canonical re-pass message per failed gate. |
| `gyrum-pr-edit <PR#> --body-file <f>` (also `--title`, `--add-label`) | Edit a PR body / title / label. Use INSTEAD of raw `gh pr edit` — the raw command silently DROPS body edits (exits 0 while discarding the write; warp#7874) AND errors on a deprecated GitHub field before applying the edit on gyrum repos; this wrapper routes around both (REST-first body path). After any body edit, read it back with `gh pr view <PR#> --json body` — the silent-drop means only a read-back proves the edit landed (warp#12220). |
| `gyrum-brief --ticket warp#NNNN` | Substrate-assembled dispatch brief (byte-identical for identical input); replaces hand-rolling. |
| `gyrum-verify-shipped warp#NNN` / `gyrum-dispatch-check warp#NNN` | Assert a dep's cited PR is MERGED; freshness-check before `Agent(...)` dispatch. |
| `gyrum-warp search "<kw>"` / `gyrum-warp preview <id>` | Find + inspect related tickets before filing or claiming. |
| `gyrum-followup-proposals --dry-run` | End-of-work follow-up tickets (duplicate-search + `--pattern`, or `--route architecture-vote`). |
| `gyrum-fleet <subcommand>` / `gyrum-warp <id>` / `gyrum-workspace <name>` / `gyrum-implement` / `gyrum-help` | Fleet supervisor CLI; one-shot ticket-to-merge; spike clone; scaffold a step; full list. |
| `gyrum-devtools diagnose "<error-signature-or-text>"` | The "RAG the system queries itself" verb: search the auto-diagnosis library → guidelines → runbooks → ADRs and print the best diagnosis + proposed_fix. Run before improvising on an error. (warp#10439) |
| `gyrum-devtools validate-auto-diagnosis <entry.yaml>...` \| `--dir <path>` \| `--all` | ADR-168 §5 wire-edge gate for auto-diagnosis library entries + sister fixtures. Runs at PR-author / detector startup / hot-reload. (warp#10439) |

### Workflow rules — STRICT (for AI agents, Claude Code, and humans)

- **NEVER** merge via `gh pr merge` (incl. `--squash`). ALWAYS `gyrum-review-pr` → `gyrum-complete-pr` from the feature branch (convention is `--merge`; the wrappers verify review, run structural checks, tag the version).
- **NEVER** POST to `/pulls/:n/reviews` with a persona PAT + your own prose — that bypasses the 3-persona AI review.
- **NEVER** use `--no-verify` (push) or `--admin` (merge) unless the operator authorised it in writing for that PR. warp#3100 Path-A atomic canon PRs auto-skip the diff-size gate (warp#3702) — do NOT reach for `--admin` on them.
- **NEVER** override `--ignore-failing-checks` (warp#3107) to silence a real broken test — `gyrum-warp add` an unblocker, `gyrum-warp block <id> --reason "waiting on warp#NNN"`, return when it ships. A CI-infra failure (dead runner, sandbox EPERM, infra kill) is a wait, not a blocker: keep the claim, leave a ticket comment (`POST /api/v1/items/<id>/comments`), and re-run the checks.
- **NEVER** link a blocker with `--blocked-by` (`gyrum-warp block` or `gyrum-warp update`) while the ticket's PR holds a persona approval — `blocked_by` is signed review evidence, so the write voids every approval and unblock never clears it; name the blocker in `--reason` instead. `gyrum-warp block` refuses the link (audited override `--skip-signed-approval-guard "<reason ≥ 20 chars>"`; warp#20986).
- **NEVER** trust an `AGENT-TERMINAL` / `MERGED` claim from a sub-agent that exited non-clean (watchdog-kill / timeout / rate-limit / crash) (warp#3144) — `gh pr view <N> --json mergedAt,state,mergeStateStatus,statusCheckRollup` first.
- **NEVER** bypass a pre-push hook failure — fix the root cause; the failure is the gate doing its job.
- **ALWAYS** run `gyrum-review-pr` before opening a PR (it gates build/test/coverage/complexity/file-length/gosec/staticcheck the persona review does not), then `gyrum-complete-pr` immediately on its `READY-TO-MERGE` directive (warp#1342); run `gyrum-pre-flight` first after >15 min autonomous work (warp#1387), and `gyrum-recover` on any non-zero exit.
- **ALWAYS** distinguish `AGENT-TERMINAL — merged` (mergedAt non-null; exit, don't poll) from `ENROLLED-NOT-YET-MERGED` (verify via `gh pr view`, then wait/unblock/escalate) on `gyrum-complete-pr`'s final line (warp#3362).
<!-- doc-truth: ignore-next -->
- **ALWAYS** start work via `gyrum-start-work <name> --ticket warp#NNN` (or `--no-ticket` for trivial); the pre-push hook refuses `feat|fix|chore|docs|refactor/*` lacking `.gyrum/branch-meta.json` (warp#1311). Parse the final `WORKTREE:`/`WORKTREE-IN-PLACE:` line and `cd` there before the next Bash call (warp#2593) — non-interactive subshells don't auto-cd. The merge side has the same contract: `gyrum-complete-pr` run from a non-interactive shell REFUSES (printing ~N candidate worktrees) unless invoked from inside the worktree with `GYRUM_WORKDIR=<worktree-abs-path>` exported (warp#9796) — a DIFFERENT variable from `GYRUM_WORKDIR_ROOT`, which only governs cleanup-root resolution (warp#12220).
- **ALWAYS** write commit-message bodies one paragraph per line (the `commit-msg` hook refuses hard-wrap; bypass `git commit --no-verify`).
- **ALWAYS** answer the PR body's `## Friction` section when a previous `gyrum-review-pr` pass recorded findings (warp#10961): `none` or one line per previous-pass finding (fixed / worked around + why), inside the `gyrum:friction` markers — placeholders are refused, clean PRs (no prior findings) are ignored. If you changed your PR to please a check you believe is WRONG, say so — that is the friction signal the daily aggregate clusters; in the end-of-ticket retro, prefix the friction answer `workaround: <gate>` (files immediately, deduped) or `latent: <subject>` (rides the daily aggregate). Override `--skip-friction "<reason ≥ 10 chars>"`.
<!-- doc-truth: ignore-next -->
- **Raise friction only for gate/tooling cost that implies a structural fix, and make every line carry three fields: mechanism, cost (cycles / time blocked), and the fix it implies** (warp#16930). Friction IS: a mechanism defeating its own purpose (tooling main-merged the branch after collecting approvals, invalidating its own exact-head review — cost N re-review cycles); a gate false-positiving on a legitimate shape (freeze scope-grep refusing a ticket that only MENTIONS a frozen path in its diagnosis); gate A making gate B unsatisfiable (senior_only epic claims vs pr-shape's claimed-branch rule — only exit an audited skip). Friction is NOT: a clear refusal you complied with in one attempt — that is the gate working, comply and move on; style or threshold opinions (400-char caps, message wording — ordinary idea ticket); provider or infra latency and outages (model timeouts, hung provider calls — that is incident/status reporting owned elsewhere, and it drowns the gate signal the aggregate exists to cluster).
- **ALWAYS** land a regression test with every `type: bug` fix — fail-before / pass-after, named or `// regression: warp#NNN`, on the ticket's `surface:` layer (warp#1008). Override `--skip-regression-fixture "<reason>"`.
<!-- doc-truth: ignore-next -->
- **ALWAYS** declare `tier` on every public-IP'd server in `infrastructure/server-ids.json` (and on ansible/`*.tf` diffs); `bff`/`bastion` need `tier_justification`, `internal` needs `exposed_ports` + `trusted_inbound` (ADR-175 / warp#1978). Carry a `## Trust-boundary audit` section on any credential-co-tenancy / privilege-escalation diff (docker/sudo/wheel, cred paths, `privileged`/docker.sock/`cap_add`) (warp#6357). Override `--skip-trust-boundary "<reason ≥ 10 chars>"`.
- **ALWAYS** ship docs alongside any new `scripts/<name>.sh` / `ansible/roles/<name>/` / ticket-filing workflow — the `doc-pair` gate names the required companion (warp#1981). Override `--skip-doc-pair "<reason ≥ 10 chars>"`.
- **ALWAYS** assemble dispatch briefs via `gyrum-brief --ticket warp#NNNN` (warp#1527); `gyrum-verify-shipped warp#NNN` before treating a dep as satisfied (warp#2915); `gyrum-dispatch-check warp#NNN` before `Agent(...)` dispatch (warp#3710) — exit 0 is clean dispatch, exit 5 is an explicitly requested audited freshness bypass, and every other exit refuses dispatch. Exit 7 is Warp's canonical non-actionable decision and `--skip-already-shipped` can never bypass it; use that bypass only for a genuine ship-again freshness case.
- **ALWAYS** ask at wrap-up whether follow-up tickets should be raised; use `gyrum-followup-proposals --dry-run` before filing (warp#2968).
- **Persona recusal** (warp#1392): commits from a persona bot (`gyrum-priya|marcus|lin|dana|sasha|quinn`) recuse that persona (quorum → 2-of-2); two-or-more default recusals fail closed; each appends a `findings.jsonl` line.
- **Merge-gate decision** (warp#14846): approval quorum and rejection veto are independent. `gyrum-complete-pr` requires at least 2-of-3 explicit current-head `APPROVED` reviews (2-of-2 after recusal) **and zero** current-head `CHANGES_REQUESTED`; one rejection blocks normal automation regardless of the approval count. Empty, comment, malformed, missing, and stale-head evidence never counts as approval. Fix and re-review; only an explicit audited operator override may bypass the veto.
- **Sister-agent collision detection** (warp#1511 / warp#1517): `gyrum-start-work` refuses >2-file (or >50%/≥3-file) open-PR overlap unless `--allow-collision "<reason ≥ 10 chars>"`; sibling to the warp#1108 issue-overlap check.
<!-- doc-truth: ignore-next -->
- **Force-push policy** (warp#1340): `policy/git-force-policy.md` — `--force-with-lease` on agent `feat|fix|chore/*` worktrees only; plain `--force` refused anywhere; force-push to `main`/`master` refused with no exception. Sandbox-blocked recovery: non-force `git merge origin/main` fast-forward, NOT `--no-verify` / `--admin`.
<!-- gyrum-devtools-section-v29:END -->

<!-- gyrum-warp-section-v16:START detail=docs/gyrum/warp.md@v16 — managed by gyrum-setup; do not edit inside markers -->
## Warp — agent work coordination

Warp is the fleet's agent work inbox — a Postgres-backed HTTP queue. Each session checks Warp first for items reserved for its label, then unreserved items, claims atomically (`SELECT … FOR UPDATE SKIP LOCKED`), heartbeats every 5 min, and marks `complete` / `release` / `block` on exit. Env: `WARP_URL` / `WARP_TOKEN` / `WARP_LABEL` from `~/.config/gyrum/control-plane.env`.

**Full protocol — REST cheatsheet, env setup, and the rationale + mechanics behind every rule below — lives in [`docs/gyrum/warp.md`](docs/gyrum/warp.md).** Open it before: filing your 3rd related ticket in an hour (EPIC batching), routing a ticket to the right repo (substrate routing), patching a supervisor kill threshold (`self-fix:` tag), reclaiming a live claim, or swarming an epic.

### Shell wrappers

| Command | When to use |
|---|---|
| `gyrum-warp ready` | List Ready items you can claim. `--all` / `--repo <name>` / `--stale` (high+urgent >24h). |
| `gyrum-warp preflight <uuid>` | **Recommended entrypoint.** Resolves UUID, prints title+desc, refuses non-ready, claims atomically. |
| `gyrum-warp claim <id>` | Atomic claim. 409 = another agent won; pick another. |
| `gyrum-warp complete <id> --pr <url>` | Terminal success; always include the merged PR URL. |
| `gyrum-warp release <id>` | Voluntary unclaim — cooperative handoff, not a failure. |
| `gyrum-warp block <id> --reason "…"` | Flag an external blocker; item returns to Ready as `blocked`. |
| `gyrum-warp unblock <id> [--reason "…"]` | Symmetric inverse of `block`. |
| `gyrum-warp add` / `--file item.md` | Add new work discovered mid-session. |
| `gyrum-warp update <id> [flags]` | Self-edit a ticket you created (own items, categorical fields). `--type <type>` fixes a mis-typed ticket (bug/feature/chore/docs/refactor/epic/infra_request); server owns the enum (warp#7884). |
| `gyrum-warp search "<kw>"` / `gyrum-warp preview <id>` | Find + inspect related tickets before filing/claiming. |

### Workflow rules — STRICT (for AI agents, Claude Code, and humans)

- **ALWAYS** check Warp at session start; reserved items belong to you — finish them first.
- **ALWAYS** heartbeat every ≤5 min while claimed; an expired lease returns the item to Ready.
- **ALWAYS** inspect `cancel_requested` on heartbeats; `true` = finish the atomic unit, push WIP, `gyrum-warp release` (do NOT `complete` partial work).
- **ALWAYS** create a Warp item for follow-up work discovered mid-session.
- **ALWAYS** search (`gyrum-warp search`/`gyrum-warp preview`) + cross-link (`depends_on`/`blocked_by`/`parent`) before filing or claiming structural work.
- **ALWAYS**: file a parent EPIC first when ≥3 related tickets are coming (warp#2980); reserve a ticket you'll work yourself at file time (warp#4307); swarm an epic by setting it `in_progress` (warp#3051); tag supervisor-kill-threshold patches `self-fix:<component>` (warp#3014). Mechanics + Why → `docs/gyrum/warp.md`.
- **NEVER** reserve to hoard; **NEVER** log your `WARP_TOKEN`; **NEVER** `/complete` a half-done item (use `/release` or `/block`).
- **NEVER** bypass `--skip-cluster-check` / `--skip-substrate-routing-check` to silence a real cluster / misroute — bypass is for genuine false positives only.
- **NEVER** force over another agent's fresh, heartbeating claim — use the cooperative `POST /cancel` → claim-when-it-frees path (`docs/gyrum/warp.md`). `gyrum-complete-pr --admin` over a live claim needs explicit per-PR operator authorization.
<!-- gyrum-warp-section-v16:END -->

<!-- gyrum-daily-session-log-v4:START — managed by gyrum-setup; do not edit inside markers -->
## Daily session log

The fleet keeps a daily diary at `<workspace-root>/dark-factory/docs/sessions/<date>.md` — the fleet's central hub at [`gyrum-labs/dark-factory`](https://github.com/gyrum-labs/dark-factory). The dated file is **AUTO-GENERATED, not hand-written** (warp#6817): do NOT create or edit `docs/sessions/<date>.md` yourself. Every session hand-writing the same dated file add/add-conflicted at the second merge and dropped all-but-one session's summary — generating it removes the collision at the root.

If `dark-factory` isn't cloned, run `gh repo clone gyrum-labs/dark-factory` once. If you genuinely can't reach it, record that in your session output and skip the diary — don't fork a per-repo `docs/sessions/` directory.

### How the generated log works

`gyrum-session-log` renders `docs/sessions/<date>.md` IDEMPOTENTLY from three authoritative sources, so re-running is always safe (deterministic overwrite, last-writer-wins on identical content):

1. `gyrum-merged-today --format md` — the "What shipped" PRs block.
2. Warp ticket closures for the local day — tickets that went `done` that day (the "Tickets closed" section).
3. Per-session NARRATIVE fragments at `docs/sessions/<date>/<session-id>.md` — folded into "Session notes". Each session writes its OWN fragment file, so fragments are collision-free; a session NEVER touches the shared dated file.

### At session start

1. `ls <workspace-root>/dark-factory/docs/sessions/` — read TODAY's generated `docs/sessions/<date>.md` (and its `docs/sessions/<date>/` fragment dir) plus yesterday's. That's your fleet state.
2. Don't create `docs/sessions/<date>.md`. If it doesn't exist yet, run `gyrum-session-log` (or just drop your fragment — the generator renders it).

### During session — drop a fragment, don't write the dated file

Write YOUR narrative to `docs/sessions/<date>/<session-id>.md` (resolve `<session-id>` via `~/.gyrum/devtools/lib/session-id.sh` → `warp_session_id`, or use `HH:MM-{WARP_LABEL}`). Seed it from `~/.gyrum/devtools/templates/daily-session-log.template.md` if you want the section scaffold. Append to YOUR fragment as events happen (PR merged, agent spawned, decision made, drift discovered) — don't batch. Don't edit other sessions' fragments; they own their narratives.

REQUIRED: record every warp ticket you touch this session on a single `Tickets touched: warp#…` line in your fragment. The dossier assembler walks fragments by ticket number to bridge date → epic, so a fragment with no ticket line is invisible to it.

If a goal-completion check applies, cite `goal:<slug>` in your fragment — the goal-completion-gate reads either the generated dated file OR the fragment dir.

### Before a status report or session end

Run `gyrum-session-log` to re-render the rolled-up dated file from merged-today + warp closures + every fragment. Your fragment should carry: Tickets touched (`warp#…`), TL;DR (3-5 sentences), What's running (live agents), Open PRs needing review, Architectural decisions, Known drift, Queued for future (link DEBT.md), For the user (morning checklist). "What shipped" and "Tickets closed" are auto-derived — you don't hand-list them.

### Rules

- The dated `docs/sessions/<date>.md` is generated — never hand-edit it; it carries an `AUTO-GENERATED` header.
- `gyrum-session-log` is also cron-able: a periodic run keeps the rolled-up file current from merged-today + warp closures even with no active session.
- Link sessions sequentially; the generator emits the `Previous:` link automatically.
- Don't admin-merge the session-log PR — it's doc-only.
- When the user asks "what's the status" → read today's generated `docs/sessions/<date>.md` + its `docs/sessions/<date>/` fragment dir, then yesterday's.

<!-- doc-truth: ignore-next -->
Pre-warp#2083 logs are at `docs/sessions/YYYY-MM-DD.md` (singular, hand-written); the generated dated file (warp#6817) reuses that path but is machine-rendered from fragments. Readers check the dated file plus the `docs/sessions/YYYY-MM-DD/` fragment dir: `ls dark-factory/docs/sessions/YYYY-MM-DD.md dark-factory/docs/sessions/YYYY-MM-DD/ 2>/dev/null`.
<!-- gyrum-daily-session-log-v4:END -->

<!-- gyrum-enforcement-section-v11:START detail=docs/gyrum/enforcement.md@v11 — managed by gyrum-setup; do not edit inside markers -->
## Enforcement gates — depends_on, smoke, pipeline-items, gyrum-warp deps, canon-tier, manifest-flip

Six structural gates (epic warp#273; canon-tier warp#2399, manifest-flip warp#2452) make one failure mode each structurally impossible: UI nobody clicked, pipelines nobody ran, deps nobody checked, `.svelte` duplicating canon, manifest entries pointing at deleted files, props rendered twice. They are LOAD-BEARING.

**Full mechanics — 412-inspect curl, smoke scaffold, the verbatim canon-tier rule + 3 refusal classes, manifest-flip kebab walk, the canon-extension gate family (warp#3707 / #3722 / #3831), and the Why behind every rule — live in [`docs/gyrum/enforcement.md`](docs/gyrum/enforcement.md).** Open it before: inspecting a 412, scaffolding a smoke spec, hitting a canon-tier / manifest-flip / single-prop-render refusal, proposing an architecture fix from code-reading, or deploying a just-merged change.

### `gyrum-warp deps` — preflight before claim

`gyrum-warp deps <id-or-#NNN>` prints the `depends_on` tree with traffic-light status (●/○/✕) so you predict whether `/claim` will 412 BEFORE calling it. Red nodes end with `(blocks claim)`. `--json` machine-readable; `--depth N` caps recursion (default 5). Exit `0` regardless — the tree IS the answer.

### Workflow rules — STRICT (for AI agents, Claude Code, and humans)

- **ALWAYS** run `gyrum-warp deps <id>` before `gyrum-warp claim <id>` if the item has any `depends_on` or is part of an epic — a 412 after a long context-load wastes the session.
- **ALWAYS** include a Playwright smoke at `e2e/<feature>.spec.ts` when touching `src/routes/**` or `src/lib/components/**`. The four assertions (nav-from-root / primary-action / outcome / failure-path) are not optional.
- **ALWAYS** post real playbook evidence to `/api/v1/items/{id}/health` for `kind: pipeline` items — faking green is the same as faking a passing test.
<!-- doc-truth: ignore-next -->
- **ALWAYS** fetch `canon.gyrum.ai/registry.json` and name-match BEFORE authoring a new `.svelte` under `src/lib/components/`.
- **ALWAYS** flip `canon-manifest.yaml lift_state: retired` in the same PR that deletes the source. One-line yaml edit, far cheaper than the audited bypass.
- **ALWAYS** live-probe an API/service/supervisor BEFORE proposing a fix that depends on its behaviour. Paste the actual response into the analysis. If you can't probe, flag the claim as "untested assumption — needs verification" rather than inferring from code reading alone.
- **ALWAYS** confirm your merge SHA is an ancestor of the deploy tag (`git merge-base --is-ancestor <merge-sha> <tag>`) BEFORE deploying "the change you just merged", then live-probe the deployed behaviour. The release pipeline tags incrementally, so the newest tag can pre-date your merge — deploying it ships the wrong binary (warp#4307).
- **NEVER** use `--skip-smoke` without a real audit-logged reason. "I'll add the smoke later" never comes.
- **NEVER** use `--skip-canon-tier` to silence a genuine duplicate or cross-tier violation — the fix is structural.
- **NEVER** use `--skip-manifest-flip` to silence a legitimate retirement — flipping is one yaml line.
- **NEVER** use `--skip-single-prop-render` to silence a genuine duplicate-render — reserve it for a11y / responsive semantic mirrors (warp#3831).
- **NEVER** mark a pipeline-item healthy via the API without an actual playbook run — green-without-exercise lies to every downstream `depends_on`.
- **NEVER** edit `depends_on` to clear a 412 you don't understand. Find out WHY the upstream is failing, fix or `gyrum-warp block` it.
- **NEVER** use `--skip-obs-logs` to silence a genuine logging gap. A deployable backend (a gyrum-catalog manifest declaring a `role:web|internal` service) must log via the canonical gyrum-go `pkg/observ` structured logger and mount `observ.Access()` so handler logs are request-scoped and carry `trace_id` — never bare `fmt.Println`/`log.Printf`/`println` for app logging — and must never silently swallow an error (every `if err != nil {}` block returns or logs). The obs-logs gate completes the three-pillar advisory obs gate family (metrics + traces + logs, parent warp#3340 / ADR-218): all three are Phase-A warn-only (`⚠`, never block), so the skip removes only the warn-row — the gap still ships, just silently. Fix the logging, don't skip the row.
- **NEVER** parent a child that has an open PR / is in_progress under a `kind:epic` that is still `rubric-review:pending` — it SILENTLY gates the child's merge: the warp API 409s `rubric_review_required` on the child's claim, so `gyrum-complete-pr` aborts and an already-green, approved PR sits unmergeable. `gyrum-complete-pr` re-checks and warns LOUDLY, naming the gating EPIC; the ONLY unblock is the operator-only `gyrum-warp approve-rubric <epic>` (agent tokens 403). Parent for tracking only once the rubric is approved — or know the merge stays gated until an operator approves it (warp#9344).
<!-- gyrum-enforcement-section-v11:END -->

<!-- gyrum-engineering-standard-section-v4:START — managed by gyrum-setup; do not edit inside markers. Body is rendered from templates/engineering-standard-body.md (warp#9968); edit that file, bump this marker version, and re-sync to propagate a content change. -->
## Engineering standard

Every agent and human working in this repo is held to the staff-engineer
standard below — Judgment first, then craft (TDD, hexagonal architecture, clean
code). This block is the single canonical copy, synced fleet-wide into every
gyrum repo; do not restate it elsewhere. Edit
templates/engineering-standard-body.md in gyrum-labs/devtools and re-sync.

<!-- Canonical engineering standard: single source of truth (warp#9968). Do not
     hand-edit the stamped copies of this text — the block in every repo's
     CLAUDE.md and the managed region in templates/worker-persona.md. Edit this
     file (templates/engineering-standard-body.md) in gyrum-labs/devtools and run
     gyrum-setup --sync-claudemd: in the devtools repo that both renders this text
     into every repo's CLAUDE.md and restamps the worker-persona region. A CI
     divergence check keeps the copies in lock-step. A content change requires
     bumping the section marker version in
     templates/CLAUDE-engineering-standard-section.md so consumer repos pick it up
     on the next sync. -->

## Judgment — the brief is a starting point, not gospel

This is what separates a staff engineer from a faithful implementer, and it
comes *before* the craft rules.

- **Verify, don't trust.** Read the source and live-probe your assumptions before
  you implement. The brief, the ticket, and the bug report can all be wrong —
  confirm the failure and the mechanism yourself. Paste the real
  API/service/command output into your reasoning rather than inferring behaviour
  from a code read alone.
- **Correct wrong instructions.** If the brief or ticket is mistaken, fix it and
  say why — do NOT faithfully implement a mistake. A correct change that
  contradicts the brief beats a faithful one that ships a bug. Name the deviation
  and the evidence for it.
- **Question the premise.** Is this the right fix? the right approach? the right
  ticket at all? Say so *before* writing code down the wrong path. If the work is
  already shipped, already wrong, or collides with something in flight, stop and
  surface it instead of producing a redundant or conflicting change.
- **Own the outcome.** Surface risks, every deviation from the brief with its
  reasoning, and follow-ups. Report what you *verified*, not just what you
  changed; if you could not verify something, flag it as an untested assumption.
- **Fix structurally, not by hand.** For infrastructure and deployment problems,
  drive the fix through the fleet's structural machinery — manifests, warp
  tickets, the deploy pipeline, and the ansible roles — not manual hand-edits on
  hosts. A hand-fix bypasses every gate and drifts from the declared source of
  truth; manual server-side steps are for read-only diagnosis only. When a tool's
  assumption drifts from reality, fix the tool (reconcile + harden), don't work
  around it by hand. The same applies to seeded memory: it is generated by
  seed-claude-memory.sh, so edit the seed and re-run — never hand-edit the
  generated file.
- **Keep a live todo for multi-step work.** For any effort of three or more
  steps, maintain a task list from the start and keep it current — mark a step in
  progress before you begin it, completed only once it is verified done, and
  surface the true state (what has landed vs what is still pending) rather than
  letting a backlog grow silently.
- **Commit and push at each chunk, not at the end.** `gyrum-start-work`
  isolates into `/tmp/gyrum-work/...`, and that path is swept under disk
  pressure — it took a worktree holding a full day of approved work on
  2026-09-29, deck edits and rendered masters alike. A commit alone does not
  save you, because a commit in a swept worktree dies with it. Push. Treat
  "the operator approved this" as the trigger to persist, and never let signed-off
  work exist only on local disk.
- **Reframe, don't just re-fix.** A review that keeps failing on the same
  change is information about the change, not the next finding to patch.
  When it doesn't converge, stop and reframe: is the premise right, the
  scope right, the layer right, and is the original goal still the goal?
  Choose one of proceed, rescope, re-spec, or close, and escalate to the
  operator if it is still unresolved.

## Rules

1. **Simplicity first.** Prefer removing or simplifying code over adding new
   code. Before creating something new, check if something existing can be
   extended. The best code is code you didn't write.
2. Never write production code without a failing test first. Red → Green →
   Refactor.
3. Domain layer has zero infrastructure imports. All external systems connect
   through ports (interfaces) and adapters.
4. Every exported symbol has a doc comment.
5. Every new package/module gets a README (see Documentation below).
6. Functions do one thing, ~20 lines max, <3 params. Extract a helper past ~40.
7. Wrap errors with context at every boundary: `fmt.Errorf("creating user:
   %w", err)`. Never swallow errors.
8. Name design patterns in comments when used. Only apply them when they reduce
   complexity.
9. Comments explain *why*, never *what*.
10. No magic numbers, no commented-out code, no `// TODO` without a ticket
    reference.
11. Never optimise without profiling first.

## Architecture (Hexagonal)

- **Domain (inner):** Pure business logic, entities, ports (interfaces). No
  framework imports. Rich models.
- **Application (middle):** Use case orchestration via domain services and
  ports. One use case per action.
- **Adapters (outer):** Implements ports. All framework code lives here. Maps
  external formats ↔ domain types.

When you must add a genuinely new responsibility to a file that is already
large, land it in its own module from the first line — decompose at the seam,
not later under gate pressure.

## TDD

**New code:** Smallest failing test → minimum code to pass → refactor → repeat.

**Existing untested code:** Read and map it first. Write `characterises_`-prefixed
tests that pin current behaviour and pass against the untouched code. Only then
refactor with Red → Green → Refactor, using those tests as the safety net.

**Untestable code:** Extract an interface at the dependency boundary (seam)
without changing logic. Comment the seam.

**Blast radius:** Verify the blast radius, not the authorship — run every spec
your change can break, not only the specs you wrote. A change to a shared
module is verified against every route/consumer that imports it; when the
import graph can't be resolved, run MORE, never fewer.

**Naming:** `should_[behaviour]_when_[condition]`. Structure: Arrange / Act /
Assert.

## Documentation

Every new package/module README must include: title + one-line description;
import path; a copy-pasteable quick-start; an API overview (exported symbols,
one line each); 2-3 realistic usage examples; and config/error-handling/test
instructions as applicable. For complex modules add architecture overview, key
decisions, data flow, extension points, and gotchas. Write for a competent
developer who has never seen this codebase.

## Code review lens

When reviewing (your own diff included), check in order: domain purity → test
coverage → single responsibility → naming → error handling → pattern
opportunities. Give direct feedback: explain why something is a problem and give
the preferred approach.

## Patterns (apply only when they reduce complexity)

Repository, Strategy, Factory, Observer/Event, Decorator, Command, Saga.
<!-- gyrum-engineering-standard-section-v4:END -->

<!-- gyrum-agent-capability-section-v8:START — managed by gyrum-setup; do not edit inside markers -->
## Agent capability boundaries — STRICT (for AI agents and Claude Code)

Cross-project rules every Claude Code session in every gyrum repo must follow. Each rule has the shape: Rule, **Why**, **How to apply** — same shape as `feedback_*.md` memory files.

### 1. Build the missing capability, don't ask

**Rule:** In dev/prelaunch, a 403 / missing CLI / missing endpoint / missing field is a signal to file-and-ship the fix yourself, not delegate back to the operator.

**Why:** Operator capacity is the bottleneck; round-tripping every "I can't because X is missing" multiplies wall-clock cost by operator response latency.

**How to apply:** When blocked, check whether shipping the capability is in scope; if yes, file a warp ticket, claim, ship through the standard gates, then resume. Only delegate when genuinely out of reach (prod credentials, identity changes, money ops).

### 2. Agents never touch the operator's CANONICAL checkout

**Rule:** Sub-agents and Claude Code sessions MUST do git work in a SIBLING CLONE under `~/work/gyrum-labs/<repo>-<branch-slug>/`, never in the operator's CANONICAL `~/work/gyrum-labs/<repo>/`.

**Why:** A sub-agent running `git stash` / `checkout` / `pull` in the canonical corrupts the operator's next interactive session. The hyphen-suffix distinction is what makes LSP-in-workspace possible while keeping the canonical protected.

**How to apply:** `gyrum-start-work` cuts the sibling clone by default — use it. If you find yourself in `~/work/gyrum-labs/<repo>/` (no hyphen suffix), stop, push WIP, redo from a fresh `gyrum-start-work` sibling. `gyrum-complete-pr` only cleans up paths whose basename has a hyphen suffix.

### 3. All bugs through warp + start-work flow

**Rule:** Live-discovered "obvious" bugs go through the canonical loop — `gyrum-warp add` → `gyrum-warp claim` → `gyrum-start-work` → review → `gyrum-complete-pr` → `gyrum-warp complete`. Manual `gh pr create` is BLOCKED, not merely discouraged: the repo hook refuses it outright (warp#11010). `gyrum-review-pr` creates the PR itself — with an ADR-134-conformant title, which a hand-created PR lacks and then fails the title-format gate on (warp#12220).

**Why:** Shortcuts skip the review gates, the warp ticket audit trail, and the heartbeat that lets parallel agents see the work-in-flight. "Just a one-line fix" is how regressions ship.

**How to apply:** When you spot a bug mid-session, stop, file a warp ticket with Why/Scope/Acceptance/Process detail, claim, branch via `gyrum-start-work`, fix, review, complete. Then return to the original work.

### 4. Verify ADR before writing brief

**Rule:** Before drafting a sub-agent brief or any prose citing an ADR / runbook / playbook / warp ticket, fetch the actual artefact and quote non-negotiable rules verbatim.

**Why:** Chat memory drifts. Briefs from memory cite ADRs that don't say what's claimed, name missing files, point at wrong-shape warp tickets — the downstream agent then misses the actual constraint.

**How to apply:** For every cited ADR / warp# / runbook, `cat` the path or `curl` the warp API first. Quote the binding sentence into the brief. If it doesn't exist or doesn't say what you remembered, fix the brief.

### 5. Docs must be real info, never fabricated

**Rule:** Every ADR ref, warp ticket number, file path, symbol name, HTTP endpoint cited in a doc / PR body / commit message / brief must be verified to exist before writing. Drop the reference rather than guess.

<!-- doc-truth: ignore-next -->
**Why:** Fabricated references poison the RAG layer, mislead the next agent, and fake grounded work. A doc confidently citing `ADR-203` when it doesn't exist is worse than "I'm not sure".

**How to apply:** Before writing a citation, verify (filesystem / GitHub / warp API / knowledge-base search). If it's not verifiable in <30s, find a different source or omit the claim.

### 6. Admin-override only when size is sole blocker

**Rule:** `gyrum-complete-pr --admin "<reason>"` is permitted ONLY when the merge-blocker is purely structural (e.g. PR exceeds 800-line cap and the unit genuinely can't split). Never bypass a real failure (failing test, real review finding, lint regression).

**Why:** Admin-override is an emergency tool. Routine use ships the bug AND poisons `~/.gyrum/admin-overrides.log` with bypasses that hide the real failure rate.

<!-- doc-truth: ignore-next -->
**How to apply:** Before running `--admin`, write down WHY the unit can't split. If you can't write a structural reason, fix the failure. The reason lands in the audit log; assume the operator reads it. Persona-truncation FP recovery: see [`docs/runbooks/persona-truncation-fp-admin-recovery.md`](https://github.com/gyrum-labs/devtools/blob/main/docs/runbooks/persona-truncation-fp-admin-recovery.md) (warp#3749) — manual recovery path until [warp#3742](https://warp.gyrum.ai/items?q=3742) auto-tool ships.

### 7. Use gyrum-complete-pr for merges

**Rule:** Never `gh pr merge` directly when the devtools are installed. Always `gyrum-review-pr` then `gyrum-complete-pr` from the feature branch.

**Why:** `gh pr merge` skips review-pass verification, structural checks, the `--merge`-not-`--squash` convention, and post-merge version tagging.

**How to apply:** From the feature branch in your `gyrum-start-work` worktree, run `gyrum-review-pr` then `gyrum-complete-pr`. Tempted to reach for `gh pr merge` = signal that something failed; investigate the gate, don't bypass.

### 8. Sub-agent briefs must include gyrum-warp claim

**Rule:** Every sub-agent task mapping to a warp ticket must include `gyrum-warp claim warp#<NNN>` (or `gyrum-warp preflight <uuid>`) in the brief BEFORE `gyrum-start-work`. The sub-agent must claim before opening any branch or PR.

**Why:** Without the claim step, sub-agents start work without claiming, the ticket sits `ready` while five agents race on it, and the operator sees an empty board next to duplicate PRs.

**How to apply:** Brief's first command is `gyrum-warp claim warp#NNN`; last command is `gyrum-warp complete warp#NNN --pr <url>`. Anything else is malformed.

### 9. No hard wraps in GitHub text

**Rule:** PR bodies, commit messages, PR comments, agent briefs, and any other text rendered by GitHub use one paragraph per line. Do not insert manual newlines.

**Why:** Hard-wrapped text renders as broken short lines on GitHub (renderer only collapses single newlines into spaces at <80 cols). Single-line paragraphs render correctly at every viewport.

**How to apply:** One logical line per paragraph; blank lines between paragraphs; lists/code/tables follow normal markdown. Your editor's soft-wrap displays it readably.

### 10. Sub-agents stall at 600s watchdog

**Rule:** Each sub-agent task produces ONE PR, time-boxed 20-25 minutes, atomic-chunk commits. Concurrency cap is 4 simultaneous sub-agents.

**Why:** The harness watchdog kills runs at ~600s without progress; a brief that asks for "5 PRs in sequence" stalls at PR 2 and burns the whole session. Atomic commits also let the operator review progress mid-flight.

**How to apply:** Decompose multi-PR work into N briefs, one PR each. Cap parallel sub-agents at 4. Commit at every meaningful checkpoint so a 600s kill loses minutes, not the whole task.

### 11. Verify agent completion claims against git state

**Rule:** When a sub-agent reports "PR #NNN merged" or "ticket complete", verify against the actual state (`gh pr view`, `git log`, `gyrum-warp ready`) before trusting the claim. Don't propagate prose to the operator.

**Why:** Agents sometimes report success when the work is on a branch with no PR, on a still-draft PR, or on a still-claimed ticket. Forwarding prose without verification makes the operator's status report a lie.

**How to apply:** For every "I shipped X" claim, run the structural check (`gh pr view <N> --json state,mergedAt`, `gyrum-warp ready --all | grep <id>`) before forwarding. If structural disagrees with prose, structural wins.

### 12. Fail-closed config — no silent defaults on secrets

**Rule:** Never `| default('')` / `${VAR:-}` a secret or required config var — a missing value must fail the render/boot loudly. A service whose own state proves a feature was active must treat an empty enabling secret as a boot contradiction, not a toggle (warp#9557).

**Why:** 2026-07-01/02 (warp#9557): a warp container rebuild whose ansible context lacked the vault var rendered `WARP_GITHUB_INGESTION_SECRET=` EMPTY with no error; template, config, and boot each sanctioned "empty", so the fleet went deaf twice in one day and only a detection alarm — no gate — caught it. A silent default converts "misconfigured" into "feature off", which is invisible to every health check that only asks "did it start?".

**How to apply:** Remove the default so a missing value aborts: ansible's StrictUndefined on a bare `{{ var }}`, compose `${VAR:?self-describing message}`, or an explicit non-empty preflight assert that names the vault file. Reserve defaults for vars where empty is EXPLICITLY safe (empty is itself fail-closed, or degrades along a documented operator-visible path) and comment why at the site — dark-factory ships a template-secret-no-silent-default shape gate enforcing the class for ansible templates via a reasoned allowlist. At boot, if service history (non-empty feature-fed tables) contradicts an empty enabling secret, refuse to start or scream on a critical log/metric — never quietly disable.

This block is regenerated by `gyrum-setup` whenever the template version bumps. To refresh without a full setup run: `gyrum-setup --sync-claudemd`.
<!-- gyrum-agent-capability-section-v8:END -->

<!-- gyrum-orient-section-v5:START -->
## Orientation — read ORIENTATION.md before touching code

<!-- doc-truth: ignore-next — ORIENTATION.md is generated at every onboarded repo's root by gyrum-orient; absent in a not-yet-onboarded stub -->
This repo carries a generated **`ORIENTATION.md`** at its root: a
one-screen brief of the repo's purpose, stack, run/test commands,
entry points, and the conventions + review gates that govern it.
**Read it before touching code** — it is the fastest way to learn
what this repo is for and how its review cycle is shaped, and it is
kept honest by a gate so it cannot silently rot.

### NEVER hand-edit ORIENTATION.md

<!-- doc-truth: ignore-next — ORIENTATION.md is generated at the repo root; absent in a not-yet-onboarded stub -->
`ORIENTATION.md` is **generated, never hand-authored.** The source
<!-- doc-truth: ignore-next — repo-meta.yaml is the hand-authored source at the repo root; absent in a not-yet-onboarded stub -->
of truth is the hand-maintained **`repo-meta.yaml`** at the repo root
(six required fields: `name`, `purpose`, `layer`, `status`, `owner`,
`links`; optional `test_cmd`). To change what the orientation says,
<!-- doc-truth: ignore-next — repo-meta.yaml is the hand-authored source at the repo root; absent in a not-yet-onboarded stub -->
edit `repo-meta.yaml` and regenerate:

```text
gyrum-orient            # regenerate ORIENTATION.md at the repo root
gyrum-orient --check    # diff a fresh render vs the committed file
gyrum-orient --init     # scaffold repo-meta.yaml in a not-yet-onboarded repo
```

The generator is deterministic — same inputs produce a byte-identical
file (no timestamps), so a re-run only changes the file when the
inputs actually changed. A hand-edit gets stomped on the next regen.

### The orientation-drift gate keeps the two in sync

`gyrum-review-pr` runs an **orientation-drift gate**. If the committed
<!-- doc-truth: ignore-next — ORIENTATION.md / repo-meta.yaml live at every onboarded repo's root; absent in a not-yet-onboarded stub -->
`ORIENTATION.md` no longer matches a fresh render of `repo-meta.yaml`
plus the repo scan, the gate flags it. The gate is in **warn-mode**
now (an advisory `⚠` row; it flips to a hard `✗` once fleet coverage
is full, via `GYRUM_ORIENTATION_GATE_HARD=1` — no date cutover). A
<!-- doc-truth: ignore-next — repo-meta.yaml lives at every onboarded repo's root; absent in a not-yet-onboarded stub -->
repo with no `repo-meta.yaml` at all gets a single `⚠ not onboarded`
nudge and is never blocked. The fix is always the same: run
`gyrum-orient` and commit the regenerated file.

### Reading other repos / the fleet — gyrum-warp orient

You do **not** need a checkout to read a repo's orientation:

```text
gyrum-warp orient                      # inside a repo: serve its local ORIENTATION.md
gyrum-warp orient --repo <name>        # any fleet repo's orientation (bare names default to gyrum-labs/)
gyrum-warp orient --ticket warp#N      # resolve the item's repo, then serve it
gyrum-warp orient --fleet              # the fleet digest (dark-factory docs/REPOS.md)
```

<!-- doc-truth: ignore-next — ORIENTATION.md lives at every onboarded repo's root; absent in a not-yet-onboarded stub -->
Local wins: inside a git repo whose root has an `ORIENTATION.md`, the
local file is served (works offline) and takes precedence over the
lagging fleet aggregate. The supported `warp-orient` command is the shorter
equivalent of the newer `gyrum-warp orient` syntax; both return the same
orientation result.

### This repo's gate profile

Which review gates fire here is declared by the root repo-type file's
<!-- doc-truth: ignore-next — repo-type.yaml lives at the repo root; the gates: block is optional and absent on repos that default into the fleet profile -->
`gates:` block in `repo-type.yaml` (profile + per-gate `require` /
`exclude` / `overrides`). A repo with no `gates:` block defaults into
the **gyrum-fleet** profile — every gate enabled, behaviour identical
to before profiles existed. Non-fleet products typically declare
`profile: standard` (the portable structural + orientation + doc-pair
+ changelog + pr-shape set) and gyrum's own UI repos default into the
fleet profile. For any gate this repo's profile excludes,
`gyrum-review-pr` prints a `∅ disabled by repo gate profile` row — a
`∅` row is not a failure, it is the profile working as declared. Read
the gate block to learn which gates govern your PR before opening it.

### Lifecycle journeys

This repo may owe lifecycle docs (a brief, a design system) that the
project-journey substrate tracks. To learn which docs are still owed:

```text
gyrum-project-journey check <journey>   # what this repo still owes (e.g. create-project)
gyrum-project-journey list              # the available journeys
```

To scaffold the docs + gates a lifecycle stage needs, run the matching
journey — `create-project` (repo + brief + design-system + gates +
orientation + EPIC kick-off), `new-feature`, `new-design-system`, or
`new-epic`:

```text
gyrum-project-journey run <journey> --project <name>
```

The freshly instantiated docs carry TODO placeholders only; their
section bodies are HTML comments, so the `doc-sections` gate
deliberately fails until a contributor fills them with real prose —
that is the mechanism by which project docs become mandatory before
agents work.

### Claim output carries an `── ORIENTATION ──` block — follow its posture

Every successful `gyrum-warp claim` appends the
claimed repo's orientation as a `── ORIENTATION ──` block, with an
audience posture you must follow:

- **engineer** (interactive): on ambiguity, a contradiction with the
  code, or an unpinned decision — **ask the operator** (or file a
  docs-drift ticket). Silent inference is a bug.
- **pipeline** (non-interactive): **fail closed.** If orientation is
  missing, stale, or contradicts the code, stop and emit a structural
  finding — do not improvise context.

Claim is best-effort about serving orientation (a claim never fails
because orientation could not be served) and logs the
oriented-version to `~/.gyrum/orient-claims.jsonl` so reviews can
compare oriented-version vs current.

This block is regenerated by `gyrum-setup` whenever the template
version bumps. To refresh without a full setup run:
`gyrum-setup --sync-claudemd`.
<!-- gyrum-orient-section-v5:END -->

<!-- gyrum-verb-manifest-section-v1:START -->
<!-- AUTO-GENERATED on `gyrum-setup --sync-claudemd`.
     Source of truth: lib/verb-manifest/generate.sh (in gyrum-labs/devtools) introspects
     ~/.local/bin/{gyrum,warp,factory}-* + repo-local bin/ at sync time.
     Anti-pattern overlay: gyrum-labs/devtools/templates/verb-anti-patterns.yaml
     Hand-edits to this block will be overwritten on the next sync.
     Fix at source: edit a verb's `--help` (changes the summary), edit
     templates/verb-anti-patterns.yaml in devtools (changes the anti-pattern column),
     or run `gyrum-setup --sync-claudemd` to refresh after either.
     The v1 markers bump only on STRUCTURAL change (new column, new
     category, etc) — body churn from verb add/remove is silent. -->

## Fleet verb manifest (introspected from `--help` — verbs that exist on disk)

> Auto-generated by lib/verb-manifest/generate.sh (in gyrum-labs/devtools) on every `gyrum-setup --sync-claudemd`.
> Source of truth: binaries on PATH whose `--help` follows the `<verb> — <summary>` convention.
> Anti-pattern column: hand-maintained overlay (templates/verb-anti-patterns.yaml in devtools).

### Workflow

| Verb | What it does (from `--help`) | Don't use instead |
|---|---|---|
| `gyrum-complete-pr` | run gates + merge the current branch's PR to main | `gh pr merge` (esp. `--admin` / `--force` / `--no-verify`) — escalation is the failure mode this verb exists to prevent |
| `gyrum-merge-train` | self-hosted merge train (warp#7441; EPIC warp#7354 Phase A; dark-factory/docs/features/project-aware-toolchain.md). | — |
| `gyrum-merged-today` | local-timezone-aware "what shipped today" wrapper. | — |
| `gyrum-rebase-stack` | sync stacked PRs against origin/main in one command. | — |
| `gyrum-review-pr` | run structural checks + 3-persona AI review on the current branch | `gh pr review` directly (bypasses persona-review + structural-checks gate) |
| `gyrum-start-work` | create an isolated workspace + feature branch + draft PR | `git checkout -b` directly (bypasses workspace isolation, ticket-claim, heartbeat, draft-PR) |
| `gyrum-start-work-safe` | verify-or-abort wrapper around gyrum-start-work | — |
| `gyrum-wip-checkpoint` | write a `WIP checkpoint <epoch>` commit holding | — |

### Warp tickets

| Verb | What it does (from `--help`) | Don't use instead |
|---|---|---|
| `warp-bulk-cancel-coherence-fp` | sweep the coherence-validator cron's | — |
| `warp-bulk-cancel-doc-debt-fp` | sweep the public-symbol-rename | — |
| `warp-claim` | atomically claim a Warp item for this agent. | manual lease manipulation via DB — claim emits lifecycle events the dashboard depends on |
| `warp-cleanup-shipped` | auto-complete warp items whose cited PR is | — |
| `warp-extend` | bounded, audited claim-lease extension for delegated work. | — |
| `warp-next-claimable` | list ONLY the Ready tickets that gyrum-start-work | — |
| `warp-protect` | add manual-only + needs-senior-agent tags to a Warp item. | — |
| `warp-release-all` | bulk force-release every claim held by a label. | — |
| `warp-retro-queue` | review queue for auto-filed retro findings (warp#11388) | — |
| `warp-sweep-zombies` | classify ready-queue zombies (substrate-shipped tickets) into HIGH/MEDIUM/LOW tiers and bulk-cancel with audit trail. | — |
| `warp-unprotect` | remove manual-only + needs-senior-agent tags from a Warp item. | — |
| `warp-update` | self-edit a Warp ticket via PATCH /api/v1/items/{id}. | direct API `PATCH` — wrapper enforces description-vs-comment + ticket-state contracts |

### Infra

| Verb | What it does (from `--help`) | Don't use instead |
|---|---|---|
| `gyrum-fleet` | unified AWS-style CLI for queue-agent v1 supervisor | direct journalctl/systemctl spelunking on supervisor hosts — fleet command produces a structured table |
| `gyrum-fleet-creds` | `gyrum-fleet-creds`: per-backend fleet credential store | — |
| `gyrum-fleet-deps` | emit a canonical fleet dependency inventory (JSON). | — |
| `gyrum-fleet-integrations` | heuristic external-integration scan + | — |
| `gyrum-fleet-library-drift` | emit a fleet-wide drift report. | — |
| `gyrum-fleet-lifeguard` | host-wide lifeguard daemon. Shape 3 of the | — |
| `gyrum-fleet-protection-sweep` | canonical branch-protection sweep across | — |
| `gyrum-fleet-security-gate` | Phase 1 pre-deploy security gate | — |
| `gyrum-runner` | unified CLI for self-hosted GH Actions runner ops on | — |
| `gyrum-runner-cache` | host-local cache primitive implementing ADR-136's | — |
| `gyrum-runner-ghost-watch` | periodic ghost-busy detector (warp#6409, | — |
| `gyrum-runners-destroy` | deregister a GitHub Actions runner AND | — |
| `gyrum-runners-drain` | relabel a self-hosted GitHub Actions runner so | — |
| `gyrum-runners-list` | read-only table of self-hosted runner state | — |
| `gyrum-runners-reap` | clear ghost-busy self-hosted GH runners | — |
| `gyrum-runners-rotate` | rolling-recycle persistent CI runners to clear | — |
| `gyrum-runners-show` | single-runner detail view (warp#2304). | — |

### Audit / pre-claim

| Verb | What it does (from `--help`) | Don't use instead |
|---|---|---|
| `gyrum-canon-add` | scaffold a new gyrum-ui canon primitive | — |
| `gyrum-canon-coverage` | build-time structural gate for canon-tier | — |
| `gyrum-predispatch-verify` | parent-session premise-verify before | shipping a sub-agent prompt unverified — predispatch catches referenced-file/symbol drift |
| `gyrum-ticket-verify-premise` | pre-claim probe of operator/UI claims | — |
| `gyrum-validate-axis-substrate` | validate a repo's axis substrate files against the fleet contract. | — |
| `gyrum-validate-changelog-shape` | PR-time check that refuses direct | — |
| `gyrum-validate-compose` | warp#2912 pre-flight gate against docker's | — |
| `gyrum-validate-credential-manifest` | validate credential-manifest.yaml. | — |
| `gyrum-validate-dashboard` | PR-time gate that refuses Grafana dashboard | — |
| `gyrum-validate-doc-references` | flag fabricated references in markdown docs. | — |
| `gyrum-validate-gate-links` | meta-check that every PR-time gate failure | — |
| `gyrum-validate-goal-completion` | read-only check of the 5 goal- | — |
| `gyrum-validate-hard-wrap` | hard-wrap lint gate for PR bodies + commit messages (warp#854). | — |
| `gyrum-validate-manifest` | validate a project manifest's `db:` block. | — |
| `gyrum-validate-pipeline-step` | flag monolithic Go functions in pipeline/ paths. | — |
| `gyrum-validate-playbook` | validate a playbook YAML against ADR-067 + ADR-068. | YAML lint alone — validate-playbook enforces ADR-067/068/109/110 schema rules a generic linter doesn't know |
| `gyrum-validate-pm-canvas` | validate a project's pm-canvas.yaml against | — |
| `gyrum-validate-pr-shape` | thin CLI wrapper for lib/pr-shape-gate.sh. | — |
| `gyrum-validate-route` | PR-time check that rejects hand-rolled CSS for | — |
| `gyrum-validate-structure` | shared structural validator for execution definitions. | — |
| `gyrum-validate-supervisor-config` | warp#3014 Layer 2. | — |
| `gyrum-validate-test-isolation` | refuse shell tests that escape their sandbox. | — |
| `gyrum-validate-ticket` | validate a warp ticket draft against the | — |

### Setup

| Verb | What it does (from `--help`) | Don't use instead |
|---|---|---|
| `gyrum-setup` | bootstrap or refresh a Gyrum-shaped repo (full development workflow). | hand-edits to managed CLAUDE.md blocks — fix the template + bump the marker version + re-sync |

### Other

| Verb | What it does (from `--help`) | Don't use instead |
|---|---|---|
| `gyrum-admin-merges-backfill` | one-shot migration for ~/.gyrum/admin-merges.log. | — |
| `gyrum-agent-report` | append a structured completion report to | — |
| `gyrum-agent-reports` | read, filter, and format the agent-reports journal | — |
| `gyrum-apply-branch-protection` | apply minimum branch protection to gyrum-labs repos. | — |
| `gyrum-audit-branch-protection` | check branch protection status across the gyrum-labs fleet. | — |
| `gyrum-audit-branch-protection-path-filters` | warp#3900. | — |
| `gyrum-audit-credential-manifests` | find legacy alias names in | — |
| `gyrum-audit-frontend-docker-build` | survey fleet repos for frontend/Dockerfile vs the frontend-docker-build workflow (warp#2770). | — |
| `gyrum-audit-overrides` | surface repeating gate-skip patterns | — |
| `gyrum-auto-merge-watcher` | single-tick helper for the auto-merge BEHIND | — |
| `gyrum-automerge` | GitHub auto-merge pipeline CLI (warp#8075). Guideline: cli@v4. | — |
| `gyrum-bind-memory` | gyrum-bind-memory CLI. | — |
| `gyrum-book` | assemble the Fleet Book from the taxonomy + tagged docs (warp#6301). | — |
| `gyrum-book-classify` | Fleet Book C11: the semantic doc-classifier (warp#6326). | — |
| `gyrum-book-svg-render` | Fleet Book B5: light static-SVG renderer (warp#6304). | — |
| `gyrum-book-taxonomy` | resolve the Fleet Book's tag→leaf taxonomy (warp#6300). | — |
| `gyrum-brief` | gyrum-brief: assemble an agent-dispatch brief from warp | — |
| `gyrum-changelog-backfill` | reconstruct .changelog/entries.jsonl from | — |
| `gyrum-changelog-entry` | draft a paste-ready `## Changelog Entry` block | — |
| `gyrum-ci-retry` | re-trigger CI for the current branch's PR without force-pushing | — |
| `gyrum-ci-verdict` | classify a red PR/branch as REAL-FAILURE vs | — |
| `gyrum-clean-curator-impact` | reap stale /tmp/curator-impact-* dirs | — |
| `gyrum-clean-trees` | top-level wrapper exposed on PATH as `gyrum-clean-trees` | — |
| `gyrum-cleanup-dev` | safe disk hygiene for gyrum dev workdirs. | — |
| `gyrum-cleanup-worker` | preserve a worker container's docker logs to disk, | — |
| `gyrum-continue` | resume a failed/interrupted gyrum-implement run. | — |
| `gyrum-create-doc` | scaffold a new typed doc per ADR-127 (docs-as-typed-playbooks). | — |
| `gyrum-create-playbook` | scaffold a new playbook YAML with ADR-067 front-matter | — |
| `gyrum-create-repo` | bootstrap or refresh a Gyrum-shaped repo (full development workflow). | — |
| `gyrum-curator-impact-analysis` | measure consumer-side damage of a substrate PR. | — |
| `gyrum-dashboard-scaffold` | instantiate Grafana dashboard templates for a service. | — |
| `gyrum-deployed-drift` | top-level wrapper exposed on PATH as | — |
| `gyrum-deployed-sync` | periodic fast-forward pull of every fleet checkout | — |
| `gyrum-dev-all-status` | flag stale dev-all farm and launch checkouts (warp#4889/7372) | — |
| `gyrum-devtools` | devtools workflow CLI (the developer loop). | — |
| `gyrum-disk-status` | read-only disk attribution for local worktrees. | — |
| `gyrum-dispatch-check` | orchestrator-side freshness check for a warp | — |
| `gyrum-distill-dossier` | the deterministic paper-source assembler (warp#9664). | — |
| `gyrum-ensure-tag` | ensure the current repo's VERSION-anchored release tag exists for origin/main's HEAD. | — |
| `gyrum-feature-smoke-init` | scaffold a starter Playwright smoke | — |
| `gyrum-file-debt` | scan the current repo for warn-only findings and file a GitHub issue for each unique one. | — |
| `gyrum-findings-backfill-category` | one-shot backfill for pre-category findings. | — |
| `gyrum-fire-playbook` | fire a playbook against a running ai-research | — |
| `gyrum-fixer-health` | per-fixer health cards from the fire-event ledger | — |
| `gyrum-fixup` | auto-apply the canonical 4-gate fixups (warp#2021). | — |
| `gyrum-followup-proposals` | end-of-work follow-up proposal helper. | — |
| `gyrum-gate-spec` | print a gate's PROACTIVE requirement contract. | — |
| `gyrum-gen-cli-docs` | generate the CLI command-reference doc + gyrum-help table from each command's cli@v3 doc-comment tags. | — |
| `gyrum-goal-drift-scan` | re-verify every DELIVERED canvas goal under the | — |
| `gyrum-heal-checkout` | exposed on PATH as `gyrum-heal-checkout` and as the | — |
| `gyrum-help` | quick cheatsheet for all devtools commands | — |
| `gyrum-hetzner-firewall` | firewall ops via the pkg/outbound/hetzner adapter (warp#7172) | — |
| `gyrum-image-gen` | Rate-limited Nano Banana (Gemini) image gen + Replicate SVG vectorisation | — |
| `gyrum-implement` | AI-driven development with requirements gathering. | — |
| `gyrum-infra` | infrastructure-domain CLI (warp#4047, ADR-189). Guideline: cli@v2. | — |
| `gyrum-infra-executor` | execute approved infrastructure requests without an agent | — |
| `gyrum-main-health-check` | Layer B of the main-health gate (warp#6375): | — |
| `gyrum-mark-goal-delivered` | the ONLY sanctioned path to set a canvas | — |
| `gyrum-memory-stale-refs` | gyrum-memory-stale-refs CLI (warp#1024). | — |
| `gyrum-migrate-branch-meta` | one-shot migration from legacy per-repo | — |
| `gyrum-migrate-memory` | gyrum-migrate-memory CLI. | — |
| `gyrum-next-adr-number` | atomically reserve the next ADR number for a repo. | — |
| `gyrum-observ-integrate` | wire a Go service for the full gyrum observ stack. | — |
| `gyrum-ops` | playbook salience nudge for inline shell chains (warp#3016). | — |
| `gyrum-orient` | generate a committed ORIENTATION.md from a hand-authored | — |
| `gyrum-orphan-edits` | fleet-wide sweep for stranded agent working-copy | — |
| `gyrum-pre-flight` | forced agent attestation before gyrum-review-pr fires. | — |
| `gyrum-prestart-check` | pre-flight ticket-risk surface before dispatch | — |
| `gyrum-preview` | per-worktree dev-server port allocation (warp#952 Phase 1) | — |
| `gyrum-project-journey` | run / check / list lifecycle project-journeys. | — |
| `gyrum-prose-audit` | scan recurring prose in agent briefs / task | — |
| `gyrum-queue-supervisor-v0` | interactive-in-container supervisor for the | — |
| `gyrum-reap-heartbeats` | reap orphan warp heartbeat loops (warp 7559). | — |
| `gyrum-reap-worktrees` | registry-backed reaper for agent worktree clones. | — |
| `gyrum-record-finding` | append a structured finding to ~/.gyrum/findings/findings.jsonl | — |
| `gyrum-record-shellcheck-budget` | update .gyrum/shellcheck-budget.json from a | — |
| `gyrum-recover` | read structured review findings, print a re-pass brief. | — |
| `gyrum-refresh-sop` | gyrum-refresh-sop CLI. | — |
| `gyrum-renumber-adr` | recover from an ADR-number collision in one step. | — |
| `gyrum-resume` | gyrum-resume <branch>: read a worktree's in-flight state | — |
| `gyrum-revert-detection-sweep` | nightly fleet revert-detection | — |
| `gyrum-review-remote` | review a PR without touching your working tree. | — |
| `gyrum-revise-guideline` | canonical revision path for | — |
| `gyrum-rule-candidates` | ADR-083 Phase 1 recurrence aggregator (warp#6356). | — |
| `gyrum-rule-candidates-scan-run` | the SCHEDULED caller for the recurrence | — |
| `gyrum-script-usage` | operator query CLI over ~/.gyrum/script-usage.jsonl. | — |
| `gyrum-seam-check` | warp#7924 / EPIC warp#7916 (A2). | — |
| `gyrum-seed-claude-memory` | drop the gyrum workflow feedback memory into | — |
| `gyrum-session-log` | AUTO-GENERATE the fleet-wide daily session log | — |
| `gyrum-session-start` | the session-start gate (warp#7848). Make a | — |
| `gyrum-set-outcome` | update a PR's outcome section via the GitHub API. | — |
| `gyrum-sitemap-discover-sveltekit` | thin shell wrapper around the | — |
| `gyrum-skip-audit` | fleet-wide aggregator of audited-skip invocations | — |
| `gyrum-spawn-agent` | read a Warp ticket, pick a model via the routing | — |
| `gyrum-stale-pr-sweep` | proactive sweep for stale approved PRs | — |
| `gyrum-supervisor-watcher` | host-level daemon that auto-deploys new | — |
| `gyrum-swarm-dispatch-template` | emit a paste-ready swarm-dispatch | — |
| `gyrum-sweep-orphan-worktrees` | fast post-dispatch orphan sweep | — |
| `gyrum-system-catalog` | generate the fleet system catalog (warp#6278). | — |
| `gyrum-task-wrap` | orchestrator-side Task-tool dispatch wrapper with | — |
| `gyrum-tf-safe-apply` | top-level wrapper exposed on PATH as | — |
| `gyrum-tmp-janitor` | sweep stale agent worktrees from /tmp. | — |
| `gyrum-vault-edit` | gyrum-vault-edit CLI: safe ansible-vault round-trips. | — |
| `gyrum-verify-shipped` | assert that a Warp ticket's cited closing-PR | — |
| `gyrum-visual-correctness` | bounding-box visual-correctness probe CLI | — |
| `gyrum-warp` | one-shot ticket-to-merge CLI verb (warp#2575). | — |
| `gyrum-warp-decompose` | atomic file-epic-and-children with parent links | — |
| `gyrum-warp-next-claimable` | list ONLY the Ready tickets that gyrum-start-work | — |
| `gyrum-warp-repair` | gyrum-warp repair <surface>: encode prod warp config | — |
| `gyrum-warp-sweep-zombies` | classify ready-queue zombies (substrate-shipped tickets) into HIGH/MEDIUM/LOW tiers and bulk-cancel with audit trail. | — |
| `gyrum-workspace` | clone the current repo into an isolated sibling | — |
| `gyrum-worktree-e2e-ready` | read-only web/e2e readiness check for isolated worktrees. | — |

### Always

On any denied gate: **STOP**, surface to operator, do not escalate via
`--admin` / `--force` / repeated retries. The verb refused for a reason;
escalating is the failure mode this manifest exists to prevent.

<!-- gyrum-verb-manifest-section-v1:END -->

<!-- gyrum-seam-contracts-section-v2:START -->
<!-- AUTO-GENERATED on gyrum-setup --sync-claudemd (warp#7930 / EPIC warp#7916, B3).
     Source of truth: this repo's seam manifest (the A2 / warp#7924 manifest).
     The body below is rendered by sync_claudemd_seam_contracts_section
     (claudemd-sync lib): it partitions the declared seams into the ones this
     repo PROVIDES (it is the provider) and the ones it CONSUMES (it is the
     consumer). Hand-edits to this block are overwritten on the next sync.
     To change what this section says, edit the seam manifest and re-run
     gyrum-setup --sync-claudemd. The v1 marker bumps only on a STRUCTURAL
     change (new column/field); seam add/remove refreshes silently. v2 adds
     request/event payload seams (`consumer_writes`, warp#15572). -->
## Seam contracts

This repo's cross-project seams — the field-shape contracts it sits on
(Bidirectional Contract Testing, EPIC warp#7916). A **seam** is one
consumer→provider JSON-shape dependency across two repos. It may cover fields
read from a response or fields written to a request/event payload. Read this at session
start so you know which contracts you own before you touch them; the data is
<!-- doc-truth: ignore-next — seams.yaml is the per-repo A2 manifest at the repo root; absent in a repo that declares no seams -->
rendered from this repo's `seams.yaml`, never hand-authored here.

- **Provides** — seams where this repo is the *provider*. Breaking the listed
  response or accepted request shape needs the consumer to migrate first
  (expand-contract); the conformance test keeps the published spec honest.
- **Consumes** — seams where this repo is the *consumer*. The entrypoint is the
  <!-- doc-truth: ignore-next — consumer_reads / seams.yaml are declared per-seam; they resolve only in a repo that consumes a seam -->
  file performing the reads or writes; `consumer_reads` / `consumer_writes` in
  <!-- doc-truth: ignore-next — seams.yaml is the per-repo seam manifest; devtools itself may declare no seams -->
  `seams.yaml` is the declared field subset checked against the provider spec
  by `gyrum-seam-check`.

_No declared seams for this repo._ This repo declares no cross-project seams (it has no seam manifest, or none of its seams touch this repo). When it starts providing or consuming a cross-repo JSON shape, declare the seam and re-run gyrum-setup --sync-claudemd to surface it here.

To verify a seam locally, run `gyrum-seam-check` (the A2 / warp#7924
consumer-subset checker). To add or change a seam, edit the seam manifest and
run gyrum-setup --sync-claudemd to refresh this block.
<!-- gyrum-seam-contracts-section-v2:END -->
