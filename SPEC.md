# Specification — AI Text Adventure & State-Based Agent Experiment

**Repository:** `gyrum-labs/research-text-adventure-ai`
**Status:** Approved for implementation. This document is the authoritative requirements source.
**Language:** TypeScript (strict), Node 20+, ESM.
**Type:** Standalone research proof of concept.

> **Read this first.** The adventure game is *not* the deliverable. The deliverable is evidence about
> whether an LLM agent can operate reliably inside a deterministic, stateful environment using only
> the information and actions available to it — and a **generic, reusable state kernel** that can
> later be pointed at a different world (e.g. an organisation simulation). The game is the *test
> fixture* that makes the evidence cheap to produce. See §1.3 and §18.

---

## Table of contents

1. [Objective, research questions, hypotheses](#1-objective-research-questions-hypotheses)
2. [Scope, non-goals, constraints](#2-scope-non-goals-constraints)
3. [Research context: which engine?](#3-research-context-which-engine)
4. [Architecture](#4-architecture)
5. [Design patterns](#5-design-patterns)
6. [Data model](#6-data-model)
7. [The Mission Impossible scenario](#7-the-mission-impossible-scenario)
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

---

## 1. Objective, research questions, hypotheses

### 1.1 Primary objective

Determine whether an AI agent can autonomously complete a multi-step mission in a deterministic,
stateful text environment, **given no privileged information about the solution**, and produce
**measurable, replayable** results that another person can reproduce and audit.

### 1.2 Secondary objectives

| # | Objective | Why it matters |
|---|---|---|
| S1 | Build a **world-agnostic** state kernel: no adventure vocabulary in the core | The kernel must survive re-pointing at an organisation simulation (§18) |
| S2 | Prove **one engine, three interfaces**: human CLI, browser UI, autonomous agent — same reducer, same rules | Confirms the environment is the controlled variable, not the UI |
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
- **RQ5 (generality).** Does the kernel — unchanged — support a second, non-adventure world?

### 1.4 Hypotheses (to be falsified, not confirmed)

| ID | Hypothesis | Falsified if |
|---|---|---|
| H1 | A capable LLM agent solves the mission ≥ 80% of runs within a 30-turn budget | Success rate < 80% across all model × condition cells |
| H2 | Masking the action space to legal commands **raises** success rate | Success rate unchanged or lower |
| H3 | A structured observation beats prose for multi-step reasoning | Structured condition does not dominate |
| H4 | Most failures are **not** parsing failures but *reasoning/ordering* failures | > 50% of failures are unparsable/invalid commands |
| H5 | Full transcript history causes **context dilution** vs a structured memory summary | `full` is worse than `structured` on both success and steps-to-solve |

H4 and H5 are the most valuable outcomes for the org-simulation goal and should be reported even if
H1 holds.

---

## 2. Scope, non-goals, constraints

### 2.1 In scope

- A generic, deterministic state kernel in TypeScript.
- One authored scenario ("Mission Impossible"-style) expressed purely as data.
- Three interfaces over the same kernel: human CLI, browser UI, autonomous AI agent.
- An LLM adapter layer (≥ 2 providers) with no SDK lock-in.
- A measurement harness: metrics, experiment matrix, aggregated results, failure taxonomy.
- Full transcripts, replay, and hash-chain verification.

### 2.2 Non-goals (explicitly out of scope)

| Non-goal | Rationale |
|---|---|
| Adopting QuestJS / ink / TextWorld as the runtime | Coupling the experiment to an engine defeats the S1 goal. §3. |
| Training or fine-tuning models | Evaluation only. |
| Reproducing an existing commercial adventure game's text | The scenario is an original homage; see §7.1. |
| Multiplayer, accounts, persistence beyond a session file | Unnecessary for the research question. |
| GUI beyond a plain browser client | The environment must stay inspectable and cheap to run. |
| An NLP-based command parser | Parsing must be deterministic and free so that failures are attributable to the agent, not the parser. §8.2. |
| Real-world org simulation in v1 | That is Phase 7 / a follow-on repo. §18 specifies the seam. |

### 2.3 Constraints

| ID | Constraint |
|---|---|
| C1 | The kernel performs **no I/O**, no wall-clock reads, no unseeded randomness. Determinism is enforced by test and by architecture test (§16, P0). |
| C2 | The agent **never** receives scenario-authoring data (gold path, hint tables, predicate source). Enforced by a dedicated observation builder + leakage test. |
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
| **QuestJS** (`textadventures/quest`) | JavaScript adventure engine: rooms, objects, text commands, runs in browser | **MIT** | Substantial existing framework; browser-native | Existing game architecture (attributes, dynamic text) complicates controlled agent testing; adds a dependency we do not control | Alternative — Phase 8 comparison |
| **ink** (`inkle/ink`) | Narrative scripting language for branching stories | **MIT** | Excellent branching narrative; browser/Node | Optimised for storytelling, not for general world-state simulation or agent evaluation | Future experiment |
| **TextWorld** (`microsoft/TextWorld`) | RL sandbox for text games: training + evaluation of agents | **Microsoft Research License** (not OSI-approved) | Purpose-built for evaluating agents in stateful text environments | Python ecosystem; heavy install; licence is non-commercial-restricted | Research reference only |
| **TALES** (`microsoft/tale-suite`) | Benchmark of curated text games across Jericho/TextWorld/TextWorld-Express/ScienceWorld/ALFWorld | MIT | Real numbers: even top LLM agents fail **~85%** of human-designed games | Python; heavyweight | **Primary reference for expected effect sizes** |
| **Minimal TypeScript reducer (this repo)** | Purpose-built pure state-transition kernel | MIT | Total control, deterministic, dependency-light, reusable for the org-simulation goal | We must implement ~15 mechanics ourselves | **Chosen for v1** |

**Decision:** build a small, generic TypeScript kernel. The adventure content is a *scenario* — data
describing nodes, entities, actions, goals — evaluated by the kernel. QuestJS and ink are deferred
comparisons (Phase 8). TextWorld/TALES are read for calibration: TALES' headline result (top agents
failing ~85% of human-designed games) sets our expectation that **a hand-built scenario may be the
hardest kind of test**, and that failure analysis matters more than a headline win-rate.

### 3.1 The design decision that follows from this

If the game engine is removed entirely, the kernel must speak a **domain-neutral vocabulary**. The
core knows *nodes, entities, connections, flags, actions, goals, turns* — never *rooms, keys,
bombs*. This is what makes §18 (organisation simulation) a configuration change rather than a rewrite.

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
                    │  Scenario ──► reduce(state, command) ──► new  │
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
| `src/scenarios` | Scenario *data* + prose + gold path | Contain logic beyond declarative data |
| `src/session` | Holds a session (state + scenario + id); create/reset/snapshot | Contain scenario logic |
| `src/agents` | Policies and LLM providers; prompt assembly; action extraction | Mutate kernel internals |
| `src/runner` | Turn loop, budgets, guards, transcript recording, metrics | Know about specific scenarios |
| `src/cli` | Argument parsing, REPL, human play, agent runs, eval sweeps | Contain game rules |
| `src/server` | HTTP routes over a server-held session | Contain game rules |
| `src/web` | Browser client | Contain game rules |

### 4.3 One engine, three interfaces — the equivalence contract

This is the single most important structural property of the repo. It must be **testable**:

> **REQ-EQUIV-1.** For a given scenario and the same sequence of commands, the human CLI, the web
> client and the agent runner must produce **identical state hash chains** (§13.2).

Enforced by a single golden transcript (`tests/fixtures/golden.jsonl`) replayed through all three
interfaces, asserting the final hash chain matches.

### 4.4 Dependency rules

- `kernel` → nothing (except `node:crypto` for hashing).
- `scenarios` → `kernel` types only.
- `session` → `kernel`.
- `agents` → `kernel` types, `scenarios` data.
- `runner` → `kernel`, `agents`, `session`.
- `cli` / `server` / `web` → `runner`, `session`, `kernel`.

Enforced by `tests/architecture.test.ts` (C4).

---

## 5. Design patterns

| Pattern | Where | Why |
|---|---|---|
| **Pure reducer / state transition function** | `kernel.reduce(state, command) → { state, events }` | Determinism, testability, replay, hash chaining, and the ability to run the identical transition in Node and in a browser |
| **Command pattern** | Every player intent is a parsed `Command { verb, args }` before any effect | Uniform error handling; illegal actions become data, not exceptions |
| **Specification / rule DSL** | `Predicate[]` + `Effect[]` on each action | Scenario authors declare *what* is true; the kernel decides *how* to evaluate it. Keeps adventure semantics out of the core |
| **Strategy** | `AgentPolicy { next(observation, history): Promise<Command \| null> }` | Human, scripted, random and LLM agents are interchangeable; the runner cannot tell them apart |
| **Ports & adapters (hexagonal)** | `LlmProvider`, `Session` | Swap Anthropic ↔ OpenAI ↔ Ollama ↔ Mock; swap in-memory ↔ HTTP session, with no change to the kernel |
| **Observer / event stream** | `reduce` emits `Event[]`; the transcript is the event log | Lets the UI animate, the evaluator classify failures, and the replayer assert — all from one stream |
| **Repository / snapshot** | `Session.save()/load()` as plain JSON | State is fully serialisable; sessions are files; no database |
| **Fixture + golden-file testing** | `tests/fixtures/*.jsonl` | Scenario behaviour and interface equivalence are pinned to readable files, not to assertions scattered across code |
| **Circuit breaker / budget guard** | Runner stop conditions + parse-failure backoff | An agent that loops or babbles must not run up a bill |
| **Structured output with repair** | LLM asked for a strict envelope; extractor falls back through a defined chain | Model-specific formatting drift is handled centrally, and every failure is counted (§12.3) |
| **Seeded PRNG** | Any randomness (random policy, jittered scenarios) takes an injected seed | Reproducibility |

### 5.1 The specification DSL (kernel vocabulary)

The kernel understands exactly these six predicates and eight effects. Nothing else.

```ts
type Predicate =
  | { op: 'at'; node: Id }
  | { op: 'entity_at'; entity: Id; node: Id }
  | { op: 'in_inventory'; entity: Id }
  | { op: 'flag'; key: string; value: boolean }
  | { op: 'entity_flag'; entity: Id; key: string; value: boolean }
  | { op: 'goal_complete'; goal: Id };

type Effect =
  | { op: 'move'; to: Id }
  | { op: 'set_flag'; key: string; value: boolean }
  | { op: 'set_entity_flag'; entity: Id; key: string; value: boolean }
  | { op: 'set_entity_at'; entity: Id; node: Id | null }
  | { op: 'add_inventory'; entity: Id }
  | { op: 'remove_inventory'; entity: Id }
  | { op: 'set_entity_state'; entity: Id; key: string; value: string }
  | { op: 'finish'; outcome: 'success' | 'failure'; reason: string };
```

This is the whole engine. Everything else is data.

---

## 6. Data model

### 6.1 Core types (target shape — `src/kernel/types.ts`)

```ts
export type Id = string;

// ---------- Scenario (data only) ----------

export interface Scenario {
  id: string;
  title: string;
  version: string;
  /** The mission briefing. Given to the agent verbatim. Must not reveal the solution. */
  brief: string;
  /** Shown when the scenario is solved/failed. */
  outcomeText: { success: string; failure: string };
  nodes: Record<Id, Node>;
  entities: Record<Id, Entity>;
  connections: Record<Id, Connection>;
  actions: ActionSpec[];
  goals: GoalSpec[];
  hints: HintSpec[];
  initial: WorldState;
}

export interface Node {
  id: Id;
  name: string;
  /** Prose shown on arrival. */
  description: string;
  /** Entity ids present in this node. */
  contents: Id[];
  /** Connection ids leading out of this node. */
  exits: Id[];
}

export interface Entity {
  id: Id;
  name: string;
  /** Extra words that resolve to this entity (e.g. "cutter", "pliers"). */
  aliases?: string[];
  description: string;
  /** Rendered only when `examine`d — may reveal detail not in `description`. */
  detail?: string;
  /** Container semantics: opening reveals `contains`. */
  container?: { closed: boolean; contains: Id[]; lockedBy?: Id };
  /** Readable: `read` yields `detail`. */
  readable?: boolean;
}

export interface Connection {
  id: Id;
  from: Id;
  to: Id;
  /** Direction word shown to the player, e.g. "north", "back", "vault door". */
  direction: string;
  label: string;
  /** If set, traversing requires an action (e.g. `unlock`) with this entity. */
  requiresAction?: { verb: string; entity: Id };
  /** If true, traversal is refused until the connection is unlocked. */
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
  role: 'node' | 'entity' | 'entity-in-node' | 'entity-in-inventory' | 'text';
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

export interface WorldState {
  nodeId: Id;
  inventory: Id[];
  /** Per-entity runtime facts: where it is, and mutable flags. */
  entities: Record<Id, EntityState>;
  /** World-level facts (e.g. `bomb_defused`). */
  flags: Record<string, boolean>;
  /** Turn counter. The kernel's only notion of time. */
  turn: number;
  /** Remaining hint credits. */
  hintsLeft: number;
  status: 'running' | 'success' | 'failure';
}

export interface EntityState {
  at: Id | null;              // node id, or null when carried
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
  state: WorldState;
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

## 7. The Mission Impossible scenario

### 7.1 Provenance and originality

This scenario is an **original homage** to the classic Mission Impossible text adventures (a
three-area, lock-and-key, bomb-disposal mission). No existing game's prose, room names, puzzle
layout or text is reproduced. The purpose is to reproduce the *shape* of the puzzle — a short
dependency chain with a lethal trap — not any specific work.

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
         node: briefing                 node: corridor                  node: vault
```

### 7.4 Objects

| Entity | Node | Properties | Role |
|---|---|---|---|
| `keycard` | briefing | takeable | Opens the vault door |
| `bulletin` | briefing | readable | Narrative texture; mentions "the maintenance locker in the corridor" (weak hint) |
| `desk` | briefing | — | Surface the keycard sits on |
| `locker` | corridor | container, closed → contains `cutters`, `manual` | Gates the two critical tools |
| `cutters` | corridor→locker | takeable | Tool required to cut a wire |
| `manual` | corridor→locker | readable | **The gate.** Reveals (a) the safe code `4821`, (b) that the safe wire is the **yellow** one |
| `extinguisher` | corridor | — | Red herring; gives a distinct failure message if used on the bomb |
| `bomb` | vault | — | Three wires: red, blue, yellow. Cutting a wrong wire detonates it |
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
cables — you cannot tell which is which in this light"), and it cannot brute-force the safe code
(the code space is 10⁴ and each attempt is a turn). A random policy therefore succeeds with
probability ≈ 0.

### 7.6 Gold path (10 commands — the efficiency denominator)

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

`tests/scenarios/mission-impossible.gold.test.ts` asserts this path succeeds, that it is the
shortest success under BFS over the action space (the harness includes a BFS oracle), and that the
random policy fails 20/20 seeds.

### 7.7 Failure states

| Trigger | Outcome | Note |
|---|---|---|
| `cut red wire with cutters` / `cut blue wire …` | **failure** — detonation, run ends | Irreversible within the run |
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
| `look` | `l` | — | Re-describe the current node |
| `inventory` | `i`, `inv` | — | List carried entities |
| `examine` | `x`, `inspect` | `target: entity-in-node` | Reveals `detail` if present |
| `go` | `walk`, `move`, `enter` | `target: node` | Direction words map to connections |
| `take` | `get`, `grab`, `pick up` | `target: entity-in-node` | |
| `drop` | — | `target: entity-in-inventory` | |
| `open` | — | `target: entity-in-node` | Containers |
| `read` | — | `target: entity-in-node` | Readables |
| `unlock` | — | `target: entity-in-node`, `with: text` | Key entity **or** numeric code |
| `cut` | — | `target: entity-in-node`, `with: entity-in-inventory` | Tool must be carried |
| `use` | — | `tool: entity-in-inventory`, `on: entity-in-node` | Generic two-arg form |
| `hint` | — | — | Costs one turn; consumes a hint credit (§7.4) |
| `wait` | — | — | Costs one turn |
| `help` | `?` | — | Lists verbs; no state change |

Multi-word forms: `use X on Y`, `cut X with Y`, `unlock X with Y`. The parser recognises the
connective (`on` / `with` / `to`) and splits accordingly.

### 8.2 Parsing rules (deterministic, no LLM)

1. Normalise: trim, lower-case, collapse whitespace.
2. Strip a leading `>` or `>` prompt marker.
3. Match the first token against the verb table (canonical + synonyms + scenario-extended verbs).
4. If the verb takes two args, split on the connective.
5. Resolve entity arguments against: current node contents → inventory → connections (by label).
   Resolution is exact alias match first, then case-insensitive prefix match if unambiguous.
6. Unresolvable argument → `parse_error` with a message naming the failure.
7. Unknown verb → `parse_error` listing the valid verbs.

**Rationale for no LLM parsing:** it keeps the cost of an invalid agent action attributable to the
agent, and makes `invalid_action_rate` (§12.2) a genuine measure rather than a parser artefact.

**Error message contract** (every failure must be informative and non-punitive — the agent must be
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
  /** Entities present and visible in the current node. */
  visible: Array<{ id: Id; name: string; description: string; readable?: boolean; container?: boolean }>;
  /** Carried entities. */
  inventory: Array<{ id: Id; name: string; description: string }>;
  /** Exits and their status. 'locked' is observable (a locked door is visible and closed). */
  exits: Array<{ direction: string; label: string; toName: string; status: 'open' | 'locked' | 'closed' }>;
  /** Outcome text of the action just taken (empty on turn 1). */
  messages: string[];
  /** The mission objectives and whether each is demonstrably complete. */
  goals: Array<{ id: Id; text: string; status: 'unknown' | 'complete' | 'incomplete' }>;
  /** Which verbs are legal right now (only in masked conditions). */
  legalActions?: string[];
}
```

### 9.2 What the observation must NEVER contain

- The gold path, the hint table, the scenario's `requires`/`effects`, or any other entity that is
  not in the current node or the inventory.
- The contents of a closed container (only that it is closed and that it *might* contain something).
- The identity of the safe wire before the manual is read.
- Any flag the agent has not observed.
- Internal ids that leak authoring structure beyond stable entity names (ids are fine — they are
  stable and opaque; authoring predicates are not).

**Enforcement:** `tests/leakage.test.ts` asserts that, for every reachable state in the scenario,
the observation's entity set ⊆ (node contents ∪ inventory), and that no observation ever contains
the substrings of the gold path or hint text before the corresponding hint is issued. The
observation builder is a **separate module** that receives only `WorldState` + public scenario
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
| `RandomPolicy` | Uniformly samples legal commands — the **lower bound** baseline |
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
(scripted responses, for tests and zero-cost runs). Implement all of them with plain `fetch` — no
vendor SDKs — so provider churn does not become a dependency problem.

### 10.3 Prompt assembly and the action envelope

The system prompt is assembled from the scenario (brief, verbs, rules) plus the strategy, and is
**versioned and hashed**; the hash is stored in every transcript so a result can be tied to the
exact prompt.

Required prompt elements:

1. Your mission (the scenario brief).
2. The world model at a high level (nodes and entities exist; travel, take, open, read, unlock,
   cut; a turn is a single command).
3. The available verbs and argument shapes.
4. The rules: issue exactly one command; only refer to things you can currently see or carry; if
   you are unsure, explore rather than guess; a failed action does not cost the mission.
5. The output envelope (below).

**Output envelope** — ask for reasoning and command in a strict form:

```
THINK: <one or two sentences of reasoning>
COMMAND: <one command>
```

`COMMAND:` is required. The extractor (§10.5) accepts the line after `COMMAND:`, strips code
fences and `>` prompts.

`THINK:` is optional and its presence/absence is an experimental variable (`thinking: on|off`).

### 10.4 Context strategy (a first-class experimental variable)

| Strategy | What the model sees |
|---|---|
| `none` | The current observation only. The control: pure reactive behaviour |
| `full` | The entire transcript: brief, every observation, every command and outcome |
| `window` | The last *N* turns (N = 5) plus the brief |
| `structured` | A compact "known facts" block (location, inventory, visible entities, disclosed goals, revealed facts) + the last 2 outcomes + the brief |

`structured` is the recommended default and the direct analogue of the organisation-simulation
requirement ("the AI agent gets your current details about where you are"). `full` tests H5.

**Known-facts block** (the `structured` strategy) is derived only from the agent's own observation
history — it is a *summary of what the agent has seen*, never scenario-authoring data.

### 10.5 Action extraction and repair

A deterministic extraction chain, in order, recording which rung succeeded (the rung is recorded
as a metric, `extraction_route`):

1. Last `COMMAND:` line in the response.
2. Last non-empty line, if it parses as a valid command.
3. First non-empty line, if it parses.
4. `null` → the runner records `unparsable_response` and re-prompts (counts against the turn
   budget).

Then: parse the extracted string with the kernel parser (§8.2). If parsing fails, the runner records
`parse_error` and returns the error message as the next observation — **the agent gets the chance to
correct itself**. Whether correction is allowed (1 retry / unlimited / none) is an experimental
variable.

**Never** repair a command by fuzzy-matching it into a legal one. If the agent said "take the
keycard", the kernel must not helpfully interpret "the keycard" as "keycard" by fiat — but alias
resolution inside the scenario's alias table is legitimate and must be declared in the scenario.

### 10.6 Prompt template

Keep it in one file, `src/agents/llm/prompt.ts`, as a pure function of
`(scenario, observation, context, options) → { system, messages }`. It must be unit-testable
without a network call, and must contain a placeholder for the scenario description so a second
scenario needs no prompt change.

---

## 11. Runner, budgets and safety guards

### 11.1 The turn loop

```
create session → state = scenario.initial
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

A **run** = one (scenario, policy, provider, model, condition, seed) tuple, producing one
transcript and one metrics record.

### 12.2 Metrics

**Outcome metrics**
| Metric | Definition |
|---|---|
| `outcome` | `success` \| `failure` \| `budget_exhausted` \| `loop_detected` \| `provider_error` \| `provider_stopped` |
| `goalsCompleted` | 0…2 (of the scenario's goals) |
| `turnsUsed` | Turns consumed |
| `goldPathLength` | 10 for this scenario |
| `efficiency` | `goldPathLength / turnsUsed` — higher is better; 1.0 = a perfect run, 0.1 = ten times the optimal path |
| `wasteRatio` | `turnsUsed / goldPathLength` — the inverse, for readers who think in overhead multiples (1.0 = optimal) |
| `hintsUsed` | Hints consumed |

**Process metrics (the interesting ones)**
| Metric | Definition |
|---|---|
| `invalidActionRate` | Invalid actions ÷ total commands — proxies "does it ground its actions in the world?" |
| `unparsableRate` | Responses the extractor could not turn into a command ÷ total turns |
| `hallucinationRate` | Commands referencing an entity not present in node ∪ inventory ÷ total commands — the grounding proxy |
| `repeatStateRate` | Commands that changed nothing ÷ total commands |
| `explorationSteps` | Turns before the first state-changing action |
| `recoveryRate` | After a failure, did the agent try something different within 2 turns? (0…1) |
| `orderingViolations` | Attempts to use a gated action before its precondition (e.g. cutting a wire before reading the manual) |

**Cost metrics**
`inputTokens`, `outputTokens`, `estimatedCostUsd`, `wallClockMs`, `msPerTurn`.

### 12.3 Failure taxonomy (S3 — the reusable artefact)

Every unsuccessful run is classified into exactly one primary category, in this priority order:

| Code | Category | Definition |
|---|---|---|
| `F1` | Parsing | The model could not produce a command the parser accepted |
| `F2` | Hallucination | The model referenced entities that do not exist in scope |
| `F3` | Planning | The model acted against its own stated plan, or repeated a failed action |
| `F4` | Ordering / precondition | The model attempted a gated action before discovering the gate (e.g. cut before read) |
| `F5` | Exploration failure | The model never found a required fact within the budget |
| `F6` | Lethal trap | The model detonated the bomb |
| `F7` | Budget exhaustion | No specific above; ran out of turns |
| `F8` | Provider error | API/network failure |
| `F9` | Abstention / early stop | The model declared itself stuck or stopped early |

The taxonomy is computed **from the transcript** by a deterministic classifier, not by hand. The
classifier's rules are unit-tested.

### 12.4 Experiment matrix (minimum viable run)

| Axis | Values |
|---|---|
| Model | ≥ 2 frontier models on ≥ 2 providers (e.g. Anthropic Claude, OpenAI GPT-class), plus 1 open-weights model via Ollama if available |
| Condition | `A` free-form text obs + `full` context · `B` json obs + `full` · `C` json obs + `structured` + masked legal actions · `D` json obs + `none` (control) |
| Seeds / repeats | ≥ 10 per cell (temperature > 0, distinct seeds) |
| Total runs | ≥ 160 |

A cell is the (model × condition) pair; report success rate with a Wilson 95% interval, median
turns, and the failure-code histogram.

### 12.5 Results artefacts

| Artefact | Path |
|---|---|
| One transcript per run | `runs/<model>/<condition>/<seed>.jsonl` (git-ignored by default; an `examples/` set is committed) |
| Per-run metrics | `runs/<model>/<condition>/<seed>.metrics.json` |
| Aggregated summary | `results/summary.json` and `results/summary.md` (a Markdown table with Wilson intervals) |
| Failure taxonomy | `results/failures.md` — histogram plus 3 annotated transcripts per category |
| Findings write-up | `RESULTS.md` — the human-readable answer to RQ1–RQ5 |

### 12.6 Acceptance criteria for the research

The experiment is complete when:

- **AC-R1.** Every run in the matrix has a transcript, a metrics file, and a classification.
- **AC-R2.** `npm run replay <transcript>` reproduces the recorded hash chain exactly for **100%** of
  transcripts (engine determinism).
- **AC-R3.** H1 is reported with a Wilson interval, whether it holds or not.
- **AC-R4.** Every failure in the matrix is assigned exactly one taxonomy code, and ≥ 3 transcripts
  per non-empty category are annotated in `results/failures.md`.
- **AC-R5.** `RESULTS.md` answers RQ1–RQ5 with numbers, and states threats to validity (§17).
- **AC-R6.** The cost per solved mission is reported.

---

## 13. Determinism, replay and persistence

### 13.1 Determinism guarantees

**Guaranteed (engine):** given the same scenario and the same command sequence, the kernel
produces byte-identical state and event sequences. Guaranteed by C1 and verified by replay.

**Not guaranteed (model):** LLM sampling is non-deterministic unless a provider supports a fixed
seed. Therefore reproducibility is defined as:

> Engine determinism + a complete recorded transcript + a pinned model identifier + a recorded
> prompt hash + a recorded seed.

Never claim "the same run can be reproduced exactly". Claim "the *environment* is exactly
reproducible, and the agent's trajectory is fully recorded".

### 13.2 Replay

`npm run replay -- <transcript.jsonl>`:

1. Re-create the session from the scenario referenced in the transcript header.
2. Re-apply each recorded command through the same reducer.
3. Recompute the hash chain and compare to the recorded chain.
4. Exit non-zero on any mismatch.

This is the executable form of §4.3's equivalence contract.

### 13.3 Session persistence

A session is `{ id, scenarioId, scenarioVersion, state, transcript[] }` and is stored as plain JSON.

- `FileSession` — writes to `sessions/<id>.json`.
- `InMemorySession` — for tests and the browser client.
- `HttpSession` — the server-held session (§14).

The server-held session exists for the "watch the agent play" demo and for multi-agent experiments.
It is **not** required for v1 to be useful.

### 13.4 Transcript format

JSON Lines. One record per line. The first line is the header:

```jsonl
{"type":"header","runId":"...","scenario":"mission-impossible","scenarioVersion":"1.0.0","scenarioHash":"sha256:...","policy":"llm","provider":"anthropic","model":"claude-sonnet-4.5","condition":"C","contextStrategy":"structured","seed":7,"promptHash":"sha256:...","startedAt":"2026-01-01T00:00:00.000Z","gitCommit":"...","engineVersion":"1.0.0"}
{"type":"observation","turn":0,"data":{...}}
{"type":"command","turn":1,"raw":"take keycard","verb":"take","args":{"target":"keycard"}}
{"type":"events","turn":1,"data":[...]}
{"type":"state","turn":1,"hash":"sha256:...","summary":{"nodeId":"briefing","inventory":["keycard"]}}
{"type":"metrics","turn":10,"data":{...}}
```

`scenarioHash` and `promptHash` pin the exact environment and prompt; `gitCommit` pins the code.

---

## 14. Interface decision: client, server, or both

The user's question — *"if you get it working in the browser, you might want a server behind it just
holding the state, unless you can do that all in memory in the front end. Have a think: adversary,
pros, cons"* — is answered here.

### 14.1 Options considered

| | **A. Browser-only** | **B. Server-held state** | **C. Pure kernel + swappable session (chosen)** |
|---|---|---|---|
| Shape | Kernel bundled into the page; state in JS memory (optionally `localStorage`) | Kernel on the server; browser is a thin client over HTTP | Kernel is a library; `Session` is an interface with `InMemory` and `Http` implementations |
| Infra | None | A running Node process | None required; a server is optional |
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
so the "watch it solve it live" demo — which is the most persuasive artefact of this project — is
impossible. Multi-agent collaboration cannot be demonstrated. State loss on refresh is a papercut
rather than a blocker.

**Against server-held state:** it introduces a process to run, a session lifecycle (create, resume,
expire), and an implicit network dependency into the *demo* path. It risks the project being judged
on its deployment rather than its findings. It also tempts the kernel to become stateful in a
server-ish way, weakening the "pure, portable kernel" property.

**For the chosen option (C):** the kernel is pure, so it runs identically in Node and in the
browser. The `Session` interface means the browser client can start in `InMemory` mode (zero
infra, GitHub Pages deployable) and switch to `Http` mode with one configuration flag when the
live agent demo is wanted. The decision is deferred rather than forced — which is the correct
posture when the two modes have genuinely different costs.

### 14.3 Decision

**Implement C. Concretely:**

- `src/session/types.ts` — `Session { id, scenario, state, send(command), snapshot(), reset() }`.
- `src/session/in-memory.ts` — `InMemorySession` (default; used by tests, the CLI, and the browser
  client).
- `src/session/http.ts` — `HttpSession` (browser client talking to `src/server`).
- `src/server/routes.ts` — `POST /api/session`, `POST /api/session/:id/command`,
  `GET /api/session/:id`, `GET /api/scenario/:id`, `GET /api/health`.
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
- The web client must contain **no game logic** — it renders observations and sends commands.

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
├── docs/
│   ├── RESEARCH-CONTEXT.md      ← engine survey, citations, licence notes
│   ├── ARCHITECTURE.md          ← diagrams and the reasoning behind §4
│   └── SCENARIOS.md             ← scenario authoring guide + the MI scenario spec
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
│   ├── scenarios/
│   │   └── mission-impossible/
│   │       ├── scenario.ts      ← pure data
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
│   ├── scenarios/*.test.ts
│   ├── architecture.test.ts     ← C4 dependency rules
│   ├── leakage.test.ts          ← C2 no privileged info
│   ├── equivalence.test.ts      ← REQ-EQUIV-1 across the three interfaces
│   └── fixtures/
│       ├── golden.jsonl
│       └── scenarios/*.json
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
| Runtime | Node 20+ | `node:test` not needed — Vitest is used |
| Test runner | Vitest | Fast, TS-native, good snapshot support |
| Dev runner | `tsx` | Zero-config TS execution |
| Validation | Zod | Runtime validation of scenario files and provider responses; scenarios are data and must be validated at load |
| CLI | `commander` | Argument parsing, subcommands, help text |
| Web build | esbuild | One bundle, no framework, fast |
| Server | `node:http` + a ~60-line router | Avoids a framework dependency; the API is 6 routes |
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
    "play": "tsx src/cli/index.ts play --scenario mission-impossible",
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

### Phase 0 — Kernel (foundation)

**Tasks:** types; predicates; effects; reduce; hash chain; parser; observation builder; text
renderer; goal evaluation.

| ID | Acceptance criterion |
|---|---|
| P0.1 | `reduce` is a pure function; no imports of `fs`/`http`/`Date`/`Math.random` in `src/kernel` (lint rule) |
| P0.2 | ≥ 90% line coverage on `src/kernel` |
| P0.3 | The hash chain is stable across runs and process restarts |
| P0.4 | The parser resolves aliases, handles `use X on Y` / `cut X with Y`, and produces informative errors |
| P0.5 | `tests/architecture.test.ts` proves the dependency rules of §4.4 |

### Phase 1 — Scenario

| ID | Acceptance criterion |
|---|---|
| P1.1 | The MI scenario is pure data, validated by Zod at load |
| P1.2 | The gold path (10 commands) reaches `success` |
| P1.3 | A BFS oracle confirms 10 is the shortest success path |
| P1.4 | `RandomPolicy` fails 20/20 seeds |
| P1.5 | Detonation is irreversible and ends the run as `failure` |

### Phase 2 — Human CLI

| ID | Acceptance criterion |
|---|---|
| P2.1 | A human can play the mission to completion from the terminal |
| P2.2 | The CLI writes a transcript in the §13.4 format |
| P2.3 | The CLI's transcript replays to an identical hash chain |

### Phase 3 — Agent harness

| ID | Acceptance criterion |
|---|---|
| P3.1 | `LlmProvider` adapters for Anthropic, OpenAI-compatible, Ollama, Mock |
| P3.2 | `MockProvider` runs the full harness with zero network calls |
| P3.3 | The prompt is a pure function, unit-tested, with a recorded hash |
| P3.4 | All four context strategies are implemented and selectable |
| P3.5 | Budgets, loop detection, and transient-error handling are implemented and unit-tested |
| P3.6 | No secret is ever written to a transcript or log |

### Phase 4 — Measurement

| ID | Acceptance criterion |
|---|---|
| P4.1 | Every run emits a metrics record with all §12.2 metrics |
| P4.2 | The failure classifier assigns exactly one code per failed run; unit-tested on synthetic transcripts |
| P4.3 | `sweep` runs the full matrix and writes `results/summary.json` + `results/summary.md` |
| P4.4 | Wilson 95% intervals are computed for every cell |

### Phase 5 — Web client + server

| ID | Acceptance criterion |
|---|---|
| P5.1 | The browser client plays the mission with no game logic in `src/web` |
| P5.2 | `InMemory` and `Http` session modes both work, selected by configuration |
| P5.3 | A human can watch an agent run live (SSE) in the browser |
| P5.4 | The web client's transcript replays identically to the CLI's |

### Phase 6 — Results

| ID | Acceptance criterion |
|---|---|
| P6.1 | The matrix is run; ≥ 160 runs with complete artefacts |
| P6.2 | `RESULTS.md` answers RQ1–RQ5 with numbers and states threats to validity |
| P6.3 | `results/failures.md` has ≥ 3 annotated transcripts per non-empty failure category |
| P6.4 | Cost per solved mission is reported |

### Phase 7 — Generality probe (stretch)

| ID | Acceptance criterion |
|---|---|
| P7.1 | A second scenario — a miniature organisation simulation (2 teams, 1 shared artefact, 1 dependency, 1 budget constraint) — is authored **without changing the kernel** |
| P7.2 | The same agent harness runs it, and `RESULTS.md` compares the two worlds |
| P7.3 | A one-page "what this means for org simulation" section is written |

### Phase 8 — Engine comparison (stretch)

| ID | Acceptance criterion |
|---|---|
| P8.1 | The same scenario is ported to QuestJS, and the agent harness runs against it |
| P8.2 | A short comparison of agent success rate and authoring cost is written |

---

## 17. Risks and threats to validity

| # | Risk | Mitigation |
|---|---|---|
| V1 | **The scenario is too easy.** A 10-command mission may not stress long-horizon reasoning | Report the step-dependency depth; add a harder variant (Phase 7) |
| V2 | **The scenario is too hard / has an unintended dead end** | Automated reachability check: every node and every entity is reachable; BFS confirms solvability; the gold path passes |
| V3 | **Prompt sensitivity dominates the result** | Pin and hash the prompt; report results per prompt version; treat prompt changes as a new experiment |
| V4 | **Model version drift** | Record the exact model id, provider, and date in every transcript; report the run date |
| V5 | **Small sample** | ≥ 10 seeds per cell; Wilson intervals; do not claim significance below that |
| V6 | **Non-determinism** | Never claim exact reproduction of an agent run; guarantee engine determinism only (§13.1) |
| V7 | **Observer effect** — the observation format helps more than the reasoning | Include the `none` control condition and a `text` observation condition so format effects are separable from reasoning effects |
| V8 | **Parser leniency inflates success** | Report `invalidActionRate`; the parser never rewrites an agent's intent (§10.5) |
| V9 | **Cost** | Budgets per §11.2; `--provider mock` for all development and CI |
| V10 | **Single-scenario overfitting** | Phase 7's second scenario; the kernel must not be tuned to the MI scenario's specifics |

---

## 18. Roadmap to organisation simulation

The long-term aim: run an organisation as an adventure game — state stored centrally, each agent
receives its current context (where it is, what it knows, what it must do), and acts through a
command vocabulary.

### 18.1 Concept mapping

| Kernel concept | Adventure instance | Organisation instance |
|---|---|---|
| Node | Room | Team, system, queue, or meeting |
| Entity | Object, tool, document | Ticket, artefact, credential, message, account |
| Connection | Door, corridor | Handoff, dependency, escalation, approval path |
| Flag | Puzzle state | Ticket status, budget consumed, SLA breach |
| Goal | Mission objective | Objective, KPI, or assigned task |
| Observation | Room description | "Your dashboard": your queue, your blockers, your standing instructions |
| Command | Typed text | Tool call (Jira API, chat, email, deploy) |
| Inventory | Carried items | Working context, open threads, fetched artefacts |
| Turn | Game move | One action cycle |
| Failure | Detonation | Blocked task, missed SLA, bad deploy |
| Hint | Hint credit | Escalation, asking a human, reading the runbook |

### 18.2 What already transfers

Because the kernel is domain-neutral (§3.1), the following are already built by Phase 0 and need no
change to serve an organisation simulation:

- The state machine, hash chain, replay, and transcript format — the audit trail for agent actions.
- The observation contract — the "current details about where you are" payload.
- The context strategies (`none` / `full` / `window` / `structured`) — the answer to "do we give the
  agent the whole context of the conversation, or a summary?".
- The budgets and guards — the answer to "how do we stop an agent burning money?".
- The failure taxonomy — the answer to "how do we know an agent is failing, and why?".

### 18.3 What must be built later (not in v1)

| Need | Change required |
|---|---|
| Live state from real systems | `Session` implementations that read/write a real backend rather than a JSON file |
| Asynchronous agents | The runner becomes an event consumer; `turn` becomes wall-clock + ordering |
| Multiple agents | `Session` per agent, plus a shared world; the kernel already supports per-session state |
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
| Q1 | Does the agent see the mission goal checklist status, or only the brief? | Yes — the objectives are disclosed (the mission is known); the *method* is not |
| Q2 | Are hints available to LLM agents? | Yes, 3 per run, identical for all conditions, recorded as `hintsUsed` |
| Q3 | Does the agent see the count of remaining hints? | Yes — it is an observable affordance, not privileged information |
| Q4 | Free-text commands or a structured action schema? | Both: free-text is the primary condition; the masked condition is the comparison |
| Q5 | Is the `THINK:` step on by default? | On (it is the stronger baseline); `off` is a recorded variable |
| Q6 | Temperature | 0.7 for the seeded main matrix (to measure reliability, not best case); 0 as a supplementary condition |
| Q7 | Should the agent be told the turn budget? | Yes — knowing the budget is part of competent agent design |
| Q8 | Which providers/models | At least one Anthropic and one OpenAI-compatible model; Ollama optional |

---

## 20. Source references

- TALES — Text Adventure Learning Environment Suite (Microsoft Research):
  https://www.microsoft.com/en-us/research/publication/tales-text-adventure-learning-environment-suite/
  · https://github.com/microsoft/tale-suite · paper: https://arxiv.org/abs/2504.14128
- QuestJS (MIT): https://github.com/textadventures/quest
- ink (MIT): https://github.com/inkle/ink
- TextWorld (Microsoft Research License): https://github.com/microsoft/TextWorld

See `docs/RESEARCH-CONTEXT.md` for the full survey, licence notes and per-source findings.
