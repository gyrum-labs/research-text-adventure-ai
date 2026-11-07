# Task Cards — research-text-adventure-ai

Implementation plan derived from `SPEC.md`. Each card is independently mergeable and carries its
own acceptance criteria. Work top to bottom; each card's "Done when" is the gate.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` complete

---

## Phase 0 — Kernel

### T0.1 Project scaffolding
- [ ] `package.json` (ESM, scripts per `SPEC.md` §15.3), `tsconfig.json` (strict, `noUncheckedIndexedAccess`), `vitest.config.ts`, `eslint.config.js`, `.gitignore`, `.env.example`
- [ ] `npm run typecheck`, `npm run lint`, `npm run test` all run clean on an empty project
- [ ] **Done when:** a fresh clone passes `npm ci && npm run check`

### T0.2 Kernel types and the DSL
- [ ] `src/kernel/types.ts` — exactly the types in `SPEC.md` §6.1
- [ ] `src/kernel/predicates.ts` — six predicate evaluators
- [ ] `src/kernel/effects.ts` — eight effect appliers
- [ ] **Done when:** types compile; every predicate and effect has a unit test including the failing cases

### T0.3 Pure reducer
- [ ] `src/kernel/reduce.ts` — `reduce(state, command) → Transition`
- [ ] Resolves the action spec matching the command's verb, evaluates `requires`, applies `effects`, emits `Event[]`
- [ ] An action whose `requires` fail emits `action_failed` and changes nothing
- [ ] **Done when:** ≥ 90% line coverage on `src/kernel`; no `Date`/`Math.random`/`fs` imports (lint rule `no-restricted-imports`)

### T0.4 Hash chain and canonical JSON
- [ ] `src/kernel/hash.ts` — canonical JSON (recursively sorted keys) + `sha256` chain
- [ ] **Done when:** the same command sequence yields an identical chain across two processes

### T0.5 Command parser
- [ ] `src/kernel/parser.ts` — grammar per `SPEC.md` §8
- [ ] Verb table with synonyms; connective splitting (`on` / `with` / `to`); alias resolution (exact then unambiguous prefix)
- [ ] Error messages follow the contract in `SPEC.md` §8.2 (what was attempted, what was wrong, what is possible)
- [ ] **Done when:** table-driven tests cover every verb, both connectives, ambiguous aliases, and four malformed inputs

### T0.6 Observation builder
- [ ] `src/kernel/observation.ts` — the **only** function that converts state → agent view
- [ ] Implements `SPEC.md` §9.1 exactly; produces `legalActions` only when requested
- [ ] **Done when:** unit tests assert the entity set is confined to node contents ∪ inventory

### T0.7 Renderers, goals, hints
- [ ] `src/kernel/render.ts` — `text`, `json` (stable key order), `text-structured`
- [ ] `src/kernel/goals.ts` — goal achievement evaluation and `goal_complete` events
- [ ] Hint credits decrementing on use
- [ ] **Done when:** renderer output snapshots are committed under `tests/fixtures/`

### T0.8 Architecture boundary
- [ ] `tests/architecture.test.ts` — proves `src/kernel` imports nothing outside `src/kernel` + `node:crypto`
- [ ] **Done when:** the test fails if a prohibited import is introduced

---

## Phase 1 — Scenario

### T1.1 Scenario data
- [ ] `src/scenarios/mission-impossible/scenario.ts` — the full data from `SPEC.md` §7
- [ ] Zod schema validates it at load; an invalid scenario fails fast with a readable message
- [ ] **Done when:** the scenario loads and `reduce` can execute every action spec

### T1.2 Prose and hints
- [ ] `src/scenarios/mission-impossible/text.ts` — descriptions, success/failure text
- [ ] `src/scenarios/mission-impossible/hints.ts` — 3 hints, vague but true
- [ ] **Done when:** the mission brief contains the objectives and no method information (§9.2)

### T1.3 Gold path and BFS oracle
- [ ] `src/scenarios/mission-impossible/gold-path.ts` — the 10 commands
- [ ] A BFS oracle over the action space that finds the shortest success path
- [ ] **Done when:** the gold path succeeds; BFS independently confirms 10 is minimal

### T1.4 Negative validation
- [ ] `RandomPolicy` fails 20/20 seeds
- [ ] Detonating ends the run irreversibly as `failure`
- [ ] Cutting a wire before reading the manual is refused (not fatal)
- [ ] Brute-forcing the safe code cannot complete within the 30-turn budget
- [ ] **Done when:** all four hold, asserted in `tests/scenarios/`

---

## Phase 2 — Human CLI

### T2.1 CLI skeleton
- [ ] `commander` root with `play`, `agent`, `sweep`, `replay`, `eval`, `serve` subcommands
- [ ] **Done when:** `--help` lists all subcommands with working descriptions

### T2.2 Human play loop
- [ ] `src/cli/play.ts` — REPL, renders the text observation, reads commands, writes the transcript
- [ ] **Done when:** a human completes the mission end-to-end in the terminal

### T2.3 Transcript writer
- [ ] `src/runner/transcript.ts` — JSONL writer/reader in the `SPEC.md` §13.4 format, header first
- [ ] **Done when:** a CLI transcript replays to an identical hash chain

---

## Phase 3 — Agent harness

### T3.1 Provider port and adapters
- [ ] `src/agents/llm/provider.ts` — the `LlmProvider` interface
- [ ] `anthropic.ts`, `openai.ts` (OpenAI-compatible), `ollama.ts`, `mock.ts` — all via `fetch`
- [ ] Keys from env only; never logged; never written to a transcript
- [ ] **Done when:** `MockProvider` drives a full run with zero network calls; each adapter has a contract test against a recorded response fixture

### T3.2 Prompt assembly
- [ ] `src/agents/llm/prompt.ts` — pure function `(scenario, observation, context, options) → { system, messages }`
- [ ] Implements the envelope `THINK:` / `COMMAND:`; `thinking` toggle
- [ ] Prompt hash computed and recorded
- [ ] **Done when:** unit-tested without network; the prompt contains no scenario solution content

### T3.3 Action extraction
- [ ] `src/agents/llm/extract.ts` — the four-rung fallback chain from `SPEC.md` §10.5, recording `extraction_route`
- [ ] **Done when:** tests cover each rung, code fences, `>` prompts, empty responses, and multi-`COMMAND:` responses

### T3.4 Policies
- [ ] `src/agents/policy.ts` (`AgentPolicy`, `PolicyContext`), `scripted.ts`, `random.ts`, `llm.ts`
- [ ] `RandomPolicy` samples uniformly from legal commands and is seeded
- [ ] **Done when:** the runner cannot distinguish policy types; all three run the same loop

### T3.5 Context strategies
- [ ] `none`, `full`, `window` (N=5), `structured` (known-facts block)
- [ ] The structured summary is derived only from the agent's own observation history
- [ ] **Done when:** tests confirm the summary contains nothing the agent has not observed

### T3.6 Runner, budgets, guards
- [ ] `src/runner/run.ts` — the turn loop of `SPEC.md` §11.1
- [ ] `src/runner/budgets.ts` — all budgets of §11.2, each overridable by CLI flag
- [ ] Loop detection (≥ 3 repeated state hashes), transient-error backoff, parse-error cap
- [ ] **Done when:** each guard has a unit test that provably terminates the run with the right outcome

---

## Phase 4 — Measurement

### T4.1 Metrics
- [ ] `src/runner/evaluate.ts` — every metric in `SPEC.md` §12.2
- [ ] **Done when:** a synthetic run produces a complete metrics record

### T4.2 Failure classifier
- [ ] `src/runner/classify.ts` — the nine codes F1–F9, applied in the stated priority order
- [ ] **Done when:** unit-tested on synthetic transcripts, one code per failed run, never zero

### T4.3 Sweep and summary
- [ ] `src/cli/sweep.ts` — runs the matrix; writes `results/summary.json` and `results/summary.md`
- [ ] Wilson 95% intervals per cell
- [ ] **Done when:** a small matrix (1 model × 2 conditions × 3 seeds) produces both artefacts

### T4.4 Replay
- [ ] `src/runner/replay.ts` + `src/cli/replay.ts` — re-apply a transcript's commands and diff the hash chain
- [ ] **Done when:** replay exits non-zero on a tampered transcript

---

## Phase 5 — Web client and server

### T5.1 Session ports
- [ ] `src/session/types.ts`, `in-memory.ts`, `file.ts`, `http.ts`
- [ ] **Done when:** the same game logic works against all three session implementations

### T5.2 Server
- [ ] `src/server/` — `node:http` + a small router; routes per `SPEC.md` §14.3
- [ ] Server-held sessions; SSE endpoint for live agent runs
- [ ] **Done when:** a browser session and an in-process session produce identical hash chains

### T5.3 Web client
- [ ] `src/web/` — plain TS, esbuild bundle, no framework, **no game logic**
- [ ] Output pane, command input with ↑/↓ history, live log, status bar (turn, goals, hash)
- [ ] **Done when:** a human completes the mission in the browser

---

## Phase 6 — Results

### T6.1 Run the matrix
- [ ] ≥ 160 runs (≥ 2 models × 4 conditions × ≥ 10 seeds)
- [ ] All artefacts present and complete
- [ ] **Done when:** AC-R1 passes — every run has a transcript, metrics file, and classification

### T6.2 Verify reproducibility
- [ ] Replay 100% of transcripts; assert identical chains
- [ ] **Done when:** AC-R2 passes

### T6.3 Write up
- [ ] `RESULTS.md` — answers RQ1–RQ5 with numbers; reports H1–H5 verdicts; cost per solved mission; threats to validity
- [ ] `results/failures.md` — histogram plus ≥ 3 annotated transcripts per non-empty category
- [ ] **Done when:** AC-R3…AC-R6 pass

---

## Phase 7 — Generality probe (stretch)

- [ ] A miniature organisation scenario (2 teams, 1 shared artefact, 1 dependency, 1 budget) authored **without kernel changes**
- [ ] Run the same harness against it; compare the two worlds in `RESULTS.md`
- [ ] **Done when:** P7.1–P7.3 pass

---

## Phase 8 — Engine comparison (stretch)

- [ ] Port the scenario to QuestJS; run the same agent harness against it
- [ ] Compare agent success rate and authoring cost
- [ ] **Done when:** P8.1–P8.2 pass

---

## Cross-cutting rules

| Rule | Where it is enforced |
|---|---|
| Kernel purity | `tests/architecture.test.ts` + ESLint `no-restricted-imports` |
| No privileged information | `tests/leakage.test.ts` |
| Interface equivalence | `tests/equivalence.test.ts` |
| Engine determinism | `tests/replay.test.ts` |
| Strict typing | `npm run typecheck` |
| Budgets enforced | `tests/budgets.test.ts` |
| No secrets in artefacts | `tests/secrets.test.ts` (scan transcripts for key-shaped strings) |
