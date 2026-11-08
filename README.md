<!-- page-version: 1.0.0 status: draft last-reviewed: 2026-11-08 -->

# research-text-adventure-ai

*I spent a while wondering whether a language model could finish a job without being shown how.
Then I noticed the question I was actually asking was smaller and much more useful: could it finish
a job without being shown the answer?*

**Can an AI agent autonomously complete a multi-step mission in a deterministic, stateful text
environment, using only the information and actions available to it, with no privileged knowledge
of the solution?**

The adventure game is not the point. The point is the evidence about how LLM agents behave inside a
controlled, replayable state machine, and a kernel written in the game's own language so that an
organisation can later be modelled *as* an adventure: teams as rooms, tickets as objects, handoffs
as doors.

> The environment is the thing under suspicion. Every result this project produces rests on one
> claim, and the claim is checked rather than asserted: the world is deterministic, the agent is
> never told more than it earned, and every run replays exactly.

> **Reader track**
>
> - **Five minutes.** Read Part 0 of the specification. It teaches the whole idea from zero, with
>   one full turn worked through.
> - **Twenty minutes.** Skim the experiment series. Six experiments, one idea each.
> - **An hour.** Read the research context. It is the evidence behind every decision in the design.
> - **A day.** Start Experiment 01. It is where the work actually begins.

---

## Where to start

| I want to | Read |
| --- | --- |
| Understand the idea | [`SPEC.md` Part 0, Orientation](./SPEC.md#part-0-orientation) |
| Build it | [`experiments/README.md`](./experiments/README.md). Six experiments, one idea each |
| Review the design | [`docs/proposal.md`](./docs/proposal.md), [`docs/RESEARCH-CONTEXT.md`](./docs/RESEARCH-CONTEXT.md), [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) |
| Hand it to an agent | [`AGENT_BRIEF.md`](./AGENT_BRIEF.md). Copy, paste, go |
| Play with it | [`docs/userguide.md`](./docs/userguide.md) |
| Know how it is proven | [`docs/TESTING.md`](./docs/TESTING.md) |

Everything is built test first. Every experiment lists its tests in the order they get written, and
the rule has a hard edge for this project: no change ships without a test that would catch the
failure it guards against. Determinism, the perception boundary and the replay guarantee are all
easy to believe and easy to break, and a test is the only thing that tells the two apart.

---

## The three deliverables

| # | Deliverable | Where |
| --- | --- | --- |
| 1 | **An adventure-native state kernel.** Pure, deterministic, and written in the game's own language: rooms, objects, doors, flags, actions, goals, turns. | `SPEC.md` §4 to §6 |
| 2 | **One engine, three interfaces.** Human CLI, browser client, autonomous agent, all driving the same reducer, provably equivalent through a hash chain. | `SPEC.md` §4.3, §14 |
| 3 | **Measurable, replayable results.** Metrics, a failure taxonomy, an experiment matrix, and transcripts anyone can re-run. | `SPEC.md` §12 to §13 |

---

## The test fixture

A short, original Mission Impossible-style adventure: three areas, a four-step dependency chain, a
lethal trap, and a ten-command gold path.

```
BRIEFING ROOM → SERVICE CORRIDOR →[keycard]→ SERVER VAULT
  keycard         locker → wire cutters          bomb (3 wires)
  bulletin              → defusal manual          safe →[code]→ case
```

The agent is told only this:

> A booby-trapped case is locked in the server vault. Two objectives: disarm the bomb, and recover
> the case. Nothing else is known. You are in the briefing room. Discover the rest by exploring.

Everything else it has to find. The defusal manual is inside a closed locker. The manual names both
the safe wire and the safe code. The vault door needs a keycard from the first room. Cutting the
wrong wire ends the run.

---

## What the experiment reports

The obvious measure is a success rate, and it gets reported. A bare number is a poor research
result, though, because it cannot tell you what to fix.

So the primary artefact is a **failure taxonomy**. Every unsuccessful run is sorted into exactly one
category, computed from the transcript: parsing, hallucination, planning, ordering, exploration
failure, lethal trap, budget exhaustion, provider error, or abstention.

That histogram is the thing worth having. It says where the model breaks, it tells you what to fix,
and it transfers. The same categories apply to an agent working inside an organisation.

---

## How the build is ordered

Six numbered experiments, in the `microgpt` and `llm.c` shape: one idea each, every one runnable on
its own, because the order of work should match the order of understanding.

| # | Experiment | The one idea |
| --- | --- | --- |
| 01 | [The game](./experiments/exp-01-the-game/README.md) | A world you can trust, playable by a human and the agent |
| 02 | [What the agent sees](./experiments/exp-02-what-the-agent-sees/README.md) | The agent's view is smaller than the world, and that gap is the experiment |
| 03 | [The agent plays](./experiments/exp-03-the-agent-plays/README.md) | A clean loop and a fair error message are enough |
| 04 | [Why it failed](./experiments/exp-04-why-it-failed/README.md) | The category of failure is the finding |
| 05 | [The matrix](./experiments/exp-05-the-matrix/README.md) | One number is an anecdote; a cell of a matrix is a result |
| 06 | [An organisation](./experiments/exp-06-an-organisation/README.md) | The metaphor has to survive contact with a real org |

---

## The longer game

The intended follow-on runs an organisation the way this game runs: state held centrally, each agent
handed its current situation and a command vocabulary, acting through tool calls. The kernel
concepts map across directly, and `SPEC.md` §18 sets out the mapping and the seam.

One thing does not carry over, and it is the interesting part. In the adventure, the agent can read
the manual and learn the rule. In an organisation, some rules are written down and some are not, and
an agent that cannot tell the difference is the failure mode worth knowing about.

---

## Repository layout

```
SPEC.md                  ← authoritative requirements, starting with Part 0
experiments/             ← the build, as six numbered experiments
AGENT_BRIEF.md           ← copy-paste brief for an implementing agent
TASKS.md                 ← phase and task cards with acceptance criteria
RESULTS.md               ← findings write-up, after Phase 6
docs/proposal.md         ← what this project is and why
docs/userguide.md       ← how to use it
docs/TESTING.md          ← the testing doctrine and what each layer guarantees
docs/docs-guide.md       ← how the docs fit together
docs/RESEARCH-CONTEXT.md ← engine survey, prior art, evidence per decision
docs/REFERENCES.md       ← the bibliography
docs/ARCHITECTURE.md     ← the layer map and ADR-001 to ADR-016
docs/ADVENTURES.md       ← how to write an adventure
docs/DIAGRAMS.md         ← the logic, visually
docs-viewer/             ← the shared Devtools reader
src/                     ← kernel · adventures · session · agents · runner · cli · server · web
tests/                   ← kernel, adventure, architecture, leakage, equivalence, replay
```

> **Key takeaways**
>
> - The environment is the thing under suspicion. Build it first, and prove it.
> - The agent's view of the world is smaller than the world. That gap is the experiment.
> - One engine, three interfaces. A human run and an agent run mean the same thing.
> - The failure category is the finding. A bare success rate cannot tell you what to fix.
> - The organisation is the destination. The adventure is the rehearsal.

---

## Licence

MIT.
