# research-text-adventure-ai

> **Status: specification complete, implementation pending.**
> This repository contains the full requirements for a research proof of concept, cut into a
> series of small experiments. Nothing is implemented yet — the build work is specified,
> task-carded and ready to hand to an implementing agent.

**Can an AI agent autonomously complete a multi-step mission in a deterministic, stateful text
environment — using only the information and actions available to it, with no privileged knowledge
of the solution?**

The adventure game is not the point. The point is the evidence about how LLM agents behave inside
a controlled, replayable state machine — and a kernel written in the game's own language, so that
an organisation can later be modelled *as* an adventure (teams as rooms, tickets as objects).

---

## Start here

Pick the door that matches why you are here.

| I want to… | Read |
|---|---|
| **Understand the idea** | [`SPEC.md` Part 0 — Orientation](./SPEC.md#part-0--orientation-start-here). It teaches the whole project from zero: the question, why a text adventure, the six words the design rests on, and one full turn end to end. |
| **Build it** | [`experiments/README.md`](./experiments/README.md). Six numbered experiments, one idea each, every one runnable on its own. Experiment 01 gets the game working so a human *and* an AI can play it. |
| **Review the design** | [`docs/proposal.md`](./docs/proposal.md) (what and why), [`docs/RESEARCH-CONTEXT.md`](./docs/RESEARCH-CONTEXT.md) (the evidence), [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) (the ADRs), [`SPEC.md` §17](./SPEC.md) (what could make the result wrong). |
| **Hand it to an agent** | [`AGENT_BRIEF.md`](./AGENT_BRIEF.md) — copy-paste and go. |
| **Play with it** | [`docs/userguide.md`](./docs/userguide.md). |

The whole thing is built **test-first**: every experiment lists its tests in the order they get
written, and the rule is that nothing ships without a test that would catch the failure it
guards against. The reasoning is in [`docs/TESTING.md`](./docs/TESTING.md).

---

## The three deliverables

| # | Deliverable | Where |
|---|---|---|
| 1 | **An adventure-native state kernel** — pure, deterministic, and written in the game's own language: rooms, objects, doors, flags, actions, goals, turns. | `SPEC.md` §4–§6 |
| 2 | **One engine, three interfaces** — human CLI, browser UI, autonomous agent, all driving the same reducer, provably equivalent via a hash chain | `SPEC.md` §4.3, §14 |
| 3 | **Measurable, replayable results** — metrics, a failure taxonomy, an experiment matrix, and transcripts anyone can re-run | `SPEC.md` §12–§13 |

## The test fixture

A short, original Mission Impossible-style adventure: three areas, a four-step dependency chain, a
lethal trap, and a 10-command gold path.

```
BRIEFING ROOM ──► SERVICE CORRIDOR ──[keycard]──► SERVER VAULT
  keycard           locker ──► wire cutters           bomb (3 wires)
  bulletin                 └─► defusal manual         safe ─[code]─► case
```

The agent receives the mission brief and nothing else. It must discover that the defusal manual is
in a locked locker, that the manual names the safe wire *and* the safe code, and that the vault
door needs a keycard from the first room. Cutting the wrong wire ends the run.

Full adventure specification: [`SPEC.md` §7](./SPEC.md#7-the-mission-impossible-adventure).

## Research questions

- **RQ1** Can a capable LLM agent complete the mission within a 30-turn budget?
- **RQ2** When it fails, *why* — perception, planning, action generation, memory, or grounding?
- **RQ3** How much do observation format and context strategy move the result?
- **RQ4** What is the cost per solved mission?
- **RQ5** Can an organisation be expressed as an adventure — teams as rooms, tickets as objects — without changing the kernel?

Hypotheses and their falsification conditions: [`SPEC.md` §1.4](./SPEC.md#14-hypotheses-to-be-falsified-not-confirmed).

## Why a custom kernel rather than an existing engine?

We surveyed QuestJS (MIT), ink (MIT), TextWorld (Microsoft Research Licence) and the TALES
benchmark. The short version: an existing adventure framework couples the experiment to an engine
we do not control, and TextWorld's licence is non-commercial. A small purpose-built kernel gives
total control over determinism and over exactly what the agent is allowed to see.

The benchmark that matters for calibration is **TALES**, where the same models score 76–100 on
synthetic games and collapse to **13.4%** of maximum score on Jericho — the suite's only
human-written environment. Human-shaped worlds are where agents break, and the *why* (grounded and
inductive reasoning failures, context dilution, uninformative feedback) is the reusable finding.

> Our numbers are **not** comparable to TALES': their agent gets almost no domain information and
> is scored on a normalised 0–100 scale, while ours gets a mission brief and a command grammar and
> is scored on binary goal completion. See [`docs/RESEARCH-CONTEXT.md` §3.5](./docs/RESEARCH-CONTEXT.md#35-two-methodological-choices-in-tales-that-differ-from-ours).

Survey, evidence per decision, and the correction log: [`docs/RESEARCH-CONTEXT.md`](./docs/RESEARCH-CONTEXT.md).
Annotated bibliography: [`docs/REFERENCES.md`](./docs/REFERENCES.md).

## Repository layout

```
SPEC.md                  ← authoritative requirements (start with Part 0)
experiments/             ← the build, as six numbered experiments, one idea each
AGENT_BRIEF.md           ← copy-paste brief for an implementing agent
TASKS.md                 ← phase and task cards with acceptance criteria
RESULTS.md               ← findings write-up (Phase 6)
docs/proposal.md         ← what this project is and why (living document)
docs/userguide.md       ← how to use it (living document)
docs/TESTING.md          ← the testing doctrine and what each layer guarantees
docs/docs-guide.md       ← how the docs fit together (living document)
docs/RESEARCH-CONTEXT.md ← engine survey, prior art, evidence per decision, correction log
docs/REFERENCES.md       ← annotated bibliography with licences and dates accessed
docs/ARCHITECTURE.md     ← layer map + ADR-001…ADR-016 (why it is shaped this way)
docs/ADVENTURES.md       ← adventure authoring guide + checklist
docs-viewer/             ← the shared Devtools docs reader (Gyrum convention)
src/                     ← kernel · adventures · session · agents · runner · cli · server · web
tests/                   ← kernel, adventure, architecture, leakage, equivalence, replay
examples/runs/           ← a few committed example transcripts
```

## How to run the build

The work is tracked as nine phase issues, each carrying its own acceptance criteria, grouped into
matching milestones:

| Issue | Phase | Gate |
|---|---|---|
| [#1](https://github.com/gyrum-labs/research-text-adventure-ai/issues/1) | P0 — Kernel | Pure reducer, DSL, parser, observation builder, architecture rules enforced |
| [#2](https://github.com/gyrum-labs/research-text-adventure-ai/issues/2) | P1 — Adventure | Gold path solves it, BFS proves it is shortest, random policy fails |
| [#3](https://github.com/gyrum-labs/research-text-adventure-ai/issues/3) | P2 — Human CLI | Playable end-to-end, transcripts replay identically |
| [#4](https://github.com/gyrum-labs/research-text-adventure-ai/issues/4) | P3 — Agent harness | Provider adapters, prompt, extraction, context strategies, budgets |
| [#5](https://github.com/gyrum-labs/research-text-adventure-ai/issues/5) | P4 — Measurement | Metrics, failure taxonomy, sweep, Wilson intervals, replay |
| [#6](https://github.com/gyrum-labs/research-text-adventure-ai/issues/6) | P5 — Web + server | Browser client, swappable session, live agent view |
| [#7](https://github.com/gyrum-labs/research-text-adventure-ai/issues/7) | P6 — Results | The matrix, `RESULTS.md`, failure annotations, cost per solve |
| [#8](https://github.com/gyrum-labs/research-text-adventure-ai/issues/8) | P7 — Generality probe | Org-simulation adventure on the *unchanged* kernel |
| [#9](https://github.com/gyrum-labs/research-text-adventure-ai/issues/9) | P8 — Engine comparison | Same adventure on QuestJS, same harness |

To hand the work to an agent: point it at [`AGENT_BRIEF.md`](./AGENT_BRIEF.md), tell it that
`SPEC.md` is authoritative, and have it work the issues in order. Each issue is self-contained
enough to be picked up on its own.

## Key design rules

| Rule | Why |
|---|---|
| The kernel performs no I/O, reads no clock, uses no unseeded randomness | Determinism is what makes the results checkable |
| The agent's view is built by exactly one function | Makes "no privileged information" a testable property rather than an intention |
| The parser never rewrites the agent's intent | Keeps invalid-action rates attributable to the agent |
| LLM calls are behind a provider port; a mock provider runs everything offline | Cost safety, and CI that needs no keys |
| The kernel speaks the game's own vocabulary | An organisation simulation is written as *another adventure*, not as a new engine (§18) |

## The longer game

The intended follow-on: run an organisation the way this game runs — state held centrally, each
agent handed its current situation and a command vocabulary, acting through tool calls. The kernel
concepts map onto that domain directly (rooms → teams, objects → tickets and artefacts,
observations → an agent's dashboard, goals → objectives). `SPEC.md` §18 sets out the mapping and
identifies which parts are already built.

## Licence

MIT.

## References

Full annotated bibliography with licences and dates accessed: [`docs/REFERENCES.md`](./docs/REFERENCES.md).

- TALES — Text Adventure Learning Environment Suite: <https://github.com/microsoft/tale-suite> · <https://arxiv.org/abs/2504.14128>
- Jericho: <https://arxiv.org/abs/1909.05398> · NAIL: <https://arxiv.org/abs/1902.04259>
- ALFWorld: <https://arxiv.org/abs/2010.03768> · ScienceWorld: <https://arxiv.org/abs/2203.07540>
- ReAct: <https://arxiv.org/abs/2210.03629> · Reflexion: <https://arxiv.org/abs/2303.11366>
- Voyager: <https://arxiv.org/abs/2305.16291> · WebArena: <https://arxiv.org/abs/2307.13854>
- BenchTrace: <https://arxiv.org/abs/2605.29225>
- QuestJS (MIT): <https://github.com/textadventures/quest> · ink (MIT): <https://github.com/inkle/ink>
- TextWorld (Microsoft Research Licence): <https://github.com/microsoft/TextWorld>
