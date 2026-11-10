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
fails. The live matrix ran the first world only; the organisation world has been driven by the
scripted and random policies and the surrogate. The next step is a live model against the
organisation's dashboard, and the measurement is the same one this series already knows how to
take.

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

## Reproducing this

```sh
npm run check                 # typecheck, lint, the whole suite, the prose gate
npm run exp:01                # the game, played by the scripted policy
npm run exp:02                # the state beside the observation
npm run exp:03                # the agent plays the game
npm run exp:04                # the failure taxonomy and the histogram
npm run exp:05                # the matrix, with the Wilson intervals
npm run exp:06                # the two worlds side by side

npm run exp:05 -- --matrix configs/matrix.live.json            # live models, shipped budgets
npm run exp:05 -- --matrix configs/matrix.live-turnbound.json  # live models, turn budget binds
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
