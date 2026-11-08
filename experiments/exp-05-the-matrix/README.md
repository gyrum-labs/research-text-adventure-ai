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
```

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
- [ ] The same matrix runs against live models, with real keys

## What we found

> **Key insight.** The matrix is the machinery, and the machinery is what this experiment
> delivers. The numbers below are a surrogate's numbers, and they say more about the surrogate
> than about any model.

**There are no provider credentials in this environment**, so the live matrix cannot be run
here and its criterion stays unticked. What is built and proved is everything short of the live
call: the conditions are real code that change what the model is shown, the sweep is resumable,
the intervals are the published ones to four decimal places, and the hypotheses are decided by
comparing cells rather than by opinion.

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

### Two of the hypotheses are falsified, and that is the point

`H2`, that masking the action space raises the success rate, is falsified: the masked and
unmasked cells are identical. `H5`, that the full history dilutes the context, is falsified
too: the structured and full cells are identical. The surrogate has no attention mechanism
that distinguishes them, so they come out the same.

That is a finding about the surrogate, and it is the reason the live matrix matters. A real
model does have an attention mechanism, and the question of whether the format or the strategy
matters is exactly the question the live matrix asks.

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
