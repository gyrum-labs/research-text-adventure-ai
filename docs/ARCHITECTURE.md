# Architecture and Decision Record

Companion to `SPEC.md`. `SPEC.md` says **what** to build; this document says **why it is shaped
this way**, and records the decisions taken so far as ADRs. Per `SPEC.md` §19, any decision that
changes the research design is recorded here.

---

## 1. The one-paragraph version

A **pure, deterministic state kernel** reduces an adventure and a command into a new state plus a
stream of events. Adventures are **data**. The agent never sees the adventure's authoring
information — it sees an **observation** built by a single function. A **runner** drives an
**agent policy** against the kernel under budgets and guards, recording a **transcript** whose
**hash chain** makes the run replayable. Three interfaces — human CLI, browser client, agent
runner — are thin shells over exactly that.

---

## 2. Layer map

```
┌───────────────────────────────────────────────────────────────────────────┐
│  EDGES                                                                   │
│                                                                          │
│   ┌────────────┐        ┌────────────┐        ┌────────────────────┐    │
│   │ Human CLI  │        │ Web client │        │ Agent CLI / sweep  │    │
│   │  (play)    │        │  (browser) │        │  (headless)        │    │
│   └─────┬──────┘        └─────┬──────┘        └─────────┬──────────┘    │
│         │  Session port         │  Session port           │             │
│         └───────────┬───────────┴───────────┬────────────┘             │
│                     ▼                       ▼                          │
│              ┌──────────────────────────────────────────┐                │
│              │  Session: InMemory │ File │ Http         │                │
│              └────────────────────┬─────────────────────┘                │
└───────────────────────────────────┼──────────────────────────────────────┘
                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  KERNEL  — pure. No I/O. No clock. No unseeded randomness.                 │
│                                                                          │
│   Adventure (data) ──► reduce(state, command) ──► { state, events }        │
│        │                      ▲                                           │
│        │                      │                                           │
│        │              ┌───────┴────────┐                                  │
│        │              │ CommandParser  │   ┌──────────────────────────┐  │
│        │              └────────────────┘   │ observation.ts           │  │
│        │                                   │ THE ONLY state→agent     │  │
│        │                                   │ boundary                 │  │
│        ▼                                   └──────────────────────────┘  │
│   goals.ts · hints.ts · render.ts · hash.ts                              │
└───────────────────────────────────┬──────────────────────────────────────┘
                                    ▼  Observation
┌───────────────────────────────────────────────────────────────────────────┐
│  AGENTS                                                                  │
│   AgentPolicy (Strategy) ── ScriptedPolicy │ RandomPolicy │ LlmPolicy   │
│                                    │                                     │
│                              LlmProvider (port)                         │
│                          Anthropic │ OpenAI │ Ollama │ Mock              │
└───────────────────────────────────┬──────────────────────────────────────┘
                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  RUNNER                                                                  │
│   budgets · loop detection · transcript (JSONL) · hash chain             │
│   metrics · failure classifier (F1–F9) · experiment sweep                │
└───────────────────────────────────────────────────────────────────────────┘
```

**Dependency rule (enforced by test + lint):** arrows point inward only. `kernel` imports nothing
from `agents`, `runner`, `cli`, `server` or `web`. `adventures` imports only kernel *types*.

---

## 3. Why the seams are where they are

### 3.1 The kernel/state seam is the experiment

The kernel is where determinism lives, and determinism is what makes a result checkable. If the
kernel could read the clock or the filesystem, every transcript would need a caveat. So the kernel
is a pure function of `(adventure, state, command)`, and the hash chain is a function of the state
alone.

### 3.2 The observation seam is the perception control

One function — `src/kernel/observation.ts` — converts state into the agent's view. Two consequences
follow, and both are tested rather than asserted:

- An adventure author **cannot** leak the gold path by accident, because the observation builder
  never receives the gold path, the hint table, or the action predicates.
- The human view and the agent view can differ. The human sees prose; the agent may see JSON, or
  JSON plus the list of legal actions. Same state, different surface.

This is the TextWorld *information mask* principle, reimplemented (`docs/RESEARCH-CONTEXT.md` §4.3,
D3).

### 3.3 The policy seam is what makes the comparison fair

`AgentPolicy` is a single interface. The runner cannot tell a scripted policy from a random one
from an LLM. Therefore a result about "condition C" is a statement about the *condition*, not about
the harness — the human CLI, the scripted gold path and the random baseline all go through the
identical loop.

### 3.4 The session seam defers the deployment decision

The kernel is pure, so it runs identically in Room and in a browser. `Session` is the swappable
part: `InMemory` (default, zero infrastructure), `File` (persistence), `Http` (server-held state
for the live agent demo and for future multi-agent work). See `SPEC.md` §14 for the full
pros/cons analysis.

---

## 4. Decision records

Format: context → decision → consequences. Status is `Accepted` for all entries unless noted.

### ADR-001 — Build a custom kernel

**Context.** Adventure engines exist and are good (QuestJS, ink, TextWorld — see
`docs/RESEARCH-CONTEXT.md` §2). Adopting one would fix the observation surface, the determinism
guarantees and the vocabulary to whatever that engine chose. The research question is precisely
about what an agent can perceive and do.

**Decision.** Build a small pure kernel in the game's own vocabulary: *rooms, objects, doors,
flags, actions, goals, turns*.

**Consequences.** We own determinism and the perception surface. We pay for ~15 mechanics of
implementation, bounded by a 6-predicate / 8-effect DSL. The organisation-simulation goal
(`SPEC.md` §18) becomes *another adventure* rather than a new engine. QuestJS and ink remain
available as Phase 8 comparisons.

### ADR-002 — The kernel speaks an adventure vocabulary *(superseded by ADR-016)*

**Status:** Superseded on 7 November 2026 by **ADR-016**, at the project owner's direction.
The reasoning below is retained because it explains what changed and why.

**Context.** A kernel that knows about rooms and keys cannot be pointed at a different domain
without modification, which was thought to forfeit the "reusable for organisation simulation" goal.

**Decision (as originally taken).** The kernel knows only generic terms — `Node`, `Entity`,
`Connection`, `WorldState` — and adventure semantics are expressed as neutral data.

**Consequences (as originally foreseen).** The vocabulary is less self-documenting for a reader
expecting an adventure game. ADR-016 reverses this trade-off deliberately.

### ADR-003 — The observation is built by exactly one function

**Context.** TALES' qualitative analysis attributes a large share of agent failure to grounded
reasoning — acting on objects seen but not present in the current location — and to inductive
failures where an environment's uninformative feedback ("nothing happened") prevents learning.

**Decision.** `src/kernel/observation.ts` is the only path from state to agent view. It receives the
state plus *public* adventure fields only.

**Consequences.** "No privileged information" becomes a testable property (`tests/leakage.test.ts`)
rather than an intention. The cost is that adventure authors cannot hand-tune the agent's view per
action; they must express visibility as state.

### ADR-004 — Error messages must be informative and recoverable

**Context.** ALFWorld answers every failure — including a parse failure — with "nothing happened".
Agents cannot infer why they failed, so they repeat the same failing action.

**Decision.** Every failure message states what was attempted, what was wrong, and what is
possible. The contract is specified in `SPEC.md` §8.2 and is a fixture-asserted property.

**Consequences.** Slightly more implementation work in the kernel. In exchange, `recoveryRate`
(`SPEC.md` §12.2) is a meaningful metric rather than a measure of environmental opacity.

### ADR-005 — The parser never repairs the agent's intent

**Context.** It is tempting for the parser to resolve "the keycard" to "keycard" or to guess a
near-miss verb. Doing so would silently convert the agent's errors into successes.

**Decision.** Alias resolution is allowed only via the adventure's **declared** alias table. Nothing
else is repaired, and a failed parse returns an error the agent can act on.

**Consequences.** `invalidActionRate` and `hallucinationRate` measure the agent, not the parser.
The agent is given a chance to recover, which the transcript records.

### ADR-006 — `THINK:` / `COMMAND:` envelope, one command per turn

**Context.** ReAct interleaves reasoning and action; ReflAct-style work shows the reasoning step
matters in ALFWorld, ScienceWorld and Jericho.

**Decision.** The LLM emits an optional `THINK:` line and exactly one `COMMAND:` line. The
extraction chain is deterministic and its route is recorded as a metric. The `thinking` flag is a
recorded experimental variable.

**Consequences.** Transcripts stay machine-readable. The THINK line is advisory — the kernel never
parses it — so a model that ignores the format still costs only one extraction failure.

### ADR-007 — Context strategy is a first-class experimental variable

**Context.** Reflexion bounds its episodic memory to the last three reflections specifically to
avoid prompt-window overflow. TALES attributes degradation with game length to "relevant
information getting lost in the ever increasing context". BenchTrace reports agents forgetting
early lessons as noise accumulates. The user's own org-simulation intent raises the same question:
*give the agent the whole conversation, or a summary of where it is?*

**Decision.** Four strategies — `none`, `full`, `window` (N=5), `structured` (a derived known-facts
block). `structured` is the recommended default.

**Consequences.** The experiment can answer H5 rather than assume it. The `structured` block must be
derived only from the agent's own observation history, which is tested.

### ADR-008 — Masked legal actions are a condition, not the default

**Context.** Jericho's template-based action space (select template, fill blanks) was the practical
route to non-trivial IF scores. A masked action list is the LLM analogue.

**Decision.** Free-form commands are the primary condition; a masked condition (the observation
carries `legalActions`) is one arm of the matrix.

**Consequences.** H2 is answerable. Masking also risks teaching the agent the answer if implemented
carelessly — the masked list must contain only *legal* commands, never *useful* ones.

### ADR-009 — Goals are graded functionally, not by path

**Context.** WebArena grades tasks by checking the **end state** of the application, not the action
sequence. Path-based grading would punish valid alternative routes and inflate the gold-path
constraint.

**Decision.** `GoalSpec` with `achievedWhen` predicates. A run succeeds when every goal's
predicates hold, regardless of the route taken.

**Consequences.** Multiple successful routes are possible and are measurable via `wasteRatio`. The
BFS oracle still computes the shortest path for the efficiency denominator.

### ADR-010 — Engine determinism is guaranteed; model determinism is not, and is never claimed

**Context.** LLM sampling is non-deterministic unless a provider supports a fixed seed. TALES
handles this with 5 repeats per game and multiple seeds.

**Decision.** Guarantee the *engine* is exactly reproducible (hash chain + replay). Record the
model id, prompt hash, seed, date and git commit in every transcript header. Never state that an
agent run can be reproduced exactly.

**Consequences.** "Reproducible" in this repo means: the environment is exactly reproducible, and
the agent's trajectory is fully recorded and replayable against the recorded hash chain.

### ADR-011 — Client/server is a swappable session, not an architectural commitment

**Context.** The brief raised the choice between an all-in-memory browser client and a
server-held state. The two have genuinely different costs.

**Decision.** Kernel pure + `Session` interface with `InMemory`, `File` and `Http` implementations.
The browser client defaults to `InMemory` (zero infrastructure, GitHub Pages deployable). The agent
runner always uses `InMemory` in-process. `Http` mode exists for the live agent demo and future
multi-agent work.

**Consequences.** The infrastructure decision is deferred rather than forced, and the choice is a
configuration flag rather than a rewrite. The live-demo capability requires running the server —
documented as optional.

### ADR-012 — Plain `fetch` for provider adapters; no vendor SDKs

**Context.** Vendor SDKs churn, pull large dependency trees, and obscure exactly what was sent to
the provider — which matters for a research artefact.

**Decision.** A `LlmProvider` interface implemented with `fetch` for Anthropic, OpenAI-compatible
and Ollama, plus a `Mock`. Runtime dependencies are limited to `zod` and `commander`.

**Consequences.** We own request formatting and error handling, including transient-error
classification, which the runner's budgets depend on. Provider-specific features are only available
if we implement them.

### ADR-013 — The failure taxonomy is operational, and a first-class deliverable

**Context.** TALES classifies failures cognitively (spatial / deductive / inductive / grounded),
which requires reading reasoning traces. BenchTrace finds that *diagnosis* is the primary
bottleneck — models are poor at identifying what went wrong.

**Decision.** Classify failures **operationally** from the transcript alone (F1–F9,
`SPEC.md` §12.3): parsing, hallucination, planning, ordering/precondition, exploration failure,
lethal trap, budget exhaustion, provider error, abstention. Exactly one code per failed run.

**Consequences.** Classification is deterministic and testable without a model in the loop. We lose
the cognitive depth of TALES' taxonomy; the two should be reported side by side in `RESULTS.md`,
using the THINK traces for the cognitive view and the transcript for the operational one.

### ADR-014 — Report every model we run, including weak ones

**Context.** TALES includes only models reaching ≥90% on its synthetic screening task. That is
reasonable for a leaderboard and wrong for us: the failures of weak models are the data.

**Decision.** Report every model, every condition, every seed. No screening.

**Consequences.** More runs and a wider, more informative failure distribution. Larger cost —
mitigated by the `mock` provider for development and by per-run budgets.

### ADR-015 — Our numbers are not comparable to TALES' and we say so

**Context.** TALES gives the agent almost no domain information; we give a mission brief and a
command grammar. The metrics also differ (normalised score vs binary goal completion).

**Decision.** `RESULTS.md` must not place our success rates on the TALES axis. We cite TALES
qualitatively — for the failure-mode vocabulary, the environment-attribute table, and the
observation that human-written games are where agents collapse.

**Consequences.** We lose the convenience of a direct comparison. We gain a defensible result.
This is recorded as threat V7 in `SPEC.md` §17.

---

### ADR-016 — The kernel speaks the adventure's own vocabulary *(supersedes ADR-002)*

**Status:** Accepted, 7 November 2026, at the project owner's direction.

**Context.** ADR-002 kept the kernel in a neutral vocabulary (`node`, `entity`, `connection`,
`world`) so it could be "pointed at other worlds" without modification. In practice this made the
code and the specification harder to read, and it did not make the organisation simulation any
easier to write — the mapping had to be written either way. The owner's stated long-term aim is
that an organisation *is* an adventure game: state held centrally, each agent given its current
situation and a command vocabulary. Under that aim, the adventure vocabulary is not a
simplification to be engineered around — it is the model.

**Decision.** The kernel speaks the game's own language: `Room`, `GameObject`, `Door`,
`GameState`, `Adventure`, and verbs named as actions. The neutral vocabulary is removed. An
organisation simulation is written as **another adventure** — teams as rooms, tickets as objects,
handoffs as doors — and the question "does the metaphor hold?" becomes the Phase 7 research
question rather than an engineering problem.

**Consequences.**
- The code reads like what it is. A reader can follow `SPEC.md` §6 without a translation table.
- The kernel is no longer reusable for a non-adventure domain without an adapter. That cost is
  accepted and made explicit: `SPEC.md` §18 now documents the mapping and the seam rather than
  claiming the kernel is domain-neutral.
- The predicate/effect DSL is unchanged in shape; only the names change (`in_room`,
  `object_in_room`, `carrying`, `set_object_flag`, …). No new machinery.
- `docs/ADVENTURES.md` replaces `docs/SCENARIOS.md`.
- This supersedes ADR-002, which is retained for the record.

---

## 5. Open decisions for the implementing agent

Per `SPEC.md` §19, these have documented defaults. An implementer who changes one must record an
ADR here.

| # | Decision | Default | Needs an ADR if changed? |
|---|---|---|---|
| 1 | Whether goals are disclosed to the agent | Yes — objectives disclosed, method withheld | Yes (changes the perception model) |
| 2 | Hint budget for LLM agents | 3 per run, identical across conditions | No, unless hints become privileged |
| 3 | Free-text vs masked actions | Free-text primary; masked is one arm | Yes (changes the matrix) |
| 4 | `THINK:` enabled by default | On | No — recorded as a variable |
| 5 | Temperature | 0.7 for the seeded matrix; 0 as a supplementary arm | No — recorded as a variable |
| 6 | Whether the turn budget is disclosed | Yes | Yes (changes the task) |
| 7 | Which providers and models | ≥1 Anthropic, ≥1 OpenAI-compatible, Ollama optional | No |
| 8 | Whether `results/` is committed | Yes — `summary.json`, `summary.md`, `failures.md`; raw runs git-ignored | No |

---

## 6. Diagrams

The layer map is in §2. Two further views are worth keeping in mind:

**The turn loop** (`SPEC.md` §11.1):

```
observe → decide → reduce → record → check goal → (repeat | finish)
   ▲                    │
   └──── observation ◄──┘
```

**The evaluation flow**:

```
adventure ──► runner ──► transcript (JSONL) ──► replay ──► hash chain check
                             │
                             ├──► metrics.json ──► sweep ──► summary.md
                             └──► classifier ──► F1..F9 histogram ──► failures.md
```

---

## 7. Change log for this document

| Date | Change |
|---|---|
| 7 Nov 2026 | Created. ADR-001 … ADR-015 record the decisions taken during specification. |
| 7 Nov 2026 | ADR-016 added: the kernel adopts the adventure vocabulary, superseding ADR-002. |
