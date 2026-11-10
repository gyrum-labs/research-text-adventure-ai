<!-- page-version: 1.0.0 status: draft last-reviewed: 2026-11-08 -->

# Experiment 04: Why It Failed

*"It failed" is not a finding. "It failed because it cut the wire before it read the manual" is
a finding, and the second one tells you what to do next.*


> **The one idea:** "it failed" is not a finding. The *category* of failure is the finding.

> **Reader track**
>
> - **Ten minutes.** The nine categories and the decision tree.
> - **Thirty minutes.** The tests and what the histogram buys you.

## What you are building

Two things that turn a pile of runs into evidence:

1. **The metrics**. Objective numbers per run: outcome, turns used, invalid commands,
   hallucinations, repeated states, tokens, cost, wall-clock.
2. **The failure classifier**. A deterministic function that sorts each failed run into exactly
   one category, computed from the transcript alone:

| | Category | What the agent did |
|---|---|---|
| `F1` | Parsing | could not produce a command the parser accepted |
| `F2` | Hallucination | referenced objects that are not in the room or the inventory |
| `F3` | Planning | repeated a failed action |
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
30 runs · 1 succeeded · 29 failed

  F6  lethal trap                  1   █
  F8  provider error               1   █
  F9  abstention                   1   █
  F2  hallucination                1   █
  F1  parsing                      1   █
  F3  planning                     2   ██
  F4  ordering / precondition      4   █████
  F5  exploration failure         17   ████████████████████
  F7  budget exhaustion            1   █

cost per solved mission: $0.0000
```

That histogram is the deliverable. It says *where* the model breaks, and it is directly
actionable: `F4` dominant means the model acts before it has looked; `F5` dominant means it does
not explore enough; `F2` dominant means the observation is confusing it.

The sweep is nine fixtures, one per category, plus the gold path and twenty random-policy seeds.
The fixtures are not experiments. They are what gives every category a run, so the classifier is
proved against something rather than against one policy's habits.

## The tests, in the order they get written

- each synthetic transcript classifies to exactly one expected code
- a failed run never classifies to zero codes, and never to two
- a successful run is never classified as a failure
- the classifier reads only the transcript. It never calls the model
- `hallucinationRate` counts a command that names an object absent from the room and the inventory
- `orderingViolations` counts an action attempted before its precondition was discovered

## Acceptance criteria

- [x] Every metric in `SPEC.md` §12.2 is computed and recorded per run
- [x] Every failed run has exactly one category, computed from the transcript
- [x] The classifier's rules are unit-tested against synthetic transcripts, not just real ones
- [x] The histogram and the per-run annotations agree

## What we found

> **Key insight.** The order of the categories is not the order they are numbered in, and that
> matters more than it sounds. A run that detonated the bomb is a lethal trap even if it also
> hallucinated once, and a run that stopped is an abstention even if it had been muddling along.

The nine categories do not compete evenly. Three of them name what actually ended the run, and
those come first: a detonation, a provider failure, a stop. Then come the behavioural ones, from
the most specific to the least: a refusal that names an object that is not there is a
hallucination, and that is more useful to know than "it produced a bad command". Only when
nothing more specific applies does a run get filed as budget exhaustion.

### The random policy is an exploration failure, almost always

Seventeen of the twenty random runs are `F5`. The random policy wanders, it does not explore
with a purpose, and it almost never finds the manual that everything else depends on. Two are
`F4` and one is `F3`. Not one of them detonates, which is a fact about the adventure rather than
about the agent: the random policy rarely gets far enough to reach the wires.

### The loop guard needed a narrower rule

The runner's loop detector counted every repeated situation, and in a three-room adventure that
meant the turn budget was unreachable: the agent ran out of distinct situations long before it
ran out of turns. Only **consecutive** repeats count now. An agent that is stuck in one place is
in a loop; an agent that wanders between two places is making a mess, and the turn budget is the
right thing to stop it. Without that change the `F7` category could never be reached.

### Half of "planning" is not a deterministic category

`F3` is "acted against its own stated plan, or repeated a failed action". The first half would
need the model to judge its own reasoning, and the classifier never calls a model. So `F3` is the
second half only, and the specification now says so rather than leaving a promise the
implementation cannot keep.

## Scaling path

One experiment's failures are anecdotes. Many experiments' failures are a result.
→ [Experiment 05](./exp-05-the-matrix/)

## Reference

- `SPEC.md` §12.2 (metrics), §12.3 (failure taxonomy)
- `docs/RESEARCH-CONTEXT.md` §3.4, §4.7. Why diagnosis, not score, is the bottleneck
