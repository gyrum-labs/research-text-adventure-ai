# Context strategies on the fixed engine, like for like

warp#23366 · roadmap step six (EPIC warp#22704) · run 2026-11-24, re-run 2026-11-25 on the fixed strategy

## The question

Operators could not tell whether an agent's failures came from what the model
knew or from what it was shown: every recorded run so far read the same
structured context, and the map-and-ledger notepad existed only as an
unmerged branch with no comparison behind it.

## The experiment

One variable — the context strategy the agent reads — on everything else
held fixed. Recorded plans, ledgers, and transcripts live under
`runs/v2-strategy-<name>/` on the operator's workstation.

A first batch (three seeds per arm) ran on 2026-11-24 against a strategy
that kept a stale lock status on the map: an exit seen locked and then
opened stayed listed both ways. That violated the notepad's own promise and
sat on this world's critical path, so the strategy was fixed and the whole
comparison was re-run on the fixed code. **This scorecard reports the
re-run.** The first batch stays on disk as recorded history, superseded.

| Fixed | Value |
|---|---|
| World | hotfix-2-4-1 @ 1.0.5 (every plan) |
| Seeds | 1, 2, 3 (every plan: identical cells) |
| Model | openrouter/deepseek/deepseek-v4-flash, temperature 0 |
| Caps | 20 turns / 30,000 tokens / 300 output per request / 120s per run |
| Source revision | `1480db6` (every plan — the fixed strategy) |
| Prices | 0.09 in / 0.18 out per million (identical rates in every plan) |

Verified from the plans: the only differing fields between arms are
`strategy`, its derived `promptHash`, the fetch timestamp on the price
evidence, and `createdAt`.

## The scorecard — claims only what was measured

| Strategy | Seed 1 | Seed 2 | Seed 3 | Solved | Turns | Tokens | Spend |
|---|---|---|---|---|---|---|---|
| none | loop (5) | loop (4) | out of turns (13) | **0 / 3** | 4–13 | 2k–11k | $0.001581 |
| full | tokens (12) | tokens (13) | tokens (12) | **0 / 3** | 12–13 | 31k–35k | $0.008962 |
| window | tokens (13) | tokens (13) | tokens (14) | **0 / 3** | 13–14 | 31k–32k | $0.008710 |
| structured | loop (19) | out of turns (18) | loop (11) | **0 / 3** | 11–19 | 12k–25k | $0.005591 |
| map | out of turns (15) | out of turns (14) | **success (14)** | **1 / 3** | 14–15 | 20k–24k | $0.006163 |

Total spend: **$0.031007**. Every run stayed inside its 120s wall clock
(longest 20.1s); the clock never bound, and cost never appeared as a
constraint.

- `tokens` = the run used its 30,000-token ceiling; `loop` = the loop guard
  stopped a repeated state; `out of turns` = the run spent its turns without
  the loop guard firing.

## What the scorecard says — and does not

- On this world, with this model, at three seeds each, **the map-and-ledger
  arm is the only one that solved the mission** (seed 3, 14 turns). Every
  other arm scored 0 of 3.
- `none` loops quickly with nothing to remember by; `full` and `window`
  burn their token ceiling on long contexts every time; `structured`
  splits between looping and running out of turns.
- **Three seeds cannot establish significance.** One success in three
  against zero in twelve is a signal, not a verdict. This scorecard claims
  nothing about other worlds, other models, other seeds, or other caps.
- Nothing was retried: every planned cell ran exactly once and its recorded
  outcome stands.
- The re-run reproduced the first batch's shape (map one of three, the rest
  zero of three) on the fixed strategy. The ten-seed replication and the
  generalization and cross-model checks are recorded in
  `strategy-followups-2026-11-25.md`.

## Acceptance, checked against the records

| Criterion | Evidence |
|---|---|
| AC1 world pin | every `plan.json` → `worldVersions` = hotfix-2-4-1 @ 1.0.5 |
| AC2 single variable | pairwise plan diff → only `strategy` (+ derived `promptHash`, timestamps) |
| AC3 shipped strategies | none, full, window, structured each have 3 recorded runs |
| AC4 notepad arm | map has 3 recorded runs under the same pin, seeds, caps |
| AC5 nothing retried | 15 planned cells, 15 transcripts, one metrics record each |
| AC6 scorecard restraint | the section above claims only the measured cells |
| AC7 wall clock binds | every run ≤ 20.1s of its 120s; each transcript's `metrics` record carries `wallClockMs`; the runner's enforcement is tested in `tests/runner/budgets.test.ts` |
| AC8 operator can attribute | the table answers per strategy from the ledgers alone |

To re-verify the wall-clock claim from the records: every transcript ends in
a `metrics` record whose `wallClockMs` is below 120000.
