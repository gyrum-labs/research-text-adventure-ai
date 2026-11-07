---
title: research-text-adventure-ai — testing
status: living document
last-updated: 2026-11-07
---

> **This is a living document.** Keep the layers below in step with the code. When a new guarantee is claimed — determinism, perception, replay — add the test that proves it in the same change that claims it.

# research-text-adventure-ai — testing

The testing story for this project has one unusual feature, and it drives everything else: **the
environment is the thing under suspicion.** We are measuring an AI agent, and the only way that
measurement means anything is if the world it was measured in is provably deterministic, provably
fair, and provably free of leaked answers. A flaky environment produces confident nonsense.

So the tests here are not a safety net at the end of the work. They are the mechanism.

## The doctrine: test first

Every experiment is built test-first, and this is not a style preference.

1. **Write the test first.** The test says what the thing must do, in executable form, before any
   implementation exists. If you cannot write the test, you do not yet know what you are building.
2. **Watch it fail.** A test that has never failed proves nothing. If it passes on the first run,
   it is not testing the thing — it is testing nothing.
3. **Make it pass.** The smallest change that works.
4. **Then clean up, with the tests green.** Refactoring happens after, never before.

For this project the discipline has a hard edge:

> **No change ships without a test that would catch the failure it is guarding against.** The
> environment's determinism, its perception boundary and its replay guarantee are all easy to
> *believe* and easy to *break*. A test is the only thing that distinguishes the two.

A green suite is a claim. A missing test is an unexamined claim.

### What that means in practice, per experiment

Each experiment's README lists its tests **in the order they get written**, so the sequence is
the plan, not an afterthought:

- [Experiment 01 — The game](../experiments/exp-01-the-game/README.md) — the kernel, the
  adventure, and the two ways to play
- [Experiment 02 — What the agent sees](../experiments/exp-02-what-the-agent-sees/README.md) —
  the perception boundary
- [Experiment 03 — The agent plays](../experiments/exp-03-the-agent-plays/README.md) — the loop,
  the prompt, the budgets
- [Experiment 04 — Why it failed](../experiments/exp-04-why-it-failed/README.md) — the metrics and
  the failure taxonomy
- [Experiment 05 — The matrix](../experiments/exp-05-the-matrix/README.md) — the sweep and the
  statistics
- [Experiment 06 — An organisation](../experiments/exp-06-an-organisation/README.md) — the
  generality probe

## Layer 1 — Unit tests (pre-push)

The fast suite. It must run on every push, with no network and no model access.

| Area | What is tested | The guarantee it buys |
|---|---|---|
| `src/kernel/reduce.ts` | Same inputs → same outputs; no mutation of the input state; a failed precondition changes nothing | The engine is a function |
| `src/kernel/parser.ts` | Every verb, both connectives, alias resolution, ambiguous aliases, malformed input | Invalid actions are attributable to the agent, not the parser |
| `src/kernel/observation.ts` | The agent's view ⊆ (room contents ∪ inventory); closed containers stay closed; goals disclosed, method withheld | No privileged information |
| `src/kernel/hash.ts` | Canonical JSON is stable; the chain is stable across processes | A run can be checked later |
| `src/adventures/mission-impossible/` | Gold path wins; BFS confirms it is shortest; random policy fails 20/20; no dead ends | The task is solvable, and not trivially |
| `src/runner/` | Every budget and every guard terminates the run with the right outcome code | A confused agent cannot run up a bill |
| `src/runner/classify.ts` | Synthetic transcripts classify to exactly one expected code | The taxonomy is a fact, not an impression |
| Architecture | `src/kernel` imports nothing outside itself; the kernel contains no clock, randomness or I/O | The boundary is enforced, not intended |

The architecture rules are enforced twice — once as a lint rule and once as a test — because a
lint rule can be disabled and a test cannot be wished away.

## Layer 2 — 3-persona AI review

The Gyrum review gate (`gyrum-review-pr`) runs a structural check suite and a five-persona AI
review over the diff. This is where the *design* is challenged rather than the code: a reviewer
asks whether the thing being measured is the thing claimed, whether the guarantee survives the
change, and whether the failure taxonomy still describes reality.

For this project the questions a reviewer should press hardest are:

- Does this change alter what the agent can observe? (If yes, every earlier result is now about a
  different experiment.)
- Does this change alter the adventure? (The adventure hash is recorded in every transcript, so
  old results are no longer comparable.)
- Does this change make the parser more forgiving? (That would quietly move the
  `invalidActionRate` metric and invalidate earlier numbers.)

## Layer 3 — Contract tests

Contract tests pin the boundaries between the pieces. The ones that matter here:

| Contract | Test |
|---|---|
| The kernel is deterministic | Replay a recorded transcript and compare the hash chain, byte for byte |
| The three interfaces agree | The same command sequence through the human CLI, the browser client and the agent runner produces identical hash chains |
| The agent sees only what it earned | For every reachable state of the adventure, the observation's objects are a subset of room contents ∪ inventory |
| No secret reaches an artefact | Scan every transcript, metrics file and log for key-shaped strings |
| The provider port is swappable | The `Mock` provider drives a full run with zero network calls |

The replay test is the one to insist on. It is the executable form of "the environment is
trustworthy", and it is the only check that would catch a change that made the kernel
non-deterministic in a way the unit tests missed.

## Layer 4 — Fleet E2E

The full sweep — models × conditions × seeds — is the end-to-end run. It is expensive (model
calls), so it is not part of the pre-push gate; it is a deliberate, scheduled experiment whose
artefacts are the result.

Its contract: every run in the matrix produces a transcript, a metrics file and exactly one
classification. A run missing any of the three is a failed run, not a skipped one.

## Commands summary

| Command | What it does |
|---|---|
| `npm run check` | typecheck + lint + tests — the pre-push gate |
| `npm test` | The unit suite alone |
| `npm run test:watch` | The unit suite in watch mode, for the test-first loop |
| `npm run replay -- <file>` | Re-apply a transcript's commands and verify the hash chain |
| `npm run exp:01` … `npm run exp:06` | Run one experiment end to end |
| `npm run agent -- --provider mock` | The full agent pipeline, offline and free |
| `npm run sweep` | The experiment matrix |
| `bash scripts/update-docs.sh` | Refresh the docs index after adding or removing documents |
| `bash /home/jon/.gyrum/devtools/pre-pr.sh` | The full pre-PR structural check suite |

## Known gaps

| Gap | Why it is still open | When it closes |
|---|---|---|
| The agent's own reasoning traces are not classified | Our taxonomy is operational, computed from the transcript; TALES' cognitive taxonomy needs the traces | If the traces are recorded and a second classifier is written, both are reported side by side |
| No test yet proves the *agent* is deterministic | It cannot be — model sampling is not reproducible | Never. The guarantee is engine determinism plus a recorded trajectory (`SPEC.md` §13.1) |
| The matrix has not been run at scale | The harness is not written | Experiment 05 |
| The failure classifier has only been checked against synthetic transcripts | Real transcripts are not yet available | Experiment 04 |

## Related

- [`SPEC.md`](../SPEC.md) §16 — the phase plan and acceptance criteria
- [`experiments/README.md`](../experiments/README.md) — the experiment series and the working method
- [`docs/proposal.md`](./proposal.md) — what this project is and why
- [`docs/userguide.md`](./userguide.md) — how to use it
