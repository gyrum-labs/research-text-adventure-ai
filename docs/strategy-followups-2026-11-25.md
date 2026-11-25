# The context-strategy signal: replication, generalization, cross-model

warp#23409 · follow-up to warp#23366 (roadmap step six, EPIC warp#22704) · run 2026-11-25

## The question

The first comparison found the map-and-ledger notepad was the only arm to
solve the hotfix mission, one run in three. Its own scorecard called that a
signal. Three experiments ask whether the signal holds, where its edges are,
and whether it belongs to the context or to one model's pairing with it.

All three ran on source revision `1480db6` (the fixed strategy), on the
operator's workstation, with recorded plans, ledgers, and transcripts under
`runs/v2-*`. Every experiment changes exactly one variable against the
first comparison.

## Experiment B — replication at ten seeds

Same world, model, and caps as the first comparison; seeds 1–10 per arm.
Seeds 1–3 were re-run as fresh runs so reproducibility could be checked.

| Strategy | Outcomes (seeds 1–10) | Solved | Wilson 95% | Spend |
|---|---|---|---|---|
| none | loop ×9, out of turns ×1 | **0 / 10** | 0.00 – 0.28 | $0.005014 |
| full | tokens ×10 | **0 / 10** | 0.00 – 0.28 | $0.029594 |
| window | tokens ×10 | **0 / 10** | 0.00 – 0.28 | $0.029533 |
| structured | loop ×9, **success** ×1 | **1 / 10** | 0.02 – 0.40 | $0.017981 |
| map | **success ×3**, loop ×6, out of turns ×1 | **3 / 10** | 0.11 – 0.60 | $0.012400 |

Total spend $0.094522; longest run 32.0s of its 120s.

**Did the signal replicate?** Directionally, yes: the notepad remains the
arm with the most solves, and the three arms that never solved before still
never solved. But the planned comparison — map against the structured
baseline — is **not statistically established**: 3/10 against 1/10, Fisher
two-sided p = 0.58, with overlapping intervals. The first comparison's
"only arm to solve" did not survive: structured solved once here.

Exploratory, and flagged as post-hoc: against the three arms that never
solve, pooled (0/30), the notepad's 3/10 gives p = 0.012. That comparison
was not planned and pools arms after seeing the data.

**A failure mode the first batch hid.** Five of the notepad's ten runs
looped on turn 5, after about 4,500 tokens: the agent reads the map and
repeats a command almost immediately. The arm is bimodal — it solves, it
runs out of turns, or it stalls at once — rather than uniformly stronger.

### Reproducibility, run by run (seeds 1–3, first comparison vs replication)

| Strategy | First comparison | Replication | Same outcome class |
|---|---|---|---|
| full | tokens, tokens, tokens | tokens, tokens, tokens | 3 / 3 |
| window | tokens, tokens, tokens | tokens, tokens, tokens | 3 / 3 |
| none | loop, loop, out of turns | loop, loop, loop | 2 / 3 |
| structured | loop, out of turns, loop | loop, loop, loop | 2 / 3 |
| map | out of turns, out of turns, success | loop, loop, success | 1 / 3 |

**Individual runs do not reproduce.** Same code, same seed, same strategy,
different outcome — most sharply for the notepad. Temperature 0 does not
make the provider deterministic across calls, and the seed fixes the world,
not the model. Runs are samples, not fixtures; only rates carry meaning, and
a rate from ten runs is still a wide interval.

## Experiment C — generalization to the second world

mission-impossible @ 1.0.3, deepseek-v4-flash, seeds 1–10, structured
against map, everything else as before.

| Strategy | Outcomes | Solved | Spend |
|---|---|---|---|
| structured | out of turns ×9, **success** ×1 | **1 / 10** | $0.019064 |
| map | out of turns ×10 | **0 / 10** | $0.023155 |

Fisher two-sided p = 1.00. **Determination: does not matter** — measurably.

**The caveat that limits this finding.** The ticket described this as the
world where the baseline already succeeds. That held for
deepseek/deepseek-chat, which solved it eight to nine times in ten in the
earlier batches. It does not hold for deepseek-v4-flash, which solved it
once in ten here. Both arms sit at the floor under this model, and a
comparison at the floor cannot show a difference that would appear at a
higher solve rate. The honest result is "no measurable effect under a model
that rarely solves this world" — not "the notepad does not generalize." A
model that solves mission-impossible reliably is needed to test that.

## Experiment D — cross-model check

z-ai/glm-5.3-flash on hotfix-2-4-1 @ 1.0.5, structured against map, seeds
1–10 — a different model from the first comparison, everything else as before.

| Strategy | Outcomes (seeds 1–10) | Solved | Wilson 95% |
|---|---|---|---|
| structured | out of turns ×8, **success** ×2 | **2 / 10** | 0.06 – 0.51 |
| map | out of turns ×4, **success ×6** | **6 / 10** | 0.31 – 0.83 |

Spend $0.080875. Neither arm looped once: every run solved or ran out of
turns.

**Does the effect belong to the context or to one model's pairing with
it?** To the context. Under a second model the notepad is again the better
arm, by a wider margin than under the first (6/10 against 2/10, where the
first model gave 3/10 against 1/10). On its own this comparison is still
short of conventional significance (Fisher two-sided p = 0.17) at ten seeds.

Pooled across both models — notepad 9/20 against baseline 3/20, the same
direction in both — Fisher two-sided p = 0.08. That is the closest the
programme comes to a statistical claim, and it is still short of 0.05; it is
reported as a consistent direction across two models, not as proof.

**The freeze did not appear here.** GLM, reading the same notepad, never
looped; its failures were runs out of turns. The turn-5 freeze is a
behaviour of one model reading this notepad, not of the notepad alone. The
notepad's gaps that sit behind it are real and are set out in
`notepad-field-notes.md`.

## Acceptance, checked against the records

| Criterion | Evidence |
|---|---|
| 1 replication coverage | 5 arms × 10 distinct seeds on hotfix-2-4-1 @ 1.0.5; seeds 1–3 are fresh transcripts in `runs/v2-strategy10-*`, not copies |
| 2 generalization coverage | both arms on mission-impossible @ 1.0.3; the record shows the baseline at 1/10, and the determination is one of the three, grounded in counts |
| 3 cross-model coverage | z-ai/glm-5.3-flash on hotfix-2-4-1 @ 1.0.5, both arms, ten seeds each; the model differs from warp#23366's in the one field the plan diff shows |
| 4 one-variable rule | B differs from the first comparison only in seed count; C only in world; D only in model — each plan diff shows the single field |
| 5 no retries | B: 50 planned cells, 50 transcripts; C: 20 and 20; no discarded or re-attempted run |
| 6 every run recorded | each transcript header carries strategy, model, world, version, seed; its metrics record the outcome; scorecard counts equal a recount |
| 7 reproducibility built in | the table above, run by run; mismatches surfaced, not smoothed |
| 8 scorecards claim only what was measured | rates given with intervals; the planned comparison reported as not established; the pooled comparison flagged exploratory |
| 9 wall clock recorded | per-run `wallClockMs` in every metrics record; longest B run 32.0s, C run 27.2s |
| 10 independent verifiability | every count above recomputes from the ledgers and transcripts named here |
