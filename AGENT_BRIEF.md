# Agent Brief — research-text-adventure-ai

Copy everything below the line into your coding agent. It is self-contained: the agent does not
need this conversation, and does not need to guess anything.

---

## Your task

You are implementing a research proof of concept in the repository `gyrum-labs/research-text-adventure-ai`.

**The authoritative requirements are `SPEC.md` in the repository root. Read it fully before writing
any code.** This brief is a summary and a work order; where the two disagree, `SPEC.md` wins.

**What the project is.** A research experiment that asks: *can an AI agent autonomously complete a
multi-step mission in a deterministic, stateful text environment, using only the information and
actions available to it, with no privileged knowledge of the solution?*

**What the project is NOT.** The adventure game is not the product. The product is (a) a generic,
deterministic, adventure-native state kernel and (b) measurable, replayable evidence about how LLM
agents behave inside it. The text adventure is the test fixture that makes the evidence cheap.

**The test fixture.** A short, original "Mission Impossible"-style adventure — a three-area
lock-and-key bomb-disposal mission with a four-step dependency chain, a lethal trap, and a 10-command
gold path. Its full specification is in `SPEC.md` §7. Do not substitute a different adventure.

## Non-negotiables

1. **TypeScript, strict mode, ESM, Node 20+.** Runtime dependencies limited to `zod` and
   `commander`. Dev dependencies: `typescript`, `tsx`, `vitest`, `esbuild`, `eslint`,
   `@typescript-eslint/*`. **No LLM vendor SDKs** — implement providers with plain `fetch`.
2. **The kernel is pure.** `src/kernel` must contain no I/O, no `Date.now()`, no `Math.random()`,
   no `fs`, and no imports from `src/agents`, `src/cli`, `src/server`, `src/web`. Enforce this with
   both an ESLint rule and `tests/architecture.test.ts`.
3. **The kernel speaks the adventure's own vocabulary.** It knows rooms, objects, doors, flags,
   actions, goals and turns. Do not abstract these into neutral terms — no `node`, no `entity`, no
   `connection`, no `world`. The game's language is the point. The adventure's *content* is still
   pure data.
4. **No privileged information leaks to the agent.** The agent's view of the game is built by
   exactly one function (`src/kernel/observation.ts`) from the game state and public adventure
   fields. The gold path, the hint table, the action predicates/effects, and the contents of closed
   containers must never appear. Enforce with `tests/leakage.test.ts`.
5. **One engine, three interfaces.** Human CLI, browser UI, and agent runner all drive the same
   reducer. A golden transcript must replay identically through all three — enforced by
   `tests/equivalence.test.ts`.
6. **Determinism.** Every state carries a hash: `h_n = sha256(h_{n-1} + ':' + canonicalJson(state_n))`.
   The same commands always produce the same chain. Replay verifies it.
7. **Cost safety.** All LLM calls sit behind `--provider`. `--provider mock` runs the entire
   harness with zero network and zero cost. Per-run budgets are mandatory (§11.2 of `SPEC.md`).
8. **No secrets in the repo.** Provider keys come from environment variables only. Commit
   `.env.example`; git-ignore `.env`.

## Where the work is

The build is cut into **six numbered experiments**, each teaching one idea and runnable on its
own. Start at [`experiments/README.md`](./experiments/README.md). Experiment 01 — *The game* — is
the one to begin with: it gets the adventure working so that a human **and** the AI system can
both play it, which is the foundation everything else stands on.

Each experiment README carries the idea, the tests **in the order they get written**, and its
acceptance criteria. Read the experiment first, then `SPEC.md` for the detail.

## The architecture you are building

```
kernel (pure)  ← adventures (data) ← session (InMemory | File | Http)
     ↑                                        ↑
   agents (LlmPolicy | ScriptedPolicy | RandomPolicy)   cli | server | web
                    ↓
            runner (budgets, guards, transcripts, metrics, taxonomy)
```

Detailed type signatures, the predicate/effect DSL, the observation shape, the command grammar, the
prompt contract, the metric definitions and the experiment matrix are all specified in `SPEC.md`.
Follow them literally — the spec is written to be implementable without interpretation. Where the
spec leaves something open, choose the simplest option that satisfies the constraints, and record
the decision as a short ADR in `docs/ARCHITECTURE.md`.

**The "why" lives in `docs/`.** Before you build, read:

| Document | Read it for |
|---|---|
| [`docs/RESEARCH-CONTEXT.md`](./docs/RESEARCH-CONTEXT.md) | Why a custom kernel, what TALES actually shows, the prior art we borrow from, and the **evidence behind each design decision** (D1–D16) |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | The layer map and **ADR-001…ADR-015** — the decisions already taken, and why. Do not re-litigate them silently |
| [`docs/REFERENCES.md`](./docs/REFERENCES.md) | Annotated bibliography with licences. Check a licence before you add a dependency |
| [`docs/SCENARIOS.md`](./docs/SCENARIOS.md) | How to write adventure data, with worked examples of every mechanic and an authoring checklist |

Two rules that follow from the research and are easy to get wrong:

- **Do not treat our success rate as comparable to TALES'.** Their metric is a normalised score
  and their agent gets almost no domain information; ours gets a mission brief and a grammar. If
  you cite TALES in `RESULTS.md`, cite it qualitatively and say why the numbers differ.
- **Informative error messages are a feature, not polish.** ALFWorld's "nothing happened"
  feedback is the documented cause of a large share of agent failure in the literature. An error
  message must say what was attempted, what was wrong, and what is possible.

## How to work

**Read first, then build.** `SPEC.md` §4 (architecture), §5 (patterns), §6 (data model), §7
(adventure), §8 (grammar), §9 (observation), §10 (agent protocol), §11 (runner), §12 (evaluation),
§15 (layout), §16 (phases) are the build-relevant sections.

**Build in phases, merge each phase green.** The phase gates are `SPEC.md` §16 (P0–P8). Each phase
has explicit acceptance criteria; a phase is done when its criteria pass. Do not start Phase 3
(LLM agents) before Phase 2 (human CLI) works end-to-end.

**Test as you go.** Every phase needs tests. The kernel needs ≥ 90% line coverage. The rules in
`SPEC.md` §16 are the definition of done — treat each acceptance criterion as a failing test to be
written first where practical.

**Use the mock provider for development.** Do not burn API tokens while building the harness.
The whole pipeline must be exercisable offline.

**Verify before claiming.** A phase is complete only when `npm run check` (typecheck + lint + test)
passes. Do not report a phase as done on the strength of code that has not been run.

## Acceptance criteria you must hit

The complete set is `SPEC.md` §16. The ones that most often get skipped:

- **P0.1 / P0.5** — kernel purity and the dependency rules are enforced automatically, not just intended.
- **P1.2 / P1.3 / P1.4** — the gold path succeeds, a BFS oracle proves 10 is the shortest path, and
  the random policy fails 20/20 seeds. These three together validate the adventure.
- **P2.3 / P5.4** — transcripts from every interface replay to identical hash chains.
- **P3.2** — the mock provider runs the entire harness with no network access.
- **P4.2** — the failure classifier assigns exactly one code to every failed run.
- **AC-R2** — 100% of recorded transcripts replay to their recorded hash chain.

## Definition of done for the whole project

1. `npm run check` passes.
2. `npm run play -- --adventure mission-impossible` is playable to completion by a human.
3. `npm run agent -- --provider mock` completes a full run and writes a transcript + metrics file.
4. `npm run replay -- <transcript>` verifies the hash chain and exits 0.
5. `npm run sweep` runs the matrix and writes `results/summary.json` and `results/summary.md`.
6. `RESULTS.md` answers RQ1–RQ5 with numbers, reports cost per solved mission, and states the
   threats to validity from `SPEC.md` §17.
7. `docs/RESEARCH-CONTEXT.md` is extended with anything you learn about the compared engines.

## If you get stuck

- Prefer a smaller, working, tested implementation over a complete, untested one. A partial matrix
  with honest reporting beats a fabricated complete one.
- If a `SPEC.md` detail is ambiguous, choose the reading that keeps the kernel in the game's own
  the agent unprivileged, then note it in `docs/ARCHITECTURE.md`.
- If a phase proves infeasible as specified, stop, document what you found, and deliver the
  remaining phases. Do not silently change the research design.
- Do not report numbers you did not measure. Every figure in `RESULTS.md` must trace to a file in
  `runs/`.
