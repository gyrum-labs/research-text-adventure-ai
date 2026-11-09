<!-- page-version: 1.0.0 status: draft last-reviewed: 2026-11-08 -->

# Experiments

*I could have written one long specification for this. What I could not have written was anything a
stranger could pick up on a Tuesday and know what to do next. So this is six experiments instead,
and each one runs.*

This is a series of small, self-contained experiments. Each one teaches exactly one idea, runs on
its own, and leaves the reader with something they can see. You work through them in order, and
each builds on the one before.

The style follows Karpathy's: `microgpt`, `llm.c`, `nanochat`. A handful of files, no frameworks,
the code readable in one sitting, and a README that tells you what you are building and what you
should see when it works. The reason to work this way is not tidiness. It is that **you cannot
evaluate an AI agent's reliability until you are certain the environment itself is reliable**.
Every experiment exists to remove one more way for the answer to be wrong.

> **Reader track**
>
> - **Five minutes.** Read the table below and Experiment 01's opening. That is the shape of the
>   whole project.
> - **Thirty minutes.** Read Experiment 01 in full. It is the foundation.
> - **An afternoon.** Start Experiment 01. Write the first test before the first line of kernel.

## The series

| # | Experiment | The one idea | Status |
|---|---|---|---|
| **01** | [The game](./exp-01-the-game/) | A deterministic world you can trust, playable by a human *and* by the agent | Built and green |
| **02** | [What the agent sees](./exp-02-what-the-agent-sees/) | The agent's view of the world is smaller than the world, and that gap is the experiment | Built and green |
| **03** | [The agent plays](./exp-03-the-agent-plays/) | A model can drive a state machine if you give it a clean loop and a fair error message | Built and green, live providers proven |
| **04** | [Why it failed](./exp-04-why-it-failed/) | "It failed" is not a finding; the category is | Built and green |
| **05** | [The matrix](./exp-05-the-matrix/) | One number is an anecdote; a cell of a matrix is a result | Spec ready |
| **06** | [An organisation](./exp-06-an-organisation/) | The adventure vocabulary has to survive contact with a real org | Spec ready |

> **Key takeaways**
>
> - The environment is the thing under suspicion. Build it first, and prove it.
> - The agent's view of the world is smaller than the world. That gap is the experiment.
> - One engine, three interfaces. A human run and an agent run mean the same thing.
> - The failure category is the finding. A bare success rate cannot tell you what to fix.
> - The organisation is the destination. The adventure is the rehearsal.

## How to run them

Each experiment is a directory with its own README, its own tests, and one command that runs it.

```sh
npm run exp:01     # play the game yourself
npm run exp:02     # see exactly what the agent sees
npm run exp:03     # watch a model try
npm run exp:04     # classify what went wrong
npm run exp:05     # run the matrix
npm run exp:06     # the organisation probe
```

Every experiment is also a **specification**: the README is the contract, the tests are the
executable form of that contract, and the code is whatever satisfies both. If you are an agent
picking up work, start with the experiment's README and its acceptance criteria. You do not need
to read `SPEC.md` first, though it has the full detail.

## The working method: test first

Every experiment is built **test-first**, and this is not a style preference. It is the mechanism
that keeps the environment honest:

1. **Write the test first.** The test says what the thing must do, in executable form, before any
   implementation exists. If you cannot write the test, you do not yet know what you are building.
2. **Watch it fail.** A test that has never failed proves nothing. If it passes on the first run,
   it is not testing the thing.
3. **Make it pass.** The smallest change that works.
4. **Then clean up, with the tests green.** Refactoring happens after, never before.

For this project specifically, the discipline has a hard edge to it:

> **No experiment ships without a test that would catch the failure it is guarding against.**
> The environment's determinism, its perception boundary, and its replay guarantee are all
> properties that are easy to *believe* and easy to *break*. A test is the only thing that
> distinguishes the two.

The test suite is therefore part of the deliverable, not scaffolding around it. A green suite is
a claim; a missing test is an unexamined claim.

## The invariant that holds across every experiment

Whichever experiment you are in, two things are true and are tested:

- **The environment is deterministic.** The same commands produce the same state, every time, and
  every run replays to an identical hash chain.
- **The agent is never told more than it earned.** It sees only what it has observed. No gold
  path, no hint table, no solution.

If either of those breaks, the results from that point on are noise.

## Relationship to the phase plan

`SPEC.md` §16 gives the full phase plan with acceptance criteria. The experiments are the *same
work, re-cut* so that each piece is independently runnable and teaches one idea. Where they
differ, `SPEC.md` is authoritative for detail and the experiment README is authoritative for
intent.

| Experiment | Covers phases |
|---|---|
| 01 The game | P0 (kernel), P1 (scenario), P2 (human CLI) |
| 02 What the agent sees | P0 (observation), P3.4 (context strategies) |
| 03 The agent plays | P3 (agent harness), P3.5 (runner) |
| 04 Why it failed | P4.1 (metrics), P4.2 (failure taxonomy) |
| 05 The matrix | P4.3 (sweep), P6 (results) |
| 06 An organisation | P7 (generality probe) |

Phases not covered here, P5 (browser client) and P8 (QuestJS comparison), are interface and
comparison work rather than new ideas, so they stay in `SPEC.md` §16 on their own.
