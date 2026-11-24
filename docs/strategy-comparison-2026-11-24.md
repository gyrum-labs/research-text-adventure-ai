# Context strategies on the fixed engine, like for like

warp#23366 · roadmap step six (EPIC warp#22704) · run 2026-11-24

## The question

Operators could not tell whether an agent's failures came from what the model
knew or from what it was shown: every recorded run so far read the same
structured context, and the map-and-ledger notepad existed only as an
unmerged branch with no comparison behind it.

## The experiment

One variable — the context strategy the agent reads — on everything else
held fixed. Recorded plans, ledgers, and transcripts live under
`runs/strategy-<name>/` on the operator's workstation.

| Fixed | Value |
|---|---|
| World | hotfix-2-4-1 @ 1.0.5 (every plan) |
| Seeds | 1, 2, 3 (every plan: identical cells) |
| Model | openrouter/deepseek/deepseek-v4-flash, temperature 0 |
| Caps | 20 turns / 30,000 tokens / 300 output per request / 120s per run |
| Source revision | `2076fd4` (every plan) |
| Prices | 0.09 in / 0.18 out per million (identical rates in every plan) |

Verified from the plans: the only differing fields between arms are
`strategy`, its derived `promptHash`, the fetch timestamp on the price
evidence, and `createdAt`.

## The scorecard — claims only what was measured

| Strategy | Seed 1 | Seed 2 | Seed 3 | Solved | Turns | Tokens | Spend |
|---|---|---|---|---|---|---|---|
| none | loop (14) | loop (11) | loop (5) | **0 / 3** | 5–14 | 3k–11k | $0.002031 |
| full | tokens (12) | tokens (13) | tokens (12) | **0 / 3** | 12–13 | 31k–33k | $0.008716 |
| window | tokens (15) | tokens (15) | tokens (13) | **0 / 3** | 13–15 | 30k–32k | $0.008686 |
| structured | tokens (16) | loop (11) | loop (11) | **0 / 3** | 11–16 | 12k–25k | $0.004720 |
| map | **success (14)** | loop (15) | tokens (14) | **1 / 3** | 14–15 | 18k–28k | $0.006122 |

Total spend: **$0.030275**. Every run stayed under its 120s wall clock
(longest 20.6s); the clock never bound, and cost never appeared as a
constraint.

- `tokens` = the run used its 30,000-token ceiling; `loop` = the loop guard
  stopped a repeated state.

## What the scorecard says — and does not

- On this world, with this model, at three seeds each, **the map-and-ledger
  arm is the only one that solved the mission** (seed 1, 14 turns, 19,124
  tokens). Every other arm scored 0 of 3.
- Each of `none`, `full`, and `window` failed the same way on all three seeds:
  `none` loops quickly with nothing to remember by; `full` and `window`
  burn their token ceiling on long contexts. `structured` split between
  burning and looping.
- **Three seeds cannot establish significance.** One success in three versus
  zero in twelve is a signal, not a verdict. This scorecard claims nothing
  about other worlds, other models, other seeds, or other caps, and nothing
  about what would happen with more runs.
- Nothing was retried: every planned cell ran exactly once and its recorded
  outcome stands.

## Acceptance, checked against the records

| Criterion | Evidence |
|---|---|
| AC1 world pin | every `plan.json` → `worldVersions` = hotfix-2-4-1 @ 1.0.5 |
| AC2 single variable | pairwise plan diff → only `strategy` (+ derived `promptHash`, timestamps) |
| AC3 shipped strategies | none, full, window, structured each have 3 recorded runs |
| AC4 notepad arm | map has 3 recorded runs under the same pin, seeds, caps |
| AC5 nothing retried | 15 planned cells, 15 transcripts, one metrics record each |
| AC6 scorecard restraint | the section above claims only the measured cells |
| AC7 wall clock binds | every run ≤ 20.6s of its 120s; cost never binding |
| AC8 operator can attribute | the table answers per strategy from the ledgers alone |
