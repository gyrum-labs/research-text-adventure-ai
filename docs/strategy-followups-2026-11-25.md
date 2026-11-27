# The context-strategy signal: replication, generalization, cross-model

> Recorded under the limits as they were before 25 November 2026: 20 turns, 30,000 tokens and
> 300 output tokens per request, with a guard that ended a run on its third unchanged turn.
> Not to be pooled with any result recorded under the current limits (`SPEC.md` 11.2, warp#23474).

warp#23409 · follow-up to warp#23366 (roadmap step six, EPIC warp#22704) ·
recorded 2026-11-25 at revision `1480db6`, and read here from the record that
survived

## The question

The first comparison could not say which context helps: no context solved in
three seeds (`strategy-comparison-2026-11-24.md`). Three experiments ask more.
Does anything hold at ten seeds, on a second world, and under a second model?

All three were recorded on source revision `1480db6` with the limits as they
then were: 20 turns, 30,000 tokens, 300 output tokens per request, 120
seconds, and a loop guard that ended a run on its third turn in an unchanged
state. Each experiment changes one thing against the first comparison. The
plans show it: the generalization arms differ only in the world, and the
cross-model arms only in the model and its prices.

### A note on the record

A first recording of these experiments was lost on 24 November. An earlier
version of this document described it and has been withdrawn. The batch was
recorded again on 25 November and kept in two places. Every number below is
read from that record, each run from its own transcript. A total of $0.240893
was spent on the fourteen arms.

## Experiment B: replication at ten seeds

Same world, model and limits as the first comparison. Seeds 1 to 10 in each
arm. Seeds 1 to 3 are new runs, so that repeatability could be checked.

| Context | How the ten runs ended | Solved | Wilson 95% | Turns with no command | Spend |
|---|---|---|---|---|---|
| none | loop guard ×10 | **0 / 10** | 0.00 to 0.28 | 11 of 111 (10 per cent) | $0.007191 |
| full | token ceiling ×9, loop guard ×1 | **0 / 10** | 0.00 to 0.28 | 16 of 133 (12 per cent) | $0.029726 |
| window | token ceiling ×9, loop guard ×1 | **0 / 10** | 0.00 to 0.28 | 10 of 147 (7 per cent) | $0.028210 |
| structured | loop guard ×7, out of turns ×3 | **0 / 10** | 0.00 to 0.28 | 3 of 168 (2 per cent) | $0.017892 |
| map | parse errors ×4, loop guard ×5, solved ×1 | **1 / 10** | 0.02 to 0.40 | 5 of 109 (5 per cent) | $0.011830 |

Total spend $0.094849. The longest run took 17.8 seconds of its 120.

**Did anything replicate?** Nothing to replicate was found. The planned
comparison, the notepad against the structured context, is 1/10 against 0/10,
Fisher two-sided p = 1.00. The one solve was seed 7, in 17 turns.

**What the runs were doing when they ended:**

- `none`: every run was ended by the loop guard, between turns 4 and 17.
- `full` and `window`: nine runs in ten reached the 30,000-token ceiling,
  between turns 12 and 15.
- `structured`: seven were ended by the loop guard and three ran out of turns.
- `map`: four runs ended repeating `read incident ticket`, a command the world
  refused while the ticket was carried. Five were ended by the loop guard on
  turn 5, after examining the ticket they were holding.

### Repeatability, run by run (seeds 1 to 3, first comparison against this one)

| Context | First comparison | Replication | Same ending |
|---|---|---|---|
| full | token ceiling ×3 | token ceiling ×3 | 3 / 3 |
| window | token ceiling, loop guard, token ceiling | token ceiling ×3 | 2 / 3 |
| none | loop guard ×3 | loop guard ×3 | 3 / 3 |
| structured | loop guard ×3 | out of turns, loop guard, loop guard | 2 / 3 |
| map | parse errors ×2, loop guard | parse errors, loop guard, parse errors | 1 / 3 |

Eleven of fifteen runs ended the same way. Four did not. Same code, same seed,
same context, a different ending: the seed fixes the world and not the model,
and temperature 0 does not make a provider repeat itself. Only rates carry
meaning, and a rate from ten runs is a wide interval.

## Experiment C: the second world

mission-impossible at 1.0.3, deepseek-v4-flash, seeds 1 to 10, the notepad
against the structured context.

| Context | How the ten runs ended | Solved | Turns the world would not take | Spend |
|---|---|---|---|---|
| structured | out of turns ×7, loop guard ×2, parse errors ×1 | **0 / 10** | 69 of 179 | $0.018621 |
| map | out of turns ×7, parse errors ×2, loop guard ×1 | **0 / 10** | 72 of 185 | $0.022211 |

Fisher two-sided p = 1.00. Total spend $0.040832. The longest run took 19.8
seconds.

**Determination: cannot be made from this record.** Both arms sit at the
floor, and a comparison at the floor cannot show a difference.

**Why the floor is where it is.** Of the turns the world would not take, 123 of
141 were `read defusal manual` or `read manual`. Each time the world answered
"You can't see anything called 'defusal manual' here" while the agent was
holding it. The mission needs the manual read, and the manual is carried when
it is read. That refusal was false, the same defect as the hotfix world's
ticket.

**After the fix, recorded separately.** PR #51 made a carried thing readable.
On 2026-11-25 the same arms were recorded again on the fixed code, with the
limits as they were: the notepad solved 10 of 10, in 12 to 14 turns, and the
structured context 3 of 10, in 13 to 15 turns. Those runs are a different
recording and are not pooled with the table above. They are told apart by
source revision, `1480db6` against `7dea3fc`, because the world's version
number did not move when its rules changed. That is a defect of labelling in
PR #51, and it is to be put right.

## Experiment D: a second model

z-ai/glm-5.3-flash on hotfix-2-4-1 at 1.0.5, the notepad against the
structured context, seeds 1 to 10.

| Context | How the ten runs ended | Solved | Wilson 95% | Turns with no command | Spend |
|---|---|---|---|---|---|
| structured | out of turns ×8, solved ×2 | **2 / 10** | 0.06 to 0.51 | 71 of 194 (37 per cent) | $0.043208 |
| map | solved ×8, out of turns ×2 | **8 / 10** | 0.49 to 0.94 | 33 of 157 (21 per cent) | $0.032905 |

Total spend $0.076113. The longest run took 48.6 seconds. No run in either arm
was ended by the loop guard. Every notepad solve took 12 turns. Fisher
two-sided p = 0.023. Pooled over both models, the notepad is 9/20 against the
structured context's 2/20, p = 0.031.

### This result is withdrawn as a claim about the contexts

It is reported because it was measured, and it cannot be read as it stands.
The model reasons before it answers, and the 300-token output cap paid for
that reasoning first. In the structured arm 37 per cent of turns came back
with no command at all, and in the notepad arm 21 per cent. So the comparison
measured how often each context made the model think past 300 tokens.

On 2026-11-25, with the cap alone raised to 1,500 on the next world version,
the same seeds gave the structured context 10 of 10, in 16 to 17 turns, and the
notepad 8 of 10, in 14 to 16 turns, Fisher p = 0.47. That is a diagnostic of
twenty runs, recorded separately and not pooled with anything. The direction
is gone. Whether the notepad helps this model is an open question again, to be
measured under the new limits.

**The turn-5 freeze did not appear here.** This model, reading the same
notepad, was never ended by the loop guard. Its failures were the cap, and a
few runs that repeated `read incident ticket` into the same false refusal.

## What stands, and what is open

- Stands: on this world, with this model, at these limits, the long contexts
  (`full`, `window`) spend their tokens by turn 15 and the short ones are
  ended by the loop guard. A carried thing could not be read, and that cost
  both worlds runs.
- Open: whether any context is better than another. The runner's output cap
  and loop guard spend a run's budget before the contexts can be told apart.
  The owner has decided on new limits (25 turns, 40,000 tokens, 3,000 output
  tokens per request with a retry, and a guard that records but does not end a
  run). The page arms will be recorded again under them.

## Acceptance, checked against the records

| Criterion | Evidence |
|---|---|
| Replication recorded | five contexts at ten seeds on hotfix-2-4-1 at 1.0.5, revision `1480db6`; seeds 1 to 3 are new transcripts in `v2-strategy10-*` |
| Second world recorded | both contexts on mission-impossible at 1.0.3, ten seeds each; both at 0/10; the determination is that it cannot be made from this record, grounded in the counts |
| Second model recorded | z-ai/glm-5.3-flash on hotfix-2-4-1 at 1.0.5, both contexts, ten seeds each |
| One change per experiment | plan diffs: the second-world arms differ only in the world, the second-model arms only in the model and its prices, with timestamps in both |
| No retries | B has 50 planned cells and 50 transcripts, C has 20 and 20, D has 20 and 20; with the first comparison that is 105 and 105, and each transcript has exactly one metrics record |
| Repeatability shown | the run-by-run table, with the four mismatches left visible |
| Scorecards claim what was measured | rates with intervals; the planned comparisons with their p-values; the second-model result reported and then withdrawn, with the reason |
| The clock recorded | a `wallClockMs` in every metrics record; the longest runs are 17.8 s in B, 19.8 s in C and 48.6 s in D, against 120 s |
| Can be checked again | every count above recomputes from the ledgers and transcripts named here |
