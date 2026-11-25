# Context strategies on the fixed engine, like for like

> Recorded under the limits as they were before 25 November 2026: 20 turns, 30,000 tokens and
> 300 output tokens per request, with a guard that ended a run on its third unchanged turn.
> Not to be pooled with any result recorded under the current limits (`SPEC.md` 11.2, warp#23474).

warp#23366 · roadmap step six (EPIC warp#22704) · recorded 2026-11-25 at
revision `1480db6`, and read here from the record that survived

## The question

Operators could not tell whether an agent's failure came from what the model
knew or from what it was shown. Every recorded run had read the same
structured context, and the notepad existed only as an unmerged branch with no
comparison behind it.

## The experiment

One variable, the context the agent reads, with everything else held fixed.

| Fixed | Value |
|---|---|
| World | hotfix-2-4-1 at 1.0.5 |
| Seeds | 1, 2, 3 |
| Model | deepseek/deepseek-v4-flash, temperature 0 |
| Limits | 20 turns, 30,000 tokens, 300 output tokens per request, 120 seconds |
| Source revision | `1480db6` |
| Prices | 0.09 in and 0.18 out per million |

The five contexts, as the code names them. `none` shows the agent only where
it is. `full` shows every turn so far. `window` keeps the last five turns.
`structured` keeps a compact summary and the last two outcomes. `map`, the
notepad, shows the world as the agent knows it: every connection, object and
told fact stated once, with one line per move.

Recorded plans, ledgers and transcripts are kept by the operator outside the
repository, in two places. Verified from the plans: between any two arms the
fields that differ are `strategy`, its derived `promptHash`, the time the
prices were checked, and `createdAt`.

### A note on the record

A first recording of these arms, and of the ten-seed arms, was lost on 24
November when a temporary folder was wiped. An earlier version of this
scorecard described that recording. It could not be checked, so it was
withdrawn. The whole batch was recorded again on 25 November and kept in two
places. Every number below is read from that record. Each run is taken from
its own transcript.

## The scorecard

| Context | Seed 1 | Seed 2 | Seed 3 | Solved | Turns used | Spend |
|---|---|---|---|---|---|---|
| none | loop guard (7) | loop guard (14) | loop guard (10) | **0 / 3** | 7 to 14 | $0.002079 |
| full | token ceiling (13) | token ceiling (12) | token ceiling (12) | **0 / 3** | 12 to 13 | $0.008737 |
| window | token ceiling (13) | loop guard (13) | token ceiling (14) | **0 / 3** | 13 to 14 | $0.008393 |
| structured | loop guard (11) | loop guard (10) | loop guard (16) | **0 / 3** | 10 to 16 | $0.004111 |
| map | parse errors (14) | parse errors (16) | loop guard (14) | **0 / 3** | 14 to 16 | $0.005779 |

Total spend $0.029099. The longest run took 16.4 seconds of its 120.

The bracket holds the turn the run ended on. "Loop guard" means the runner
ended the run on its third turn in an unchanged state. "Token ceiling" means
the run used all 30,000 tokens. "Parse errors" means ten commands could not be
carried out.

## What the scorecard says, and does not

- No context solved in three seeds. Nothing here says which context is better.
  Three seeds cannot establish anything, and this scorecard claims nothing
  about other worlds, other models or other seeds.
- The shape of each failure can be read, and much of it is the runner's. `none`
  and `structured` were ended by the loop guard in every run. `full` reached
  the token ceiling in every run, and `window` in two of three.
- The two `map` runs that ended on parse errors repeated `read incident ticket`
  ten times each. The world answered "You can't see anything called 'incident
  ticket' here" while the agent was holding it. That refusal was false. It is
  fixed in world 1.0.6 (PR #51), and results from before and after are never
  pooled.
- Nothing was retried. Each planned cell ran once.
- The ten-seed arms, the second world and the second model are in
  `strategy-followups-2026-11-25.md`.

## Two rules of the runner that shape every number in this document

Both were found on 25 November, after this record was made. Both belong to the
measuring instrument, not to the model.

**The loop guard.** It compares the whole state. A look and a refused command
leave the state as it was. The count starts at one when the agent arrives in a
state, so after any move that changes the world the agent has two more turns
there, and the third ends the run. In this record it ended eight of the
fifteen runs.

**The output cap.** A request may produce 300 tokens. On a model that reasons
before it answers, that includes the reasoning. When the reasoning needs more,
the reply arrives with no content, the turn is spent, and the agent is asked
again. This model lost 3 to 13 per cent of its turns that way in these arms. A
second model lost up to 43 per cent (see the follow-ups).

The owner has decided to change both, together with the turn cap and the token
budget: 25 turns, 40,000 tokens, 3,000 output tokens per request with a retry
when a reply is cut off, and a loop guard that records repeats and no longer
ends a run. The page arms will be recorded again under those limits. Every
number in this document belongs to the limits as they were.

## Acceptance, checked against the records

| Criterion | Evidence |
|---|---|
| World pinned | every `plan.json` names hotfix-2-4-1 at 1.0.5 |
| One variable | a pairwise diff of the five plans: only `strategy`, `promptHash`, `prices.checkedAt` and `createdAt` differ |
| Shipped contexts recorded | none, full, window and structured each have 3 recorded runs |
| Notepad recorded alike | map has 3 recorded runs under the same pin, seeds and limits |
| Nothing retried | the whole batch has 105 planned cells, 105 transcripts, and each transcript has exactly one metrics record; these arms are 15 of them |
| Scorecard restraint | the section above claims the measured cells and no others |
| The clock did not bind | every run ended inside 16.4 seconds of its 120; each transcript's `metrics` record carries `wallClockMs` |
| An operator can attribute | the table answers per context from the ledgers alone |
