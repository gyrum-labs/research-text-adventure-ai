# research-text-adventure-ai

> **Status: specification complete, implementation pending.**
> This repository currently contains the full requirements for a research proof of concept. The
> build work is specified, task-carded and ready to hand to an implementing agent — see
> [`AGENT_BRIEF.md`](./AGENT_BRIEF.md) and [`TASKS.md`](./TASKS.md).

**Can an AI agent autonomously complete a multi-step mission in a deterministic, stateful text
environment — using only the information and actions available to it, with no privileged knowledge
of the solution?**

The adventure game is not the point. The point is the evidence about how LLM agents behave inside
a controlled, replayable state machine — and a generic kernel that can later be pointed at a
different world (e.g. simulating an organisation with autonomous agents).

---

## The three deliverables

| # | Deliverable | Where |
|---|---|---|
| 1 | **A generic state kernel** — pure, deterministic, domain-neutral. Knows nodes, entities, connections, flags, actions, goals, turns. Never mentions rooms or bombs. | `SPEC.md` §4–§6 |
| 2 | **One engine, three interfaces** — human CLI, browser UI, autonomous agent, all driving the same reducer, provably equivalent via a hash chain | `SPEC.md` §4.3, §14 |
| 3 | **Measurable, replayable results** — metrics, a failure taxonomy, an experiment matrix, and transcripts anyone can re-run | `SPEC.md` §12–§13 |

## The test fixture

A short, original Mission Impossible-style scenario: three areas, a four-step dependency chain, a
lethal trap, and a 10-command gold path.

```
BRIEFING ROOM ──► SERVICE CORRIDOR ──[keycard]──► SERVER VAULT
  keycard           locker ──► wire cutters           bomb (3 wires)
  bulletin                 └─► defusal manual         safe ─[code]─► case
```

The agent receives the mission brief and nothing else. It must discover that the defusal manual is
in a locked locker, that the manual names the safe wire *and* the safe code, and that the vault
door needs a keycard from the first room. Cutting the wrong wire ends the run.

Full scenario specification: [`SPEC.md` §7](./SPEC.md#7-the-mission-impossible-scenario).

## Research questions

- **RQ1** Can a capable LLM agent complete the mission within a 30-turn budget?
- **RQ2** When it fails, *why* — perception, planning, action generation, memory, or grounding?
- **RQ3** How much do observation format and context strategy move the result?
- **RQ4** What is the cost per solved mission?
- **RQ5** Does the kernel support a second, non-adventure world unchanged?

Hypotheses and their falsification conditions: [`SPEC.md` §1.4](./SPEC.md#14-hypotheses-to-be-falsified-not-confirmed).

## Why a custom kernel rather than an existing engine?

We surveyed QuestJS (MIT), ink (MIT), TextWorld (Microsoft Research Licence) and the TALES
benchmark. The short version: an existing adventure framework couples the experiment to an engine
we do not control, and TextWorld's licence is non-commercial. A small purpose-built kernel gives
total control over determinism and over exactly what the agent is allowed to see.

The benchmark that matters for calibration is **TALES**, where even top LLM agents fail the large
majority of human-designed text adventures — long chains of dependent decisions are genuinely hard,
which is why this experiment measures *how* agents fail, not just whether they succeed.

Survey and citations: [`docs/RESEARCH-CONTEXT.md`](./docs/RESEARCH-CONTEXT.md).

## Repository layout

```
SPEC.md                  ← authoritative requirements (start here)
AGENT_BRIEF.md           ← copy-paste brief for an implementing agent
TASKS.md                 ← phase and task cards with acceptance criteria
RESULTS.md               ← findings write-up (Phase 6)
docs/RESEARCH-CONTEXT.md ← engine survey, licences, citations
docs/ARCHITECTURE.md     ← diagrams + ADRs (Phase 0)
docs/SCENARIOS.md        ← scenario authoring guide (Phase 1)
src/                     ← kernel · scenarios · session · agents · runner · cli · server · web
tests/                   ← kernel, scenario, architecture, leakage, equivalence, replay
examples/runs/           ← a few committed example transcripts
```

## Key design rules

| Rule | Why |
|---|---|
| The kernel performs no I/O, reads no clock, uses no unseeded randomness | Determinism is what makes the results checkable |
| The agent's view is built by exactly one function | Makes "no privileged information" a testable property rather than an intention |
| The parser never rewrites the agent's intent | Keeps invalid-action rates attributable to the agent |
| LLM calls are behind a provider port; a mock provider runs everything offline | Cost safety, and CI that needs no keys |
| The kernel vocabulary is domain-neutral | This is what makes the organisation-simulation goal a configuration change rather than a rewrite |

## The longer game

The intended follow-on: run an organisation the way this game runs — state held centrally, each
agent handed its current situation and a command vocabulary, acting through tool calls. The kernel
concepts map onto that domain directly (nodes → teams, entities → tickets and artefacts,
observations → an agent's dashboard, goals → objectives). `SPEC.md` §18 sets out the mapping and
identifies which parts are already built.

## Licence

MIT.

## References

- TALES — Text Adventure Learning Environment Suite: <https://github.com/microsoft/tale-suite> · <https://arxiv.org/abs/2504.14128>
- QuestJS (MIT): <https://github.com/textadventures/quest>
- ink (MIT): <https://github.com/inkle/ink>
- TextWorld: <https://github.com/microsoft/TextWorld>
