# Repeatability batch re-run against the corrected hotfix world, 2026-11-14

The same experiment as the 2026-11-13 batch, run again after the hotfix world
stopped advertising a readability it could not honour. The question this run
answers is narrow: did that correction change what the model does on that
world?

## How it ran

Same plan shape, same model, same limits, same seeds and temperature, prices
re-checked against the OpenRouter models API on 2026-11-14. The plan is on
file with the books (`runs/batch/plan.json`) and records the worlds as they
now ship: `mission-impossible@1.0.3` and `hotfix-2-4-1@1.0.4`. Every cell
reserved its worst case ($0.013020) before it dispatched; nothing was refused,
nothing retried, nothing ran twice.

- Model: `deepseek/deepseek-chat` through OpenRouter, temperature 0
- Limits: 20 turns, 30,000 total tokens, 300 output tokens per request,
  16,000 prompt bytes, 120 seconds, one run at a time

## What happened

| World | Version | Runs | Solved | Fraction | Tokens | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| mission-impossible | 1.0.3 | 10 | 10 | 100% | 152,150 | $0.049314 |
| hotfix-2-4-1 | **1.0.4** | 10 | **0** | **0%** | 140,262 | $0.045506 |
| **Both** | | **20** | **10** | **50%** | **292,412** | **$0.094820** |

For comparison, the previous batch on 2026-11-13 recorded 8/10 and 0/10 on
those worlds, for $0.077007. All twenty transcripts in this run replay to
their recorded hashes, and there are no unsettled holds.

## The disclosure fix changed behaviour, not the score

The hotfix world still scored zero, and it is tempting to read that as the fix
having done nothing. The transcripts say otherwise. Every one of the ten runs
now reads the on-call board, claims the incident ticket, travels to release
engineering, opens the shared inbox, takes the deploy credential and reads the
release runbook: the whole first half of the mission, which no run in the
previous batch completed, because all ten of them died repeating a read the
world refused.

What stops them now is different, and it is two things the world does rather
than one thing it lies about:

1. **Ordering.** Seven of the ten runs attempted the deploy before unlocking
   the release gate; three never reached the deploy at all.
2. **The approval code, used on the wrong lock.** Nine of the ten runs tried
   `unlock release gate with 7311`. The runbook is explicit that 7311 is the
   customer handover's approval code; the gate needs the incident ticket.

## A new friction point, of the same family as the last one

Seven runs also tried `unlock release gate with incident ticket`, using the
object's own display name. The world refuses that with "The gate needs the
incident ticket", which names the thing the agent just provided.

The unlock rule compares the `with` text literally against `incident-ticket`,
the hyphenated form. The world shows the object as `incident ticket`, with a
space, and never shows the hyphenated form. An agent that writes what it can
see is refused, and the refusal reads as though it had not provided the thing
it did provide.

That is a world-design finding, not a model finding, and it is the same family
as the readability lie the last batch found: the world accepts one written form
while presenting another. Fixing it means changing the world again, which this
ticket does not authorise, so it is recorded for the roadmap.

## What this does not establish

Two samples of ten runs each, one model, two days. The first world's move from
8/10 to 10/10 is within what small samples do, and is not claimed as
improvement. The hotfix world's unchanged zero does not prove the world is
unsolvable; it says this model, under these rules, did not solve it in ten
attempts on either day, for two different reasons.

## Where the evidence is

Plan, books, transcripts and findings live outside source control with the
session's other records. Nothing in `runs/` is committed, the closed
four-attempt mission ledger is untouched, and the 2026-11-13 findings are left
exactly as published.
