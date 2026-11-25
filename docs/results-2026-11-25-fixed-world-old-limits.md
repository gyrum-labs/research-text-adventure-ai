# The page game on the fixed world: the last recording under the old limits

> Recorded under the limits as they were before 25 November 2026: 20 turns, 30,000 tokens and
> 300 output tokens per request, with a guard that ended a run on its third unchanged turn.
> Not to be pooled with any result recorded under the current limits (`SPEC.md` 11.2, warp#23474).

Recorded on 25 November 2026, from 11:22 to 11:58. 105 runs, $0.2612. Every
number is read from the records by the operator's reader, and the records are
kept in two places.

## What was recorded, and on what

The same 105 runs as the recording of 24 and 25 November on world 1.0.5 (see
`strategy-comparison-2026-11-24.md` and `strategy-followups-2026-11-25.md`),
run again on the fixed code, after PR #51 made a carried thing readable and
the engine's refusals true.

| Fixed | Value |
|---|---|
| Source | `7dea3fc`: the fix (`d9a74db`) merged with the strategy branch as it was pushed |
| Worlds | hotfix-2-4-1 at 1.0.6. mission-impossible at 1.0.3: its rules changed with the fix, and its number did not move |
| Models | deepseek-v4-flash everywhere. glm-5.3-flash in the cross-model arms |
| Limits | as they were: 20 turns, 30,000 tokens, 300 output tokens per request, 120 seconds |
| The guard | ends a run on its third turn in an unchanged state |

Nothing here is pooled with the earlier recording. Each table sets the two
side by side, by world version. In brackets after a rate is its Wilson 95 per
cent interval.

## The ten-seed arms, side by side

### hotfix-2-4-1

| Model | Context | World 1.0.5 | World 1.0.6 | How the 1.0.6 runs ended |
|---|---|---|---|---|
| DeepSeek | none | 0/10 | 0/10 (0.00 to 0.28) | guard 10 |
| DeepSeek | full | 0/10 | 0/10 (0.00 to 0.28) | token ceiling 10 |
| DeepSeek | window | 0/10 | 0/10 (0.00 to 0.28) | token ceiling 8, guard 2 |
| DeepSeek | structured | 0/10 | 0/10 (0.00 to 0.28) | out of turns 7, guard 3 |
| DeepSeek | map, the notepad | 1/10 | 0/10 (0.00 to 0.28) | guard 9, out of turns 1 |
| GLM | structured | 2/10 | 1/10 (0.02 to 0.40) | out of turns 8, guard 1 |
| GLM | map, the notepad | 8/10 | 5/10 (0.24 to 0.76) | solved in 16 to 17 turns, out of turns 5 |

"Guard" is the loop guard. "Token ceiling" is the 30,000 tokens. "Out of
turns" is the 20 turns. Notepad against structured on 1.0.6: DeepSeek 0/10
against 0/10, p = 1.00. GLM 5/10 against 1/10, p = 0.14.

### mission-impossible

| Model | Context | Before the fix | After the fix | Turns to solve | How the others ended |
|---|---|---|---|---|---|
| DeepSeek | map, the notepad | 0/10 | **10/10** (0.72 to 1.00) | 12 to 14 | none |
| DeepSeek | structured | 0/10 | 3/10 (0.11 to 0.60) | 13, 15, 15 | guard 5, out of turns 2 |

Notepad against structured on the fixed world: 10/10 against 3/10, Fisher
two-sided p = 0.003.

## The three-seed arms, hotfix-2-4-1

No context solved in three seeds, on either world version.

| Context | World 1.0.5 | World 1.0.6 |
|---|---|---|
| none | guard 3 | guard 3 |
| full | token ceiling 3 | token ceiling 3 |
| window | token ceiling 2, guard 1 | token ceiling 2, guard 1 |
| structured | guard 3 | guard 2, out of turns 1 |
| map, the notepad | parse errors 2, guard 1 | out of turns 2, guard 1 |

## What the fix changed

**The ticket is no longer where the runs stop.** On 1.0.5 four of ten notepad
runs, and two of three in the first comparison, ended repeating `read
incident ticket` into a refusal that was false. On 1.0.6 no run ends that
way. In the notepad arm the five turn-5 freezes are gone as well. The runs get
further: when the guard ends them they have a median of 6 turns left, against
14 before.

**On the hotfix world the solve count did not move.** DeepSeek solved nothing
under any context, as before. GLM's notepad arm went from 8/10 to 5/10 (p =
0.35), with 27 per cent of its turns lost to the output cap. Ten runs cannot
say whether that is the fix, the cap, or chance.

**On the other world it moved everything.** mission-impossible went from 0/10
to 10/10 with the notepad. The reason is in the earlier record. The mission
needs its manual read, the manual is carried when it is read, and the old
world said it could not be seen. Of 141 turns the old world refused, 123 were
that one request. With the truth told, this model solves the mission every
time with the notepad, and three times in ten without it.

## What the fix did not change: two rules of the runner

**The loop guard** ended these runs, of ten. DeepSeek on hotfix: none 10, map
9, structured 3, window 2, full 0. DeepSeek on mission-impossible:
structured 5. In one notepad run (seed 3) the agent had deployed the hotfix,
had been told at the gate "The release gate is shut. It wants the incident
ticket.", examined the gate, and the run was ended with ten turns left.

**The output cap** took these turns, of all the turns in the arm. GLM
structured 82 of 191 (43 per cent). GLM notepad 52 of 196 (27 per cent).
DeepSeek between 9 and 23 per cent on these arms, mostly more than on 1.0.5.
A turn is taken when the reply arrives with no content because the reasoning
used all 300 tokens.

## The turn cap

Of 21 hotfix runs in the ten-seed arms that used all 20 turns, 19 had one of
the two objectives done, and 19 were still changing the world in their last
three turns.

## A diagnostic, recorded apart: the cap alone

Twenty runs, same seeds, same world and code, the cap alone raised from 300 to
1,500. GLM, hotfix-2-4-1 at 1.0.6. Kept in `runs/diag-cap1500-glm-*` and never
pooled with the tables above.

| Context | Cap 300 | Cap 1,500 | Turns to solve | Turns with no command |
|---|---|---|---|---|
| structured | 1/10 | **10/10** | 16 to 17 | 1 of 177 |
| map, the notepad | 5/10 | 8/10 | 14 to 16 | 0 of 162 |

Notepad against structured at cap 1,500: 8/10 against 10/10, p = 0.47.

## The reading, restrained

1. A false refusal cost both worlds runs. Removing it opened one of them
   completely, for one model with one context.
2. The page game's numbers for a model that thinks before it answers are
   numbers about the output cap. "The notepad is better for GLM", read from
   the earlier record, does not survive a cap that fits.
3. The guard and the turn cap between them decide most endings for the other
   model. What that model can do with twenty-five turns and no guard is not
   known. It is to be recorded under the new limits (warp#23474).

## Spend

This recording, $0.2612. The diagnostic, $0.0736. Both booked in the ledger.
