# Repeatability batch, 2026-11-13

Twenty runs, ten per world, one plan, one model, one set of limits. This is the
first measurement the roadmap has produced, and it answers a narrower question
than it might look like it answers: how the same model does on the two worlds
we already ship, under the same rules, on one day, with twenty attempts.

## How it ran

The plan was written before anything ran, and it is on file with the books
(`runs/batch/plan.json`). It names both worlds and their versions
(`mission-impossible@1.0.3`, `hotfix-2-4-1@1.0.3`), the revision it was written
against, the prompt version and its hash, temperature 0, the budgets, and the
prices it checked and when. Every cell reserved its worst case before it
dispatched; no cell was refused; nothing was retried; no cell ran twice.

- Model: `deepseek/deepseek-chat` through OpenRouter, temperature 0
- Limits: 20 turns, 30,000 total tokens, 300 output tokens per request,
  16,000 prompt bytes, 120 seconds, one run at a time
- Prices: $0.32 in and $0.89 out per million, checked 2026-11-13 against the
  OpenRouter models API
- Reserved worst case per run: $0.013020, ceiling $0.40 for the batch

## What happened

| World | Runs | Solved | Fraction | Tokens | Cost |
| --- | --- | --- | --- | --- | --- |
| mission-impossible | 10 | 8 | 80% | 167,404 | $0.054240 |
| hotfix-2-4-1 | 10 | 0 | 0% | 70,118 | $0.022768 |
| **Both** | **20** | **8** | **40%** | **237,522** | **$0.077007** |

Every one of the twenty transcripts replays to the recorded hashes. There are
no unsettled holds: every cell settled at its measured cost.

## The gap between the worlds, and what causes it

The first world was solved eight times in ten. The second was never solved in
ten, and all ten runs stopped the same way: the agent returned to the same
state three times in a row.

The cause is visible in every transcript. All ten runs opened by asking to
`read incident ticket`: thirty-nine read attempts across the ten runs: and
the world refuses every one of them with "You cannot read incident ticket."
The world shows that ticket as `(readable, takeable)`, but its only read rules
accept the runbook and the on-call board, so there is no command that can
succeed, and no feedback that tells the agent its reading is the problem. It
asks again, the state does not move, and the loop guard stops the run.

The first world does not have this problem: both objects it marks readable have
read rules. That difference, not general model ability, is what the 80% against
0% is measuring.

## What this does not establish

Twenty runs on one day with one model is a small sample. The fractions above
describe these twenty runs, not a rate the model can be relied on to repeat:
no confidence interval is claimed, no other model was tried, and no second day
was run. The temperature was 0, so the variation between seeds comes from the
worlds' own deterministic behaviour and the model's sampling, not from an
experimentally controlled randomisation.

The mission-impossible figure does not transfer to the hotfix world, and the
hotfix figure is not evidence that the world is impossible: only that this
model, under these rules, did not solve it in ten attempts while the world
refused the command it reached for first.

## The defect this found

The hotfix world advertises a readability it cannot honour. Fixing that means
changing the world, which the previous ticket pinned and this one does not
authorise. It is filed to the roadmap rather than changed here.

## Where the evidence is

Plan, books, transcripts and findings live outside source control with the
session's other records. Nothing in `runs/` is committed, and the closed
four-attempt mission ledger is untouched by this experiment.
