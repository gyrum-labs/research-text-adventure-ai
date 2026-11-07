# Experiment 04 — Why It Failed

> **The one idea:** "it failed" is not a finding. The *category* of failure is the finding.

## What you are building

Two things that turn a pile of runs into evidence:

1. **The metrics** — objective numbers per run: outcome, turns used, invalid commands,
   hallucinations, repeated states, tokens, cost, wall-clock.
2. **The failure classifier** — a deterministic function that sorts each failed run into exactly
   one category, computed from the transcript alone:

| | Category | The agent... |
|---|---|---|
| `F1` | Parsing | could not produce a command the parser accepted |
| `F2` | Hallucination | referenced objects that are not in the room or the inventory |
| `F3` | Planning | repeated a failed action, or contradicted its own stated plan |
| `F4` | Ordering / precondition | acted before discovering the fact the action needed |
| `F5` | Exploration failure | never found a required fact inside the budget |
| `F6` | Lethal trap | detonated the bomb |
| `F7` | Budget exhaustion | ran out of turns with nothing more specific to say |
| `F8` | Provider error | the API failed, not the agent |
| `F9` | Abstention | declared itself stuck or stopped early |

## How to run it

```sh
npm run exp:04
```

## What you should see

```
26 runs · 4 succeeded · 22 failed

  F1  parsing                    0   ▏
  F2  hallucination              1   ▎
  F3  planning                   3   ███
  F4  ordering / precondition    7   ███████
  F5  exploration failure        6   ██████
  F6  lethal trap                2   ██
  F7  budget exhaustion           2   ██
  F8  provider error             1   ▎
  F9  abstention                 0   ▏

cost per solved mission: $0.41
```

That histogram is the deliverable. It says *where* the model breaks, and it is directly
actionable: `F4` dominant means the model acts before it has looked; `F5` dominant means it does
not explore enough; `F2` dominant means the observation is confusing it.

## The tests, in the order they get written

- each synthetic transcript classifies to exactly one expected code
- a failed run never classifies to zero codes, and never to two
- a successful run is never classified as a failure
- the classifier reads only the transcript — it never calls the model
- `hallucinationRate` counts a command that names an object absent from the room and the inventory
- `orderingViolations` counts an action attempted before its precondition was discovered

## Acceptance criteria

- [ ] Every metric in `SPEC.md` §12.2 is computed and recorded per run
- [ ] Every failed run has exactly one category, computed from the transcript
- [ ] The classifier's rules are unit-tested against synthetic transcripts, not just real ones
- [ ] The histogram and the per-run annotations agree

## Scaling path

One experiment's failures are anecdotes. Many experiments' failures are a result.
→ [Experiment 05](./exp-05-the-matrix/)

## Reference

- `SPEC.md` §12.2 (metrics), §12.3 (failure taxonomy)
- `docs/RESEARCH-CONTEXT.md` §3.4, §4.7 — why diagnosis, not score, is the bottleneck
