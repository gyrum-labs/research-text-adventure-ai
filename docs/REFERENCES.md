# References

Annotated bibliography. Every entry was read in full text (papers), or read directly from the
repository's own metadata (code), on **7 November 2026**. Licence statements were taken from the
GitHub REST API `license.spdx_id` field rather than from badges or README claims.

Where a figure is quoted, the paper is cited with its section number so it can be checked.

---

## A. Benchmarks and environments

### A1. TALES — Text Adventure Learning Environment Suite

- **Cui, C. Z., Yuan, X., Xiao, Z., Ammanabrolu, P., & Côté, M.-A.** (2025).
  *TALES: Text Adventure Learning Environment Suite.* arXiv:2504.14128 (v1 19 Apr 2025, v4 24 Apr 2025).
- Paper: <https://arxiv.org/abs/2504.14128> · Suite: <https://github.com/microsoft/tale-suite>
  · Visualisation: <https://microsoft.github.io/tales>
- **Licence:** paper CC BY 4.0; suite repository MIT.
- **Status:** NeurIPS 2026.
- **What it is:** Unifies Jericho, ALFWorld, ScienceWorld, TextWorld and TextWorldExpress in their
  canonical forms, plus "Simon Says" — a synthetic screening task used to filter the model pool.
  Reports results across open- and closed-weights LLMs with a qualitative failure analysis.
- **Why we cite it:** it is our primary yardstick and the source of the failure-mode vocabulary
  (spatial / deductive / inductive / grounded reasoning).
- **Key readings:** §3.1 abstract (the "15%" claim), Table 1 (environment attributes), §4.1–§4.5
  (per-environment qualitative analysis), §4.4 (Zork1), Appendix B (per-framework scores).
- **Caveats we must respect:** the metric is a *normalised score*, not per-game success; the model
  pool is *screened* at ≥90% on Simon Says; the agent prompt deliberately contains almost no domain
  information, so our numbers are not comparable. See `RESEARCH-CONTEXT.md` §3.5–§3.7.

### A2. Jericho — Interactive Fiction Games: A Colossal Adventure

- **Hausknecht, M., Ammanabrolu, P., Côté, M.-A., & Yuan, X.** (2020).
  *Interactive Fiction Games: A Colossal Adventure.* AAAI 2020; arXiv:1909.05398.
- Paper: <https://arxiv.org/abs/1909.05398> · Code: <https://github.com/microsoft/jericho>
- **What it is:** A gym-like Python environment over 56 human-written interactive fiction games,
  with the ability to **load and save game state**, and a **template-based action space** (choose
  a template, fill the blanks from the game's vocabulary).
- **Key readings:** the template action space (§2, §4); the state load/save mechanism (§4);
  progress scores RANDOM 1.8%, NAIL 4.9%, TDQN 6.1%, DRRN 10.7%.
- **Why we cite it:** the template action space is the direct precedent for our masked-action
  condition; state load/save is the precedent for our hash chain and replay.

### A3. NAIL — A General Interactive Fiction Agent

- **Hausknecht, M., Ammanabrolu, P., Côté, M.-A., & Yuan, X.** (2019).
  *NAIL: A General Interactive Fiction Agent.* arXiv:1902.04259.
- Paper: <https://arxiv.org/abs/1902.04259>
- **What it is:** Winner of the 2018 Text-Based Adventure AI Competition (20 unseen games,
  1000-step limit). Uses a 5-gram language model over web page titles to constrain its action
  space.
- **Why we cite it:** the pragmatic, corpus-driven approach to action generation, and evidence
  that constraining the action space is a productive line of attack.

### A4. TextWorld

- **Côté, M.-A., et al.** (2018). *TextWorld.* <https://github.com/microsoft/TextWorld>
- **Licence: Microsoft Research License** — the GitHub API reports `spdx_id: NOASSERTION`. This is
  **not** an OSI-approved, commercially permissive licence. Reviewed against the intended use
  before any dependency is considered.
- **What it is:** A sandbox for training and evaluating RL agents on text-based games, with an
  **information mask** that lets the designer control exactly what the agent can observe.
- **Why we cite it:** the information mask is the design principle behind
  `src/kernel/observation.ts` and `tests/leakage.test.ts`. We reimplemented the principle rather
  than the code.

### A5. QuestJS

- **textadventures/quest** — <https://github.com/textadventures/quest>
- **Licence: MIT** (verified via the GitHub API). JavaScript; browser-native.
- **What it is:** The JavaScript re-implementation of the Quest engine — rooms, objects,
  attributes, dynamic text, a text command parser.
- **Why we cite it:** the strongest alternative engine, and the subject of the Phase 8 comparison
  (same scenario, same agent harness, different runtime).

### A6. ink

- **inkle/ink** — <https://github.com/inkle/ink>
- **Licence: MIT** (verified via the GitHub API). C# runtime with web/Unity integrations.
- **What it is:** A narrative scripting language for branching interactive fiction.
- **Why we cite it:** the best-in-class narrative authoring experience; a candidate for a future
  *narrative* variant of the experiment, but not a world-state simulator.

### A7. ALFWorld

- **Shridhar, M., Yuan, X., Côté, M.-A., Bisk, Y., Trischler, A., & Hausknecht, M.** (2021).
  *ALFWorld: Aligning Text and Embodied Environments for Interactive Learning.* ICLR 2021;
  arXiv:2010.03768. <https://arxiv.org/abs/2010.03768>
- **What it is:** A text-based simulator for embodied household tasks, derived from ALFRED.
- **Why we cite it:** it is the **counterexample** that justifies our design. ALFWorld is the only
  TALES environment with no informative feedback, no nearest-neighbour parser, no game resets and
  no dead state — and it answers every failed action with *"nothing happened"*. The TALES
  qualitative analysis attributes a large share of agent failure to exactly that: the agent cannot
  infer why an action failed, so it cannot learn. Our scenario inverts all four properties.

### A8. ScienceWorld

- **Wang, R., Jansen, P., Côté, M.-A., & Ammanabrolu, P.** (2022).
  *ScienceWorld: Is your Agent Smarter than a 5th Grader?* arXiv:2203.07540.
  <https://arxiv.org/abs/2203.07540>
- **What it is:** Procedural and scientific reasoning tasks grounded in K–12 science curricula.
- **Why we cite it:** its scale (average gold trajectory 41.67 steps vs ALFWorld's 5.83) is the
  clearest demonstration that horizon length degrades agent reasoning — the direct justification
  for H5 and for the `structured` context strategy.

---

## B. Agent methods

### B1. ReAct — Synergizing Reasoning and Acting in Language Models

- **Yao, S., Zhao, J., Yu, D., Du, N., Shafran, I., Narasimhan, K., & Cao, Y.** (2023).
  *ReAct: Synergizing Reasoning and Acting in Language Models.* ICLR 2023; arXiv:2210.03629.
  <https://arxiv.org/abs/2210.03629> · <https://react-lm.github.io/>
- **What it is:** Few-shot prompting that interleaves free-form reasoning traces (Thought) with
  actions (Action) and environment feedback (Observation). **Prompting, not reinforcement
  learning.**
- **Key readings:** the abstract (+34% absolute over the BUTLER baseline on ALFWorld, +10% on
  WebShop, with one or two in-context examples); §"where it breaks" — non-informative search
  accounts for a substantial share of errors; the finding that *constraining* the trace structure
  raises reasoning-error rate relative to free chain-of-thought.
- **Why we cite it:** our `THINK:` / `COMMAND:` envelope is a ReAct-shaped, one-action-per-turn
  contract that keeps transcripts machine-readable. The `thinking: on|off` variable is the
  ReAct-vs-zero-shot comparison.

### B2. Reflexion — Language Agents with Verbal Reinforcement Learning

- **Shinn, N., Cassano, F., Gopinath, A., Narasimhan, K., & Yao, S.** (2023).
  *Reflexion: Language Agents with Verbal Reinforcement Learning.* NeurIPS 2023;
  arXiv:2303.11366. <https://arxiv.org/abs/2303.11366> · <https://github.com/noahshinn024/reflexion>
- **What it is:** Agents reflect on task feedback in verbal form and maintain the reflection in an
  **episodic memory buffer** to improve subsequent trials. No weight updates.
- **Key readings:** +22% on ALFWorld, +20% on HotPotQA, +11% on HumanEval; the memory is
  **bounded** — truncated to the last three reflections to avoid exceeding prompt-window limits.
- **Why we cite it:** the `structured` context strategy is the Reflexion insight applied to a
  single episode — a bounded, derived summary of what the agent has observed rather than a growing
  transcript. Reflexion's *retry with memory* loop is out of scope for v1.

### B3. Voyager — An Open-Ended Embodied Agent with Large Language Models

- **Wang, G., Xie, Y., Jiang, Y., Mandlekar, A., Xiao, C., Zhu, Y., Fan, L., & Anandkumar, A.**
  (2024). *Voyager: An Open-Ended Embodied Agent with Large Language Models.* TMLR 2024;
  arXiv:2305.16291. <https://arxiv.org/abs/2305.16291> · <https://github.com/MineDojo/Voyager>
- **What it is:** An LLM agent in Minecraft with an **automatic curriculum**, an **ever-growing
  skill library** of executable code, and iterative prompting that incorporates environment
  feedback, execution errors and self-verification.
- **Key readings:** 3.3× more unique items, 2.3× greater travel distance, up to 15.3× faster
  tech-tree milestones; and — the result that matters to us — **the skill library transfers: the
  agent reuses it in a new world to solve novel tasks from scratch**, where other methods fail to
  generalise.
- **Why we cite it:** the closest published analogue to the organisation-simulation ambition, and
  the evidence that a skill library can transfer across worlds.

### B4. WebArena — A Realistic Web Environment for Building Autonomous Agents

- **Zhou, S., Xu, F. F., Zhu, H., Zhou, X., Lo, R., Sridhar, A., Cheng, X., Ou, T., Bisk, Y.,
  Fried, D., Alon, U., & Neubig, G.** (2024). *WebArena: A Realistic Web Environment for Building
  Autonomous Agents.* ICLR 2024; arXiv:2307.13854. <https://arxiv.org/abs/2307.13854> ·
  <https://webarena.dev>
- **What it is:** A standalone, self-hostable, reproducible environment of four functional website
  categories (e-commerce, forum, collaborative software development, CMS) plus tools and knowledge
  resources. 812 long-horizon tasks from 241 templates, graded by **functional correctness** —
  programmatic checks of the end state rather than the action sequence.
- **Key readings:** best GPT-4-based agent **14.41%** end-to-end success vs **78.24%** for humans.
- **Why we cite it:** (a) functional-correctness grading is our `GoalSpec` mechanism; (b) a
  self-hosted, reproducible environment is the precedent for our zero-infrastructure position;
  (c) the 14.41%-vs-78.24% gap is the sobering reference point for the organisation simulation.

### B5. BenchTrace — Testing Reflection Ability and Controlled Evolution in LLM Agents

- **Huang, J., et al.** (2026). *BenchTrace: A Benchmark for Testing Reflection Ability and
  Controlled Evolution in LLM Agents.* arXiv:2605.29225. <https://arxiv.org/abs/2605.29225>
- **What it is:** A dataset of annotated episodes across six tasks (Jericho, ALFWorld, BabyAI,
  ScienceWorld, Bundled Web Shopping, Group Travel Planning) with a reflection-evaluation and
  evolution-evaluation suite.
- **Key readings:** current models fall **below a 30% end-to-end pass rate** on reflection
  evaluation, with **diagnosis as the primary bottleneck**; self-evolution improves over the
  non-evolving baseline but **agents forget early lessons as noise episodes accumulate**, causing
  negative transfer. Its Jericho reflection prompt gives the evaluator exactly `obs`, `inv` and
  `action`.
- **Why we cite it:** (a) "diagnosis is the bottleneck" is the strongest argument for making the
  failure taxonomy the primary artefact rather than the win rate; (b) the `obs`+`inv`+`action`
  shape corroborates our observation contract; (c) the forgetting result independently supports H5.

---

## C. Genre history

### C1. Scott Adams' Adventure #3 — *Mission Impossible* / *Secret Mission*

- Adventure International, first published by TRS-80 Software Exchange, **1979**.
  Also known as *Impossible Mission* and *Atomic Mission*; renamed *Secret Mission* following a
  legal request from the television series.
- Reference: <https://www.ifwiki.org/Scott_Adams> · <https://www.mobygames.com/game/9820/secret-mission/>
- **What it is:** Adventure #3 in the Scott Adams Adventure series. Set in a nuclear power plant:
  a saboteur has wired a bomb and rewired the security system, and the player (as Mr. Phelps) must
  stop the explosion before a move limit expires, starting with a map and a few security keys.
  One- or two-word commands, a simple parser, abbreviable directions.
- **The design lesson:** the IF community's assessment — *"the first one conceived as a single
  puzzle that needs to be planned as a timed task… the difficulty is offset by the lack of options:
  there are only so many things the player can try, so success is likely."* Our scenario keeps both
  halves: the move limit as the antagonist, and a deliberately narrow option space.
- **Originality:** our scenario reproduces the *shape* only. No prose, names, layout, walkthrough
  or text is reproduced. See `RESEARCH-CONTEXT.md` §5.1.

---

## D. Licence summary

| Item | Licence | Usable as a dependency? |
|---|---|---|
| Tale-suite | MIT | Yes — reference implementation only |
| QuestJS | MIT | Yes — Phase 8 comparison |
| ink | MIT | Yes — future narrative variant |
| TextWorld | **Microsoft Research License** (`NOASSERTION`) | **No** — non-commercial; reference only |
| Jericho | MIT | Yes — reference only (Python) |
| arXiv papers | CC BY 4.0 (TALES) / arXiv perpetual non-exclusive licence (others) | Quotation with attribution |

This repository is MIT.
