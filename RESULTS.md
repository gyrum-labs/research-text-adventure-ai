<!-- page-version: 1.1.0 status: draft last-reviewed: 2026-11-10 -->

# Results

*Everything below was produced by the code in this repository, and every number can be
reproduced by running the command beside it. Where a number could not be produced, this
document says so rather than estimating it.*

> **Reader track**
>
> - **Ten minutes.** The headline and RQ1 to RQ5.
> - **Thirty minutes.** The threats to validity, and what an organisation would need.
> - **An hour.** The whole series, experiment by experiment.

## The headline

> **Key insight.** The live matrix found the instrument before it found the models. The guards
> were written against a policy that acts immediately, and a real model looks before it acts, so
> the shipped budgets stop the agents before the mission does and the pooled success rate is
> 2.0%. With the turn budget in charge, the same four models score 31.5%, and the finding that
> survives both sweeps is not about a model at all: the observation is memoryless, and an agent
> with no memory scores 0% every time.

The series built six things. A deterministic text adventure that a human and an agent can both
play. A perception boundary with a proof rather than a promise. An agent loop with a provider
port, a hashable prompt and enforceable budgets. A failure taxonomy that sorts every failed run
into exactly one of nine categories. A matrix that runs the same experiment across models and
conditions with Wilson intervals, and that ran against four live models, four hundred runs in
all. And a second world, written as an adventure, that the same harness plays without a change
to the kernel.

## What was measured, and what was not

This matters more than anything else in the document, so it comes first.

The matrix ran against **live models with real keys**, twice, and against a **surrogate** once,
before any key was available. Four models were reachable through two vendors: `claude sonnet
4.5` and `gpt-4.1-mini` through OpenRouter, `glm 5.3` and `glm 4.5 air` through Z.ai. Each live
sweep is the same grid, four models across five conditions with ten seeds each: two hundred runs
per sweep, four hundred live runs in all.

A third sweep pointed the same grid at the organisation world. The first attempt stopped where
the money did: both vendors' accounts ran out mid-sweep (OpenRouter answers `402 insufficient
credits` for a full-sized request, Z.ai answers `429` with `Insufficient balance or no resource
package`), and the 97 runs that ended in a provider payment failure were **deleted rather than
counted**, because a run the model never played says nothing about the model. Once OpenRouter
was funded again the three OpenRouter-served models ran the grid to completion: **150 valid
runs, zero solves, 150 of 150 transcripts replaying exactly.** Z.ai stayed dead, so glm 5.3's
fifty valid runs from the first attempt survive only in that attempt's summary, preserved in
the repository's history at the merge that carried Experiment 06.

The two live sweeps differ in one number: which budget binds. The first holds the budgets the
harness ships with. The second lets the turn budget bind instead of the token ceiling and the
loop guard. Three of the five hypothesis verdicts flip between them, and both sweeps are
reported, because a matrix whose every cell is zero cannot tell a reader whether the models are
weak or the instrument is blunt.

The surrogate is an instrument, not a model: it has the plan and nothing else, and answers a
step whose fact is not in the part of its prompt it can attend to with a guess. Its numbers
appear below for one reason: its runs are free and deterministic, so the mechanism the
conditions manipulate, the memorylessness of the observation, is isolated from everything a
real model brings.

What is proved, and proved over the real network against the real engine:

- The environment is deterministic and replays exactly.
- The perception boundary holds for every reachable state, not a sample.
- The agent loop, the prompt, the extraction ladder and the budgets work end to end, against
  four live models and two wire protocols.
- The failure taxonomy sorts every failure into exactly one existing category, in both worlds.
- The kernel did not change when the second world was written.
- No key appears in any committed artefact. The summaries name the environment variable a key
  is read from, and never the key.

The four hundred live transcripts are not committed: they are too large for the repository. The
two summaries are, in `results/live/` and `results/live-turnbound/`, every figure in this
document traces to them, and the sweep is resumable from the committed configuration in
`configs/`.

## RQ1: can an LLM agent complete a 10-command mission?

**Not to the 80% bar, and the strongest cell in the matrix reaches 90%.** Four live models
played the same grid twice.

With the turn budget binding, the pooled success rate across every cell is **31.5%** (63 of 200
runs), against H1's threshold of 80%. H1 is **falsified**. The best cell is `claude sonnet 4.5`
with a JSON observation and the full history: **90%** (interval 60 to 98). The weakest result is
not a model, it is the control: condition `D`, the same observation with no history, scores
**0% for every model in both sweeps**.

| Model | A | B | C | D | E |
|---|---|---|---|---|---|
| claude sonnet 4.5 | 0% | 90% | 70% | 0% | 80% |
| glm 5.3 | 60% | 80% | 60% | 0% | 60% |
| gpt-4.1-mini | 40% | 50% | 0% | 0% | 20% |
| glm 4.5 air | 0% | 20% | 0% | 0% | 0% |

With the budgets the harness ships with, the same models score **2.0%** pooled (4 of 200). The
loop guard stops an agent that returns to the same state three times, and a real model examines
the keycard and the wall notice before it acts, which is already three visits to the same state.
155 of those 196 failures are exploration failures the guard caused, not the model.

The environment is not the obstacle: the oracle proves the shortest route is 10 commands, and
the harness drives it without a human in the loop. The surrogate, which acts on the first turn
and never triggers the guard, pooled **50.0%** over its own 200 runs, against the same 80%
threshold and the same falsified verdict.

## RQ2: when it fails, why?

**It depends on which constraint stops the run, and the live matrix separated the two.**

With the turn budget binding, the histogram over 137 failures is mostly hallucination: **80 are
`F2`**, a command that names something the agent cannot see. The taxonomy counts `F2` as
malformed output rather than reasoning, so H4 flips from supported to falsified between the
sweeps: **80 of 137 malformed against 57 reasoning, ordering or planning**.

| Code | Category | Runs |
|---|---|---:|
| `F2` | hallucination | 80 |
| `F3` | planning | 23 |
| `F5` | exploration failure | 23 |
| `F7` | budget exhaustion | 8 |
| `F4` | ordering / precondition | 3 |

With the budgets the harness ships with, the histogram inverts: **155 of 196 failures are
`F5`**, because the loop guard stops an exploring agent in its first three turns, and only 30
are hallucination. An unwary reader of either sweep alone would report a different dominant
failure, and both would be correct: the first sweep measures the guard, the second the models.

The dedicated taxonomy sweep from Experiment 04, 29 surrogate failures across all nine
categories, still holds as the proof that the classifier is total, one code per failed run:

| Code | Category | Runs |
|---|---|---:|
| `F5` | exploration failure | 17 |
| `F4` | ordering / precondition | 4 |
| `F3` | planning | 2 |
| `F1` | parsing | 1 |
| `F2` | hallucination | 1 |
| `F6` | lethal trap | 1 |
| `F7` | budget exhaustion | 1 |
| `F8` | provider error | 1 |
| `F9` | abstention | 1 |

The ordering matters: an agent that cannot read the room, or that acts before it has read the
manual, fails. An agent that has the facts and cannot use them fails differently, and the
taxonomy keeps them apart.

## RQ3: how much does the success rate move across conditions?

**The information content moves it enormously, and on live models the format moves it too.**

The control condition `D`, which is the same observation with no history, succeeds on **0% of
runs, for every model, at every budget, and at every surrogate reliability**. That is the
largest single effect in the matrix, and it has a mechanism: the observation is memoryless, so
the safe combination the agent read on turn 4 is gone from its view by turn 8.

On live models with the turn budget binding:

| Hypothesis | Claim | Measured | Verdict |
|---|---|---|---|
| `H2` | Masking the legal action space raises the success rate | 40.0% masked (`E`), 60.0% unmasked (`B`) | **falsified** |
| `H3` | A structured observation beats prose | 60.0% JSON (`B`), 25.0% prose (`A`) | **supported** |
| `H5` | The full history dilutes the context | 32.5% structured (`C`), 40.0% full (`E`) | **falsified** |

`H3` is the hypothesis the live matrix was built to ask. The surrogate could not answer it: it
has no attention mechanism, so its format cells came out identical, 62.5% against 62.5%, and
its masked cells likewise. A real model reads a JSON observation better than prose, by **35
percentage points** pooled across four models, and masking the legal actions costs it 20.

What the format also changes is the bill. The same mission costs the frontier surrogate
**8,720 tokens** per solve with a prose observation and **23,007 tokens** with a JSON one:
JSON is **2.6x the tokens** for the same facts. The structured context brings it back down to
**8,944**, within 3% of prose.

> **Key insight.** The structured context is not cheaper than prose by accident. It is the only
> condition that keeps the JSON observation affordable, and it is the condition that would ship
> in an organisation's dashboard payload.

## RQ4: what does a solved mission cost?

**Between $0.05 and $0.45 per solved mission on live models, and $0.2868 pooled.**

With the turn budget binding, the cost per solved mission across the whole sweep is **$0.2868**.
The cheapest cell is `gpt-4.1-mini` with a prose observation at **$0.0451** per solve; the
dearest is `claude sonnet 4.5` with a masked JSON observation and the full history at
**$0.4541**. With the budgets the harness ships with, the pooled figure is **$0.6239**, because
a failed run spends its budget without producing a solve, and 196 of 200 runs failed.

In tokens, the surrogate puts a floor under the same question. A solved mission costs **8,720
tokens** with a prose observation and **23,007** with a JSON one: **2.6x** for the same facts.
The token number is the one that scales, and it scales with two things: the depth of the chain
and the verbosity of the observation.

The open-weights surrogate needed **55,462 tokens** per solve where the frontier one needed
**8,720**, because it fails more often and a failed run spends its whole budget. Cost per
*solve* is therefore a misleading number on its own, and the honest pairing is cost per solve
alongside the success rate that produces it.

## RQ5: does the adventure vocabulary hold up as a model for a second domain?

**Yes, and the finding that makes it interesting is where it did not.**

The second world, a release of a hotfix, was written as an adventure with **no change to
`src/kernel`**. That is enforced two ways: the kernel's file hashes are recorded in a manifest
and a test fails if any of them changes, and a test fails if the kernel's source mentions a
single organisation word.

The same harness plays it: the scripted policy wins in 10 commands, the breadth-first search
confirms 10 is the shortest winning route, every room and object is reachable, and the random
policy fails on both worlds. The failure classifier sorts the organisation's failures into the
existing nine categories with no new rule and no edit to the classifier.

The world changed more than the nouns:

| | The game | The organisation |
|---|---|---|
| Verbs | `take`, `cut`, `unlock` | `claim`, `deploy`, `unlock` |
| The flag a verb asks for | `takeable` | `claimable` |
| The credential | a keycard in the bag | the ticket in the bag |
| The gated action | cut one of three wires | deploy one of three releases |
| The failure | the bomb goes off | the wrong release goes out |

The vocabulary is the kernel's, and the kernel never learns a word of either world.

### The constraint the second world found

Authoring the organisation turned up a rule the first world never exercised. **Two actions with
the same verb must agree on their argument shapes**, because the parser resolves the arguments
before the engine chooses between the candidate actions. The organisation wanted one `unlock`
that took a held object and another that took a typed code, and it could not have both.

That is a real limit on the engine, found only by writing a second world, and it is cheap to
live with: give the two actions different verbs. It would have been invisible in a single-world
project.

### The live sweep against the organisation world

**On the 150 completed-grid runs, no model solved the organisation's mission: 0/150, Wilson
interval 0 to 2.0%. Add glm 5.3's fifty runs from the first attempt and the evidence is 0/200.**

The same turn-bound grid as the second sweep, `configs/matrix.live-org-turnbound.json`, was
pointed at `hotfix-2-4-1` with `npm run exp:05 -- --matrix configs/matrix.live-org-turnbound.json
--adventure hotfix-2-4-1`. The valid cells and what is in them:

| Model | Cells | Median turns | What killed the runs |
|---|---|---|---|
| claude sonnet 4.5 | A to E (50 runs) | 18 to 29 | hallucination first, then planning and budget |
| gpt-4.1-mini | A to E (50 runs) | 23 to 27 | hallucination dominates in every cell |
| glm 4.5 air | A to E (50 runs) | 26 to 29 | hallucination and budget exhaustion |

And glm 5.3's fifty runs from the first attempt, preserved in that summary: it spends its turns
at gold-path speed and loses them to hallucinated objects, ten of ten in its prose cell.

Three observations the completed grid makes solid:

- **On this world, the agents lose to furniture that is not there.** 88 of the 150 failures are
  F2, the category for referencing objects that are not in the room: 59%, against 33 planning,
  23 budget exhaustions, and 9 spread over ordering and looping. The models act for rooms they
  imagine rather than the one they were shown.
- **H4 flipped, and the flip is a finding about the world.** On mission-impossible the
  reasoning failures outnumbered the output failures and H4 was supported; here the verdict
  falsifies, because the output-shaped category dominates. The taxonomy absorbed both worlds
  with no new rule, and the histogram is where the difference between the worlds lives.
- **The models grind longer and still lose.** The completed cells' medians sit between 18 and
  29 turns on a ten-command mission, against the first attempt's cells where some models gave
  up in two. A funded grid bought longer attempts, and longer attempts did not buy a solve: the
  bottleneck is knowing which objects exist, and more turns of imagining cannot fix that.

**What the completion cost, and what it could not buy.** After the first attempt's 97
payment-failed runs were deleted, the accounts were funded and the three OpenRouter models ran
every one of their cells: 150 runs, complete, each replaying exactly. Z.ai never came back, so
glm 5.3 could not be re-run; its fifty valid runs from the first attempt have no transcripts on
disk, and the committed summary marks that model's cells `incomplete` rather than averaging
over them. Those numbers are quoted above, and the attempt's own summary is preserved in the
repository's history at the merge that carried Experiment 06, so the claim rests on a committed
artefact either way. The honest reading is unchanged by the completion: 0 of 150 fresh runs
bounds the pooled rate below 2.0%, and 0 of 200 across both attempts.

## Phase 8: is our engine the reason it works?

**The control refused to give a simple answer, and that refusal is the result.
Across two sweeps the agent has been 0/10, 3/10, 10/10 and 0/10 on the other
engine in the same cell, while scoring 4/10 on ours. No engine wins on a single
sweep; what survives every sweep and both engines is the no-history control.**

Phase 8 is the control on everything above. The same agent, the same prompt,
the same budgets, the same transcript format and the same taxonomy were run
against **Operation Nightingale ported to QuestKit**, the maintained JavaScript
toolkit of the Quest engine family (MIT), with the rules of the world living
in that engine rather than in ours. Same models, same seeds, same condition:
prose observations and the full history.

| Model | Our engine | QuestKit | Our failure mix | QuestKit failure mix |
|---|---|---|---|---|
| claude sonnet 4.5 | 0/10 | 0/10 | 10 x hallucination | 10 x planning |
| gpt-4.1-mini | **4/10** | **0/10** | 5 hallucination, 1 loop | 10 x planning |
| glm 4.5 air | 0/10 | 0/10 | 10 x hallucination | 10 x planning |

**Then the full grid ran, and the first sweep's story broke.** The same
comparison was repeated over all five conditions, three models, ten seeds:
150 runs. The frontier model, which had scored 0/10 on QuestKit in the first
sweep, scored 10/10 in condition A of the second: the same cells, the same
seeds, the same port. A reading built on one sweep would have said the agent
cannot solve the game on the other engine, and the second sweep says it wins
every time it tries.

| Model | Ours A | Ours B | Ours C | Ours D | Ours E | QuestKit A | QuestKit B | QuestKit C | QuestKit D | QuestKit E |
|---|---|---|---|---|---|---|---|---|---|---|
| claude sonnet 4.5 | 0 | 9 | 7 | 0 | 8 | 10 | 0 | 9 | 0 | 0 |
| gpt-4.1-mini | 4 | 5 | 0 | 0 | 2 | 3 | 0 | 0 | 0 | 0 |
| glm 4.5 air | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | not run |

(Counts of ten. The QuestKit grid for glm 4.5 air stopped in condition E, when
the OpenRouter key's fifty-dollar limit ran out: nine runs died as provider
errors and the tenth is ambiguous, so the cell is excluded rather than
averaged. That is the same funding failure that cut the organisation grid,
on the same key.)

What the full grid says, and does not:

- **The memorylessness finding survives the engine.** Condition D, the
  no-history control, is 0 for every model on both engines: 0 of 30 on ours,
  0 of 30 on the port. Of everything in this series, that is the result that
  reproduces furthest from home.
- **The frontier model can win on the other engine.** 10/10 in condition A,
  9/10 in condition C: the mission is solvable through QuestKit's surface,
  by a model that cannot solve it through ours in the same condition. So our
  engine was carrying weight for that model, and the direction of the load
  depends on the sweep.
- **The condition pattern does not transfer cleanly.** On ours the frontier
  model needs a structured or JSON view (B 9, C 7, E 8 against A 0); on
  QuestKit prose is its best condition (A 10) and every JSON rendering scores
  0 or nothing. A finding about renderers measured in one engine does not
  transfer to the other, which is a warning about every renderer claim above.
- **gpt-4.1-mini solves less everywhere.** 11 of 50 on ours, 3 of 50 on
  QuestKit, with no condition above 3.

**The failure mode moves, and it moves the informative way.** On our engine
the frontier model fails these cells by hallucination; on QuestKit the same
model's failures are planning loops, repeats of an action that had already
failed. Two engines, one agent, two different mistakes.

**What is being compared, exactly.** The observation surfaces differ by
construction, and that difference cannot be separated from the engine in this
design. Our engine shows the agent what it has perceived; QuestKit shows it
everything in scope, because that is what scope means there. The perception
boundary is one of our design choices, so the comparison is a comparison of
design choices, which is what Phase 8 set out to measure.

**Authoring the same world twice.**

| | Our engine | The QuestKit port |
|---|---|---|
| World definition | 569 lines, 18,578 bytes | 431 lines, 11,323 bytes |
| Verbs the world declares | 19, each with its arguments, predicates and effects | 9 commands, each with a script |
| Verbs the world inherits | none | look, examine, take, drop, inventory and the directional go commands, from the toolkit |
| Validation | every world is checked against a schema when it loads | none: the engine runs what the script says |
| Determinism | a pure reducer and a hash chain | ordinary mutable state |

The port is smaller, and the difference is mostly the standard library: the
toolkit hands over six verbs that our world has to declare, with their
argument shapes and their rules. Our verb table is part of the experiment,
because it is one of the things the matrix varies.

**What the port cost.** The toolkit's engine is a browser engine, so the port
runs it in a Node context and compiles the world's sections the way the
toolkit's own compiler does. Two things about it are worth recording, because
they are the kind of thing only a comparison finds: a command pattern with two
`#object#` slots is one argument twice, so the second silently shadows the
first; and the engine's `set` only takes three arguments when the value is
truthy, so `set(exit, 'locked', false)` sets the wrong thing entirely.

**What this does not settle.** A port written by the same hand as the engine
it is compared against can only be checked for sameness, not for innocence:
a differential test now compares the two worlds room by room, object by
object, door by door, verb by verb and command by command, and fails when
they stop matching, but a port is not the original game. Ten seeds per cell
cannot make a 4/10 and a 0/10 significant, and the two sweeps disagree by ten
solved runs in the same cell, which is more than any engine difference
explains. The claim this supports is the narrow one: **the numbers in this
document are not a fact about the agent alone, and they are not yet a fact
about the engine alone either.**

## Threats to validity

- **Two sweeps, one grid, three flips.** The live matrix ran twice and the sweeps disagree on
  three of the five hypotheses. The difference is one configuration number, which budget binds,
  and a reader who takes one sweep without the other takes an answer the other sweep
  contradicts. Both are reported for that reason.
- **The live transcripts are not committed.** Four hundred of them are too large for the
  repository. The summaries are committed and the sweep is resumable from `configs/`, but a
  live run cannot be replayed from the repository alone: the engine replays exactly, the model
  does not.
- **One wire protocol.** All four live models were reached through the OpenAI-compatible
  adapter over two vendors. The Anthropic-compatible adapter is live-proved by the single runs
  in Experiment 03, not by the matrix.
- **The dollar figures are list prices, not invoices.** They are computed from the published
  per-million prices in one table, `src/runner/metrics.ts`, and that table goes stale.
- **The surrogate models one failure mode.** It forgets facts and guesses. A real model also
  hallucinates, misreads and loops, and the weights between the nine categories would change.
- **One adventure, then two.** Two worlds is enough to show the vocabulary transfers and not
  enough to say it transfers in general.
- **The engine comparison is one condition deep where it counts, and sweep-fragile.** The
  full grid ran once, its first sweep disagreed with it by ten solved runs in one cell, and
  the frontier model's prose cell swung from 0/10 to 10/10. Ten seeds a cell cannot settle an
  engine difference of that size; a reader should treat every engine claim here as one sweep's
  evidence, not a verdict.
- **The organisation matrix needed two attempts.** The first was cut short by provider credit,
  and its payment-failed runs were deleted rather than counted; the second completed every
  OpenRouter cell after funding. glm 5.3's fifty valid runs from the first attempt have no
  transcripts on disk, so the committed summary marks that model incomplete and its numbers are
  quoted from the preserved first-attempt summary instead. With 0 solves on 150 completed-grid
  runs, the pooled rate is bounded below 2.0% and nothing finer than that is claimable.
- **The sample is small.** Ten seeds per cell, with Wilson intervals, and no claim of
  significance below that.
- **The engine is deterministic; the agent is not.** Every transcript replays exactly, and no
  agent run is claimed to reproduce.

## What this means for running an organisation

The point of writing an organisation as an adventure was to find out how much of it survives.
Here is the short answer.

**What transfers as it is.** The observation contract, the context strategies, the budgets, the
transcript, the replay, the hash chain and the failure taxonomy all moved to the second world
without a change. An organisation running on this engine would have a dashboard payload for each
agent, a bounded budget, a replayable audit trail, and a per-run category that says whether the
agent got stuck, acted too early, or ran out of budget.

**What changes.** The verbs and the flags become the organisation's own, which is the point: the
engine learns nothing. The dashboard payload is a JSON observation, which live models read
better than prose by 35 percentage points, and it carries a *summary*, not the whole history:
the summary holds the token bill within 3% of prose, and the live matrix falsified the claim
that the full history dilutes the context, so the summary is bought for the bill rather than
for the score. And the memory has to live somewhere: the observation is deliberately
memoryless, so the context strategy is the only place a discovered fact can survive.

**What it does not tell you.** Nothing here says an LLM can run an organisation. It says the
harness can hold an organisation still enough to be measured, and it says where the agent
fails. The live matrix ran the first world twice; against the organisation world it has 150
valid live runs on the completed grid, none of them a solve, and glm 5.3's fifty runs from the
first attempt agree from the preserved summary.

> **Key takeaways**
>
> - The agent's view of the world is much smaller than the world: 109 distinct observations
>   across 1,504 reachable states.
> - The guards bind before the models do. At the shipped budgets a real model is stopped by the
>   loop guard while it is still examining the room; with the turn budget in charge, four live
>   models solve 31.5% of 200 runs, and the best cell of the twenty reaches 90%.
> - The observation is memoryless, so the context strategy is not an optimisation, it is the
>   only place a learned fact can survive: no history, no solves, for any model at any budget.
> - The format of the observation changes the bill by 2.6x and, on live models, the success
>   rate by 35 percentage points. The JSON observation is read better and costs more.
> - The vocabulary transfers. A second world was written with no change to the kernel, and the
>   only thing it cost was one rule about argument shapes that a single world never reveals.
> - The engine is part of the result, and so is the sweep. The frontier model scored 0/10 on
>   QuestKit in one sweep and 10/10 in the next, in the same cells; on our engine it is 0/10
>   in prose and 9/10 in JSON. What survives every engine and every sweep is the no-history
>   control, 0 everywhere. Single-sweep claims about engines do not survive contact with a
>   second sweep.
> - The organisation world is where the live agents stop: 0 solves on 150 completed-grid runs
>   and 0 on glm 5.3's fifty from the first attempt. The failure is hallucination, not
>   hesitancy: 88 of 150 runs acted on objects that were not in the room, and longer budgets
>   bought longer defeats. The taxonomy needed no new category to say so, and H4 flipped in
>   the saying.

## Reproducing this

```sh
npm run check                 # typecheck, lint, the whole suite, the prose gate
npm run exp:01                # the game, played by the scripted policy
npm run exp:02                # the state beside the observation
npm run exp:03                # the agent plays the game
npm run exp:04                # the failure taxonomy and the histogram
npm run exp:05                # the matrix, with the Wilson intervals
npm run exp:06                # the two worlds side by side
npm run exp:08                # the same agent, on somebody else's engine

npm run exp:05 -- --matrix configs/matrix.live.json            # live models, shipped budgets
npm run exp:05 -- --matrix configs/matrix.live-turnbound.json  # live models, turn budget binds
npm run exp:05 -- --matrix configs/matrix.live-org-turnbound.json \
    --adventure hotfix-2-4-1                                  # live models, the organisation world
npm run exp:08 -- --matrix configs/matrix.live-questjs.json   # live models, the QuestKit engine
npm run exp:05 -- --matrix configs/matrix.live-org-turnbound.json \
    --adventure hotfix-2-4-1 --summarise-only                 # report the runs on disk, spend nothing
```

Every artefact is on disk afterwards: a transcript and a metrics file per run, the matrix
summary in `results/`, and the transfer comparison in `results/transfer.md`. The two live
matrices need `OPENROUTER_API_KEY` and `ZAI_API_KEY` in the environment; a model whose key is
missing is refused before the sweep starts, and the sweep resumes from where it stopped.

## Reference

- `SPEC.md` §1.3 (the research questions), §12 (evaluation), §16 (the phases), §17 (threats to
  validity), §18 (the roadmap to organisation simulation)
- `docs/RESEARCH-CONTEXT.md` §7. Why our numbers are *not* comparable to TALES' numbers
- `experiments/`. The six experiments, each with its own README and its own acceptance criteria
