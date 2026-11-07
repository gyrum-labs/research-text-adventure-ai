<!-- gyrum-warp-detail-v16 — managed by gyrum-setup; companion to the Warp section in CLAUDE.md. Do not hand-edit; edit the devtools template and re-sync. -->
# Warp — full protocol, REST reference & rule rationale

Companion to the **Warp** section in `CLAUDE.md`. Read the relevant part when a trigger fires (filing a 3rd related ticket, routing a ticket, patching a kill threshold, reclaiming a live claim, swarming an epic). The imperatives are in `CLAUDE.md`; the *Why* and *mechanics* are here.

## Env contract (full)

`WARP_URL`, `WARP_TOKEN`, `WARP_LABEL` load from `~/.config/gyrum/control-plane.env`. Mint tokens via `POST /api/v1/keys` with scope `agent`. Missing `WARP_URL` exits the wrappers `1` with a self-describing error; fix in one shot:

    cp ~/.gyrum/devtools/templates/control-plane.env.example ~/.config/gyrum/control-plane.env \
      && chmod 600 ~/.config/gyrum/control-plane.env \
      && $EDITOR ~/.config/gyrum/control-plane.env

## Raising contract — frame with Jan before filing (warp#11068)

Repos whose orientation declares the persona-driven raising contract require
every new ticket to be framed through the Jan requirements persona first.
The invocation: `gyrum-warp refine "<problem statement>"` (or
`gyrum-warp refine --file <path.md>`). One command does both contract steps:

1. **Framing** — Jan frames the WHAT (requirements, acceptance criteria,
   non-goals, scope), never the HOW; the requirements stay
   implementation-free. The persona definition is
   `gyrum-labs/devtools/templates/jan-persona.md`.
2. **Attestation** — `gyrum-warp refine` emits the signed attestation block
   (agent-id + role + timestamp + requirements-hash) with the framed body;
   there is no separate signing verb. Editing the requirements after signing
   invalidates the hash.

Feed the emitted body to `gyrum-warp add --file <path.md>`. Filing without
the framing is rejected: `gyrum-warp add --lint` fails on the five raising
gates (requirements-present, persona-used, no-impl-in-requirements,
criteria-observable, signed), and `gyrum-warp complete` re-validates every
acceptance criterion plus the requirements hash before allowing completion —
an unframed or hand-forged ticket cannot reach `done`.

## REST + CLI cheatsheet

| Op | CLI | REST |
|---|---|---|
| List Ready | `gyrum-warp ready` | `GET /api/v1/items?status=ready` |
| Get item | (use REST) | `GET /api/v1/items/{id}` |
| Resolve+claim | `gyrum-warp preflight <uuid>` | `GET` then `POST /claim` |
| Claim | `gyrum-warp claim <id>` | `POST /api/v1/items/{id}/claim` |
| Heartbeat | (auto every 5min) | `POST /api/v1/items/{id}/heartbeat` |
| Extend lease (delegated work) | `gyrum-warp extend <id> [--minutes N] --reason "<≥20 chars>"` | `POST /api/v1/items/{id}/heartbeat` (real-claimer beats) |
| Complete | `gyrum-warp complete <id> --pr X` | `POST /api/v1/items/{id}/complete` |
| Release | `gyrum-warp release <id>` | `POST /api/v1/items/{id}/release` |
| Block | `gyrum-warp block <id> --reason X` | `POST /api/v1/items/{id}/block` |
| Unblock | `gyrum-warp unblock <id>` | `POST /api/v1/items/{id}/unblock` |
| Cancel | `gyrum-warp cancel <id> --reason X` ends the item for good; `--handover` sends the cooperative stop instead, the only form the reclaim flow below works with | `POST /api/v1/items/{id}/cancel` |
| Add | `gyrum-warp add --file path.md` | `POST /api/v1/items` |
| Self-edit | `gyrum-warp update <id> [flags]` (incl. `--type <type>`) | `PATCH /api/v1/items/{id}` |
| Cohort disposition | `gyrum-warp disposition plan\|apply\|reverse` | list/get + validated lifecycle/PATCH + per-item audit |
| List children | (use REST) | `GET /api/v1/items/{id}/children` |
| Decompose epic | (post-ADR-098) | `POST /api/v1/items/{id}/decompose` |

CLI exit codes: `0` success (full item JSON on stdout for write ops), `1` HTTP error (`409` already-claimed, `403` not-the-claimer), `2` usage error. REST calls need `Authorization: Bearer $WARP_TOKEN` against `$WARP_URL`. `gyrum-warp add` follows a tighter stdout-only-on-success contract (`Created: warp#NNN: <title>` or empty on failure; diagnostics to stderr) — so `if ! gyrum-warp add ...; then handle_failure; fi` is safe; merged-stream grepping is not.

`gyrum-warp update <id> --type <type>` patches a mis-typed ticket's `type` (categorical field, own tickets, agent scope — warp#797; the service PATCH handler accepts it per warp#7882). Valid types: `bug`, `feature`, `chore`, `docs`, `refactor`, `epic`, `infra_request` — the server owns the enum and rejects an unknown value with `400 invalid_type`. Symmetrically, when `gyrum-warp add --file` carries an out-of-enum `type:`, the server's accepted set (`details.valid` on the 400) is surfaced in `gyrum-warp add`'s stderr diagnostic so the author sees the valid types at the CLI instead of a bare `invalid_type` (warp#7884).

## Common patterns

The canonical session loop is claim → heartbeat → terminal: pick an id from `gyrum-warp ready`, `gyrum-warp claim`, do the work, heartbeat every ~5 min (wrappers spawn a background loop; direct REST callers must handle this), then `gyrum-warp complete` / `gyrum-warp release` / `gyrum-warp block`. Heartbeat responses include `cancel_requested: bool` — when true, finish the current atomic unit, push WIP, and `gyrum-warp release` (do NOT `complete` partial work). Items carry `status`, `priority`, `tags`, `reserved_for` (label that gets first refusal, survives release), `claimed_by` (label holding the lease, clears on release/expiry).

### Claim guard and dead local heartbeats (warp#20493)

When you claim another ticket, the Devtools concurrency guard counts your
session's existing claims. It releases an expired lease immediately. If a
local per-ticket heartbeat PID is dead but the lease is valid, it keeps the
claim held for **15 minutes after the server's `last_heartbeat_at`**, falling
back to `claimed_at` before the first heartbeat. A dead PID with no server
refresh for 15 minutes is released and audited as a dead-session claim.
Missing or malformed lease expiry, or missing, malformed, or future activity
timestamps count as held. The same session scope and parallel cap still apply.

A recent one-shot `gyrum-warp extend` proves recent activity, not continuous
work. With a longer lease, a live session that stops refreshing for 15 minutes
can still be reclaimed if its local heartbeat PID is dead; keep extending
while the work continues. Normal 15-minute leases leave through the existing
expired-lease path once the expiry time has passed.

### Long-running delegated dispatches (warp#14721)

A dispatched sub-agent often runs longer than one ~15-min lease window, and its heartbeats are **noise** — the server only extends a lease for beats whose `agent_name` matches the row's `claimer_agent`, i.e. the session that made the claim. Survival is therefore the CLAIMING session's job. While delegate work runs, keep the claim alive from the claiming session:

    gyrum-warp extend warp#<id> --minutes 45 --reason "delegated implement agent running" &

- Bounded: `--minutes` accepts 1-60 per call; omit it for a single refresh beat (+15 min). Chain invocations for longer windows.
- Fail-closed: refuses before any heartbeat traffic unless the item is in_progress AND claimed by this label; a 200 beat whose `lease_expires_at` did not advance (server noise classification) exits 1 loudly rather than faking success.
- Audited: every invocation appends one JSONL row to `~/.gyrum/lease-extensions.log` naming ticket, minutes, reason, agent, and the resulting lease deadline.

## Ticket batching — proactive EPIC creation (warp#2980)

**Before filing the 3rd ticket in 1 hour against the same repo + same feature-area, STOP: do these belong as sub-tickets of an EPIC?**

- If yes: file the EPIC FIRST with `--kind epic` + `super_doc:` frontmatter. Then file sub-tickets with `--parent warp#<epic-NNN>` so `/board` renders the tree.
- If no (truly independent): proceed with individual filing.
- The catch: `gyrum-warp add` runs a client-side cluster check at file-time (same repo +2, tag overlap +1/tag, title-token Jaccard ≥0.3 +2 → cluster member at ≥3 points). When the new ticket would be the 3rd similar ticket in the last 4h (`GYRUM_WARP_ADD_CLUSTER_WINDOW_SEC=14400`, `GYRUM_WARP_ADD_CLUSTER_THRESHOLD=2`), `gyrum-warp add` warns to stderr and — in agent contexts — tags the create `cluster-detected-needs-epic-name` so `/board` surfaces it. Bypass: `gyrum-warp add --file <path> --skip-cluster-check '<reason ≥ 20 chars>'`; bypasses append to `~/.gyrum/cluster_detection_overrides_log`.
- warp#8422 — three UX/correctness refinements around that check (the detection heuristic itself is unchanged):
  - **An epic parent satisfies it.** If the item carries `--parent warp#<epic>` (or a frontmatter `parent_id` that resolves to `kind:epic`), the cluster check is skipped — the item is already grouped, so there's nothing to nag about, and the epic no longer mis-appears among "similar" tickets. No `--skip-cluster-check` needed.
  - **It runs at `--lint` time too** (advisory): `gyrum-warp add --lint` now surfaces the cluster banner so you see it at pre-check, not only at submit. Lint stays exit 0 — the advisory never flips the verdict (the create path tags-and-ships rather than refusing, so lint matches it).
  - **The non-interactive `--file` outcome is deterministic:** a cluster-hit in agent context ALWAYS creates the ticket and tags it `cluster-detected-needs-epic-name`, then exits 0. It never refuses and never silently persists nothing — after a cluster-hit the ticket exists, tagged for operator review.
- DO NOT rely on the post-hoc tag — the `PATCH parent_id` path requires admin scope (agent scope returns 403 `forbidden:agent_field:parent_id`), so once children ship un-parented an operator must hand-thread them.

**Why:** Operator (jon, 2026-05-16) flagged that warp#2971-2977 were filed as un-parented siblings of what should have been warp#2978 EPIC; the retroactive parent_id PATCH dead-ended on agent-scope refusal. The catch lifts the pattern to a file-time gate so the next occurrence interrupts at filing.

## Sizing — two-axis hints at filing time (warp#17392)

Every `kind:ticket` gets two INDEPENDENT routing tags computed at `gyrum-warp add` lint and create time; the overseer's assignment step reads them mechanically instead of judging at launch time (evidence: warp#17397 was medium-brain but needed a 1M-context seat, was launched from the `complexity` tag alone onto a 256k seat, and compacted mid-flight):

- **`size:brain-{low|med|high}`** — the reasoning axis; fed by the existing `complexity:` tag (default `med`, same as review-complexity). An explicit `size:brain-*` tag in the ticket's tags line is the author's pin and wins.
- **`size:ctx-{256k|1m}`** — the context axis; heuristic starts dumb per the amendment: repo in the small known set (`GYRUM_WARP_ADD_CTX_256K_REPOS`, default `devtools`) → `256k`, anything else → `1m`. An explicit `size:ctx-*` tag is the author's pin.

Alongside the tags, a sizing ADVISORY fires (never refuses — the cluster advisory is the precedent) when the `## Scope` section names an expected diff over `GYRUM_WARP_ADD_SIZING_MAX_LINES` (default 400): review rounds track diff size (warp#17118, ~1100 lines, took 14 paid review passes; warp#16632 took 5; warp#17334, 9 lines, took 1 pass in 25 minutes), so split into one-review-pass slices at filing time — discovering it at pass 9 costs days. Advisory prose prints at `--lint` and on interactive creates; non-interactive creates keep the warp#1254 bounded stderr budget and carry the result via the tags only. Bypass: `gyrum-warp add --file <path> --skip-sizing-advisory '<reason ≥ 20 chars>'`; bypasses append to `~/.gyrum/sizing_advisory_overrides_log` (aggregated by `gyrum-skip-audit`). `kind:epic` is exempt (tracked, not seated).

## Substrate routing — match work-shape to canonical substrate (warp#3029)

**Before filing, ask: does the work-shape match the canonical substrate?** Host bootstrap → `dark-factory/ansible/roles/`; operational ops → `dark-factory/playbooks/`; cross-repo reusable units → `gyrum-pipelines/blocks/`; supervisor/worker/queue-agent → `gyrum-labs/devtools`; warp API endpoints → `gyrum-labs/warp`; cross-cutting principles → `dark-factory/docs/decisions/` ADRs.

- The catch: `gyrum-warp add` runs a client-side substrate-routing check at file-time. The detector reads `~/.gyrum/devtools/lib/substrate-routing.yaml` (versioned rulebook), scores title+body against each rule's keyword bag, picks the highest-scoring rule over threshold. When the detected substrate disagrees with the declared `repo:`, gyrum-warp add warns to stderr and — in agent contexts — tags the create `substrate-routing-suggested-<shape>`.
- Override: `gyrum-warp add --file <path> --skip-substrate-routing-check '<reason ≥ 20 chars>'`; bypasses append to `~/.gyrum/substrate_routing_overrides_log`.
- The rulebook is checked-in, versioned, PR-reviewable. To refine a rule, edit `gyrum-labs/devtools/lib/substrate-routing.yaml` in `gyrum-labs/devtools` via the standard PR flow.

**Why:** The routing analysis is mechanical, not creative — given a work-shape there's a deterministic right answer. Trigger (2026-05-16): the agent drafting warp#3030 proposed a bash script; operator pushback "is there a pipeline?" forced a re-route to ansible role + install-spare.yml — 15 min of grep-the-tree. The gate catches the misroute at filing time.

## Portfolio gate — assign a strategic portfolio at epic creation (warp#8304)

**Before filing a `kind:epic`, pick its portfolio.** The portfolio is the FIXED strategic layer ABOVE the ~149 epics. The canonical vocabulary (six slugs) lives in `~/.gyrum/devtools/lib/portfolio-vocabulary.json` — the single source of truth, also read by `gyrum-roadmap` (the renderer) and `gyrum-portfolio-backfill`:

- `portfolio:factory-platform` — agent/playbook/quality engine + devtools
- `portfolio:factory-ui` — operator-facing surfaces (the frontend going online)
- `portfolio:warp-pm` — the work-coordination backend (this PM work)
- `portfolio:infra-consolidation` — Hetzner substrate · hosts · fleet · cost · secrets
- `portfolio:products` — the SaaS layer (factory-vs-product separation)
- `portfolio:aws-enablement` — deferred until a product needs it

- The catch: `gyrum-warp add` runs an author-time portfolio gate (beside the routing gate) on every `kind:epic` item. It requires exactly one valid `portfolio:<slug>` tag in the YAML frontmatter `tags:` list. Missing → refuse with the canonical list + a repo-inferred suggestion (`jobboard|daysout|pm-saas`→`products`; `warp|ai-research`→`warp-pm`; `devtools|gyrum-knowledge-base`→`factory-platform`; `dark-factory|gyrum-catalog`→`infra-consolidation`; `ai-frontend|gyrum-ui`→`factory-ui`). Unknown slug → refuse + suggest the closest canonical match. Two tags → refuse (exactly one). The gate runs in `gyrum-warp add --lint` too.
- Override: `gyrum-warp add --file <path> --skip-portfolio-gate '<reason ≥ 10 chars>'`, for genuinely cross-cutting epics that no single portfolio fits; the bypass is audited to stderr (same shape as `--skip-routing-gate`).
- The vocabulary is checked-in, versioned, PR-reviewable. To retune it, edit `gyrum-labs/devtools/lib/portfolio-vocabulary.json` in `gyrum-labs/devtools` via the standard PR flow; `gyrum-labs/devtools/test/portfolio-vocabulary.test.sh` pins its shape.

**Why:** Live audit (2026-06-16): 149 epics, ~50 fragmented `area:` tags, 88/149 epics (59%) ungroupable. The bottleneck shifted from "having tickets" to "deciding what to work on", but a roadmap view is noise without a consistent grouping, and a one-time backfill is out-paced by the fleet's epic churn. The fix is the SAME shape as the routing gate — assign the grouping at CREATION (fix the creator, not the backlog). `area:` stays as the drill-down level beneath the portfolio; nothing is deleted, only rolled up.

## Self-fix tag — patches that touch their own kill condition (warp#3014)

**When the ticket patches a kill threshold the supervisor uses against the agent** (lifeguard dead-threshold, per-supervisor cooldown, `WORKER_MAX_RUNTIME_SEC`), **tag it `self-fix:<component>`** so the supervisor relaxes that threshold for the cycle.

- The supervisor reads the tag at claim time and multiplies the relevant kill threshold by `LIFEGUARD_SELF_FIX_MULTIPLIER` (default `3`) — a 30-min kill becomes 90-min, enough headroom to ship the fix before the kill it patches fires.
- Recognised today: `self-fix:lifeguard`. Reserve `self-fix:cooldown`, `self-fix:max-runtime` for the supervisors that grow those gates. The bare `self-fix` tag is recognised for non-lifeguard kill conditions.
- Audit: every cycle logs `lifeguard_threshold_computed` to `~/.gyrum/queue-supervisor-v0/journal.jsonl` (default + effective threshold), so abuse is visible.

**Why:** Without the tag-and-relax dance, every autonomous fix to a kill condition has ~50% chance of being killed BY that condition mid-fix. Incident: 2026-05-16 fleet-spare-a was lifeguard-killed mid-warp#2976; the next cycle's claim on warp#3011 (the fix for that kill) was at the same risk. warp#3014 institutionalises the relaxation.

**How to apply:** `--add-tag self-fix:<component>` on `gyrum-warp add`/`gyrum-warp update`. Pair with the Layer-2 author-time gate: every new kill-style threshold (`*_DEAD_THRESHOLD_SEC` / `*_KILL_THRESHOLD_SEC` / `*_MAX_RUNTIME_SEC`) must be preceded by a `# self-fix-margin: <basis>` comment, enforced by `gyrum-validate-supervisor-config <file.sh>`.

## Reserving + reclaiming claims cooperatively (warp#4307)

**The 10-agent fleet auto-claims _unreserved_ Ready items within minutes.** If you `gyrum-warp add` a ticket you'll work yourself, reserve it to your label at file time (`reserved_for: <label>` / `--reserved <label>`) or claim instantly — else a fleet agent grabs it before you `gyrum-start-work` it. Don't file-then-wander.

To reclaim a ticket held by another agent on a **fresh, heartbeating** claim there is NO `--steal-from` / live-takeover verb (takeover only fires on a stale lease). Cooperative path — **every step below needs `--handover`**: the default `gyrum-warp cancel` sends warp#17310's `final: true`, which ends the item when its holder releases, so `claimed_by` never frees for you and step 2 cannot succeed:

1. `gyrum-warp cancel {id} --handover --reason "<why>"` (or `POST /api/v1/items/{id}/cancel` with no `final`) — sets `cancel_requested=true`, a cooperative STOP signal. Do NOT use the default `gyrum-warp cancel` here: it sends warp#17310's `final: true`, which ENDS the item when the holder releases instead of freeing it for you. Status stays `in_progress`; the holder sees the flag on its next heartbeat (≤5min) and releases. `/reopen` does NOT work here — it only accepts `done`/`cancelled`.
2. Still on the `--handover` path: poll `GET /api/v1/items/{id}` until `claimed_by` clears, then immediately `gyrum-warp claim {id} --force "<reason>"` (add `--allow-sibling-mismatch "<reason ≥30>"` on a sibling-token collision). You're racing the fleet's re-grab — claim in the same tick it frees.

**Why:** Operator (jon, 2026-05-25) — a self-filed, locally-verified fix was auto-claimed by a fleet agent that did zero work. `cancel_requested` → holder released on its next heartbeat (~3min) → the claim was won on the poll that saw it go `ready`. Without reserving up front, every file-then-work ticket is a race you can lose.

**How to apply:**
- Prefer prevention: `reserved_for` at file time for work you'll start now.
- Forcing over a still-active claim via `gyrum-complete-pr --admin` needs explicit per-PR operator authorization — the cooperative cancel-and-wait path is the default.
- zsh gotcha: `status` is a read-only special var — name the poll-loop variable something else (`st`) or run the loop under `bash -c`.

## Swarm an EPIC — governed activation boosts its children (warp#3051)

**Activating a `kind: epic` through `gyrum-warp swarm <epic>` is the "swarm this EPIC" verb:** the command uses the governed `POST /api/v1/items/{id}/activate` lifecycle route and verifies the read-back instead of writing `status` through generic PATCH. The resulting `in_progress` state lifts every open child up one effective-priority tier in the claim and ready queues, so the fleet picks the epic's children ahead of unrelated ready work — without any per-child `reserved_for` cascade. Reserve the EPIC's intent once by activating the parent; the boost follows the parent's status automatically. Reverse it through the governed lifecycle that moves the epic off `in_progress` (`done`/`blocked`).

How the boost behaves (server-side, `gyrum-labs/warp/api/internal/items/claim.go` — `epicChildPriorityBoostExpr`, spliced into the claim CTE `claimNextSQL` in `gyrum-labs/warp/api/internal/items/claim_next.go` and the supervisor ready-queue `listWithAffinitySQLTemplate` in `gyrum-labs/warp/api/internal/items/list.go`):

- **One tier, never more.** A child of an `in_progress` epic sorts as if one band higher (`low`→`med`, `med`→`high`, `high`→`urgent`), capped at `urgent`; never overflows the band.
- **Immediate parent only, in_progress only.** Fires only when the row's direct parent is a `kind: epic` that is `in_progress` and not soft-deleted. `done`/`blocked`/`cancelled`/non-epic parents never boost; top-level tickets never boost. No nesting — an EPIC-of-EPICs does not compound; exactly one tier (v1).
- **Anti-starvation: the boost ties, it does not jump.** A boosted `med` child reaches the same effective rank as an unboosted `high` non-child — ties fall through to the `created_at` tiebreak, so a genuinely-higher-priority unrelated ticket is never starved. The boost ranks BELOW the operator `next_up` pin and the `type: bug` elevation, ABOVE `created_at`.
- **Claim and ready agree.** The same tier is spliced into both paths, so the row `gyrum-warp ready` SHOWS next is the row a claim would PICK next.

**How to apply:** To converge the fleet on an Epic's sub-tickets, run `gyrum-warp swarm <epic>` as a programme owner rather than hand-reserving each child. The command keeps both reads on ordinary `WARP_TOKEN` and uses saved `WARP_APPROVE_TOKEN` (or `WARP_ADMIN_TOKEN` as fallback) only for the activation POST; run `gyrum-warp set-token` if no operator token is saved. It refuses non-Epics and blocked/terminal Epics, treats an already-active Epic as success, and only reports a new activation after Warp's read-back is `in_progress`. Don't reach for the per-child `reserved_for` cascade the boost replaces. The boost honours the priority children already carry — a low-priority swarm won't outrank genuinely urgent independent tickets.
