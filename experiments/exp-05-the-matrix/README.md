<!-- page-version: 1.0.0 status: draft last-reviewed: 2026-11-08 -->

# Experiment 05: The Matrix

*One number is an anecdote. A cell of a matrix with an interval is a result, and the difference
between them is the difference between a hunch and a finding.*


> **The one idea:** one number is an anecdote. A cell of a matrix, with an interval, is a result.

> **Reader track**
>
> - **Ten minutes.** The conditions and what a cell means.
> - **Thirty minutes.** The tests and the acceptance criteria.

## What you are building

The sweep: the same experiment across models and conditions, many times each, summarised
honestly.

- **Conditions**: The experimental variables, one per axis:
  - `A` prose observation, full history
  - `B` JSON observation, full history
  - `C` JSON observation + masked legal actions + structured context
  - `D` JSON observation, no history *(the control)*
  - `E` JSON observation + masked legal actions + full history
- **Cells**: (model × condition), each with at least 10 seeds.
- **Summaries**: Success rate with a Wilson 95% interval, median turns, the failure histogram,
  and cost per solved mission.

`E` is there so the three context hypotheses can be told apart. Without it, `C` differs from `B`
in two ways at once and the masking effect cannot be separated from the strategy effect. With
it, each comparison holds everything else constant: `E` vs `B` is the masking, `B` vs `A` is the
rendering, and `C` vs `E` is the context strategy.

## How to run it

```sh
npm run exp:05 -- --matrix configs/matrix.default.json
npm run exp:05 -- --matrix configs/matrix.live.json          # live models, shipped budgets
npm run exp:05 -- --matrix configs/matrix.live-turnbound.json # live models, turn budget binds
```

The two live configurations differ in one thing: the budgets. The first holds the budgets the
harness ships with. The second lets the turn budget bind instead of the token ceiling and the
loop guard. Both run the same grid, and the difference between them is the finding.

## What you should see

```
model                     cond  n      success (95% CI)  median turns  $/solve
------------------------  ----  -----  ----------------  ------------  -------
surrogate (frontier)      A     10/10  100%  (72–100%)   10            -
surrogate (frontier)      B     10/10  100%  (72–100%)   10            -
surrogate (frontier)      C     10/10  100%  (72–100%)   10            -
surrogate (frontier)      D     10/10  0%   (0–28%)     8             -
surrogate (frontier)      E     10/10  100%  (72–100%)   10            -
surrogate (strong)        A     10/10  70%  (40–89%)    10            -
...
```

The rows are the same shape as the live matrix will be, and the interval is the same
calculation. What differs is the model.

## The tests, in the order they get written

- the Wilson interval matches known values to four decimal places
- the summary row count equals (models × conditions)
- every run in the sweep produced a transcript, a metrics file and a classification
- a cell with fewer than its configured seeds is reported as incomplete, not averaged
- the sweep is resumable: re-running does not re-run completed cells

## Acceptance criteria

- [x] At least 160 runs complete, with every artefact present
- [x] Every cell reports a success rate with a Wilson interval and a sample size
- [x] Failures are aggregated into the F1–F9 histogram
- [x] Cost per solved mission is reported
- [x] H1–H5 are reported as **falsified or supported**, not as impressions
- [x] The same matrix runs against live models, with real keys

## What we found

> **Key insight.** The matrix is the machinery, and the machinery is what this experiment
> delivers. The surrogate's numbers say more about the surrogate than about any model. The live
> numbers say something the surrogate could never have said, and it is about the harness rather
> than about the models: **the guards were written against a policy that acts immediately, and a
> real model does not.**

The criterion is met. The same grid, four models across five conditions with ten seeds each, ran
against four live models with real keys: `claude sonnet 4.5` and `gpt-4.1-mini` through
OpenRouter, `glm 5.3` and `glm 4.5 air` through Z.ai. It ran twice, four hundred runs in all,
and the two sweeps are the finding.

The matrix runs a live model when the configuration names one. A model entry carries the
provider, the model, the endpoint and the variable its key is in, so any OpenAI-compatible
service can be swept:

```json
{
  "id": "live",
  "label": "live",
  "provider": "openai",
  "model": "a-model",
  "baseUrl": "https://api.example.com/v1",
  "apiKeyEnv": "A_PROVIDER_KEY"
}
```

The key is read from the environment and nowhere else, and a model whose key is missing is
refused before the sweep starts rather than halfway through it.

### The shipped budgets stop the agent before the experiment does

The first sweep holds the budgets the harness ships with. Two hundred runs, and the pooled
success rate is 2.0%.

| Model | A | B | C | D | E |
|---|---|---|---|---|---|
| claude sonnet 4.5 | 0% | 0% | 0% | 0% | 0% |
| glm 5.3 | 10% | 0% | 10% | 0% | 0% |
| gpt-4.1-mini | 10% | 0% | 0% | 0% | 0% |
| glm 4.5 air | 10% | 0% | 0% | 0% | 0% |

Two guards explain the near-empty table, and neither is the model's reasoning.

The loop guard stops an agent that returns to the same state three times in a row. A real model
looks before it acts: it examines the keycard, it examines the wall notice, and neither changed
the world, so the state is the same three times and the run ends. The surrogate never triggered
this, because the surrogate acts on the first turn. The guard was written against a policy that
does not explore, and it binds on the first thing a real model does. Exploration failure, which
is `F5`, is 155 of the 196 failures.

The token ceiling arrives before the turn budget does. The default is 20 000 tokens, and a live
model sends the whole observation every turn, so a fifteen-turn run is already over it. The
matrix was measuring the ceiling rather than the model.

### With the turn budget in charge, the models play

The second sweep holds the same grid and the same models and changes one thing: the turn budget
binds, and the token ceiling and the loop guard are held back. The ceiling is 300 000 tokens,
which is more than a thirty-turn run needs even in the condition that keeps the whole history.

| Model | A | B | C | D | E |
|---|---|---|---|---|---|
| claude sonnet 4.5 | 0% | 90% | 70% | 0% | 80% |
| glm 5.3 | 60% | 80% | 60% | 0% | 60% |
| gpt-4.1-mini | 40% | 50% | 0% | 0% | 20% |
| glm 4.5 air | 0% | 20% | 0% | 0% | 0% |

The pooled success rate is 31.5%, the cost per solved mission is $0.2868, and the failure
histogram is mostly hallucination: 80 of the 137 failures are `F2`, a command that named
something the agent could not see.

### The verdicts change, and that is the point

The same hypotheses, the same models and the same grid give different answers depending on
whether the harness's own guards bind.

| Hypothesis | Shipped budgets | Turn budget binds |
|---|---|---|
| H1, a capable agent solves the mission | FALSIFIED, 2.0% | FALSIFIED, 31.5% |
| H2, masking the action space helps | FALSIFIED, 0.0% vs 0.0% | FALSIFIED, 40.0% vs 60.0% |
| H3, a structured observation beats prose | FALSIFIED, 0.0% vs 7.5% | **SUPPORTED, 60.0% vs 25.0%** |
| H4, failures are reasoning, not parsing | SUPPORTED | FALSIFIED |
| H5, full history dilutes the context | SUPPORTED | FALSIFIED |

Three of the five flip. `H3` is the one the surrogate matrix could not answer, and the live
matrix answers it: the JSON observation beats the prose observation, 60.0% against 25.0%, and
that is the hypothesis the live matrix was built to ask.

A matrix whose every cell is zero cannot tell a reader whether the models are weak or the
instrument is blunt. The first sweep could only report that, and it reported the instrument. The
second sweep reports the models. Both are the same code, the same grid and the same keys, and
the difference between them is one number in one configuration.

### The surrogate, and why it exists

The surrogate is a stand-in for a model: it has the plan and nothing else, and a plan step
whose fact is not in the part of the prompt it can attend to is answered with a guess. It is an
instrument, not a model, and its numbers are about the instrument.

What it models is the one thing the conditions actually manipulate. An agent can only act on
what is in its context, and the observation is memoryless: a message lasts one turn, so the
safe combination the agent read at turn 4 is gone from a plain observation by turn 8. The
conditions decide whether it is still there.

### The control is the finding

Condition `D`, with no history, succeeds on **0% of runs** at every reliability. The agent
reads the manual, walks to the vault, forgets the combination, guesses, and the run ends in
the failure the adventure is built around. Every other condition succeeds in proportion to how
reliably the surrogate recalls what it read.

That is the matrix working: the control is not a formality, it is the measurement.

The live sweep says the same thing about four real models. Condition `D`, with no history, scores
0% for every model and every budget, and the other four conditions score between 0% and 90%. A
model that cannot remember what it read cannot finish a ten-step chain, and that is a property of
the observation rather than of the model.

### Two of the hypotheses are falsified, and that is the point

`H2`, that masking the action space raises the success rate, is falsified: the masked and
unmasked cells are identical. `H5`, that the full history dilutes the context, is falsified
too: the structured and full cells are identical. The surrogate has no attention mechanism
that distinguishes them, so they come out the same.

That is a finding about the surrogate, and it is the reason the live matrix matters. A real
model does have an attention mechanism, and the question of whether the format or the strategy
matters is exactly the question the live matrix asks.

The live matrix answers it. The format matters and the strategy does not: the JSON observation
beats the prose observation by 35 percentage points, and the structured context does not beat the
full history. The surrogate could not tell them apart, because the surrogate has no attention
mechanism to tell them apart with.

### The specification had a hypothesis pointing the wrong way

`H5` claims that the full history causes context dilution, which means the hypothesis is
supported when the full history is *worse*. The specification's falsification column said the
opposite. It now says that the hypothesis is falsified when `full` is **not** worse, and the
experiment's own expected output, which shows the structured condition helping, agrees.

## Scaling path

The method works on one world. Now: does it work on a second, very different one?
→ [Experiment 06](./exp-06-an-organisation/)

## Reference

- `SPEC.md` §12.4 (experiment matrix), §12.6 (acceptance), §17 (threats to validity)
- `docs/RESEARCH-CONTEXT.md` §7. Why our numbers are *not* comparable to TALES' numbers
