<!-- page-version: 1.0.0 status: draft last-reviewed: 2026-11-08 -->

# Specification: AI Text Adventure & State-Based Agent Experiment

**Repository:** `gyrum-labs/research-text-adventure-ai`
**Status:** Approved for implementation. This document is the authoritative requirements source.
**Language:** TypeScript (strict), Node 20+, ESM.
**Type:** Standalone research proof of concept.

*I began this project wanting to know whether a language model could finish a job without being
shown how. It took me a while to notice that the question I actually wanted was smaller: could it
finish a job without being shown the answer?*

> **Read this first.** The adventure game is *not* the deliverable. The deliverable is evidence about
> whether an LLM agent can operate reliably inside a deterministic, stateful environment using only
> the information and actions available to it. And a **state kernel written in the game's own
> language** (rooms, objects, doors, flags), which an organisation simulation can then be
> expressed *as*. The game is the *test fixture* that makes the evidence cheap to produce. See
> §1.3, §3.1 and §18.
>
> **New here?** Start with [Part 0, Orientation](#part-0-orientation): it teaches the
> whole idea from the beginning, with a worked example, and needs nothing else. The
> [glossary](#glossary) follows it. Sections §1 onward are the precise reference an implementer
> works from.

> **Reader track**
>
> - **Ten minutes.** Part 0, from 0.1 to 0.4. That is the whole idea and one full turn of it.
> - **Thirty minutes.** Part 0 in full, then §7. You now know the project and the fixture.
> - **Two hours.** Part 0, §1, §2 and §12. You now know the question, the scope and the
>   measurement.
> - **A day.** Everything, then the experiment series. You are ready to build.

---

## Part 0: Orientation

*This part teaches the material from the beginning. If you are new to this project, read it in
order and you will need nothing else before you can read the rest of the document. Everything from
§1 onward is the precise reference that an implementer works from.*

> **Key insight.** The whole project reduces to one sentence: build a world you can trust, then
> find out what an agent does inside it. Everything else, the kernel, the harness, the taxonomy,
> the matrix, is machinery for making that sentence checkable.

### 0.1 The question, in plain words

Here is a thing we want to know:

> **Can a large language model drive itself through a task that has rules, without being told the
> answer?**

Concretely: we build a small computer game. The game has rooms, objects, doors, and a goal. An AI
model is dropped into it with no instructions beyond the rules of the game and the mission it was
given. We watch what it does. We record everything. Then we can say something honest about how
reliable AI agents are when the work is *stateful*. When what happened three moves ago decides
what is possible now.

Why not just ask the model? Because a model can produce a confident, fluent, wrong answer in one
shot. A game does not let it do that. The game **checks**. If the model claims to have disarmed the
bomb, the bomb's state says otherwise. That is the whole point: we are not measuring how good the
model's prose is, we are measuring whether it can keep track of a world and act correctly inside it.

### 0.2 Why a text adventure is a good laboratory

Text adventures are games where you type commands like `take keycard` or `go corridor`, and the
game describes what happened. They are a surprisingly good testbed for AI agents, and the research
literature agrees. The [TALES benchmark](https://arxiv.org/abs/2504.14128) exists precisely to
measure AI agents this way.

Three properties make a text adventure useful here:

1. **The rules are fixed and checkable.** The world does not negotiate. A door is locked until a
   keycard is used. There is no ambiguity to hide behind.
2. **The state is small enough to read.** We can hold the entire world in memory and print it. When
   an agent fails, we can show you the exact state it failed in.
3. **It is deterministic.** The same commands always produce the same result. So a run can be
   replayed exactly, and a finding can be checked rather than trusted.

And there is a fourth reason, which is the one that matters most long-term: **the vocabulary of an
adventure game is the vocabulary of an organisation.** Rooms become teams, objects become tickets
and artefacts, doors become handoffs and dependencies, the goal becomes an objective, and an agent
in a room is an agent with a queue and a context. That mapping is written out in §18. This project
is, in part, a rehearsal for that.

### 0.3 The six words you need

Everything in this project is built from six concepts. Learn these and the rest is detail.

| Word | What it means | Example from our adventure |
|---|---|---|
| **Room** | A place the agent can be in. | The *Service Corridor*. |
| **Object** | A thing that exists in a room, or that the agent is carrying. | The *wire cutters*, the *defusal manual*, the *keycard*. |
| **Door** | A connection between two rooms. It may be open, closed, or locked. | The *vault door*, locked until a keycard is used. |
| **Action** | One command the agent issues, which may change the world or may not. | `take keycard`, `open locker`, `cut yellow wire with cutters`. |
| **Goal** | A condition that must become true for the adventure to be won. | *Disarm the bomb.* *Recover the case.* |
| **Turn** | One action and its consequences. The game's only unit of time. | Reading `take keycard` and seeing what happened is one turn. |

Two more appear constantly, so:

- **State**: The complete description of the world right now: which room the agent is in, what it
  is carrying, which doors are open, which goals are done. The state is a value, not a process.
- **Observation**: The slice of that state the agent is allowed to see. This is deliberately
  *smaller* than the state. The agent cannot see the contents of a closed locker until it opens it.
  That gap is the entire experiment.

### 0.4 One turn, end to end

Here is a single turn of our adventure, in full, so the shape of the system is concrete.

**The adventure.** The agent starts in the *Briefing Room*. It has been told only this:

> A booby-trapped case is locked in the server vault. Two objectives: disarm the bomb, and recover
> the case. Nothing else is known. You are in the briefing room. Discover the rest by exploring.

**What the agent sees** (this is the observation. The *only* thing it gets):

```
Turn 0
Location: Briefing Room
A windowless office. A desk, a wall notice, and a door south to the service corridor.
You can see: keycard, bulletin, desk
Exits: south → Service Corridor
Carrying: (nothing)
Objectives:
  - Disarm the bomb  [not done]
  - Recover the case  [not done]
```

**What the agent replies** (one command, optionally preceded by its reasoning):

```
THINK: The keycard is on the desk. The vault will need it, and I should take what I can see
before moving on.
COMMAND: take keycard
```

**What the engine does.** The engine is a *pure function*. It takes the state and the command, and
produces a new state and a list of events. It never guesses, never asks the model anything, and
never changes its mind:

```
You pocket the keycard.

Turn 1
Location: Briefing Room
Carrying: keycard
```

The new state is fingerprinted so that the run can be checked later:

```
h1 = sha256(h0 + ':' + canonicalJson(state1))
```

That is the whole loop, repeated until the agent wins, loses, or runs out of turns:

```
   ┌──────────────────────────────────────────────────────────────┐
   │                                                              │
   ▼                                                              │
 observe  ──►  decide  ──►  reduce  ──►  record  ──►  check goals ─┘
 (the state)   (the model)  (the engine) (the log)   (win / continue)
```

Notice what the engine does **not** do. It does not decide what the agent should do, it does not
fix up a malformed command, and it does not reward or punish. It is a rulebook. All the
interesting behaviour is in the middle box. And that is exactly what we want to measure.

### 0.5 Three ways to play, one engine

The same adventure is playable three ways, and all three drive the *same* engine:

| Interface | Who is playing | Why it exists |
|---|---|---|
| **Human CLI** (`npm run play`) | You | Proves the adventure is actually solvable, and produces the transcripts the agent is compared against. |
| **Browser** (`npm run web:dev`) | You | The same thing, with a screen. Also the place to *watch* an agent play. |
| **Agent runner** (`npm run agent`) | The model | The experiment. Headless, scripted, recorded, scored. |

This matters for the integrity of the result. Because a human transcript and an agent transcript
are produced by the same engine, "the agent solved it" means the same thing as "a human solved
it". We can compare them directly, and we can prove the three interfaces agree. See §4.3.

### 0.6 How we will know whether it worked

The obvious measure is a success rate: *did the agent complete the mission?* We will report it. But
we expect it to be low and noisy, and a bare number is a poor research result. It cannot tell you
what to fix.

So the primary artefact is a **failure taxonomy**: every unsuccessful run is classified into
exactly one category, computed automatically from the transcript. See §12.3. Was the agent's command
malformed? Did it invent an object that was not there? Did it act before it had discovered the fact
it needed? Did it cut the wrong wire? Did it loop? Did it run out of turns?

That taxonomy is the thing worth having. It tells you what to fix, and it transfers: the same
categories apply to an agent working inside an organisation.

Alongside it we record the cheap, objective numbers: how many turns it took, how many commands
were invalid, how many tokens it cost, and, crucially, whether the engine behaved itself. The
environment is fully deterministic, so **every** run must replay to an identical state history
See §13. If the environment is not trustworthy, the agent's results mean nothing.

### 0.7 What this project is not

- It is **not** a game. The adventure is a fixture. A small, controlled world we can reason about.
- It is **not** a model training project. We evaluate; we do not fine-tune.
- It is **not** a claim about AI capability in general. One hand-built adventure is a narrow claim.
  §17 lists the threats to validity honestly, and Phase 7 adds a second world.
- It is **not** an organisation simulator yet. §18 describes the seam, and Phase 7 tests whether the
  adventure metaphor actually holds for an organisation.

### 0.8 How to read the rest of this document

| If you are… | Read |
|---|---|
| **New to the project** | This part, then §1 (what we are trying to find out), then §7 (the adventure itself). That is enough to understand the whole idea. |
| **Going to implement it** | §1–§16 in order, implementing phase by phase. See §16. The data model is the part to read most carefully: see §6. |
| **Reviewing the research design** | §1 (questions and hypotheses), §12 (what is measured), §17 (what could make the result wrong). |
| **Sceptical / new to the team** | §3 (why we built our own engine), `docs/RESEARCH-CONTEXT.md` (the evidence), and §17. |

---

## Glossary

Terms used throughout this document, in the order a newcomer meets them.

| Term | Meaning |
|---|---|
| **Adventure** | The complete definition of one game: its rooms, objects, doors, actions and goals. Pure data. No logic. |
| **Room** | A place the agent can be in. |
| **Object** | A thing in a room or carried by the agent. |
| **Door** | A connection between two rooms; it may be open, closed or locked. |
| **Action** | One command, with the conditions under which it succeeds and the effects when it does. |
| **Goal** | A condition that must hold for the adventure to be won. Checked on the end state, not the route. |
| **State** | The complete description of the world at one moment. A plain value, fully serialisable. |
| **Observation** | The part of the state the agent may see. Smaller than the state, on purpose. |
| **Turn** | One action and its consequences. The engine's only unit of time. |
| **Kernel** | The pure engine: `(state, command) → { state, events }`. No I/O, no clock, no randomness. |
| **Reducer** | The specific function that is the kernel. Named for the Redux/Elm idea of folding a state forward. |
| **Pure function** | A function whose output depends only on its inputs. No clock, no randomness, no side effects. This is what makes a run replayable. |
| **Event** | Something that happened: an action succeeded, an action failed, a goal completed. The transcript is a list of events. |
| **Transition** | The result of applying one command: the new state, the events, and whether anything changed. |
| **Predicate** | A condition the engine can check. "the keycard is in the inventory", "the bomb is defused". Six kinds exist. See §5.1. |
| **Effect** | A change the engine can apply. "move to this room", "set this flag true". Eight kinds exist. See §5.1. |
| **Hash chain** | A fingerprint of every state, each derived from the last. Makes a run tamper-evident and replay-checkable. |
| **Canonical JSON** | A JSON representation with sorted keys and no incidental whitespace, so two equal states always produce identical bytes. |
| **Policy** | Whatever is choosing the agent's next command. The human, a script, a random picker and the model are all policies. The runner cannot tell them apart. |
| **Budget** | A limit on turns, tokens, cost or wall-clock time. Every run has them, so a confused agent cannot run up a bill. |
| **Guard** | A rule that stops a run early. A repeated state, too many provider errors, a blown budget. |
| **Transcript** | The JSONL record of a run: every observation, command, event and state hash. |
| **Replay** | Re-running a transcript's commands through the engine and checking the hashes match. Proves the environment is deterministic. |
| **Context strategy** | What the model is allowed to remember: the whole history, a recent window, a summary of what it has seen, or nothing. An experimental variable. See §10.4. |
| **Failure taxonomy** | The fixed set of categories every failed run is sorted into, computed from the transcript. See §12.3. |
| **Wilson interval** | A way to state a success rate with its uncertainty, for small samples. §12.4. |
| **Scenario vs adventure** | Historical: earlier drafts called it a "scenario". It is now an *adventure* throughout, matching the game's own language. |
| **warp#NNNNN** | An identifier in the team's ticket system. GitHub issues in `gyrum-labs/devtools` carry one in their title. |

---

## Table of contents

**Part 0, Orientation** (you are here)

0. [Orientation: start here](#part-0--orientation-start-here)
   · [Glossary](#glossary)

**Part 1. The reference specification**

1. [Objective, research questions, hypotheses](#1-objective-research-questions-hypotheses)
2. [Scope, non-goals, constraints](#2-scope-non-goals-constraints)
3. [Research context: which engine?](#3-research-context-which-engine)
4. [Architecture](#4-architecture)
5. [Design patterns](#5-design-patterns)
6. [Data model](#6-data-model)
7. [The Mission Impossible adventure](#7-the-mission-impossible-adventure)
8. [Command grammar](#8-command-grammar)
9. [Observation contract](#9-observation-contract)
10. [Agent protocol](#10-agent-protocol)
11. [Runner, budgets and safety guards](#11-runner-budgets-and-safety-guards)
12. [Evaluation: metrics, experiment matrix, acceptance](#12-evaluation)
13. [Determinism, replay and persistence](#13-determinism-replay-and-persistence)
14. [Interface decision: client, server, or both](#14-interface-decision-client-server-or-both)
15. [Repository layout and tooling](#15-repository-layout-and-tooling)
16. [Phase plan and acceptance criteria](#16-phase-plan-and-acceptance-criteria)
17. [Risks and threats to validity](#17-risks-and-threats-to-validity)
18. [Roadmap to organisation simulation](#18-roadmap-to-organisation-simulation)
19. [Open questions](#19-open-questions)
20. [Source references](#20-source-references)

> **Key takeaways**
>
> - The environment is the thing under suspicion. Build it first, and prove it.
> - The agent's view of the world is smaller than the world. That gap is the experiment.
> - One engine, three interfaces. A human run and an agent run mean the same thing.
> - The failure category is the finding. A bare success rate cannot tell you what to fix.
> - The organisation is the destination. The adventure is the rehearsal.

---

## 1. Objective, research questions, hypotheses

### 1.1 Primary objective

Determine whether an AI agent can autonomously complete a multi-step mission in a deterministic,
stateful text environment, **given no privileged information about the solution**, and produce
**measurable, replayable** results that another person can reproduce and audit.

### 1.2 Secondary objectives

| # | Objective | Why it matters |
|---|---|---|
| S1 | Build an **adventure-native** state kernel: rooms, objects, doors, flags. The game's own vocabulary, used directly | The kernel should read like the thing it models, and must survive being pointed at an organisation simulation expressed as an adventure. See §18 |
| S2 | Prove **one engine, three interfaces**: human CLI, browser UI, autonomous agent. Same reducer, same rules | Confirms the environment is the controlled variable, not the UI |
| S3 | Produce a **failure taxonomy** for LLM agents in stateful environments | The taxonomy is the reusable artefact; the win-rate is not |
| S4 | Measure the effect of **context strategy** and **action masking** | Directly informs how an org-simulation agent should be built |
| S5 | Produce **cost and latency** data per solved mission | Determines feasibility at scale |
| S6 | Keep every run **replayable and auditable** | Research claims must be checkable, not asserted |

### 1.3 Research questions

- **RQ1 (capability).** Can a modern LLM agent complete a 10-command mission requiring a 4-step
  dependency chain, with only a mission brief and the text it has observed?
- **RQ2 (reliability).** When it fails, *why* does it fail? Is the failure in perception
  (misreading the observation), reasoning (wrong plan), action generation (invalid command),
  memory (losing a discovered fact), or grounding (inventing an object that is not there)?
- **RQ3 (prompt sensitivity).** How much does success rate move across context strategies
  (`none` / `full` / `window` / `structured`) and between free-form and masked action spaces?
- **RQ4 (scale).** What is the cost per solved mission, and how does it scale with task depth?
- **RQ5 (generality).** Does the adventure vocabulary hold up as a model for a second domain.
  specifically, can an organisation be expressed **as** an adventure (teams as rooms, tickets as
  objects, handoffs as doors) without changing the kernel?

### 1.4 Hypotheses (to be falsified, not confirmed)

| ID | Hypothesis | Falsified if |
|---|---|---|
| H1 | A capable LLM agent solves the mission ≥ 80% of runs within a 30-turn budget | Success rate < 80% across all model × condition cells |
| H2 | Masking the action space to legal commands **raises** success rate | Success rate unchanged or lower |
| H3 | A structured observation beats prose for multi-step reasoning | Structured condition does not dominate |
| H4 | Most failures are **not** parsing failures but *reasoning/ordering* failures | > 50% of failures are unparsable/invalid commands |
| H5 | Full transcript history causes **context dilution** vs a structured memory summary | `full` is **not** worse than `structured` on both success and steps-to-solve |

H5's falsification condition was inverted in an earlier draft, which read that the hypothesis
is falsified when `full` *is* worse. The hypothesis claims that dilution happens, so the
evidence of dilution supports it and its absence falsifies it. The row now says so.

H4 and H5 are the most valuable outcomes for the org-simulation goal and should be reported even if
H1 holds.

---

## 2. Scope, non-goals, constraints

### 2.1 In scope

- A generic, deterministic state kernel in TypeScript.
- One authored adventure ("Mission Impossible"-style) expressed purely as data.
- Three interfaces over the same kernel: human CLI, browser UI, autonomous AI agent.
- An LLM adapter layer (≥ 2 providers) with no SDK lock-in.
- A measurement harness: metrics, experiment matrix, aggregated results, failure taxonomy.
- Full transcripts, replay, and hash-chain verification.

### 2.2 Non-goals (explicitly out of scope)

| Non-goal | Rationale |
|---|---|
| Adopting QuestJS / ink / TextWorld as the runtime | Coupling the experiment to an engine defeats the S1 goal. §3. |
| Training or fine-tuning models | Evaluation only. |
| Reproducing an existing commercial adventure game's text | The adventure is an original homage; see §7.1. |
| Multiplayer, accounts, persistence beyond a session file | Unnecessary for the research question. |
| GUI beyond a plain browser client | The environment must stay inspectable and cheap to run. |
| An NLP-based command parser | Parsing must be deterministic and free so that failures are attributable to the agent, not the parser. §8.2. |
| Real-world org simulation in v1 | That is Phase 7 / a follow-on repo. §18 specifies the mapping and the seam. |

### 2.3 Constraints

| ID | Constraint |
|---|---|
| C1 | The kernel performs **no I/O**, no wall-clock reads, no unseeded randomness. Determinism is enforced by test and by architecture test. See §16, P0. |
| C2 | The agent **never** receives adventure-authoring data (gold path, hint tables, predicate source). Enforced by a dedicated observation builder + leakage test. |
| C3 | All LLM traffic is **opt-in** and cost-capped. A `MockProvider` must allow the full harness to run with zero network and zero cost. |
| C4 | The kernel must not import from `src/agents`, `src/cli`, `src/server` or `src/web`. Enforced by an architecture test. |
| C5 | Every run writes a machine-readable transcript with model, prompt hash, condition, seed and outcome. |
| C6 | No secrets in the repo. Provider keys come from environment variables only. `.env` is git-ignored; `.env.example` is committed. |

---

## 3. Research context: which engine?

The question "is there a simple open-source adventure engine we could utilise?" was researched.
Summary of findings (full detail and citations in `docs/RESEARCH-CONTEXT.md`):

| Option | What it is | Licence | Advantages | Disadvantages | Decision |
|---|---|---|---|---|---|
| **QuestJS** (`textadventures/quest`) | JavaScript adventure engine: rooms, objects, text commands, runs in browser | **MIT** | Substantial existing framework; browser-native | Existing game architecture (attributes, dynamic text) complicates controlled agent testing; adds a dependency we do not control | Alternative. Phase 8 comparison |
| **ink** (`inkle/ink`) | Narrative scripting language for branching stories | **MIT** | Excellent branching narrative; browser/Room | Optimised for storytelling, not for general world-state simulation or agent evaluation | Future experiment |
| **TextWorld** (`microsoft/TextWorld`) | RL sandbox for text games: training + evaluation of agents | **Microsoft Research License** (not OSI-approved) | Purpose-built for evaluating agents in stateful text environments | Python ecosystem; heavy install; licence is non-commercial-restricted | Research reference only |
| **TALES** (`microsoft/tale-suite`) | Benchmark of curated text games across Jericho/TextWorld/TextWorld-Express/ScienceWorld/ALFWorld | MIT | Real numbers: on human-written games (Jericho. The suite's only non-synthetic environment) the best agents reach only **13.4%** of maximum normalised score, vs 76–100 on synthetic environments | Python; heavyweight; its metric is a normalised score, not per-game success | **Primary reference for expected effect sizes** |
| **Minimal TypeScript reducer (this repo)** | Purpose-built pure state-transition kernel | MIT | Total control, deterministic, dependency-light, reusable for the org-simulation goal | We must implement ~15 mechanics ourselves | **Chosen for v1** |

**Decision:** build a small, generic TypeScript kernel. The adventure content is a *adventure*. Data
describing rooms, objects, actions, goals. Evaluated by the kernel. QuestJS and ink are deferred
comparisons (Phase 8). TextWorld/TALES are read for calibration: TALES' result. A roughly
tenfold score collapse between synthetic and human-written games. Sets our expectation that
**human-shaped worlds are where agents break**, and that failure analysis matters more than a
headline win-rate.

> **Note on the vocabulary.** The kernel deliberately speaks the game's own language. Rooms,
> objects, doors, flags. Rather than a neutral abstraction. An organisation simulation is
> therefore written as another adventure (teams as rooms, tickets as objects, handoffs as doors),
> not as a new engine. See §3.1 and §18.

> **Note on comparability.** TALES deliberately gives its agent almost no domain information, and
> scores a normalised 0–100 per environment rather than binary success. Our prompt supplies a
> mission brief and a command grammar, and our metric is binary goal completion. **Our numbers are
> not comparable to TALES numbers** and must not be plotted on the same axis
> (`docs/RESEARCH-CONTEXT.md` §3.5–§3.7).

### 3.1 The design decision that follows from this

If the game engine is removed entirely, the kernel still speaks an **adventure vocabulary**, and
that is deliberate. The core knows *rooms, objects, doors, flags, actions, goals, turns*. The
language of the game it runs, not a neutral abstraction over it.

The reasoning: the adventure is not merely the fixture, it is the **model**. The longer-term aim
is to run an organisation the way this game runs, and that works best when the organisation is
expressed *as* an adventure. Teams as rooms, tickets as objects, handoffs as doors. An
abstraction layer between "the game" and "the kernel" would have to be taught to every reader and
every agent, for no benefit. §18 sets out the mapping and the seam.

This reverses an earlier draft of this specification, which kept the kernel domain-neutral so it
could be pointed at other worlds. That was over-engineering: it made the code harder to read
without making the organisation simulation any easier to write. See `docs/ARCHITECTURE.md`
ADR-002 (superseded) and ADR-016.

---

## 4. Architecture

### 4.1 Component map

```
                    ┌──────────────────────────────────────────────┐
                    │              Interfaces (edges)              │
                    │  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
                    │  │ Human CLI│  │ Web UI   │  │ Agent CLI  │  │
                    │  └────┬─────┘  └────┬─────┘  └─────┬──────┘  │
                    └───────┼─────────────┼──────────────┼─────────┘
                            │             │              │
                    ┌───────▼─────────────▼──────────────▼─────────┐
                    │            Session (port)                    │
                    │  InMemorySession │ HttpSession │ FileSession  │
                    └───────────────────────┬───────────────────────┘
                                            │
                    ┌───────────────────────▼───────────────────────┐
                    │            KERNEL  (pure, no I/O)            │
                    │  Adventure ──► reduce(state, command) ──► new  │
                    │      ▲                    │                  │
                    │      │                    ▼                  │
                    │  goalTable        CommandParser             │
                    │  hintTable        Renderer (text | json)     │
                    └───────────────────────┬───────────────────────┘
                                            │  Observation
                    ┌───────────────────────▼───────────────────────┐
                    │            Agent harness (edges)             │
                    │  AgentPolicy ◄── LlmPolicy ──► LlmProvider  │
                    │      ▲                          (Anthropic,   │
                    │      │                           OpenAI,      │
                    │  ScriptedPolicy                   Ollama,     │
                    │  RandomPolicy                    Mock)       │
                    └───────────────────────┬───────────────────────┘
                                            │
                    ┌───────────────────────▼───────────────────────┐
                    │      Runner / Recorder / Evaluator           │
                    │  budgets, loop detection, transcripts,      │
                    │  metrics, experiment matrix, results        │
                    └─────────────────────────────────────────────┘
```

### 4.2 Module responsibilities

| Module | Responsibility | Must not do |
|---|---|---|
| `src/kernel` | Pure state transition, parsing, goal/hint evaluation, hashing | I/O, clock, randomness, imports from edges |
| `src/adventures` | Adventure *data* + prose + gold path | Contain logic beyond declarative data |
| `src/session` | Holds a session (state + adventure + id); create/reset/snapshot | Contain adventure logic |
| `src/agents` | Policies and LLM providers; prompt assembly; action extraction | Mutate kernel internals |
| `src/runner` | Turn loop, budgets, guards, transcript recording, metrics | Know about specific adventures |
| `src/cli` | Argument parsing, REPL, human play, agent runs, eval sweeps | Contain game rules |
| `src/server` | HTTP routes over a server-held session | Contain game rules |
| `src/web` | Browser client | Contain game rules |

### 4.3 One engine, three interfaces: the equivalence contract

This is the single most important structural property of the repo. It must be **testable**:

> **REQ-EQUIV-1.** For a given adventure and the same sequence of commands, the human CLI, the web
> client and the agent runner must produce **identical state hash chains**. See §13.2.

Enforced by a single golden transcript (`tests/fixtures/golden.jsonl`) replayed through all three
interfaces, asserting the final hash chain matches.

### 4.4 Dependency rules

- `kernel` → nothing (except `node:crypto` for hashing). No clock, no randomness, no I/O.
- `adventures` → `kernel` types only. The adventure files are data; the search tools that
  explore an adventure live in `runner`.
- `session` → `kernel`.
- `agents` → `kernel` types, `adventures` data.
- `runner` → `kernel`, `agents`, `adventures`.
- `cli` / `server` / `web` → `runner`, `kernel`, `agents`, `adventures`.

Every layer may look down and never up. The command line is the composition root, so it is
the one layer that reaches the adventure data directly, and it is the layer that picks the
provider.

The provider seam sits inside `agents`. The kernel never sees a model, and the runner never
sees a provider: the runner asks a policy, and the policy is the only thing that talks to one.

Enforced by `tests/architecture.test.ts` (C4), and by a lint rule that keeps the kernel a leaf.

---

## 5. Design patterns

| Pattern | Where | Why |
|---|---|---|
| **Pure reducer / state transition function** | `kernel.reduce(state, command) → { state, events }` | Determinism, testability, replay, hash chaining, and the ability to run the identical transition in Room and in a browser |
| **Command pattern** | Every player intent is a parsed `Command { verb, args }` before any effect | Uniform error handling; illegal actions become data, not exceptions |
| **Specification / rule DSL** | `Predicate[]` + `Effect[]` on each action | Adventure authors declare *what* is true; the kernel decides *how* to evaluate it. Keeps adventure semantics out of the core |
| **Strategy** | `AgentPolicy { next(observation, history): Promise<Command \| null> }` | Human, scripted, random and LLM agents are interchangeable; the runner cannot tell them apart |
| **Ports & adapters (hexagonal)** | `LlmProvider`, `Session` | Swap Anthropic ↔ OpenAI ↔ Ollama ↔ Mock; swap in-memory ↔ HTTP session, with no change to the kernel |
| **Observer / event stream** | `reduce` emits `Event[]`; the transcript is the event log | Lets the UI animate, the evaluator classify failures, and the replayer assert. All from one stream |
| **Repository / snapshot** | `Session.save()/load()` as plain JSON | State is fully serialisable; sessions are files; no database |
| **Fixture + golden-file testing** | `tests/fixtures/*.jsonl` | Adventure behaviour and interface equivalence are pinned to readable files, not to assertions scattered across code |
| **Circuit breaker / budget guard** | Runner stop conditions + parse-failure backoff | An agent that loops or babbles must not run up a bill |
| **Structured output with repair** | LLM asked for a strict envelope; extractor falls back through a defined chain | Model-specific formatting drift is handled centrally, and every failure is counted. See §12.3 |
| **Seeded PRNG** | Any randomness (random policy, jittered adventures) takes an injected seed | Reproducibility |

### 5.1 The specification DSL (kernel vocabulary)

The kernel understands exactly these ten predicates and ten effects. Nothing else.

```ts
type Predicate =
  | { op: 'in_room'; room: Id }                                 // the player is here
  | { op: 'object_in_room'; object: Id; room: Id }              // a named object is there
  | { op: 'arg_in_room'; arg: string }                         // the bound object is here
  | { op: 'carrying'; object: Id }                              // a named object is carried
  | { op: 'flag'; key: string; value: boolean }                 // a world fact
  | { op: 'object_flag'; object: Id; key: string; value: boolean }
  | { op: 'arg_flag'; arg: string; key: string; value: boolean }
  | { op: 'arg_equals'; arg: string; value: string }            // the bound value matches
  | { op: 'goal_complete'; goal: Id }
  | { op: 'hints_remaining'; count: number };

type Effect =
  | { op: 'move_to'; room: Id }
  | { op: 'set_flag'; key: string; value: boolean }
  | { op: 'set_arg_flag'; arg: string; key: string; value: boolean }
  | { op: 'set_arg_room'; arg: string; room: Id | null }
  | { op: 'add_to_inventory'; arg: string }
  | { op: 'remove_from_inventory'; arg: string }
  | { op: 'reveal_container'; arg: string }
  | { op: 'set_arg_state'; arg: string; key: string; value: string }
  | { op: 'give_hint' }
  | { op: 'finish'; outcome: 'success' | 'failure'; reason: string };
```

This is the whole engine. Everything else is data.

The DSL grew from the original six predicates and eight effects as the scenario's needs became
concrete. Three additions earned their place:

- **`arg_equals`** lets an action check the value of an argument, which is how a code lock works
  (`unlock safe with 4821`) and how an action identifies its own target (`cut yellow wire`). It
  compares after stripping articles, so "my keycard" and "keycard" are the same thing.
- **`carrying`** names a fixed object rather than an argument, which is how one action refers to
  another ("the vault door needs the keycard").
- **`give_hint`** spends a hint credit, which keeps the hint economy inside the engine rather than
  in the runner.

Every member is used by the shipped adventure, and the kernel's own source names none of that
adventure's objects. A test enforces both.

## 6. Data model

### 6.1 Core types (target shape: `src/kernel/types.ts`)

```ts
export type Id = string;

// ---------- Adventure (data only) ----------

export interface Adventure {
  id: string;
  title: string;
  version: string;
  /** The mission briefing. Given to the agent verbatim. Must not reveal the solution. */
  brief: string;
  /** Shown when the adventure is solved/failed. */
  outcomeText: { success: string; failure: string };
  rooms: Record<Id, Room>;
  objects: Record<Id, GameObject>;
  doors: Record<Id, Door>;
  actions: ActionSpec[];
  goals: GoalSpec[];
  hints: HintSpec[];
  /** The codes in play. The oracle searches them; the agent must read them. */
  codes?: string[];
  initial: GameState;
}

export interface Room {
  id: Id;
  name: string;
  /** Prose shown on arrival. */
  description: string;
  /** GameObject ids present in this room. */
  contents: Id[];
  /** Door ids leading out of this room. */
  exits: Id[];
}

export interface GameObject {
  id: Id;
  name: string;
  /** Extra words that resolve to this object (e.g. "cutter", "pliers"). */
  aliases?: string[];
  description: string;
  /** Rendered only when `examine`d — may reveal detail not in `description`. */
  detail?: string;
  /** Container semantics: opening reveals `contains`. */
  container?: { closed: boolean; contains: Id[]; lockedBy?: Id };
  /** Readable: `read` yields `detail`. */
  readable?: boolean;
  /** Takeable: the object can be picked up and carried. */
  takeable?: boolean;
}

export interface Door {
  id: Id;
  from: Id;
  to: Id;
  /** Direction word shown to the player, e.g. "north", "back", "vault door". */
  direction: string;
  label: string;
  /** If set, traversing requires an action (e.g. `unlock`) with this object. */
  requiresAction?: { verb: string; object: Id };
  /** If true, traversal is refused until the door is unlocked. */
  locked?: boolean;
}

export interface ActionSpec {
  /** Canonical verb, e.g. "take". */
  verb: string;
  /** Player-facing synonyms, e.g. ["get", "grab"]. */
  synonyms?: string[];
  /** Argument shapes. Role constrains where the argument may be resolved from. */
  args: ArgSpec[];
  /** All must hold for the action to succeed. */
  requires: Predicate[];
  /** Applied on success. */
  effects: Effect[];
  /** Prose for success / failure. */
  text: { success: string; failure: string };
  /** Optional: hint index consumed when this action fails informatively. */
  failureHint?: number;
}

export type ArgSpec = {
  name: string;
  role: 'room' | 'object' | 'object-in-room' | 'object-in-inventory' | 'text';
};

export interface GoalSpec {
  id: Id;
  /** Mission text. Disclosed to the agent — the objective, not the method. */
  text: string;
  requires: Predicate[];
  /** True when the agent has demonstrably achieved it (used to mark complete). */
  achievedWhen: Predicate[];
}

export interface HintSpec {
  id: Id;
  /** The fact revealed. Deliberately vague — a nudge, not the answer. */
  text: string;
}

// ---------- Runtime state ----------

export interface GameState {
  roomId: Id;
  inventory: Id[];
  /** Per-object runtime facts: where it is, and mutable flags. */
  objects: Record<Id, GameObjectState>;
  /** World-level facts (e.g. `bomb_defused`). */
  flags: Record<string, boolean>;
  /** Turn counter. The kernel's only notion of time. */
  turn: number;
  /** Remaining hint credits. */
  hintsLeft: number;
  status: 'running' | 'success' | 'failure';
}

export interface GameObjectState {
  at: Id | null;              // room id, or null when carried
  flags: Record<string, boolean>;
  state: Record<string, string>;
}

// ---------- Commands, events, observations ----------

export interface Command {
  verb: string;
  args: Record<string, string>;
  /** The raw text the player produced (for transcripts and error messages). */
  raw: string;
}

export type Event =
  | { type: 'command'; raw: string; verb: string; args: Record<string, string>; turn: number }
  | { type: 'parse_error'; raw: string; message: string; turn: number }
  | { type: 'invalid_action'; verb: string; message: string; turn: number }
  | { type: 'action_succeeded'; verb: string; message: string; turn: number }
  | { type: 'action_failed'; verb: string; message: string; turn: number }
  | { type: 'state_changed'; summary: string; turn: number }
  | { type: 'hint_given'; text: string; turn: number }
  | { type: 'goal_completed'; goal: Id; text: string; turn: number }
  | { type: 'run_ended'; outcome: 'success' | 'failure' | 'budget_exhausted' | 'loop_detected' | 'provider_error'; reason: string; turn: number };

export interface Transition {
  state: GameState;
  events: Event[];
  /** True when the transition changed nothing (illegal action). */
  changed: boolean;
}
```

### 6.2 State hash chain

Every transition produces a hash: `h_n = sha256(h_{n-1} + ':' + canonicalJson(state_n))`, with
`h_0 = sha256(canonicalJson(initialState))`. Canonical JSON = keys sorted recursively, no
whitespace. The chain is written into every transcript, which makes runs tamper-evident and makes
"the three interfaces are equivalent" a checkable assertion rather than a claim.

---

## 7. The Mission Impossible adventure

### 7.1 Provenance and originality

This adventure is an **original homage** to the classic Mission Impossible text adventures (a
three-area, lock-and-key, bomb-disposal mission). No existing game's prose, room names, puzzle
layout or text is reproduced. The purpose is to reproduce the *shape* of the puzzle. A short
dependency chain with a lethal trap. Not any specific work.

### 7.2 Narrative

> **Mission brief (given to the agent verbatim, the only mission-level information it receives):**
>
> *Mission brief. A booby-trapped case is locked in the server vault. You have two objectives:
> disarm the bomb, and recover the case. Nothing else is known. You are in the briefing room.
> Discover the rest by exploring.*

### 7.3 Layout

```
   ┌──────────────────────┐        ┌──────────────────────┐        ┌──────────────────────┐
   │     BRIEFING ROOM    │        │   SERVICE CORRIDOR   │        │     SERVER VAULT     │
   │                      │◄──────►│                      │◄──────►│                      │
   │  • keycard (desk)    │  open  │  • locker (closed)   │ locked │  • bomb (3 wires)    │
   │  • bulletin (read)   │        │      ↳ wire cutters  │ keycard│  • safe (locked)     │
   │  • desk              │        │      ↳ defusal manual│        │      ↳ case          │
   │                      │        │  • extinguisher      │        │  • shelving         │
   └──────────────────────┘        └──────────────────────┘        └──────────────────────┘
         room: briefing                 room: corridor                  room: vault
```

### 7.4 Objects

| GameObject | Room | Properties | Role |
|---|---|---|---|
| `keycard` | briefing | takeable | Opens the vault door |
| `bulletin` | briefing | readable | Narrative texture; mentions "the maintenance locker in the corridor" (weak hint) |
| `desk` | briefing |. | Surface the keycard sits on |
| `locker` | corridor | container, closed → contains `cutters`, `manual` | Gates the two critical tools |
| `cutters` | corridor→locker | takeable | Tool required to cut a wire |
| `manual` | corridor→locker | readable | **The gate.** Reveals (a) the safe code `4821`, (b) that the safe wire is the **yellow** one |
| `extinguisher` | corridor |. | Red herring; gives a distinct failure message if used on the bomb |
| `bomb` | vault |. | Three wires: red, blue, yellow. Cutting a wrong wire detonates it |
| `safe` | vault | container, locked, code `4821` → contains `case` | Gates the objective item |
| `case` | vault→safe | takeable | Objective item |

### 7.5 The dependency chain (why this is a real test)

```
read manual ──► know the safe wire (yellow)
read manual ──► know the safe code (4821)
open locker ──► acquire cutters AND manual
take keycard ─► unlock vault door
take cutters ─► cut yellow wire
enter 4821  ──► open safe
take case ────► recover objective
```

Four *independent* gating facts must be discovered and held. The agent cannot brute-force the
wire (cutting without having read the manual is refused: "the wiring is a tangle of identical
cables. You cannot tell which is which in this light"), and it cannot brute-force the safe code
(the code space is 10⁴ and each attempt is a turn). A random policy therefore succeeds with
probability ≈ 0.

### 7.6 Gold path (10 commands: the efficiency denominator)

```
 1  take keycard
 2  go corridor
 3  open locker
 4  take cutters
 5  read manual
 6  unlock vault door with keycard
 7  go vault
 8  cut yellow wire with cutters
 9  unlock safe with 4821
10  take case
                    → both goals complete → SUCCESS
```

`tests/adventures/mission-impossible.gold.test.ts` asserts this path succeeds, that it is the
shortest success under BFS over the action space (the harness includes a BFS oracle), and that the
random policy fails 20/20 seeds.

### 7.7 Failure states

| Trigger | Outcome | Note |
|---|---|---|
| `cut red wire with cutters` / `cut blue wire …` | **failure**. Detonation, run ends | Irreversible within the run |
| `cut yellow wire with cutters` before reading the manual | action fails (not fatal) | Enforces the manual gate |
| `unlock safe with 0000` … `9999` | action fails | Bounded by the turn budget, so brute force is impossible in practice |
| `go vault` while the vault door is locked | action fails | |
| `unlock vault door with keycard` without the keycard | action fails | |
| Turn budget exhausted (30) | `budget_exhausted` | |
| Repeated identical state ≥ 3× | `loop_detected` | |

---

## 8. Command grammar

### 8.1 Verbs

| Verb | Synonyms | Args | Notes |
|---|---|---|---|
| `look` | `l` |. | Re-describe the current room |
| `inventory` | `i`, `inv` |. | List carried objects |
| `examine` | `x`, `inspect` | `target: object-in-room` | Reveals `detail` if present |
| `go` | `walk`, `move`, `enter` | `target: room` | Direction words map to doors |
| `take` | `get`, `grab`, `pick up` | `target: object-in-room` | |
| `drop` |. | `target: object-in-inventory` | |
| `open` |. | `target: object-in-room` | Containers |
| `read` |. | `target: object-in-room` | Readables |
| `unlock` |. | `target: object-in-room`, `with: text` | Key object **or** numeric code |
| `cut` |. | `target: object-in-room`, `with: object-in-inventory` | Tool must be carried |
| `use` |. | `tool: object-in-inventory`, `on: object-in-room` | Generic two-arg form |
| `hint` |, |, | Costs one turn; consumes a hint credit. See §7.4 |
| `wait` |, |, | Costs one turn |
| `help` | `?` |. | Lists verbs; no state change |

Multi-word forms: `use X on Y`, `cut X with Y`, `unlock X with Y`. The parser recognises the
connective (`on` / `with` / `to`) and splits accordingly.

### 8.2 Parsing rules (deterministic, no LLM)

1. Normalise: trim, lower-case, collapse whitespace.
2. Strip a leading `>` or `>` prompt marker.
3. Match the first token against the verb table (canonical + synonyms + adventure-extended verbs).
4. If the verb takes two args, split on the connective.
5. Resolve object arguments against: current room contents → inventory → doors (by label).
   Resolution is exact alias match first, then case-insensitive prefix match if unambiguous.
6. Unresolvable argument → `parse_error` with a message naming the failure.
7. Unknown verb → `parse_error` listing the valid verbs.

**Rationale for no LLM parsing:** it keeps the cost of an invalid agent action attributable to the
agent, and makes `invalid_action_rate` a genuine measure rather than a parser artefact. See §12.2.

**Error message contract** (every failure must be informative and non-punitive. The agent must be
able to recover): state what was attempted, what was wrong, and what *is* possible.

```
> take the brass key
You can't see anything called "the brass key" here.
You can see: keycard, bulletin, desk.
```

---

## 9. Observation contract

The observation is **the entire interface between world and agent**. It must contain everything the
agent is allowed to know and nothing else (C2).

### 9.1 Shape

```ts
export interface Observation {
  turn: number;
  location: { id: Id; name: string; description: string };
  /** GameObjects present and visible in the current room. */
  visible: Array<{ id: Id; name: string; description: string; readable?: boolean; container?: boolean }>;
  /** Carried objects. */
  inventory: Array<{ id: Id; name: string; description: string }>;
  /** Exits and their status. 'locked' is observable (a locked door is visible and closed). */
  exits: Array<{ direction: string; label: string; toName: string; status: 'open' | 'locked' | 'closed' }>;
  /** Outcome text of the action just taken (empty on turn 1). */
  messages: string[];
  /** The mission objectives and whether each is demonstrably complete. */
  goals: Array<{ id: Id; text: string; status: 'unknown' | 'complete' | 'incomplete' }>;
  /**
   * The commands that are legal right now (only in masked conditions).
   *
   * The commands, not the bare verbs: the legal verb list is the same on
   * every turn of every room, so it would mask nothing.
   */
  legalActions?: string[];
}
```

### 9.2 What the observation must NEVER contain

- The gold path, the hint table, the adventure's `requires`/`effects`, or any other object that is
  not in the current room or the inventory.
- The contents of a closed container (only that it is closed and that it *might* contain something).
- The identity of the safe wire before the manual is read.
- Any flag the agent has not observed.
- Internal ids that leak authoring structure beyond stable object names (ids are fine. They are
  stable and opaque; authoring predicates are not).

**Enforcement:** `tests/leakage.test.ts` asserts that, for every reachable state in the adventure,
the observation's object set ⊆ (room contents ∪ inventory), and that no observation ever contains
the substrings of the gold path or hint text before the corresponding hint is issued. The
observation builder is a **separate module** that receives only `GameState` + public adventure
fields, so authors cannot leak by accident.

### 9.3 Renderer variants

| Renderer | Output | Used by |
|---|---|---|
| `text` | Prose, classic adventure style | Human CLI; web UI |
| `json` | Compact, stable-key JSON of §9.1 | Agent conditions B/C/D |
| `text-structured` | Prose + an explicit "facts known" block (goals checklist, inventory, exits) | Agent conditions A/D |

JSON output must use a **stable key order and stable formatting** so that transcripts diff cleanly
and token counts are comparable across runs.

---

## 10. Agent protocol

### 10.1 `AgentPolicy` (the Strategy port)

```ts
export interface AgentPolicy {
  readonly id: string;
  /** Produce the next command, or null to end the run. */
  next(observation: Observation, context: PolicyContext): Promise<Command | null>;
}

export interface PolicyContext {
  /** Recent history per the configured context strategy (§10.4). */
  history: HistoryEntry[];
  turn: number;
  turnsLeft: number;
  /** Emit this to end the run early. */
  stop(reason: string): void;
}
```

Implementations:

| Policy | Purpose |
|---|---|
| `ScriptedPolicy` | Replays a fixed command list (used for the gold path and for regression fixtures) |
| `RandomPolicy` | Uniformly samples legal commands. The **lower bound** baseline |
| `LlmPolicy` | Calls an `LlmProvider`, renders the observation into a prompt, extracts a command |

### 10.2 `LlmProvider` (the ports & adapters seam)

```ts
export interface LlmProvider {
  readonly id: string;              // e.g. "anthropic/claude-sonnet-4.5"
  readonly model: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}

export interface LlmRequest {
  system: string;
  messages: ChatMessage[];
  maxOutputTokens?: number;
  temperature?: number;
  /** Provider-specific extra body. */
  extra?: Record<string, unknown>;
}

export interface LlmResponse {
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  raw?: unknown;
  /** Non-fatal provider error (rate limit, transient). */
  transientError?: string;
}
```

Required adapters: **Anthropic**, **OpenAI-compatible**, **Ollama** (local), and **`Mock`**
(scripted responses, for tests and zero-cost runs). Implement all of them with plain `fetch`. No
vendor SDKs. So provider churn does not become a dependency problem.

### 10.3 Prompt assembly and the action envelope

The system prompt is assembled from the adventure (brief, verbs, rules) plus the strategy, and is
**versioned and hashed**; the hash is stored in every transcript so a result can be tied to the
exact prompt.

Required prompt elements:

1. Your mission (the adventure brief).
2. The world model at a high level (rooms and objects exist; travel, take, open, read, unlock,
   cut; a turn is a single command).
3. The available verbs and argument shapes.
4. The rules: issue exactly one command; only refer to things you can currently see or carry; if
   you are unsure, explore rather than guess; a failed action does not cost the mission.
5. The output envelope (below).

**Output envelope**. Ask for reasoning and command in a strict form:

```
THINK: <one or two sentences of reasoning>
COMMAND: <one command>
```

`COMMAND:` is required. The extractor accepts the line after `COMMAND:`, strips code
fences and `>` prompts.

`THINK:` is optional and its presence/absence is an experimental variable (`thinking: on|off`).

### 10.4 Context strategy (a first-class experimental variable)

| Strategy | What the model sees |
|---|---|
| `none` | The current observation only. The control: pure reactive behaviour |
| `full` | The entire transcript: brief, every observation, every command and outcome |
| `window` | The last *N* turns (N = 5) plus the brief |
| `structured` | A compact "known facts" block (location, inventory, visible objects, disclosed goals, revealed facts) + the last 2 outcomes + the brief |

`structured` is the recommended default and the direct analogue of the organisation-simulation
requirement ("the AI agent gets your current details about where you are"). `full` tests H5.

**Known-facts block** (the `structured` strategy) is derived only from the agent's own observation
history. It is a *summary of what the agent has seen*, never adventure-authoring data.

### 10.5 Action extraction and repair

A deterministic extraction chain, in order, recording which rung succeeded (the rung is recorded
as a metric, `extraction_route`):

1. Last `COMMAND:` line in the response.
2. Last non-empty line, if it parses as a valid command.
3. First non-empty line, if it parses.
4. `null` → the runner records `unparsable_response` and re-prompts (counts against the turn
   budget).

Then: parse the extracted string with the kernel parser. See §8.2. If parsing fails, the runner records
`parse_error` and returns the error message as the next observation. **the agent gets the chance to
correct itself**. Whether correction is allowed (1 retry / unlimited / none) is an experimental
variable.

**Never** repair a command by fuzzy-matching it into a legal one. If the agent said "take the
keycard", the kernel must not helpfully interpret "the keycard" as "keycard" by fiat. But alias
resolution inside the adventure's alias table is legitimate and must be declared in the adventure.

### 10.6 Prompt template

Keep it in one file, `src/agents/llm/prompt.ts`, as a pure function of
`(adventure, observation, context, options) → { system, messages }`. It must be unit-testable
without a network call, and must contain a placeholder for the adventure description so a second
adventure needs no prompt change.

---

## 11. Runner, budgets and safety guards

### 11.1 The turn loop

```
create session → state = adventure.initial
loop:
  observation = buildObservation(state)          // §9
  if all goals achieved → finish(success)
  command = await policy.next(observation, ctx)  // may throw / return null
  if command === null → finish(provider_stopped)
  transition = reduce(state, command)            // pure
  state = transition.state
  record events + new state hash
  if transition indicates terminal failure → finish(failure)
guards:
  if turn >= maxTurns            → finish(budget_exhausted)
  if repeatedStateHashes >= 3    → finish(loop_detected)
  if cost/token ceiling exceeded → finish(budget_exhausted)
  if provider transient error x3  → finish(provider_error)
```

### 11.2 Budgets (defaults, all overridable by CLI flag)

| Budget | Default | Rationale |
|---|---|---|
| `maxTurns` | 30 | Gold path is 10; 3× is generous but still bounded |
| `maxHints` | 3 | Prevents unbounded flailing; hints are recorded and counted |
| `maxOutputTokensPerTurn` | 500 | Bounds cost per turn |
| `maxTotalTokens` | 20 000 | Hard cost ceiling per run |
| `maxWallClockMs` | 300 000 | Protects CI |
| `maxTransientProviderErrors` | 3 | Then fail the run cleanly |
| `maxParseErrors` | 10 | Then fail the run cleanly |

### 11.3 Cost control (C3)

- All LLM calls are behind `--provider`; `--provider mock` runs the whole harness with no network.
- A run prints its token usage and estimated cost as it goes.
- `--dry-run` performs the full pipeline with a mock provider, verifying wiring without spending.

---

## 12. Evaluation

### 12.1 The unit of measurement

A **run** = one (adventure, policy, provider, model, condition, seed) tuple, producing one
transcript and one metrics record.

### 12.2 Metrics

**Outcome metrics**
| Metric | Definition |
|---|---|
| `outcome` | `success` \| `failure` \| `budget_exhausted` \| `loop_detected` \| `provider_error` \| `provider_stopped` |
| `goalsCompleted` | 0…2 (of the adventure's goals) |
| `turnsUsed` | Turns consumed |
| `goldPathLength` | 10 for this adventure |
| `efficiency` | `goldPathLength / turnsUsed`. Higher is better; 1.0 = a perfect run, 0.1 = ten times the optimal path |
| `wasteRatio` | `turnsUsed / goldPathLength`. The inverse, for readers who think in overhead multiples (1.0 = optimal) |
| `hintsUsed` | Hints consumed |

**Process metrics (the interesting ones)**
| Metric | Definition |
|---|---|
| `invalidActionRate` | Invalid actions ÷ commands produced. Proxies "does it ground its actions in the game?" |
| `unparsableRate` | Responses the extractor could not turn into a command ÷ total turns |
| `hallucinationRate` | Commands naming an object not present in room ∪ inventory ÷ commands produced. The grounding proxy |
| `repeatStateRate` | Commands that changed nothing ÷ commands produced |
| `explorationSteps` | Turns before the first state-changing action |
| `recoveryRate` | After a failure, did the agent try something different within 2 turns? (0…1) |
| `orderingViolations` | Attempts to use a gated action before its precondition (e.g. cutting a wire before reading the manual) |

**Commands produced** means every command the agent issued, whether the parser accepted it or
not. A hallucination is a command that never became an accepted command, so a denominator of
accepted commands alone would make the hallucination rate meaningless.

**Cost metrics**
`inputTokens`, `outputTokens`, `estimatedCostUsd`, `wallClockMs`, `msPerTurn`. The cost estimate
uses a table of prices per million tokens, which is an estimate and goes stale; it lives in one
place so that refreshing it is a single edit.

### 12.3 Failure taxonomy (S3: the reusable artefact)

Every unsuccessful run is classified into exactly one primary category.

**The order matters, and it is not the order the codes are numbered in.** A category that names
what actually ended the run comes before one that explains the path, because the terminal fact is
the most consequential single thing about the run. A refusal that names an object that is not
there is more specific than a refusal about the shape of the command, so it comes before the
general parsing category. The behavioural categories then explain the path, and the process
metrics in §12.2 record the detail separately so that nothing is lost by the choice of a single
code.

| Code | Category | Definition |
|---|---|---|
| `F6` | Lethal trap | The run ended in failure: the model detonated the bomb |
| `F8` | Provider error | The run ended in a provider failure; the agent is not at fault |
| `F9` | Abstention / early stop | The run ended because the model stopped or declared itself stuck |
| `F2` | Hallucination | The model referenced objects that do not exist in scope |
| `F1` | Parsing | The model never produced a command the parser accepted |
| `F3` | Planning | The model repeated an action that had already failed |
| `F4` | Ordering / precondition | The model attempted a gated action before discovering the gate |
| `F5` | Exploration failure | The model never found a required fact within the budget |
| `F7` | Budget exhaustion | No specific above; ran out of turns |

`F3` covers the half of "planning" a deterministic classifier can see. The other half, acting
against the model's own stated plan, would need the model to judge itself, and the classifier
never calls a model.

The taxonomy is computed **from the transcript** by a deterministic classifier, not by hand. The
classifier's rules are unit-tested against synthetic transcripts, one per category, and the
classifier reads the transcript and the adventure's own data and nothing else.

### 12.4 Experiment matrix (minimum viable run)

| Axis | Values |
|---|---|
| Model | ≥ 2 frontier models on ≥ 2 providers (e.g. Anthropic Claude, OpenAI GPT-class), plus 1 open-weights model via Ollama if available |
| Condition | `A` free-form text obs + `full` context · `B` json obs + `full` · `C` json obs + `structured` + masked legal actions · `D` json obs + `none` (control) · `E` json obs + masked legal actions + `full` |
| Seeds / repeats | ≥ 10 per cell (temperature > 0, distinct seeds) |
| Total runs | ≥ 160 |

`E` exists so that the three context hypotheses can be told apart. Without it, `C` differs
from `B` in two ways at once, and the masking effect cannot be separated from the strategy
effect. With it, each comparison holds everything else constant: `E` vs `B` is the masking,
`B` vs `A` is the rendering, and `C` vs `E` is the context strategy.

A cell is the (model × condition) pair; report success rate with a Wilson 95% interval, median
turns, and the failure-code histogram. A cell with fewer runs than its configuration asked for
is reported as **incomplete**, not averaged: a rate over four runs looks like a fact and is not
one.

### 12.5 Results artefacts

| Artefact | Path |
|---|---|
| One transcript per run | `runs/<model>/<condition>/<seed>.jsonl` (git-ignored by default; an `examples/` set is committed) |
| Per-run metrics | `runs/<model>/<condition>/<seed>.metrics.json` |
| Aggregated summary | `results/summary.json` and `results/summary.md` (a Markdown table with Wilson intervals) |
| Failure taxonomy | `results/failures.md`. Histogram plus 3 annotated transcripts per category |
| Findings write-up | `RESULTS.md`. The human-readable answer to RQ1–RQ5 |

### 12.6 Acceptance criteria for the research

The experiment is complete when:

- **AC-R1.** Every run in the matrix has a transcript, a metrics file, and a classification.
- **AC-R2.** `npm run replay <transcript>` reproduces the recorded hash chain exactly for **100%** of
  transcripts (engine determinism).
- **AC-R3.** H1 is reported with a Wilson interval, whether it holds or not.
- **AC-R4.** Every failure in the matrix is assigned exactly one taxonomy code, and ≥ 3 transcripts
  per non-empty category are annotated in `results/failures.md`.
- **AC-R5.** `RESULTS.md` answers RQ1–RQ5 with numbers, and states threats to validity. See §17.
- **AC-R6.** The cost per solved mission is reported.

---

## 13. Determinism, replay and persistence

### 13.1 Determinism guarantees

**Guaranteed (engine):** given the same adventure and the same command sequence, the kernel
produces byte-identical state and event sequences. Guaranteed by C1 and verified by replay.

**Not guaranteed (model):** LLM sampling is non-deterministic unless a provider supports a fixed
seed. Therefore reproducibility is defined as:

> Engine determinism + a complete recorded transcript + a pinned model identifier + a recorded
> prompt hash + a recorded seed.

Never claim "the same run can be reproduced exactly". Claim "the *environment* is exactly
reproducible, and the agent's trajectory is fully recorded".

### 13.2 Replay

`npm run replay -- <transcript.jsonl>`:

1. Re-create the session from the adventure referenced in the transcript header.
2. Re-apply each recorded command through the same reducer.
3. Recompute the hash chain and compare to the recorded chain.
4. Exit non-zero on any mismatch.

This is the executable form of §4.3's equivalence contract.

### 13.3 Session persistence

A session is `{ id, adventureId, adventureVersion, state, transcript[] }` and is stored as plain JSON.

- `FileSession`. Writes to `sessions/<id>.json`.
- `InMemorySession`. For tests and the browser client.
- `HttpSession`. The server-held session. See §14.

The server-held session exists for the "watch the agent play" demo and for multi-agent experiments.
It is **not** required for v1 to be useful.

### 13.4 Transcript format

JSON Lines. One record per line. The first line is the header:

```jsonl
{"type":"header","runId":"...","adventure":"mission-impossible","adventureVersion":"1.0.0","adventureHash":"sha256:...","policy":"llm","provider":"anthropic","model":"claude-sonnet-4.5","condition":"C","contextStrategy":"structured","seed":7,"promptHash":"sha256:...","startedAt":"2026-01-01T00:00:00.000Z","gitCommit":"...","engineVersion":"1.0.0"}
{"type":"observation","turn":0,"data":{...}}
{"type":"command","turn":1,"raw":"take keycard","verb":"take","args":{"target":"keycard"}}
{"type":"events","turn":1,"data":[...]}
{"type":"state","turn":1,"hash":"sha256:...","summary":{"roomId":"briefing","inventory":["keycard"]}}
{"type":"metrics","turn":10,"data":{...}}
```

`adventureHash` and `promptHash` pin the exact environment and prompt; `gitCommit` pins the code.

---

## 14. Interface decision: client, server, or both

The user's question. *"if you get it working in the browser, you might want a server behind it just
holding the state, unless you can do that all in memory in the front end. Have a think: adversary,
pros, cons"*. Is answered here.

### 14.1 Options considered

| | **A. Browser-only** | **B. Server-held state** | **C. Pure kernel + swappable session (chosen)** |
|---|---|---|---|
| Shape | Kernel bundled into the page; state in JS memory (optionally `localStorage`) | Kernel on the server; browser is a thin client over HTTP | Kernel is a library; `Session` is an interface with `InMemory` and `Http` implementations |
| Infra | None | A running Room process | None required; a server is optional |
| Latency | Zero | One round trip per command | Zero locally; one round trip in HTTP mode |
| State survives refresh | Only via `localStorage` | Yes, server-side | Depends on the session implementation |
| The agent can drive the *same* session the human watches | No | **Yes** | Yes, when the session is HTTP-backed |
| Multi-agent / concurrent | No | Possible | Possible |
| Audit trail | Local only | Server-side, authoritative | Wherever the transcript is written |
| Failure modes | Tab close loses the run | Server down = no UI | Adapter mismatch bugs |
| Deployment | GitHub Pages | Needs a host | GitHub Pages **or** a host |
| Cost | Free | A server (can be free-tier) | Free |

### 14.2 Adversary analysis

**Against browser-only:** the agent runner cannot observe the same session the human is watching,
so the "watch it solve it live" demo, which is the most persuasive artefact of this project, is
impossible. Multi-agent collaboration cannot be demonstrated. State loss on refresh is a papercut
rather than a blocker.

**Against server-held state:** it introduces a process to run, a session lifecycle (create, resume,
expire), and an implicit network dependency into the *demo* path. It risks the project being judged
on its deployment rather than its findings. It also tempts the kernel to become stateful in a
server-ish way, weakening the "pure, portable kernel" property.

**For the chosen option (C):** the kernel is pure, so it runs identically in Room and in the
browser. The `Session` interface means the browser client can start in `InMemory` mode (zero
infra, GitHub Pages deployable) and switch to `Http` mode with one configuration flag when the
live agent demo is wanted. The decision is deferred rather than forced. Which is the correct
posture when the two modes have genuinely different costs.

### 14.3 Decision

**Implement C. Concretely:**

- `src/session/types.ts`. `Session { id, adventure, state, send(command), snapshot(), reset() }`.
- `src/session/in-memory.ts`. `InMemorySession` (default; used by tests, the CLI, and the browser
  client).
- `src/session/http.ts`. `HttpSession` (browser client talking to `src/server`).
- `src/server/routes.ts`. `POST /api/session`, `POST /api/session/:id/command`,
  `GET /api/session/:id`, `GET /api/adventure/:id`, `GET /api/health`.
- The web client reads `VITE_SESSION_MODE=memory|http` (or a runtime config object) and picks the
  implementation.

**The agent runner always uses `InMemorySession` in-process.** It does not need a server, and
keeping it in-process removes a network failure mode from the measurement path.

### 14.4 Web client requirements

- Text output pane, command input with history (↑/↓), a live log pane, and a status bar showing
  turn count, goals, and current hash.
- A "watch the agent" mode: a `GET /api/runs/:id/stream` (SSE) endpoint that streams an agent run's
  events to the browser. Server-backed, optional, clearly labelled as a demo convenience.
- No framework. Plain TypeScript bundled with esbuild. Rationale: the UI is a display surface; a
  framework would add weight and obscure the fact that the UI holds no rules.
- The web client must contain **no game logic**. It renders observations and sends commands.

---

## 15. Repository layout and tooling

### 15.1 Layout

```
research-text-adventure-ai/
├── README.md
├── SPEC.md                      ← this document (authoritative requirements)
├── AGENT_BRIEF.md               ← copy-paste brief for the implementing agent
├── TASKS.md                     ← phase/task cards with acceptance criteria
├── RESULTS.md                   ← findings write-up (filled in Phase 6)
├── experiments/                 ← the work, re-cut as teachable experiments
│   ├── README.md                ← the series index and the working method
│   ├── exp-01-the-game/         ← 01 — a world you can trust
│   ├── exp-02-what-the-agent-sees/
│   ├── exp-03-the-agent-plays/
│   ├── exp-04-why-it-failed/
│   ├── exp-05-the-matrix/
│   └── exp-06-an-organisation/
├── docs/
│   ├── RESEARCH-CONTEXT.md      ← engine survey, prior art, evidence per decision
│   ├── REFERENCES.md            ← annotated bibliography with licences
│   ├── ARCHITECTURE.md          ← layer map + ADR-001…ADR-016
│   ├── ADVENTURES.md            ← adventure authoring guide + checklist
│   ├── proposal.md              ← what this project is and why (living document)
│   ├── userguide.md            ← how to use it (living document)
│   ├── TESTING.md               ← the testing doctrine and what each layer guarantees
│   └── docs-guide.md            ← how the docs fit together (living document)
├── src/
│   ├── kernel/
│   │   ├── types.ts
│   │   ├── reduce.ts            ← the pure transition function
│   │   ├── predicates.ts        ← the six predicate evaluators
│   │   ├── effects.ts           ← the eight effect appliers
│   │   ├── parser.ts            ← deterministic command grammar
│   │   ├── observation.ts       ← the ONLY thing that can see state → agent
│   │   ├── render.ts            ← text renderers
│   │   ├── goals.ts
│   │   ├── hash.ts              ← canonical JSON + hash chain
│   │   └── index.ts
│   ├── adventures/
│   │   └── mission-impossible/
│   │       ├── adventure.ts      ← pure data
│   │       ├── text.ts          ← prose
│   │       ├── gold-path.ts
│   │       └── hints.ts
│   ├── session/
│   │   ├── types.ts
│   │   ├── in-memory.ts
│   │   ├── file.ts
│   │   └── http.ts
│   ├── agents/
│   │   ├── policy.ts
│   │   ├── scripted.ts
│   │   ├── random.ts
│   │   └── llm/
│   │       ├── provider.ts
│   │       ├── anthropic.ts
│   │       ├── openai.ts
│   │       ├── ollama.ts
│   │       ├── mock.ts
│   │       ├── prompt.ts
│   │       └── extract.ts
│   ├── runner/
│   │   ├── run.ts
│   │   ├── budgets.ts
│   │   ├── transcript.ts
│   │   ├── replay.ts
│   │   ├── classify.ts          ← failure taxonomy
│   │   └── evaluate.ts
│   ├── cli/
│   │   ├── index.ts
│   │   ├── play.ts              ← human CLI
│   │   ├── agent.ts             ← headless agent runs
│   │   ├── sweep.ts             ← experiment matrix
│   │   └── replay.ts
│   ├── server/
│   │   ├── index.ts
│   │   ├── routes.ts
│   │   └── sessions.ts
│   └── web/
│       ├── index.html
│       ├── app.ts
│       └── styles.css
├── tests/
│   ├── kernel/*.test.ts
│   ├── adventures/*.test.ts
│   ├── agents/*.test.ts
│   ├── runner/*.test.ts
│   ├── cli/*.test.ts
│   ├── architecture.test.ts     ← C4 dependency rules
│   ├── leakage.test.ts          ← C2 no privileged info
│   ├── equivalence.test.ts      ← REQ-EQUIV-1 across the three interfaces
│   └── fixtures/
│       ├── golden.jsonl
│       └── adventures/*.json
├── scripts/
│   └── seed-results.ts
├── examples/
│   └── runs/                    ← a few committed example transcripts
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── eslint.config.js             ← flat config; enforces C4 as a lint rule too
```

### 15.2 Tooling

| Tool | Choice | Rationale |
|---|---|---|
| Language | TypeScript 5.x, `strict: true`, `noUncheckedIndexedAccess: true` | The spec *is* the contract; the type system should enforce it |
| Module system | ESM (`"type": "module"`), Node 20+ | Current default; `tsx` handles TS directly |
| Runtime | Node 20+ | `node:test` not needed. Vitest is used |
| Test runner | Vitest | Fast, TS-native, good snapshot support |
| Dev runner | `tsx` | Zero-config TS execution |
| Validation | Zod | Runtime validation of adventure files and provider responses; adventures are data and must be validated at load |
| CLI | `commander` | Argument parsing, subcommands, help text |
| Web build | esbuild | One bundle, no framework, fast |
| Server | `room:http` + a ~60-line router | Avoids a framework dependency; the API is 6 routes |
| Lint | ESLint flat config | Enforce the architecture boundary as a lint rule *and* a test |
| CI | GitHub Actions | `npm ci && npm run typecheck && npm run test && npm run lint` |

**Dependency policy:** runtime dependencies are limited to `zod` and `commander`. Everything else is
a dev dependency. Provider SDKs are explicitly rejected (use `fetch`). This keeps the research
artifact auditable and cheap to fork.

### 15.3 npm scripts (the contract for the implementing agent)

```json
{
  "scripts": {
    "dev": "tsx src/cli/index.ts",
    "play": "tsx src/cli/index.ts play --adventure mission-impossible",
    "agent": "tsx src/cli/index.ts agent --provider anthropic --model claude-sonnet-4.5",
    "sweep": "tsx src/cli/index.ts sweep --matrix configs/matrix.default.json",
    "replay": "tsx src/cli/index.ts replay",
    "eval": "tsx src/cli/index.ts eval --runs runs/",
    "server": "tsx src/server/index.ts",
    "web:build": "esbuild src/web/app.ts --bundle --outfile=public/app.js --format=esm",
    "web:dev": "npm run web:build && tsx src/server/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "check": "npm run typecheck && npm run lint && npm run test"
  }
}
```

---

## 16. Phase plan and acceptance criteria

Each phase is a mergeable increment with its own gate. A phase is done when its acceptance criteria
pass in CI.

### 16.0 Working method: test first, and the experiment series

**Every phase is built test-first.** Write the test, watch it fail, make it pass, then refactor
with the tests green. If a test passes on its first run, it is not testing the thing.

This is not a style preference for this project. It is the mechanism that keeps the measurement
honest. The environment's determinism, its perception boundary and its replay guarantee are all
easy to *believe* and easy to *break*, and a test is the only thing that distinguishes the two. So:

> **No change ships without a test that would catch the failure it is guarding against.**

A green suite is a claim. A missing test is an unexamined claim.

**The same work, re-cut as experiments.** The phases below are the authoritative plan. They are
also presented as a numbered series of small experiments, each teaching one idea and runnable on
its own. The Karpathy `microgpt`/`llm.c` shape, because the order of work should match the order
of understanding. Start at [`experiments/README.md`](./experiments/README.md); each experiment's
README carries the idea, the tests in the order they get written, and its acceptance criteria.

| Experiment | The one idea | Covers |
|---|---|---|
| [01. The game](./experiments/exp-01-the-game/README.md) | A deterministic world you can trust, playable by a human *and* by the agent | P0, P1, P2 |
| [02. What the agent sees](./experiments/exp-02-what-the-agent-sees/README.md) | The agent's view is smaller than the world, and that gap is the experiment | P0 (observation), P3.4 |
| [03. The agent plays](./experiments/exp-03-the-agent-plays/README.md) | A model can drive a state machine given a clean loop and a fair error message | P3 |
| [04. Why it failed](./experiments/exp-04-why-it-failed/README.md) | "It failed" is not a finding; the category is | P4.1, P4.2 |
| [05. The matrix](./experiments/exp-05-the-matrix/README.md) | One number is an anecdote; a cell of a matrix is a result | P4.3, P6 |
| [06. An organisation](./experiments/exp-06-an-organisation/README.md) | The adventure vocabulary has to survive contact with a real org | P7 |

P5 (browser client) and P8 (QuestJS comparison) are interface and comparison work rather than new
ideas, so they stay in this phase plan on their own.

### Phase 0: Kernel (foundation)

**Tasks:** types; predicates; effects; reduce; hash chain; parser; observation builder; text
renderer; goal evaluation.

| ID | Acceptance criterion |
|---|---|
| P0.1 | `reduce` is a pure function; no imports of `fs`/`http`/`Date`/`Math.random` in `src/kernel` (lint rule) |
| P0.2 | ≥ 90% line coverage on `src/kernel` |
| P0.3 | The hash chain is stable across runs and process restarts |
| P0.4 | The parser resolves aliases, handles `use X on Y` / `cut X with Y`, and produces informative errors |
| P0.5 | `tests/architecture.test.ts` proves the dependency rules of §4.4 |

### Phase 1: Adventure

| ID | Acceptance criterion |
|---|---|
| P1.1 | The MI adventure is pure data, validated by Zod at load |
| P1.2 | The gold path (10 commands) reaches `success` |
| P1.3 | A BFS oracle confirms 10 is the shortest success path |
| P1.4 | `RandomPolicy` fails 20/20 seeds |
| P1.5 | Detonation is irreversible and ends the run as `failure` |

### Phase 2: Human CLI

| ID | Acceptance criterion |
|---|---|
| P2.1 | A human can play the mission to completion from the terminal |
| P2.2 | The CLI writes a transcript in the §13.4 format |
| P2.3 | The CLI's transcript replays to an identical hash chain |

### Phase 3: Agent harness

| ID | Acceptance criterion |
|---|---|
| P3.1 | `LlmProvider` adapters for Anthropic, OpenAI-compatible, Ollama, Mock |
| P3.2 | `MockProvider` runs the full harness with zero network calls |
| P3.3 | The prompt is a pure function, unit-tested, with a recorded hash |
| P3.4 | All four context strategies are implemented and selectable |
| P3.5 | Budgets, loop detection, and transient-error handling are implemented and unit-tested |
| P3.6 | No secret is ever written to a transcript or log |

### Phase 4: Measurement

| ID | Acceptance criterion |
|---|---|
| P4.1 | Every run emits a metrics record with all §12.2 metrics |
| P4.2 | The failure classifier assigns exactly one code per failed run; unit-tested on synthetic transcripts |
| P4.3 | `sweep` runs the full matrix and writes `results/summary.json` + `results/summary.md` |
| P4.4 | Wilson 95% intervals are computed for every cell |

### Phase 5: Web client + server

| ID | Acceptance criterion |
|---|---|
| P5.1 | The browser client plays the mission with no game logic in `src/web` |
| P5.2 | `InMemory` and `Http` session modes both work, selected by configuration |
| P5.3 | A human can watch an agent run live (SSE) in the browser |
| P5.4 | The web client's transcript replays identically to the CLI's |

### Phase 6: Results

| ID | Acceptance criterion |
|---|---|
| P6.1 | The matrix is run; ≥ 160 runs with complete artefacts |
| P6.2 | `RESULTS.md` answers RQ1–RQ5 with numbers and states threats to validity |
| P6.3 | `results/failures.md` has ≥ 3 annotated transcripts per non-empty failure category |
| P6.4 | Cost per solved mission is reported |

### Phase 7: Generality probe (stretch)

| ID | Acceptance criterion |
|---|---|
| P7.1 | A second adventure, a miniature organisation simulation (2 teams as rooms, 1 shared artefact, 1 dependency, 1 budget constraint), is authored **without changing the kernel** |
| P7.2 | The same agent harness runs it, and `RESULTS.md` compares the two worlds |
| P7.3 | A one-page "what this means for org simulation" section is written |

### Phase 8: Engine comparison (stretch)

| ID | Acceptance criterion |
|---|---|
| P8.1 | The same adventure is ported to QuestJS, and the agent harness runs against it |
| P8.2 | A short comparison of agent success rate and authoring cost is written |

---

## 17. Risks and threats to validity

| # | Risk | Mitigation |
|---|---|---|
| V1 | **The adventure is too easy.** A 10-command mission may not stress long-horizon reasoning | Report the step-dependency depth; add a harder variant (Phase 7) |
| V2 | **The adventure is too hard / has an unintended dead end** | Automated reachability check: every room and every object is reachable; BFS confirms solvability; the gold path passes |
| V3 | **Prompt sensitivity dominates the result** | Pin and hash the prompt; report results per prompt version; treat prompt changes as a new experiment |
| V4 | **Model version drift** | Record the exact model id, provider, and date in every transcript; report the run date |
| V5 | **Small sample** | ≥ 10 seeds per cell; Wilson intervals; do not claim significance below that |
| V6 | **Non-determinism** | Never claim exact reproduction of an agent run; guarantee engine determinism only. See §13.1 |
| V7 | **Observer effect**. The observation format helps more than the reasoning | Include the `none` control condition and a `text` observation condition so format effects are separable from reasoning effects |
| V8 | **Parser leniency inflates success** | Report `invalidActionRate`; the parser never rewrites an agent's intent. See §10.5 |
| V9 | **Cost** | Budgets per §11.2; `--provider mock` for all development and CI |
| V10 | **Single-adventure overfitting** | Phase 7's second adventure; the kernel must not be tuned to the MI adventure's specifics |

---

## 18. Roadmap to organisation simulation

The long-term aim: run an organisation as an adventure game. State stored centrally, each agent
receives its current context (where it is, what it knows, what it must do), and acts through a
command vocabulary.

### 18.1 Concept mapping

| Kernel concept | Adventure instance | Organisation instance |
|---|---|---|
| Room | Room | Team, system, queue, or meeting |
| GameObject | Object, tool, document | Ticket, artefact, credential, message, account |
| Door | Door, corridor | Handoff, dependency, escalation, approval path |
| Flag | Puzzle state | Ticket status, budget consumed, SLA breach |
| Goal | Mission objective | Objective, KPI, or assigned task |
| Observation | Room description | "Your dashboard": your queue, your blockers, your standing instructions |
| Command | Typed text | Tool call (Jira API, chat, email, deploy) |
| Inventory | Carried items | Working context, open threads, fetched artefacts |
| Turn | Game move | One action cycle |
| Failure | Detonation | Blocked task, missed SLA, bad deploy |
| Hint | Hint credit | Escalation, asking a human, reading the runbook |

### 18.2 What already transfers

Because the kernel speaks the game's own vocabulary, an organisation simulation is written
as *another adventure* rather than as a new engine. The following are already built by Phase 0 and
need no change to serve it:

- The state machine, hash chain, replay, and transcript format. The audit trail for agent actions.
- The observation contract. The "current details about where you are" payload.
- The context strategies (`none` / `full` / `window` / `structured`). The answer to "do we give the
  agent the whole context of the conversation, or a summary?".
- The budgets and guards. The answer to "how do we stop an agent burning money?".
- The failure taxonomy. The answer to "how do we know an agent is failing, and why?".

### 18.3 What must be built later (not in v1)

| Need | Change required |
|---|---|
| Live state from real systems | `Session` implementations that read/write a real backend rather than a JSON file |
| Asynchronous agents | The runner becomes an event consumer; `turn` becomes wall-clock + ordering |
| Multiple agents | `Session` per agent, plus a shared game; the kernel already supports per-session state |
| Permissions and approvals | An `Effect` that suspends a transition pending an external decision |
| Success metrics beyond goals | The `GoalSpec` mechanism generalises to arbitrary predicates |

### 18.4 The one design question this experiment must answer

> **Does the observation contract carry enough context for an agent to act correctly, without
> giving it the whole history?**

That is H5, and it is why `structured` is a first-class condition rather than an afterthought. The
answer determines the shape of the organisation-simulation interface: a dashboard payload, not a
transcript.

---

## 19. Open questions

These are decisions the implementing agent may take, with the stated default. Anything that changes
the *research design* must be recorded in `docs/ARCHITECTURE.md` as an ADR.

| # | Question | Default |
|---|---|---|
| Q1 | Does the agent see the mission goal checklist status, or only the brief? | Yes. The objectives are disclosed (the mission is known); the *method* is not |
| Q2 | Are hints available to LLM agents? | Yes, 3 per run, identical for all conditions, recorded as `hintsUsed` |
| Q3 | Does the agent see the count of remaining hints? | Yes. It is an observable affordance, not privileged information |
| Q4 | Free-text commands or a structured action schema? | Both: free-text is the primary condition; the masked condition is the comparison |
| Q5 | Is the `THINK:` step on by default? | On (it is the stronger baseline); `off` is a recorded variable |
| Q6 | Temperature | 0.7 for the seeded main matrix (to measure reliability, not best case); 0 as a supplementary condition |
| Q7 | Should the agent be told the turn budget? | Yes. Knowing the budget is part of competent agent design |
| Q8 | Which providers/models | At least one Anthropic and one OpenAI-compatible model; Ollama optional |

---

## 20. Source references

Full annotated bibliography with licences and dates accessed: **[`docs/REFERENCES.md`](./docs/REFERENCES.md)**.

**Benchmarks and environments**

- TALES. Text Adventure Learning Environment Suite (Microsoft Research):
  <https://www.microsoft.com/en-us/research/publication/tales-text-adventure-learning-environment-suite/>
  · <https://github.com/microsoft/tale-suite> · paper: <https://arxiv.org/abs/2504.14128>
- Jericho. <https://arxiv.org/abs/1909.05398> · <https://github.com/microsoft/jericho>
- NAIL. <https://arxiv.org/abs/1902.04259>
- ALFWorld. <https://arxiv.org/abs/2010.03768>
- ScienceWorld. <https://arxiv.org/abs/2203.07540>

**Engines**

- QuestJS (MIT): <https://github.com/textadventures/quest>
- ink (MIT): <https://github.com/inkle/ink>
- TextWorld (Microsoft Research License. **not** MIT): <https://github.com/microsoft/TextWorld>

**Agent methods**

- ReAct. <https://arxiv.org/abs/2210.03629>
- Reflexion. <https://arxiv.org/abs/2303.11366>
- Voyager. <https://arxiv.org/abs/2305.16291>
- WebArena. <https://arxiv.org/abs/2307.13854>
- BenchTrace. <https://arxiv.org/abs/2605.29225>

**Genre history**

- Scott Adams' Adventure #3, *Mission Impossible* / *Secret Mission* (1979):
  <https://www.ifwiki.org/Scott_Adams>

See [`docs/RESEARCH-CONTEXT.md`](./docs/RESEARCH-CONTEXT.md) for the survey, the evidence behind
each design decision, and the correction log; [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for
the ADRs.
