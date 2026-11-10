<!-- page-version: 1.0.0 status: draft last-reviewed: 2026-11-08 -->

# Research Context: Engines, Benchmarks, Prior Art and the Design Decisions

This document records the evidence behind the architectural decisions in `SPEC.md` §3. It is the
"why", kept separate from the "what". It is a research record: every figure below was read from a
primary source and verified against it on **7 November 2026**. Where an earlier draft of this
repository mis-stated a figure, the correction is recorded explicitly in §3.6. The error and its
repair are part of the record.

---

## 1. Method

| Aspect | Approach |
|---|---|
| Scope | (a) Which open-source adventure engine to build on; (b) what the existing literature says about LLM agents in stateful text environments; (c) the genre lineage of the adventure fixture |
| Primary sources | arXiv papers (full text, not abstracts), GitHub repository licence fields via the REST API, official project pages, the IFWiki / IF database for the genre history |
| Licence verification | Read from the GitHub API `license.spdx_id` field, not from a badge or a README claim |
| Excluded | Blog posts and second-hand summaries, except where they aggregate a primary result that was not accessible (flagged where used) |
| Citation style | §9 and [`REFERENCES.md`](./REFERENCES.md) hold the full annotated bibliography |

---

## 2. The engine question

> *"Are there any simple open-source adventure game engines we could utilise?"*

Yes. Several, and they are good. We are not using one for v1 because of **coupling**, not quality.
The research question is about an agent operating inside a *controlled, deterministic, auditable*
environment. If the environment is supplied by a third party, then the observation surface. The
exact variable under test. Is decided by that engine's script format rather than by us, and
determinism, replay format and the kernel's vocabulary all become someone else's decision.

### 2.1 Survey

| Option | Licence (verified via GitHub API) | What it is | Fit for v1 |
|---|---|---|---|
| **QuestJS**, [`textadventures/quest`](https://github.com/textadventures/quest) | **MIT** (`spdx_id: MIT`) | JavaScript re-implementation of the Quest engine. Rooms, objects, attributes, dynamic text, text command parser. Browser-native. | **Alternative, Phase 8.** Existing object model is attribute-driven and designed for human-authored prose; modelling "the agent may only observe what it has perceived" on top of it is awkward. Quest shows the player the room's full contents; we need a perception layer that differs between human and agent views. |
| **ink**. [`inkle/ink`](https://github.com/inkle/ink) | **MIT** (`spdx_id: MIT`) | Narrative scripting language for branching interactive fiction. Excellent at story structure and conditional text. | **Future experiment.** A *story runtime*, not a world-state simulator. It does not model inventories, locks, tool possession or world flags, and has no notion of "the agent does not yet know which wire is safe". Deriving a state kernel from ink means building the kernel anyway, on top of ink. |
| **TextWorld**, [`microsoft/TextWorld`](https://github.com/microsoft/TextWorld) | **Microsoft Research License**, the GitHub API reports `NOASSERTION`, **not** an OSI-approved licence | RL sandbox for training and evaluating agents on text games. Its *information mask* is exactly the perception control we want. | **Research reference only.** Python; heavy install (Java needed for TextWorld-Express and ScienceWorld); non-commercial licence. **Correction:** an earlier draft of this project assumed TextWorld was MIT. It is not, and that assumption must not be carried forward. |
| **TALES**. [`microsoft/tale-suite`](https://github.com/microsoft/tale-suite) | MIT | Benchmark unifying Jericho, ALFWorld, ScienceWorld, TextWorld and TextWorldExpress, plus the synthetic "Simon Says" screening task | **Primary yardstick and design vocabulary.** See §3. |
| **Minimal TypeScript kernel** | MIT (ours) | Purpose-built pure state-transition kernel with a declarative adventure format | **Chosen for v1.** |

### 2.2 The cost we accept

We implement roughly fifteen mechanics ourselves: movement, visibility, taking, dropping,
containers, locks, readables, tools, codes, goal tracking, hints, failure states, dead states.
`SPEC.md` §5.1 bounds the entire engine to **ten predicates and ten effects**, which is what
makes that tractable.

---

## 3. TALES: the benchmark we calibrate against

**Primary source:** Cui, Yuan, Xiao, Ammanabrolu & Côté, *TALES: Text Adventure Learning Environment
Suite*, arXiv:2504.14128 (v1 19 Apr 2025; v4 24 Apr 2025), CC BY 4.0. Suite: <https://github.com/microsoft/tale-suite>.

### 3.1 The headline claim, verbatim

> "Despite an impressive showing on synthetic games, even the top LLM-driven agents fail to achieve
> 15% on games designed for human enjoyment."

### 3.2 What that actually means: and what it does not

This is the single most important correction in this document, so it is worth being precise.

**The TALES metric is a normalised score (0–100) per environment, not a binary
success/failure per game.** The abstract's "15%" therefore does **not** mean "85% of games were
failed". It means: *on human-written games, the best agents reach roughly 13–15% of the maximum
achievable score.*

Table 1 of the paper classifies each framework by whether its games are synthetic, and reports the
top agent score per framework:

| Framework | #Games | Avg walkthrough length | Informative feedback | Synthetic | Intermediate rewards | Nearest-neighbour parser | Game resets | Dead state | Top score (zero-shot) | Top score (reasoning) |
|---|---|---|---|---|---|---|---|---|---|---|
| TextWorld | 10 | 13.70 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 95.5 | 100.0 |
| TextWorldExpress | 16 | 33.06 | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | 81.6 | 91.8 |
| ALFWorld | 12 | 5.83 | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | 75.0 | 83.3 |
| ScienceWorld | 30 | 41.67 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 82.3 | 80.1 |
| **Jericho** | **54** | **87.15** | ✓ | **✗** | ✓ | ✓ | ✓ | ✓ | **9.5** | **13.4** |

**Jericho is the only non-synthetic framework in the suite.** Its top reasoning-agent score is
**13.4**. Which is where the abstract's "fail to achieve 15%" comes from. Per-game breakdown
(Appendix B, top rows):

| Model | TextWorld | TextWorldExpress | ALFWorld | ScienceWorld | Jericho |
|---|---|---|---|---|---|
| claude-3.7-sonnet (reasoning) | 97.3 | 91.3 | 83.3 | 76.5 | **12.5** |
| gemini-2.5-pro-preview (reasoning) | 100.0 | 91.8 | 75.0 | 64.2 | **13.4** |
| claude-3.5-sonnet (reasoning) | 95.5 | 81.6 | 75.0 | 82.3 | **9.6** |
| o1 (reasoning) | 97.8 | 70.2 | 28.3 | 80.1 | **10.3** |
| gpt-4o (zero-shot) | 83.6 | 80.6 | 56.7 | 61.4 | **5.6** |

The shape of the result: **the same models score 76–100 on synthetic and structured environments
and 5–13 on human-written interactive fiction.** A roughly tenfold collapse, driven entirely by
whether the games are human-authored.

### 3.3 Zork1: the hardest single case

From §4.4, verbatim in substance:

- Zork1 "still proves an insurmountable challenge even for modern state-of-the-art LLMs".
- The authors suspect training-data leakage: *"we very strongly suspect that Claude-3.5-Sonnet and
  other LLMs were trained on play-through transcripts of Zork1"*. And it still fails.
- The top agents reach **.291** normalised score, which the authors describe as failing "to achieve
  over 50% of the available score".
- Zork1 needs "well over 100 steps" to complete; the suite caps agents at **100 steps**.
- Only **57% of the total score is achievable within 100 steps** in Jericho.
- Grounded-reasoning failures observed: hallucinating actions that make no sense in context, and
  **attempting to interact with objects seen but not in the current location**.
- Inductive-reasoning failures observed: agents **repeatedly attempted actions that failed, or
  repeatedly cycled between a set of locations**. And this affected strong models too, despite
  the suspected leakage.
- The mechanism named for degradation with game length: *"relevant information getting lost in the
  ever increasing context."*

### 3.4 The four reasoning skills TALES uses to classify failures

TALES classifies every failure as **spatial**, **deductive**, **inductive** or **grounded**
reasoning. Our failure taxonomy (`SPEC.md` §12.3) is different on purpose. Ours is
*operational* (what the agent did wrong, recoverable from a transcript) rather than *cognitive*
(requires reading reasoning traces). But the two are complementary and should be reported side by
side in `RESULTS.md`.

The paper's own findings that matter to our design:

| Finding | Our design consequence |
|---|---|
| *"LLMs often fail to discover implicit game dynamics through inductive reasoning"* | Our adventure must teach its rules **through the environment**, not the prompt. Hence the manual in the locker, and the `hint` affordance. |
| ALFWorld returns *"nothing happened"* for **any** failure, including parse failure. So the agent cannot learn why it failed. | `SPEC.md` §8.2 mandates an **informative error contract**: what was attempted, what was wrong, what is possible. This is a direct, evidence-backed design decision, and ALFWorld is the counterexample. |
| Grounded failures: acting on objects **seen but not present in the current location**. | `SPEC.md` §9.2 confines the observation to room contents ∪ inventory, and `hallucinationRate` measures exactly this failure. |
| Inductive failures: repeating failed actions, cycling between locations. | `SPEC.md` §11.3 adds **loop detection** (≥3 repeated state hashes) and the `repeatStateRate` metric. |
| *"basing current action and reasoning in outdated or incorrect game state facts, especially in later steps"*; *"failure to abstract failure modes from repeated attempts"*. | Directly motivates **H5** and the `structured` context strategy (`SPEC.md` §10.4): a known-facts block beats a growing transcript. |
| Step cap: **100 steps**, 5 repeats per game, temperature 0 where supported plus multiple seeds. | Our experiment uses a **30-turn** budget (gold path 10) and ≥10 seeds per cell, and records the exact model id and date. |

### 3.5 Two methodological choices in TALES that differ from ours

These are the honest comparability caveats.

1. **TALES gives the agent almost no inductive bias.** Its entire system prompt is: *"You are
   playing a text-based game and your goal is to finish it with the highest score. Upon reading the
   text observation, provide a single short phrase to interact with the game, e.g. 'get lamp'…
   When stuck, try using the 'help' command…"* The authors state they deliberately provide no
   domain knowledge, unlike several other benchmarks, to measure capability rather than
   instruction-following.
   **Our prompt is materially more informative**. It supplies the mission brief and the command
   grammar (`SPEC.md` §10.3). Our experiment therefore tests *instruction-following under a state
   machine*, not *blind exploration*. Our success rates are **not comparable** to TALES numbers,
   and should not be placed on the same axis.
2. **TALES screens its model pool.** Only models reaching ≥90% on the 100-step "Simon Says with
   Memory" task are included, so the table is a best-of-pool, not a survey of all models. We
   report every model we run, including weak ones, because a failure taxonomy needs the failures.

### 3.6 Correction log

| Date | Item | Earlier statement | Corrected statement |
|---|---|---|---|
| 7 Nov 2026 | TALES headline | "top LLM-driven agents fail ~85% of human-designed text adventures" (in `SPEC.md` §3 and `README.md`) | The metric is **normalised score, not per-game failure rate**. The correct statement is: on Jericho, the only non-synthetic environment, the best agents reach **13.4%** of maximum score (zero-shot: 9.5%), versus 76–100 on synthetic environments. The "~85%" framing conflated a score shortfall with a failure rate and has been removed everywhere. |
| 7 Nov 2026 | TextWorld licence | "MIT" | **Microsoft Research License** (`NOASSERTION`). Not commercially permissive. |

### 3.7 Point-in-time caveat

The figures above are from the paper's initial release (April 2025). The suite's own model
inventory shows it has since been re-run across a much newer and larger model set (open-weights and
proprietary, including current frontier models), with per-model run tallies maintained in the
repository. **The 15% figure is a 2025 baseline, not a current leaderboard value.** If we cite
TALES as a contemporary yardstick in `RESULTS.md`, we must state the date of the figures used and
prefer the suite's live results where they are available.

---

## 4. Prior art we build on

### 4.1 ReAct: the reasoning/acting loop

Yao et al., *ReAct: Synergizing Reasoning and Acting in Language Models*, ICLR 2023,
arXiv:2210.03629. <https://arxiv.org/abs/2210.03629>

- Interleaves free-form reasoning traces (**Thought**) with task actions (**Action**) and
  environment feedback (**Observation**). Prompting, not reinforcement learning.
- On interactive decision-making, ReAct beats action-only prompting and outperforms
  baselines trained by imitation and by reinforcement learning, by **+34% absolute on ALFWorld** and **+10% on WebShop**,
  while using one or two in-context examples against baselines trained on 10³–10⁵ instances.
- Its failure analysis attributes a large share of errors to **non-informative search**. The agent
  searching without learning.

**What we take:** the `THINK:` / `COMMAND:` envelope (`SPEC.md` §10.3) is a ReAct-shaped contract
with one action per turn, which keeps the transcript machine-readable. The `thinking: on|off`
variable (`SPEC.md` §19, Q5) is the ReAct-vs-zero-shot comparison, borrowed directly.

### 4.2 Reflexion: memory built from the agent's own observations

Shinn et al., *Reflexion: Language Agents with Verbal Reinforcement Learning*, NeurIPS 2023,
arXiv:2303.11366. <https://arxiv.org/abs/2303.11366>

- Agents reflect on task feedback in **verbal** form and store the reflection in an **episodic
  memory buffer** to improve subsequent trials. No weight updates.
- Improves over baselines by **22% on ALFWorld**, 20% on HotPotQA, 11% on HumanEval.
- Notably, the memory is **bounded**. The paper truncates to the last three reflections
  explicitly *"to avoid very long prompt windows that may exceed the maximum limit"*.

**What we take:** the `structured` context strategy (`SPEC.md` §10.4) is the Reflexion insight
applied to a single episode. A bounded, derived summary of what the agent has observed, rather
than a growing transcript. The bounded-memory lesson also underwrites the `window` strategy (N=5).
Reflexion's *retry with memory* loop is out of scope for v1 and is noted in `SPEC.md` §18.3.

### 4.3 Jericho: template-based action spaces and state introspection

Hausknecht, Ammanabrolu, Côté & Yuan, *Interactive Fiction Games: A Colossal Adventure*, AAAI
2020 (arXiv:1909.05398); companion *NAIL: A General Interactive Fiction Agent*
(arXiv:1902.04259). <https://github.com/microsoft/jericho>

- Provides a gym-like interface to 56 human-written IF games, and crucially **can load and save
  game state**, enabling planning and RL that needs state restoration.
- Introduces a **template-based action space**: select an action template, then fill the blanks
  from the game's vocabulary.
- Progress scores: **RANDOM 1.8%, NAIL 4.9%, TDQN 6.1%, DRRN 10.7%** completion.

**What we take:**
- The **masked-action condition** (`SPEC.md` §12.4, condition C) is the LLM analogue of TDQN's
  template action space, and this is now an explicit comparison rather than an invention.
- Jericho's **state load/save** is the precedent for our hash chain and replay (`SPEC.md` §13).
- The random-policy baseline is expected to score ~0. Our adventure must preserve that property
  (acceptance criterion P1.4).

### 4.4 Voyager: skill libraries, and the shape of the long-term goal

Wang et al., *Voyager: An Open-Ended Embodied Agent with Large Language Models*, TMLR 2024,
arXiv:2305.16291. <https://github.com/MineDojo/Voyager>

- Three components: an **automatic curriculum** that maximises exploration, an **ever-growing skill
  library** of executable code, and **iterative prompting** that incorporates environment feedback,
  execution errors and self-verification.
- Obtains **3.3× more unique items**, travels **2.3× farther**, unlocks tech-tree milestones up to
  **15.3× faster** than prior SOTA, and, the result that matters for us, **reuses its skill
  library in a new world to solve novel tasks from scratch**, where other methods fail to
  generalise.

**What we take:** this is the closest published analogue to the organisation-simulation ambition.
The `SPEC.md` §18 mapping (rooms → teams, objects → artefacts, skills → procedures) borrows its
shape. A skill library is explicitly **not** in v1 scope, but `SPEC.md` §18.3 names it as the
natural next mechanism, and the "reuses its library in a new world" result is the evidence that
such transfer is achievable at all.

### 4.5 WebArena: the organisation-simulation prior art

Zhou et al., *WebArena: A Realistic Web Environment for Building Autonomous Agents*, ICLR 2024,
arXiv:2307.13854. <https://webarena.dev>

- A **standalone, self-hostable, reproducible** environment: four functional website categories
  (e-commerce, forum, collaborative software development, CMS), plus utility tools and knowledge
  resources. 812 long-horizon tasks from 241 templates, graded by **functional correctness**.
  programmatic checks of the *end state*, not the action sequence.
- Best GPT-4-based agent: **14.41% end-to-end success**, against **78.24% for humans**.

**What we take:** three things map directly onto our design.
1. **Functional-correctness grading**, checking the end state, not the path, is what our
   `GoalSpec` mechanism does (`SPEC.md` §6.1).
2. **A self-hosted, reproducible environment** is the precedent for our "no infrastructure required"
   position (`SPEC.md` §14).
3. **The 14.41% vs 78.24% gap** is the sobering reference point for the organisation simulation:
   even with rich tooling, frontier models were at roughly one-sixth of human performance on
   long-horizon professional tasks. Our experiment should be read as a *scaled-down rehearsal* of
   that gap, not as a proof of feasibility.

### 4.6 ALFWorld and ScienceWorld: the environment attributes that matter

Shridhar et al., *ALFWorld: Aligning Text and Embodied Environments for Interactive Learning*,
ICLR 2021. <https://arxiv.org/abs/2010.03768> · Wang et al., *ScienceWorld*, arXiv:2203.07540.

These matter to us through the **attribute table in §3.2**, not through their scores. ALFWorld is
the only environment in TALES with *no informative feedback, no nearest-neighbour parser, no game
resets and no dead state*. And the paper's qualitative analysis attributes much of its agents'
failure to exactly that: the environment says *"nothing happened"* and the agent cannot infer why.
Our adventure deliberately inverts all four properties. Informative feedback, alias resolution,
irreversible failure (detonation), and a dead state.

### 4.7 BenchTrace: failure localisation as a first-class metric

*BenchTrace: A Benchmark for Testing Reflection Ability and Controlled Evolution in LLM Agents*,
arXiv:2605.29225. <https://arxiv.org/abs/2605.29225>

- Reports that current models fall **below a 30% end-to-end pass rate on reflection evaluation**,
  with **diagnosis as the primary bottleneck**.
- Its reflection prompt for Jericho gives the evaluator exactly three inputs: `obs`, `inv`, and
  `action`. The same shape as our `Observation`.
- Reports that self-evolution methods improve over non-evolving baselines, but that **agents forget
  early lessons as noise episodes accumulate** and fail to generalise reflections beyond the
  specific context, causing negative transfer.

**What we take:** (a) the `obs` + inventory + action shape corroborates our observation contract;
(b) the "diagnosis is the bottleneck" result is the strongest available argument that a *failure
taxonomy*, not a win rate, is the artefact worth producing, which is why `SPEC.md` §12.3 makes
the taxonomy a first-class deliverable and `AC-R4` requires annotated transcripts per category;
(c) "forget early lessons as noise accumulates" is independent support for H5.

---

## 5. The genre lineage of the adventure fixture

The brief for this project referenced "the Mission Impossible text adventure game". That line of
descent is real, and its mechanics shaped our adventure.

**Origin.** *Mission Impossible* was Adventure #3 in Scott Adams' Adventure series, first
published by TRS-80 Software Exchange in **1979** and issued by Adventure International across
Apple II, Atari 8-bit, BBC Micro, Commodore PET/64/VIC-20, TRS-80, TI-99/4A and others. It was
renamed ***Secret Mission*** (also *Impossible Mission*, *Atomic Mission*) after a legal request
from the television series of the same name.

**Setting and premise.** A nuclear power plant. A saboteur has wired a time bomb and rewired the
security system; the player, as Mr. Phelps, must stop the explosion before it is too late. The
player begins with a map and a few security keys, and must complete the objective within a **given
time limit measured in moves taken**.

**Mechanics.** One- or two-word commands with a simple text parser; directions may be abbreviated
to a single letter; coloured text separating descriptions, actions and prompts.

**The design lesson.** The IF community's own assessment of the original: *"This adventure looks
like the first one conceived as a single puzzle that needs to be planned as a timed task. These
kinds of adventures are usually harder, but in this one the difficulty is offset by the lack of
options: there are only so many things the player can try, so success is likely."*

Two things follow for us, and both are deliberate:

1. **The move limit is the real antagonist.** Our adventure keeps a tight turn budget (`SPEC.md`
   §11.2, default 30) and a lethal failure state, exactly as the original's timed-task design
   intends. The budget is the difficulty, not the prose.
2. **A narrow, well-signposted option space is what makes it fair.** The original's difficulty was
   "offset by the lack of options". Our adventure keeps that property deliberately: three areas,
   nine objects, thirteen verbs, one gold path of ten commands.

### 5.1 Originality statement

Our adventure is an **original homage**. It reproduces the *shape* of the 1979 adventure. A
three-area, lock-and-key, bomb-disposal mission under a move limit. And nothing else. No prose,
room names, object names, puzzle layout, walkthrough or text from any existing game is reproduced.
The setting is a corporate server vault rather than a nuclear plant, the objects are a keycard, a
wire cutter, a defusal manual and a safe rather than security keys and a bomb detector, and the
dependency chain is our own. This is stated in `SPEC.md` §7.1 and enforced by review.

---

## 6. Design decisions, and the evidence behind each

| # | Decision | Evidence | Where it lands |
|---|---|---|---|
| D1 | Build a custom kernel instead of adopting an engine | Coupling argument in §2; the kernel must read like the thing it models | `SPEC.md` §3, §4.4 |
| D2 | The kernel speaks the adventure's vocabulary. Rooms, objects, doors, flags | The game's own language is the point; Phase 7 writes the organisation as another adventure | `SPEC.md` §6.1 |
| D3 | The agent's view is built by exactly one function | TextWorld's information mask; TALES' grounded-reasoning failures | `SPEC.md` §9 |
| D4 | Informative error messages are mandatory | ALFWorld's "nothing happened" is the counterexample that produces unlearnable failures | `SPEC.md` §8.2 |
| D5 | The parser never repairs the agent's intent | Otherwise `invalidActionRate` measures the parser, not the agent | `SPEC.md` §8.2, §10.5 |
| D6 | `THINK:` / `COMMAND:` envelope with a thinking on/off variable | ReAct's thought-action-observation loop and its +34% ALFWorld result | `SPEC.md` §10.3 |
| D7 | Four context strategies, with `structured` as the recommended default | Reflexion's bounded episodic memory; TALES' "relevant information getting lost in the ever increasing context"; BenchTrace's forgetting | `SPEC.md` §10.4 |
| D8 | Masked legal actions as an experimental condition | Jericho's template-based action space | `SPEC.md` §12.4 |
| D9 | A random-policy lower bound and a gold-path upper bound | Jericho's RANDOM 1.8% baseline; TALES' walkthrough scoring | `SPEC.md` §7.6, `P1.3`/`P1.4` |
| D10 | Failure taxonomy as a first-class deliverable, graded operationally | BenchTrace's "diagnosis is the primary bottleneck"; TALES' qualitative failure analysis | `SPEC.md` §12.3, `AC-R4` |
| D11 | Functional-correctness grading (goal state, not action sequence) | WebArena's programmatic end-state checks | `SPEC.md` §6.1 `GoalSpec` |
| D12 | Deterministic kernel + hash chain + replay; engine determinism guaranteed, model determinism not | Jericho's state load/save; TALES' `--continue-from` deterministic replay | `SPEC.md` §13 |
| D13 | Tight turn budget and an irreversible failure state | The 1979 original's move-limit design; TALES' 100-step cap | `SPEC.md` §7.7, §11.2 |
| D14 | Report every model we run, not a screened pool | TALES screens on "Simon Says" ≥90%, which hides the failures we need to study | `SPEC.md` §12.4 |
| D15 | Our numbers are not comparable to TALES' | TALES gives almost no inductive bias; we give a mission brief and a grammar | `SPEC.md` §17 (V3, V7) |
| D16 | Plain `fetch` for provider adapters, no vendor SDKs | Keeps the artefact auditable and forkable; SDK churn is not a research contribution | `SPEC.md` §15.2 |

---

## 7. Threats to comparability with TALES

Stated so that nobody misreads our numbers as TALES numbers.

| # | Difference | Consequence |
|---|---|---|
| K1 | Our prompt supplies a mission brief and the command grammar; TALES supplies almost nothing | Our absolute success rate will be **higher** than TALES' and does not measure the same capability |
| K2 | Our metric is binary goal completion; TALES' is normalised score with milestones | Not convertible without a mapping. We report our own metric and cite TALES qualitatively |
| K3 | Our adventure is one game, hand-built, with a 10-command gold path; Jericho is 54 human-written games with an 87.15-step average walkthrough | A single adventure cannot support a population claim. Phase 7 adds a second adventure; Phase 8 adds QuestJS |
| K4 | Our turn budget is 30; TALES' is 100, and only 57% of Jericho's score is reachable in 100 steps | Our task is *shorter* but *more tightly budgeted*. Both directions of difficulty are present; report both |
| K5 | We use a newer model generation than the paper's initial release | The 2025 figures are a baseline, not a live leaderboard. See §3.7 |

---

## 8. What we deliberately did **not** conclude

- We did **not** conclude that agents "fail 85% of the time". See §3.6.
- We did **not** conclude that adventure difficulty transfers from TALES to ours. See K1–K5.
- We did **not** conclude that WebArena's 14.41% predicts our org-simulation outcome. We cite it as
  a reference point for the *shape* of the problem, not as a forecast.
- We did **not** assume TextWorld's information-mask design is available to us under a permissive
  licence. We reimplemented the *principle*. See §4.3, D3.

---

## 9. Annotated bibliography

Full citations with licences and dates accessed: [`REFERENCES.md`](./REFERENCES.md).

| Source | Role here |
|---|---|
| TALES (arXiv:2504.14128) | Primary yardstick; failure-mode taxonomy; the 15% figure |
| Tale-suite (GitHub) | Implementation reference; model inventory |
| QuestJS | Engine comparison, Phase 8 |
| ink | Engine comparison, narrative variant |
| TextWorld | Design reference for the information mask |
| Jericho (arXiv:1909.05398) + NAIL (arXiv:1902.04259) | Template action spaces, state introspection, random baseline |
| ReAct (arXiv:2210.03629) | Thought-action-observation envelope |
| Reflexion (arXiv:2303.11366) | Bounded episodic memory; structured context strategy |
| Voyager (arXiv:2305.16291) | Skill library; the long-term org-simulation shape |
| WebArena (arXiv:2307.13854) | Functional-correctness grading; org-simulation reference point |
| ALFWorld (arXiv:2010.03768) | The environment-attribute table; the "nothing happened" counterexample |
| ScienceWorld (arXiv:2203.07540) | Environment attributes; horizon-length degradation |
| BenchTrace (arXiv:2605.29225) | Failure diagnosis as the bottleneck; obs+inv+action shape |
| Scott Adams Adventure #3 | The adventure's genre lineage and its move-limit design lesson |
