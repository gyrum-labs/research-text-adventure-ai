# Experiment 05 — The Matrix

> **The one idea:** one number is an anecdote. A cell of a matrix, with an interval, is a result.

## What you are building

The sweep: the same experiment across models and conditions, many times each, summarised
honestly.

- **Conditions** — the experimental variables, one per axis:
  - `A` prose observation, full history
  - `B` JSON observation, full history
  - `C` JSON observation + masked legal actions + structured context
  - `D` JSON observation, no history *(the control)*
- **Cells** — (model × condition), each with at least 10 seeds.
- **Summaries** — success rate with a Wilson 95% interval, median turns, the failure histogram,
  and cost per solved mission.

## How to run it

```sh
npm run exp:05 -- --matrix configs/matrix.default.json
```

## What you should see

```
model                    cond   n   success (95% CI)      median turns   $/solve
claude-sonnet-4.5        A     10   70%  (39–89%)            14            $0.52
claude-sonnet-4.5        C     10   90%  (60–98%)            12            $0.47
claude-sonnet-4.5        D     10   30%  (11–61%)            22            $1.10
gpt-5.1                  A     10   50%  (26–74%)            16            $0.21
```

Read it as: *the structured, masked condition helped, and the no-history control hurt.* That is a
finding about **context strategy and action masking**, and it transfers directly to the
organisation simulation.

## The tests, in the order they get written

- the Wilson interval matches known values to four decimal places
- the summary row count equals (models × conditions)
- every run in the sweep produced a transcript, a metrics file and a classification
- a cell with fewer than its configured seeds is reported as incomplete, not averaged
- the sweep is resumable: re-running does not re-run completed cells

## Acceptance criteria

- [ ] At least 160 runs complete, with every artefact present
- [ ] Every cell reports a success rate with a Wilson interval and a sample size
- [ ] Failures are aggregated into the F1–F9 histogram
- [ ] Cost per solved mission is reported
- [ ] H1–H5 are reported as **falsified or supported**, not as impressions

## Scaling path

The method works on one world. Now: does it work on a second, very different one?
→ [Experiment 06](./exp-06-an-organisation/)

## Reference

- `SPEC.md` §12.4 (experiment matrix), §12.6 (acceptance), §17 (threats to validity)
- `docs/RESEARCH-CONTEXT.md` §7 — why our numbers are *not* comparable to TALES' numbers
