# Research Context — Engines, Benchmarks and the Design Decision

This document records the evidence behind the architectural decision in `SPEC.md` §3. It is the
"why", kept separate from the "what". All sources were checked against their primary source on
**7 November 2026**.

---

## 1. The question we started with

> *"Are there any simple open-source adventure game engines we could utilise?"*

Yes — several, and they are good. The reason we are not using one for v1 is not quality; it is
**coupling**. The research question is about an agent operating inside a *controlled, deterministic,
auditable* environment. If the environment is supplied by a third-party engine, then:

1. We do not control the observation surface — what the agent can see is decided by an engine's
   script format, not by us. That is the exact variable under test.
2. We do not control determinism guarantees or the replay format.
3. We cannot hold the kernel's vocabulary domain-neutral, which forecloses the organisation
   simulation follow-on.
4. We inherit that engine's licence and maintenance life.

So the engines are surveyed here, and two of them are scheduled as Phase 8 comparison work.

---

## 2. Survey

### 2.1 QuestJS

- **Repository:** <https://github.com/textadventures/quest> (textadventures/quest)
- **Language:** JavaScript. **Licence: MIT** (confirmed via the GitHub API licence field).
- **What it is:** The JavaScript re-implementation of the Quest engine — a long-established
  adventure-game authoring system with rooms, objects, attributes, and a text command parser.
  Runs in the browser and on Node.
- **Strengths for us:** Substantial, battle-tested command handling; browser-native; MIT means we can
  fork it if needed.
- **Weaknesses for us:** Quest's object model is *attribute-driven* and its script language is
  designed for human-authored prose with dynamic text. Modelling "the agent may only observe what
  it has perceived" on top of that is possible but awkward — Quest shows the player the room's
  full contents, whereas our experiment needs a *perception* layer that can differ between the
  human view and the agent view.
- **Verdict:** Strong alternative, deferred to **Phase 8**. The specific experiment we want is
  "same scenario, same agent harness, QuestJS as the runtime".

### 2.2 ink

- **Repository:** <https://github.com/inkle/ink> (inkle/ink)
- **Language:** C# runtime with web/Unity integrations. **Licence: MIT** (confirmed via the GitHub
  API licence field).
- **What it is:** A narrative scripting language for branching interactive fiction. Excellent at
  story structure, choices and conditional text.
- **Strengths for us:** Superb authoring experience for narrative; MIT; good JS runtime available.
- **Weaknesses for us:** ink is a *story runtime*, not a world-state simulator. It does not model
  entity inventories, locks, tool possession or world flags in the way our dependency chain needs,
  and it has no notion of "the agent may not yet know that the manual names the yellow wire".
  Deriving a state kernel from ink would mean building the kernel anyway, on top of ink.
- **Verdict:** Wrong shape for this experiment. Possible fit for a later *narrative* variant where
  the interesting variable is dialogue rather than state.

### 2.3 TextWorld

- **Repository:** <https://github.com/microsoft/TextWorld> (microsoft/TextWorld)
- **Language:** Python. **Licence: Microsoft Research License** — the GitHub API reports
  `NOASSERTION`, not an OSI-approved licence. **This is a correction to the earlier assumption in
  this project's brief that TextWorld is MIT; it is not, and it is not commercially permissive.**
- **What it is:** A sandbox for training and evaluating RL agents on text-based games. Supports
  generation of games with goals, and provides a gym-like interface with an information mask that
  is *exactly* the perception control we want.
- **Strengths for us:** Purpose-built for agent evaluation; the information-mask concept is a proven
  implementation of "the agent sees only what it has perceived".
- **Weaknesses for us:** Python; heavy install (with Java for TextWorld-Express and ScienceWorld);
  non-commercial licence; and building our own scenario in it means writing Python plus a custom
  game, with the kernel's portability and the browser client both lost.
- **Verdict:** **The most relevant prior art, and the design reference for our observation layer**
  — but a Python dependency we cannot use in a TypeScript repo, and the licence rules it out of the
  product path.

### 2.4 TALES — the benchmark to calibrate against

- **Repository:** <https://github.com/microsoft/tale-suite> (microsoft/tale-suite), MIT.
- **Paper:** *TALES: Text Adventure Learning Environment Suite* — <https://arxiv.org/abs/2504.14128>
- **Project page:** <https://www.microsoft.com/en-us/research/publication/tales-text-adventure-learning-environment-suite/>
- **What it is:** A curated collection of text-adventure games drawn from Jericho, TextWorld,
  TextWorld-Express, ScienceWorld and ALFWorld, packaged for evaluating LLM-based agents under
  zero-shot and ReAct prompting.
- **Why it matters here:** It reports that **even the top LLM-driven agents fail to achieve ~15% on
  games designed for human enjoyment** (12% in the earlier project-page wording), while performing
  far better on synthetic games. Its stated finding — *"because of the long-range causal
  dependencies often found in these games, a single mistake at any step can lead to a breakdown in
  gameplay later on"* — is the exact phenomenon this project is built to measure locally.
- **Useful behaviours to copy:** the `Agent` interface with pluggable prompting modes; the
  `--continue-from` trajectory replay that re-runs a logged trajectory deterministically without
  re-calling the LLM; the separation of zero-shot and ReAct conditions; walkthrough agents as an
  upper bound.
- **Verdict:** Not a dependency. It is our **yardstick and our design vocabulary**.

### 2.5 The chosen option — a minimal TypeScript kernel

A purpose-built, pure, dependency-light state kernel plus a data-driven scenario format.

| Criterion | Why the kernel wins |
|---|---|
| Determinism | We own the transition function and can hash-chain every state |
| Perception control | One function builds the agent's view; leakage is testable |
| Portability | Same TypeScript runs in Node (agent runner) and in the browser (web client) |
| Domain neutrality | The same kernel can host an organisation simulation (§18 of `SPEC.md`) |
| Auditability | ~600 lines of core logic, fully readable and testable |
| Licence | MIT, ours |

The cost we accept: we implement roughly fifteen mechanics ourselves — movement, visibility,
taking, dropping, containers, locks, readables, tools, codes, goal tracking, hints, failure states.
`SPEC.md` §5.1 defines the complete predicate/effect vocabulary needed, which is small.

---

## 3. Decision summary

| Option | Decision | Revisit when |
|---|---|---|
| QuestJS | Alternative — Phase 8 comparison | After the v1 matrix is complete |
| ink | Future experiment (narrative variant) | If the research question shifts to dialogue rather than state |
| TextWorld | Research reference only (licence + language) | Never as a product dependency |
| TALES | Reference benchmark and design vocabulary | Continuously |
| **Custom TypeScript kernel** | **Chosen for v1** | — |

---

## 4. What we borrowed conceptually

| From | What | Why |
|---|---|---|
| TALES | Pluggable `Agent` interface with zero-shot / ReAct modes | Makes the prompting strategy an experimental variable, not a constant |
| TALES | Deterministic trajectory replay from a log | Reproducibility without re-calling the LLM — mirrors our hash-chain replay |
| TALES | Walkthrough agent as an upper bound | Our gold path + BFS oracle is the same idea, and it calibrates "is this task even solvable?" |
| TextWorld | Information mask | The design principle behind `src/kernel/observation.ts` and `tests/leakage.test.ts` |
| Jericho / Inform-style parsers | Recoverable error messages ("you can't see any X here; you can see: ...") | An agent that cannot recover from a failed action cannot complete a 10-step chain |

---

## 5. Open items for later phases

- **Phase 8** — port the scenario to QuestJS and run the identical agent harness against it, to
  quantify how much of our measured agent performance is an artefact of our observation format.
- **Phase 9 (candidate)** — run our scenario inside TALES' harness, or our harness against a
  Jericho game, to place our absolute numbers on an existing scale.
- **Licence note** — if TextWorld is ever revisited, the Microsoft Research License must be
  reviewed for the intended use before any code is copied from or linked against it.
