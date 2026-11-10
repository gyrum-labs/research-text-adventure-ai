---
name: Claims require a session identity — never send only a bare machine label
description: warp#12224 refuses a claim whose agent is a bare machine label (no -- session suffix) equal to the token's own label; always derive a session identity (machine--session) via warp_agent_name, or send a distinct supervisor label
metadata:
  type: feedback
---
The warp claim server (`api/internal/httpapi/claimsrv/claimsrv.go`) refuses a claim when the effective agent is a bare machine label (no `--` session suffix) that equals the token's own base label (e.g. `jon-laptop`). It returns **400 `agent_name_is_bare_label`** (warp#12224).

**Why:** warp#11496 only refused `agent_name == label` when BOTH were supplied; a caller sending only `body.Label` (no `agent_name`) got that bare label promoted into the agent slot via warp#3198, skipping the check. A bare `jon-laptop` then slipped through as `claimer_agent`, making every session on that machine share one identity — the root of the repeated "claimed by jon-laptop, not this session (zoe)" claim collisions / claim-hoarding (seen on warp#12217, 12224).

**How to apply:**
- Always claim with a **session identity**: `agent_name="machine--session"` (e.g. `jon-laptop--otter-rustle-bobcat`), which `warp_agent_name` derives. Do not send only `body.Label`.
- A **distinct supervisor label** (e.g. `supervisor-b` != the token's own label) is still accepted — that is the legitimate warp#3198 multi-supervisor promotion.
- Exempt from the guard: an explicit `agent_name` (same-actor re-claim, reserved-label match) and operator `force` claims.
- The guard is `!force && agent_name=="" && agent != "" && agent == actor && !strings.Contains(agent, "--")` — it compares against the token's ORIGINAL base label (`actor`), not `claimActor` (which `applyReservationLabel`/`applyForceLabelOverride` may swap to a reservation/force label).
- If you see `agent_name_is_bare_label`, you sent a bare label equal to the token's own label — derive a session identity via `warp_agent_name` and retry.
