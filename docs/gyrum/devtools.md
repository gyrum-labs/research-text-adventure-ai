<!-- gyrum-devtools-detail-v28 — managed by gyrum-setup; companion to the Devtools section in CLAUDE.md. Do not hand-edit; edit the devtools template and re-sync. -->
# Devtools — full command reference, mechanics & rule rationale

Companion to the **Devtools** section in `CLAUDE.md`. Read the relevant part when a trigger fires (a `gyrum-*` command's full flags/exit-codes, an always-on background mechanism's cadence/tunables, or the *Why* + mechanics behind a STRICT rule). The imperatives are in `CLAUDE.md`; the long-form command tables, the background-mechanism reference, and every rule's justification live here.

## Command reference (full)

Gyrum devtools are installed at `~/.gyrum/devtools/` and exposed on PATH via `~/.local/bin/gyrum-*`. Prefer these over hand-rolling — they own the workflow contract (hooks, review gates, finding journal, worktree isolation).

| Command | When to use |
|---|---|
| `gyrum-start-work <name>` | Start a feature: auto-isolates into a fresh sibling clone, creates branch + draft PR. `--in-place` to skip isolation. Final stdout line is `WORKTREE: <abs-path>` (or `WORKTREE-IN-PLACE: <repo-root>`) — non-interactive callers `cd` to that path before the next command. |
<!-- doc-truth: ignore-next -->
| `gyrum-workspace <name>` | Spawn a parallel sibling clone for spike/experiment work (`~/work/<name>`). Allocates a fresh TCP port from `~/.gyrum/workspaces.json`; emits `run-dev.sh` when the repo declares `server_command` in `.gyrum/workspace.yml`. |
| `gyrum-complete-pr` | Finish a feature: pre-PR checks, 3-persona AI review, merge. |
| `gyrum-review-pr` | Local 3-persona review on the current branch. |
| `gyrum-review-remote <owner/repo#N>` | Review any PR in a fresh clone, no working-tree disturbance. |
| `gyrum-followup-proposals --dry-run ...` | End-of-work follow-up substrate (warp#2968). Direct route renders/ files concrete scoped tickets only after a duplicate-search query; architecture-vote route records disputed or high-blast-radius proposals without creating implementation work. |
| `gyrum-implement <spec>` | Scaffold + implement a pipeline step end-to-end. |
| `gyrum-continue` | Resume an interrupted `/loop` or `gyrum-implement`. |
| `gyrum-record-finding` | Log a cross-agent finding to `~/.gyrum/findings/findings.jsonl`. |
| `gyrum-create-repo <name>` | Bootstrap a new gyrum-shaped repo (CI, branch protection, bots). |
| `gyrum-setup` | (Re-)install hooks + aliases + this CLAUDE.md section. |
<!-- doc-truth: ignore-next -->
| `gyrum-bind-memory` | Symlink `~/.claude/projects/-<slug>/memory/` → `<repo>/.claude/memory/` so durable Claude memory lives in git (ADR-126 / warp#1004). Idempotent; run by `gyrum-setup`. |
<!-- doc-truth: ignore-next -->
| `gyrum-validate-playbook <file.yaml>` | Validate a playbook against ADR-067 schema + ADR-068 target rules before runtime. |
| `gyrum-validate-structure <path>` | Shared structural validator for playbooks, pipeline/block YAML, and pipeline-step source — execution-plane, entrypoint, dry-run/approval, direct-prod-mutation policy. |
| `gyrum-create-playbook <kind> <id>` | Scaffold a validator-clean playbook (onboarding / release_flow / service_runbook / journey / experiment / incident_response). |
<!-- doc-truth: ignore-next -->
| `gyrum-pre-flight` | Forced agent attestation before `gyrum-review-pr` (warp#1387). Prints a 3-digit pin + 7-item checklist; reads marked+pinned reply on stdin; appends to findings.jsonl; exec's `gyrum-review-pr`. Use after >15min autonomous work. |
<!-- doc-truth: ignore-next -->
| `gyrum-recover` | After non-zero `gyrum-review-pr` exit: read `./gyrum-review-findings.json` and print a markdown re-pass message naming the canonical rule, evidence, fix-hint, and override criteria for each failed gate. Pipe into the continuation message. |
| `gyrum-brief --ticket warp#NNNN [--persona name] [--out path]` | Substrate-driven dispatch-brief generator. Pulls the ticket, parent epic's `docs[]`, the canonical gate attestation, persona recommendation, and an open-PR collision check; emits templated markdown (byte-identical when input is identical). Replaces ~150-line hand-rolled briefs. |
| `gyrum-warp <ticket-id>` | One-shot ticket-to-merge verb (warp#2575). Delegates to `gyrum-start-work` for claim + worktree + draft-PR, renders a brief, spawns headless `claude -p`. `gyrum-warp --doctor` walks every prereq in one pass. |
| `gyrum-warp search "<keywords>"` | Search Warp tickets before filing or claiming structural work; use repo names, paths, error text, feature names, or operator phrases to find related tickets to cross-link. |
| `gyrum-warp preview <id-or-warp#NNN>` | Read a ticket without claiming it. Use to inspect candidate cross-links before adding `depends_on`, `blocked_by`, `context_links`, or `parent:warp-NNN`. |
| `gyrum-verify-shipped warp#NNN [--json] [--require-terminal] [--allow-mention-only]` | Verify the cited closing PR merge separately from Warp Done (warp#2915, warp#19400). Default exit 0 means source merged: `SHIPPED` only when Warp is Done, otherwise `SOURCE-MERGED` with delivery pending. `--require-terminal` returns exit 5 until Warp is Done and requires an exact merge SHA before terminal success. Exit 1=cited PR unmerged, 2=no PR cited, 3=cancelled/blocked, 4=API error (including absent Warp status or missing SHA in terminal mode). JSON includes `ticket_status`, `merge_sha` (null when GitHub omits it), `delivery_state`, and `source_merged`. Strict close-verb matching remains the default (warp#2997); `--allow-mention-only` opts into legacy permissive matching. |
| `gyrum-dispatch-check warp#NNN [--json] [--skip-already-shipped "<reason ≥ 20 chars>"]` | Orchestrator-side canonical-actionability and freshness check BEFORE `Agent(...)` dispatch (warp#3710, warp#16361). Sister to `gyrum-verify-shipped` (which fires at completion). Validates Warp's canonical actionability before GitHub lookups, then runs FOUR freshness queries — ticket status, merged-PR close-verb, open-PR close-verb, recent main commit reference. Exit codes: 0=dispatch-ok, 1=already-shipped, 2=in-progress (open PR or live claim), 3=terminal (done/cancelled/blocked), 4=recent-main-commit, 5=bypass-honoured (audited freshness refusal only), 6=usage/API error, 7=canonical non-actionable. Exit 7 cannot be bypassed; when a Ready canonical refusal also has a higher-priority live-claim verdict, the legacy shipment override remains ineligible and cannot produce exit 5. |
<!-- doc-truth: ignore-next -->
| `gyrum-fleet <subcommand>` | Unified AWS-style supervisor CLI (warp#3065): `status` / `scale` / `scale-plan <host>` / `pause @label` / `resume @label` / `stop @label` / `start @label` / `logs @label` / `kills` / `reserve <ticket> @label` / `unreserve <ticket>` / `claim-state <ticket>` / `containers` / `hosts` / `register-runner <name> <ip> [--count N]` / `runner-reset <name>` (warp#3175) / `host audit <alias> [--format=json] [--no-cache]` (warp#3166) / `host-info <alias> [--json]` (warp#7862). Replaces the SSH + systemctl + warp-API + docker + ansible choreography per fleet op with one verb per intent. `scale-plan` (warp#3168) is read-only pre-flight: emits a structural change-list (dispatch edits, stagger edits, host_enable rows, backend collisions) BEFORE you execute. `host audit` (warp#3166) is read-only single-host inspection: five sections (system + supervisor slot matrix + Claude OAuth credential layout + docker daemon state + last 5 systemd events per slot) cached at `~/.gyrum/fleet-audit/<alias>.json` for 30s; output schema at `schemas/host-audit.schema.json`; alias resolution via `dark-factory/infrastructure/server-ids.json` plus the `spare` LAN nick. Reads inventory from `~/.gyrum/devtools/etc/fleet-hosts.yml` (template: `templates/fleet-hosts.yml.example`); reservations require an admin token at `~/.config/gyrum/warp-admin.token`; runner-registration reads `dark-factory/infrastructure/server-ids.json`. `host-info` (warp#7862) is read-only "what serves on that box" in one ssh round-trip: containers (names+ports), :80/:443 listener owner, caddy/nginx/docker service states, Caddyfile `import sites/*.caddy` + `sites/` listing, `/opt` dirs, and a derived `proxy_mode` verdict (`edge-container`/`host-caddy`/`nginx`/`none`/`unknown` — the docker-exec-caddy vs systemctl-reload deploy fork); alias resolution from the CANONICAL `dark-factory/ansible/inventory.ini`; per-probe graceful degradation (missing docker = reported fact, not a crash). Operator quick-ref: `docs/runbooks/fleet-operator-quickref.md`; runner-registration runbook: `docs/runbooks/gyrum-fleet-register-runner.md`. |
| `gyrum-help` | Print the up-to-date command list. |

## Background mechanisms (always-on, structural)

<!-- doc-truth: ignore-next -->
Deterministic shell loops / hooks / shims that fire when `gyrum-start-work` spawns a worktree. None calls an LLM. Full reference + tunables in devtools' `README.md`.

| Mechanism | Cadence | What it does |
|---|---|---|
<!-- doc-truth: ignore-next -->
| `lib/wip-checkpoint.sh` | every 600s | force-with-lease pushes a `WIP checkpoint <epoch> [skip ci]` commit on your feature branch. Refuses protected branches (warp#1986). |
<!-- doc-truth: ignore-next -->
| `lib/heartbeat.sh` | every 4 min | POSTs `/api/v1/items/<id>/heartbeat` to keep your Warp lease alive. |
| `gyrum-deployed-sync` | every 5 min (systemd user timer) | fast-forwards tracked fleet checkouts to `origin/main`. |
| `gyrum-service-version-drift` | every 30 min (systemd user timer) | hits each long-running service's `/api/version` badge and reports any whose running build SHA lags `origin/main` (binary deploy-lag, merged≠live), filing a deduped warp alert. Read-only — NEVER redeploys (warp#8860 detector, scheduled by warp#9328). |
| `lib/agent-guard/{git,mv,rm,cp}` | per-call in agent shells | refuses sub-agent mutations to `~/work/` paths with exit 2. No-op for operator shells. |
| `.githooks/pre-push` + `.githooks/commit-msg` | per push / commit | structural-checks gate. `--no-verify` is an audited bypass — operator authorisation only. |

## Rule rationale — the *Why* + mechanics behind each STRICT rule

These rules are LOAD-BEARING. Persona-PAT rubber-stamping cannot reproduce the contracts devtools enforce. The "simpler-looking" alternative bypasses every gate. AI agents in particular: do not pick the simpler-looking path — it bypasses every gate.

### Merge path — review-pr → complete-pr, never `gh pr merge`

`gh pr merge` directly bypasses the whole contract: `gyrum-review-pr` then `gyrum-complete-pr` from the feature branch verify the review pass, run structural checks, merge with the right strategy, and tag the version — none of which `gh pr merge` does. POSTing to `/pulls/:n/reviews` with a persona PAT and prose you wrote yourself bypasses the 3-persona AI review, replacing reviewer judgement with persona-themed prose. `gh pr merge --squash` is wrong because the convention is `--merge` so per-commit history is preserved (each commit independently testable and revertable); `gyrum-complete-pr` handles the strategy.

### `--no-verify` / `--admin` — audited bypass, never a workflow step

Hook bypass on push and admin override on merge are emergency tools, not workflow steps; both need explicit written operator authorisation for the specific PR. Specifically for diff-size: warp#3100 Path-A atomic canon-author PRs (canon-manifest delta + matching Lit+adapter+tests+storybook trio for each added primitive, all paths on the Path-A allowlist) auto-skip the diff-size gate via `lib/review-checks.sh::_is_path_a_canon_atomic`, with one audited row per PR appended to `~/.gyrum/admin-overrides.log` (warp#3702). Do NOT reach for `--admin` on a legitimate Path-A ship — the gate already exempts it; reaching anyway re-introduces the warp#3100-vs-admin-no-bypass rule conflict the auto-skip exists to dissolve.

### `--ignore-failing-checks` — never to silence a real broken test (warp#3107)

`gyrum-complete-pr` refuses to enrol auto-merge when `statusCheckRollup` contains any FAILURE conclusion — sister-shape to warp#3009's DIRTY refusal. The right path is the unblocker ticket workflow: `gyrum-warp add` a ticket for the failing test, `gyrum-warp block <current> --reason 'blocked-by:warp#NNN'`, return when the unblocker ships. The audited override exists ONLY for the case where the failing check is legitimately unrelated to this PR's scope AND an unblocker is already filed.

### Never `--blocked-by` an approved ticket; CI-infra waits are comments (warp#20986)

Every persona approval carries a digest of the ticket it reviewed, and `gyrum-complete-pr` and the merge train count an approval only while that digest still recomputes. The digest signs the ticket's content (title, description, priority, tags, `blocked_by`, `depends_on` and the rest of `persona_review_evidence_canonical_ticket`) but not `status` or `blocked_reason`. A reason-only `gyrum-warp block` is therefore safe, while linking a blocker after review voids every approval on the PR. `gyrum-warp unblock` never clears `blocked_by`, so the void outlives the wait. warp#20986 traced 14 voided approvals to CI-infra blockers linked 30-60 minutes after approval.

- **CI-infra wait** (dead runner, sandbox EPERM, rc=75 infra kill): not a blocker. Keep the claim, leave a ticket comment (`POST /api/v1/items/<id>/comments` with `{"body": "…"}`; there is no `gyrum-warp comment` verb yet), and re-run the checks once the infra recovers.
- **Real broken test on main**: file the unblocker, then `gyrum-warp block <id> --reason "waiting on warp#NNN"`. The reason carries the link; `--blocked-by` would void the approvals.
- **The guard**: `gyrum-warp block --blocked-by` exits 3 when an open PR linked to the ticket holds an APPROVED review carrying a persona evidence marker, and fails closed when it cannot check. It derives "signed" from the digest's own canonical ticket, so it stops refusing by itself if `blocked_by` ever leaves the signed set. Audited override: `--skip-signed-approval-guard "<reason ≥ 20 chars>"` (logged to `~/.gyrum/admin-overrides.log`). `gyrum-warp update --blocked-by` is not guarded yet; the rule applies to it all the same.

### `gyrum-review-pr` before opening — structural gate

It gates structural checks (build, test, coverage, complexity, file length, gosec, staticcheck) that the persona review alone does not. Local review IS the review — there is no external review step.

### `gyrum-pre-flight` after >15 min autonomous work (warp#1387)

The 3-digit pin is the structural delta vs documentary "remember the gates" prose; typing the pin is proof of read; the auto-appended findings line is the audit trail that makes "you said you did X, the diff shows you didn't" retrospectively answerable. Bypassing the wrapper is the same shape of lie as bypassing a gate.

### `gyrum-recover` on non-zero `gyrum-review-pr` exit

It reads the structured review-findings JSON contract and prints a canonical re-pass message naming the rule body, evidence, fix-hint, and override criteria for each failed gate. Cuts the diagnose step from "parse stderr and back-translate to which rule" to "read structured rule references" — the agent fixes against the canonical rule, not the symptom. Pipe into the continuation message.

### `gyrum-complete-pr` immediately after SUCCESS (warp#1342)

There is NO external review step — local review IS the review. The script's FINAL stdout line is a literal directive token (`READY-TO-MERGE — call gyrum-complete-pr` / `REVIEW-FAILED — fix findings then re-run gyrum-review-pr`); swarm agents pattern-match on it. Do not exit waiting for an async/external verdict; the verdict has already been printed — agents stalled holding orphan heartbeat leases on warp#1311 / warp#1330 by misreading local review as advisory.

### Follow-up proposals at wrap-up (warp#2968)

Use `gyrum-followup-proposals --dry-run` before filing anything. Direct follow-up tickets require a duplicate-search query, concrete scope, and a `--pattern` precedent; disputed, cross-system, policy-changing, or high-blast-radius proposals go through `--route architecture-vote` so agent positions are preserved before implementation tickets exist.

### `AGENT-TERMINAL` vs `ENROLLED-NOT-YET-MERGED` (warp#3362)

`AGENT-TERMINAL — merged` (or `— auto-merge enrolled` under the audited `--accept-enrollment-as-terminal "<reason ≥ 20 chars>"` legacy override) means the PR is genuinely merged (mergedAt non-null) — exit immediately, do NOT poll. `ENROLLED-NOT-YET-MERGED — BLOCKED: <named-blocker>` / `— TIMEOUT: <state-summary>` / `— POLL_DISABLED` means auto-merge enrolled but GitHub has not landed it yet — the caller MUST `gh pr view <N> --json mergedAt,mergeStateStatus,statusCheckRollup` to verify, then either wait (with a larger `GYRUM_AUTO_MERGE_WATCH_MINUTES`), file an unblocker ticket, or escalate. Reporting `AGENT-TERMINAL — merged` when the script emitted `ENROLLED-NOT-YET-MERGED` is the warp#3071 / warp#3060 false-claim regression the truth gate exists to prevent.

`AUTO-MERGE-PENDING — enrolled, checks still running; re-run gyrum-complete-pr after merge` (rc=0, warp#13151) is the default bounded merge-wait outcome: complete-pr waited `GYRUM_COMPLETE_MERGE_WAIT_SECS` (90s default), verified the enrolled auto-merge is merely PENDING — PR still OPEN, no failed checks — and exited 0 instead of blocking the foreground through the whole CI duration. It is NOT a merge claim: re-run `gyrum-complete-pr` once the merge lands (the idempotent warp#12394 tail then completes in seconds) or poll `mergedAt` yourself. A FAILED merge (conflict / red required check / closed-without-merge) never emits this — those exit non-zero with the failure surfaced. `gyrum-complete-pr --tail` restores the pre-warp#13151 wait-through-CI shape when an in-session watch is genuinely wanted.

### Never trust an AGENT-TERMINAL claim from a non-clean sub-agent exit (warp#3144)

The `gyrum-warp` dispatch wrapper classifies the spawn's actual exit reason (`clean_exit` / `watchdog_killed` / `timeout` / `rate_limited` / `crashed`) and refuses to forward an AGENT-TERMINAL-claiming report on any non-clean exit — rewriting the report to a `WATCHDOG-KILLED — orchestrator MUST verify via gh pr view <N>` directive and exiting non-zero. Sister to warp#3361 (persona-review-truth-gate at review-pr layer) and warp#3362 (post-enroll merge-watcher truth gate at complete-pr layer); together the three gates close the dispatch → review → complete loop against false-positive shipped claims. On any WATCHDOG-KILLED output, the orchestrator MUST `gh pr view <N> --json mergedAt,state,mergeStateStatus,statusCheckRollup` before treating the ticket as shipped.

### Fix pre-push hook failures at the root cause

A hook failure is the gate doing its job; silencing it ships the bug. Never bypass.

### `gyrum-start-work … --ticket warp#NNN` (warp#1311)

The pre-push hook refuses pushes from `feat/* | fix/* | chore/* | docs/* | refactor/*` lacking per-branch metadata under `.gyrum/branch-meta/` (or the audited marker named `branch-meta.no-ticket`) — the structural-vs-documentary lift. If you hit the gate on an in-flight branch, recover by re-creating it via `gyrum-start-work` in a fresh worktree and re-applying your changes. `--no-ticket` is for genuinely-trivial fixes only — pick it explicitly.

### Parse + `cd` to the `WORKTREE:` line (warp#2593)

Parse the final `WORKTREE: <path>` (or `WORKTREE-IN-PLACE: <path>`) line of `gyrum-start-work`'s stdout and `cd` to that path before the NEXT Bash call. The interactive-shell auto-cd (warp #459) only fires for shells that have the `gyrum-start-work` shell-function wrapper sourced — non-interactive subshells (Claude Code Bash tool, sub-agents, CI driver scripts) do not. Without this `cd`, every subsequent git operation runs against the operator's canonical checkout — exactly the Rule #2 violation the sibling-clone story exists to prevent.

### Commit-message bodies — one paragraph per line

The shared `commit-msg` hook refuses hard-wrapped or over-stuffed paragraphs at author time, so the same lint `gyrum-review-pr` runs over PR-body + commit-messages no longer fires three layers later requiring `git commit --amend` + `git push --force-with-lease` (a path that is sandbox-blocked on agent-created branches per warp#1319). Canonical bypass when the rule genuinely doesn't apply: `git commit --no-verify` — do not add a second escape hatch. See warp#1327 (commit-author-time catch), warp#854 (PR-review-time backstop), ADR-084 (the rule).

### Regression test with every bug fix (warp#1008)

PRs closing a `type: bug` ticket are gated by `regression-fixture-for-bug-ticket` (devtools PR #233). The test must fail BEFORE the fix and pass AFTER, and reference the ticket in its name or a `// regression: warp#NNN` comment so reviewers can trace the bug class. Accepted layers: `*_test.go`, `*.test.ts`, `*.spec.ts`, `test_*.py`, `e2e/**/*.spec.ts`. The gate fires on the surface declared in the ticket's `surface:` field (`unit | integration | journey | contract`, default `unit`). This is TDD applied to bug fixes — same shape as red-green-refactor, scaled to where the bug lives. Audited override (use only when the bug genuinely has no testable surface — e.g. visual-only CSS regression with no DOM assertion possible): `gyrum-review-pr --skip-regression-fixture "<reason>"` — logged to `~/.gyrum/admin-overrides.log`.

### Declare `tier` on every public-IP'd server (ADR-175 / warp#1978)

PRs touching `gyrum-labs/devtools/infrastructure/server-ids.json`, `ansible/playbooks/install-*.yml`, `ansible/roles/*/tasks/*.yml`, or `**/*.tf` are gated by `trust-boundary`, which runs `scripts/check-trust-boundaries.sh --check` (Phase 3 / warp#1977) in schema-only mode and refuses on gap. Required: `tier: bff | internal | bastion`; for bff/bastion add `tier_justification` (one-liner); for internal add `exposed_ports` (TCP port list) + `trusted_inbound` (alias list). Rationale is BFF + internal-firewalled (one trust boundary per app; internal services trust the network behind it). Audited override (use only when the gap is a documented exception, e.g. a `tier=bastion` addition under separate review): `--skip-trust-boundary "<reason ≥ 10 chars>"` — logged to `~/.gyrum/admin-overrides.log`. See `gyrum-labs/devtools/docs/runbooks/trust-boundary-gate-fail.md` (in devtools) for the per-gap fix table.

### Justify credential-co-tenancy / privilege-escalation (warp#6357)

The same `trust-boundary` gate (extended in warp#6357) ALSO refuses any diff that (a) adds a runtime user to `docker`/`sudo`/`wheel` or drops a `NOPASSWD` sudoers fragment, (b) places a credential path (vault/ssh/hcloud/`*token*`) under a runtime user, or (c) adds `privileged: true` / a `/var/run/docker.sock` mount / `cap_add` to a worker container — unless the PR body carries a `## Trust-boundary audit` section (who can reach these creds, blast radius of a compromise, why acceptable). This codifies the mini-64gb root-equivalence finding (internet-fed agents one container-escape from fleet creds) as a deterministic gate. Same audited override: `--skip-trust-boundary "<reason ≥ 10 chars>"`.

### Ship docs alongside script / role / ticket-filing workflow (warp#1981)

PRs adding `scripts/<name>.sh` (excluding `*.test.sh`), `ansible/roles/<name>/`, or ticket-filing `.github/workflows/<name>.yml` are gated by `doc-pair`. Scripts need `scripts/README-<name>.md` AND (`docs/HOWTO/<name>.md` OR `docs/runbooks/<name>.md`); roles need `ansible/roles/<name>/README.md`; ticket workflows need `docs/runbooks/<name>.md`. Templates + per-shape guidance in `gyrum-labs/devtools/docs/HOWTO/writing-pair-docs.md` (in devtools). Audited override (use ONLY when the artefact genuinely has no operator-facing surface): `--skip-doc-pair "<reason ≥ 10 chars>"` — logged to `~/.gyrum/admin-overrides.log`. Rationale: documentary "ship docs" rules degrade under pressure; structural refusal at merge time is the only enforcement that holds (same lesson as warp#1311 / warp#1327 / warp#1387 / warp#1008).

### Persona recusal (warp#1392)

When a PR carries commits from a fleet persona bot account (`gyrum-priya` / `gyrum-marcus` / `gyrum-lin` / `gyrum-dana` / `gyrum-sasha` / `gyrum-quinn`), `gyrum-review-pr` recuses that persona and drops quorum to 2-of-2 from the remaining default reviewers. When two-or-more default personas (Priya / Marcus / Lin) recuse on the same PR, the gate fails closed and asks the operator to invite a non-default reviewer. Every recusal appends one JSON line to `findings.jsonl` (kind `persona-recusal`) so the decision is auditable. This is the structural enforcement that makes the persona-as-employee architecture (ADR-115) safe — without it a persona could ship a PR and self-approve it the moment dual-role lands.

### Merge-gate decision: approval minimum plus rejection veto (warp#14846)

Approval and rejection are separate signals. The 2-of-3 approval quorum is a minimum positive threshold, not permission to erase a negative verdict. `gyrum-review-pr`, its durable auto-merge helper, and `gyrum-complete-pr` each enforce the same exact-head decision:

- **At least 2 default personas explicitly `APPROVED` (or 2-of-2 after a recusal) and zero `CHANGES_REQUESTED`** → the clean quorum may proceed.
- **Any current-head `CHANGES_REQUESTED` from a required persona** → normal automation is **refused**, even when two other personas approved. Fix the finding and rerun review; completion never dismisses or reinterprets the rejection.
- **Empty, `COMMENTED`, malformed, missing, or stale-head evidence** → never increments the approval count. A blank response is not agreement.
- **The ≥2-recusal fail-closed rule (persona recusal, above) is unchanged** — the merge gate honours it too.

### Sister-agent collision detection (warp#1511 / warp#1517)

`gyrum-start-work` greps open PRs on the target repo for files matching the ticket's likely-touch paths (extracted from the ticket description). Warns on 1-2-file overlap with one open PR (proceeds with stderr note); refuses on >2-file overlap OR (>50% overlap with ≥3 likely-files) unless `--allow-collision "<reason ≥ 10 chars>"` (audited override to `~/.gyrum/start-work-overrides.log` + a finding line); refuses outright on multi-PR overlap with no bypass. The check eliminates the warp#1372/1377 + warp#1373/1378 + warp#1374/1379 duplicate-pair collision pattern. Sibling to the warp#1108 issue-overlap check at the same call-site (issue-overlap catches "another PR mentions this ticket"; file-overlap catches "another PR touches the same files").

### Assemble dispatch briefs via `gyrum-brief` (warp#1527)

The generator pulls the ticket body, parent epic docs[] (warp#1481), the active gate attestation (warp#1420), persona recommendation (warp#1424 / warp#1439), and an open-PR collision check (warp#1517) and emits canonical markdown. Hand-rolled briefs drift between dispatches; substrate-assembled briefs are byte-identical when input is identical, structurally unable to silently miss a gate. Pass `--persona name` to override routing (recorded in provenance); pass `--out path` to write to file. The single command replaces the ~150-line hand-rolled brief operator authored ~12 times/day on 2026-05-06.

### Verify shipped before treating a dep as satisfied (warp#2915)

Call `gyrum-verify-shipped warp#NNN` to prove a closing source PR merged before starting dependent source work. Exit 0 in default mode proves the closing PR merged, even when Warp still says `in_progress`: JSON then reports `SOURCE-MERGED` and `delivery_state=pending`. For a delivery dependency or a claim that work is live, use `--require-terminal`; it returns exit 5 while the merged ticket is not Done and exit 0 `SHIPPED` only after Warp reports Done with an exact merge SHA. An older merged PR whose GitHub record omits `mergeCommit` keeps default source-merge success with `merge_sha:null`; terminal mode refuses success without that SHA. A tag, green release build, or merged module does not certify delivery. Unmerged PRs, absent PRs, cancelled/blocked tickets, and API errors retain distinct exits 1/2/3/4. Auto-merge enrollment is not a source merge.

### Dispatch-check before spawning a sub-agent (warp#3710)

Run `gyrum-dispatch-check warp#NNN` before invoking `Agent(...)` to spawn a sub-agent on warp#NNN. The verb first validates Warp's canonical actionability projection, then runs four freshness queries (ticket status, merged-PR close-verb, open-PR close-verb, recent main commit). Dispatch only on exit 0, or on exit 5 when the caller deliberately requested an audited freshness bypass for a genuine ship-again case. Exit 1 (already-shipped), 2 (in-progress), 3 (terminal), 4 (recent-main-commit), 6 (usage/API error), and 7 (canonical non-actionable) refuse dispatch. Exit 7 is never bypassable; a Ready item that is canonically non-actionable remains ineligible for `--skip-already-shipped` even when a live claim retains the higher-priority IN-PROGRESS verdict. The bypass audit row lands in `~/.gyrum/admin-overrides.log`.

### Force-push policy (warp#1340)

See `gyrum-labs/devtools/policy/git-force-policy.md`. `--force-with-lease` allowed on agent `feat/` / `fix/` / `chore/` branches in `gyrum-start-work` worktrees only; plain `--force` (no-lease) refused anywhere; force-push to `main`/`master` refused with no exception. The harness grounds its push-gating judgment on that file rather than re-deriving the rule per invocation; agents authoring or reviewing a push that needs history rewrite should cite the matching rule number. Recovery when the sandbox blocks a legitimate `--force-with-lease` on an agent branch (warp#1319 / warp#1340 outstanding): non-force `git merge origin/main` fast-forward, NOT `--no-verify` or `--admin`.
