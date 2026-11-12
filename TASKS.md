<!-- page-version: 1.0.0 status: draft last-reviewed: 2026-11-08 -->

# Task Cards: research-text-adventure-ai

Implementation plan derived from `SPEC.md`. Each card is independently mergeable and carries its
own acceptance criteria. Work top to bottom; each card's "Done when" is the gate.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` complete

Phases 0 to 7 are built and green. Phase 8 (the QuestJS comparison) is not started, and the
card says so.

Two cards were written as a sketch and describe a layout the build did not use. The adapters all
live in `src/agents/llm/provider.ts` rather than in a file each, and the budgets, the metrics and
the sweep live in `src/runner/run.ts`, `src/runner/metrics.ts` and `src/cli/exp-05.ts`. The card
text now names the files that exist. Two other cards asked for something the build achieved
differently: the renderers are asserted to agree on the facts rather than snapshotted, because
agreement is the property that matters and a snapshot would only pin the prose. The adapters are
tested against a local server that speaks their wire format rather than against a recorded
fixture, because that proves the request as well as the response.

Three cards had gates that were open when the work was marked done, and the gaps were closed
rather than waived: the DSL now has its own unit tests for every predicate and every effect
including the failing cases, the hash chain is proved identical across two separate processes,
and every action spec of the adventure is proved executable by the reducer.

---

## Phase 0: Kernel

### T0.1 Project scaffolding
- [x] `package.json` (ESM, scripts per `SPEC.md` §15.3), `tsconfig.json` (strict, `noUncheckedIndexedAccess`), `vitest.config.ts`, `eslint.config.js`, `.gitignore`, `.env.example`
- [x] `npm run typecheck`, `npm run lint`, `npm run test` all run clean on an empty project
- [x] **Done when:** a fresh clone passes `npm ci && npm run check`

### T0.2 Kernel types and the DSL
- [x] `src/kernel/types.ts`. Exactly the types in `SPEC.md` §6.1
- [x] `src/kernel/predicates.ts`. Ten predicate evaluators
- [x] `src/kernel/effects.ts`. Ten effect appliers
- [x] **Done when:** types compile; every predicate and effect has a unit test including the failing cases

### T0.3 Pure reducer
- [x] `src/kernel/reduce.ts`. `reduce(state, command) → Transition`
- [x] Resolves the action spec matching the command's verb, evaluates `requires`, applies `effects`, emits `Event[]`
- [x] An action whose `requires` fail emits `action_failed` and changes nothing
- [x] **Done when:** ≥ 90% line coverage on `src/kernel`; no `Date`/`Math.random`/`fs` imports (lint rule `no-restricted-imports`)

### T0.4 Hash chain and canonical JSON
- [x] `src/kernel/hash.ts`. Canonical JSON (recursively sorted keys) + `sha256` chain
- [x] **Done when:** the same command sequence yields an identical chain across two processes

### T0.5 Command parser
- [x] `src/kernel/parser.ts`. Grammar per `SPEC.md` §8
- [x] Verb table with synonyms; connective splitting (`on` / `with` / `to`); alias resolution (exact then unambiguous prefix)
- [x] Error messages follow the contract in `SPEC.md` §8.2 (what was attempted, what was wrong, what is possible)
- [x] **Done when:** table-driven tests cover every verb, both connectives, ambiguous aliases, and four malformed inputs

### T0.6 Observation builder
- [x] `src/kernel/observation.ts`. The **only** function that converts state → agent view
- [x] Implements `SPEC.md` §9.1 exactly; produces `legalActions` only when requested
- [x] **Done when:** unit tests assert the object set is confined to room contents ∪ inventory

### T0.7 Renderers, goals, hints
- [x] `src/kernel/render.ts`. `text`, `json` (stable key order), `text-structured`
- [x] `src/kernel/goals.ts`. Goal achievement evaluation and `goal_complete` events
- [x] Hint credits decrementing on use
- [x] **Done when:** the three renderers are asserted to agree on the facts, and the JSON key order is pinned

### T0.8 Architecture boundary
- [x] `tests/architecture.test.ts`. Proves `src/kernel` imports nothing outside `src/kernel` + `node:crypto`
- [x] **Done when:** the test fails if a prohibited import is introduced

---

## Phase 1: Adventure

### T1.1 Adventure data
- [x] `src/adventures/mission-impossible/adventure.ts`. The full data from `SPEC.md` §7
- [x] Zod schema validates it at load; an invalid adventure fails fast with a readable message
- [x] **Done when:** the adventure loads and `reduce` can execute every action spec

### T1.2 Prose and hints
- [x] Descriptions, success/failure text, carried in `src/adventures/mission-impossible/adventure.ts`
- [x] 3 hints, vague but true, carried in `src/adventures/mission-impossible/adventure.ts`
- [x] **Done when:** the mission brief contains the objectives and no method information. See §9.2.

### T1.3 Gold path and BFS oracle
- [x] `src/adventures/mission-impossible/gold-path.ts`. The 10 commands
- [x] A BFS oracle over the action space that finds the shortest success path
- [x] **Done when:** the gold path succeeds; BFS independently confirms 10 is minimal

### T1.4 Negative validation
- [x] `RandomPolicy` fails 20/20 seeds
- [x] Detonating ends the run irreversibly as `failure`
- [x] Cutting a wire before reading the manual is refused (not fatal)
- [x] Brute-forcing the safe code cannot complete within the 30-turn budget
- [x] **Done when:** all four hold, asserted in `tests/adventures/`

---

## Phase 2: Human CLI

### T2.1 CLI skeleton
- [x] `commander` root with `play`, `agent`, `replay`, `exp` and `adventures` subcommands
- [x] **Done when:** `--help` lists all subcommands with working descriptions

### T2.2 Human play loop
- [x] `src/cli/play.ts`. REPL, renders the text observation, reads commands, writes the transcript
- [x] **Done when:** a human completes the mission end-to-end in the terminal

### T2.3 Transcript writer
- [x] `src/runner/transcript.ts`. JSONL writer/reader in the `SPEC.md` §13.4 format, header first
- [x] **Done when:** a CLI transcript replays to an identical hash chain

---

## Phase 3: Agent harness

### T3.1 Provider port and adapters
- [x] `src/agents/llm/provider.ts`. The `LlmProvider` interface
- [x] `anthropic`, `openai` (OpenAI-compatible), `ollama` and `mock` adapters, all in `src/agents/llm/provider.ts`. All via `fetch`
- [x] Keys from env only; never logged; never written to a transcript
- [x] **Done when:** `MockProvider` drives a full run with zero network calls; each adapter has a contract test against a local server that speaks its wire format

### T3.2 Prompt assembly
- [x] `src/agents/llm/prompt.ts`. Pure function `(adventure, observation, context, options) → { system, messages }`
- [x] Implements the envelope `THINK:` / `COMMAND:`; `thinking` toggle
- [x] Prompt hash computed and recorded
- [x] **Done when:** unit-tested without network; the prompt contains no adventure solution content

### T3.3 Action extraction
- [x] `src/agents/llm/extract.ts`. The four-rung fallback chain from `SPEC.md` §10.5, recording `extraction_route`
- [x] **Done when:** tests cover each rung, code fences, `>` prompts, empty responses, and multi-`COMMAND:` responses

### T3.4 Policies
- [x] `src/agents/policy.ts` (`AgentPolicy`, `PolicyContext`), `src/agents/scripted.ts`, `src/agents/random.ts`, `src/agents/llm/policy.ts`
- [x] `RandomPolicy` samples uniformly from legal commands and is seeded
- [x] **Done when:** the runner cannot distinguish policy types; all three run the same loop

### T3.5 Context strategies
- [x] `none`, `full`, `window` (N=5), `structured` (known-facts block)
- [x] The structured summary is derived only from the agent's own observation history
- [x] **Done when:** tests confirm the summary contains nothing the agent has not observed

### T3.6 Runner, budgets, guards
- [x] `src/runner/run.ts`. The turn loop of `SPEC.md` §11.1
- [x] All budgets of §11.2, carried in `src/runner/run.ts` and overridable through the run options
- [x] Loop detection (≥ 3 consecutive repeats), transient-error backoff, parse-error cap
- [x] **Done when:** each guard has a unit test that provably terminates the run with the right outcome

---

## Phase 4: Measurement

### T4.1 Metrics
- [x] `src/runner/metrics.ts`. Every metric in `SPEC.md` §12.2
- [x] **Done when:** a synthetic run produces a complete metrics record

### T4.2 Failure classifier
- [x] `src/runner/classify.ts`. The nine codes F1–F9, applied in the stated priority order
- [x] **Done when:** unit-tested on synthetic transcripts, one code per failed run, never zero

### T4.3 Sweep and summary
- [x] `src/cli/exp-05.ts`. Runs the matrix; writes `results/summary.json` and `results/summary.md`
- [x] Wilson 95% intervals per cell
- [x] **Done when:** a small matrix (1 model × 2 conditions × 3 seeds) produces both artefacts

### T4.4 Replay
- [x] `src/runner/replay.ts` + the `replay` subcommand. Re-apply a transcript's commands and diff the hash chain
- [x] **Done when:** replay exits non-zero on a tampered transcript

---

## Phase 5: Web client and server

### T5.1 Session ports
- [x] `src/session/types.ts`, `in-memory.ts`, `file.ts`, `http.ts`
- [x] **Done when:** the same game logic works against all three session implementations.
      `tests/session/ports.test.ts` plays the gold path through each port;
      `tests/equivalence.test.ts` proves the hash chains agree link for link

### T5.2 Server
- [x] `src/server/`. `node:http` + a small router; routes per `SPEC.md` §14.3, plus the
      reset the session interface needs
- [x] Server-held sessions; SSE endpoint for live agent runs (`GET /api/runs/:id/stream`,
      scripted and random policies, no provider keys server-side)
- [x] **Done when:** a browser session and an in-process session produce identical hash chains.
      `tests/equivalence.test.ts`, and `tests/server/routes.test.ts` covers every route

### T5.3 Web client
- [x] `src/web/`. Plain TS, esbuild bundle (`npm run build:web`), no framework, **no game logic**.
      The kernel bundles for the page with `node:crypto` aliased to a synchronous sha256 shim that
      a test holds to node:crypto's own answers
- [x] Output pane, command input with ↑/↓ history, live log, status bar (turn, goals, hash)
- [x] Optional browser agent demo, with streamed observations, final goals, start, stop and retry.
      `tests/web/watch.test.ts` covers the stream lifecycle; the Chromium acceptance pass covers the controls
- [x] **Done when:** a human completes the mission in the browser. A test cannot be a human, so
      `tests/web/ui.test.ts` types the ten commands through the same terminal code the page runs
      and watches the mission end in a success; `npm run serve` serves the built page itself

---

## Phase 6: Results

### T6.1 Run the matrix
- [x] 200 runs (4 models × 5 conditions × 10 seeds)
- [x] All artefacts present and complete
- [x] **Done when:** AC-R1 passes. Every run has a transcript, metrics file, and classification

### T6.2 Verify reproducibility
- [x] Replay 100% of transcripts; assert identical chains (200 of 200)
- [x] **Done when:** AC-R2 passes

### T6.3 Write up
- [x] `RESULTS.md`. Answers RQ1–RQ5 with numbers; reports H1–H5 verdicts; cost per solved mission; threats to validity
- [x] `results/failures.md`. Histogram plus ≥ 3 annotated transcripts per non-empty category
- [x] **Done when:** AC-R3…AC-R6 pass

---

## Phase 7: Generality probe (stretch)

- [x] A miniature organisation adventure (3 teams, 1 shared artefact, 1 dependency, 1 budget) authored **without kernel changes**
- [x] Run the same harness against it; compare the two worlds in `RESULTS.md`
- [x] **Done when:** P7.1–P7.3 pass

---

## Phase 8: Engine comparison (stretch)

- [ ] Port the adventure to QuestJS; run the same agent harness against it
- [ ] Compare agent success rate and authoring cost
- [ ] **Done when:** P8.1–P8.2 pass

---

## Cross-cutting rules

| Rule | Where it is enforced |
|---|---|
| Kernel purity | `tests/architecture.test.ts` + ESLint `no-restricted-imports` |
| No privileged information | `tests/leakage.test.ts` |
| Interface equivalence | `tests/equivalence.test.ts`, with the same commands through memory, file and HTTP ports |
| Engine determinism | `tests/runner/replay.test.ts` |
| Strict typing | `npm run typecheck` |
| Budgets enforced | `tests/runner/budgets.test.ts` |
| No secrets in artefacts | `tests/runner/secrets.test.ts` (scan transcripts for key-shaped strings) |
| Decisions that change the research design are recorded | An ADR in `docs/ARCHITECTURE.md`. **do not change the design silently** |
| Adventure mechanics follow the published checklist | `docs/ADVENTURES.md` §7 |
| External licences checked before adding a dependency | `docs/REFERENCES.md` §D |
