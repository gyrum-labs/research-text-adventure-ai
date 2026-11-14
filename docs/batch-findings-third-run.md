# Repeatability batch on the hotfix world with both corrections, 2026-11-14

The third run of the same experiment, now against a hotfix world whose release
gate accepts the ticket by the name the world shows it. This is the run that
answers the question the last two could not: is the mission solvable?

## How it ran

Same plan shape, model, limits, seeds and temperature; prices re-checked
against the OpenRouter models API on 2026-11-14. The plan is on file
(`runs/batch/plan.json`) and records `mission-impossible@1.0.3` and
`hotfix-2-4-1@1.0.5`. Every cell reserved its worst case ($0.013020) before
dispatch; nothing was refused, nothing retried, nothing ran twice.

## What happened

| World | Version | Runs | Solved | Fraction | Tokens | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| mission-impossible | 1.0.3 | 10 | 9 | 90% | 156,907 | $0.050848 |
| hotfix-2-4-1 | **1.0.5** | 10 | **4** | **40%** | 169,828 | $0.055075 |
| **Both** | | **20** | **13** | **65%** | **326,735** | **$0.105923** |

All twenty transcripts replay to their recorded hashes. There are no unsettled
holds. Cumulative roadmap spend is now $0.279 of the $1 ceiling.

## The three-batch picture

| Batch | Hotfix world | Runs | Solved | What stopped the runs |
| --- | --- | --- | --- | --- |
| 2026-11-13 | 1.0.3 | 10 | 0 | Ten loops after read attempts on a ticket advertised as readable and refused |
| 2026-11-14 | 1.0.4 | 10 | 0 | Runs reached the release gate, then seven wrote the ticket by the name shown and were refused, and nine used the handover code on the gate |
| 2026-11-14 | **1.0.5** | 10 | **4** | Six runs stopped by the loop guard, on the code conflation and on trying to read the notification |

The first correction did not move the score, because it removed one barrier
while another stood behind it. The second did: the hotfix world went from
unwinnable in twenty runs across two batches to solved in four of ten.

## What stops the six unsolved runs

Two things, and this time both are the model planning, not the world lying.

- **The approval code on the wrong lock.** Nine attempts used `7311` on the
  release gate. The runbook is explicit that `7311` is the customer handover's
  code, and the gate needs the incident ticket. The refusal is accurate and
  directional.
- **Reading the objective.** Five attempts tried `read customer notification`.
  The notification is not a document; it is the thing to claim and deliver,
  and the world says so. The refusal is honest.

There is also one attempt to `read incident ticket`, which is now an honest
refusal of an object the world no longer claims is readable.

## What this does not establish

Three samples of ten runs, one model, two days, one world at three versions.
The mission-impossible figures across the three batches (8, 10 and 9 of 10)
are what small samples do, and no trend is claimed from them. Forty percent on
the hotfix world is a measured fraction over ten runs, not a reliability
statement, and the two corrections are not thereby proven to be the only
barriers: they are the two the transcripts named.

## Where the evidence is

Plan, books, transcripts and findings live outside source control with the
session's other records. Nothing in `runs/` is committed, the closed
four-attempt mission ledger is untouched, and the two earlier findings
documents are left exactly as published.
