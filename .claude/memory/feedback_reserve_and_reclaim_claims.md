---
name: reserve-and-reclaim-claims
description: The fleet auto-claims unreserved Ready warp items within minutes — reserve a ticket to your label before working it; reclaim a live claim via POST /cancel (cooperative stop) then poll-and-claim
metadata:
  type: feedback
---
The 10-agent fleet auto-claims **unreserved** Ready warp items within minutes. If you `gyrum-warp add` a ticket you intend to work yourself, reserve it to your label at file time (`reserved_for`) or claim it instantly — else a fleet agent grabs it before you `gyrum-start-work` it.

To reclaim a ticket held by another agent on a fresh, heartbeating claim there is NO `--steal-from` / live-takeover verb (takeover only fires on a stale lease). Use the cooperative path:

1. `gyrum-warp cancel {id} --handover --reason "<why>"` (or `POST /api/v1/items/{id}/cancel` with no `final`) — sets `cancel_requested=true`, a cooperative STOP signal. The DEFAULT `gyrum-warp cancel` sends warp#17310's `final: true`, which ends the item when the holder releases instead of freeing it for you (warp#17312) (status stays `in_progress`; the holder releases on its next heartbeat ≤5min). `/reopen` does NOT work here — it only accepts `done`/`cancelled`.
2. Still on the `--handover` path: poll `GET /api/v1/items/{id}` until `claimed_by` clears, then immediately `gyrum-warp claim {id} --force "<reason>"` (add `--allow-sibling-mismatch "<reason ≥30>"` on a sibling-token collision). You're racing the fleet's re-grab — claim in the same tick it frees.

**Why:** Operator (jon, 2026-05-25) — a self-filed, locally-verified fix was auto-claimed by a fleet agent that did zero work. `cancel_requested` → the holder released on its next heartbeat (~3min) → the claim was won on the poll that saw it go `ready`. Without reserving up front, every file-then-work ticket is a race that can be lost.

**How to apply:**
- Prefer prevention: `reserved_for` at file time for work you'll start now.
- Forcing over a still-active claim via `gyrum-complete-pr --admin` needs explicit per-PR operator authorization — the cooperative cancel-and-wait path is the default.
- zsh gotcha: `status` is a read-only special var — name the poll-loop variable something else (`st`) or run the loop under `bash -c`. Canonical rule lives in `CLAUDE-warp-section.md` — keep both surfaces in sync.
