<!-- page-version: 1.0.0 status: draft last-reviewed: 2026-11-08 -->

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

> **Key insight.** The environment is ready to answer the research questions, and the answers it
> can give today are about the environment rather than about a model: the agent's view of the
> world is 109 distinct observations across 1,504 reachable states, and the failures that a
> competent-but-imperfect agent produces are reasoning failures, not malformed output.

The series built six things. A deterministic text adventure that a human and an agent can both
play. A perception boundary with a proof rather than a promise. An agent loop with a provider
port, a hashable prompt and enforceable budgets. A failure taxonomy that sorts every failed run
into exactly one of nine categories. A matrix that runs the same experiment across models and
conditions with Wilson intervals. And a second world, written as an adventure, that the same
harness plays without a change to the kernel.

## What was measured, and what was not

This matters more than anything else in the document, so it comes first.

**There are no provider credentials in the environment this was built in.** No `ANTHROPIC_API_KEY`,
no `OPENAI_API_KEY`, no local Ollama. Every number below therefore comes from a **surrogate**:
a stand-in that has the plan and nothing else, and answers a step whose fact is not in the part
of its prompt it can attend to with a guess.

The surrogate is an instrument, not a model. Its numbers are about the instrument. The live
matrix is the same code with a different provider behind it, and the criterion that asks for it
is left **unticked** rather than quietly claimed.

What is proved, and proved against the real engine, is everything short of the live call:

- The environment is deterministic and replays exactly.
- The perception boundary holds for every reachable state, not a sample.
- The agent loop, the prompt, the extraction ladder and the budgets work end to end.
- The failure taxonomy sorts every failure into exactly one existing category, in both worlds.
- The kernel did not change when the second world was written.

## RQ1: can an LLM agent complete a 10-command mission?

**Not measured against a modern LLM, because there is no key here.** What is measured is that
the environment can be completed, that the shortest route is 10 commands, and that the harness
drives it without a human in the loop.

The surrogate's pooled success rate across the whole matrix is **50.0%** over 200 runs, against
H1's threshold of 80%. H1 is therefore **falsified** on the surrogate, and the live matrix
remains the test that would settle it.

## RQ2: when it fails, why?

**Reasoning, overwhelmingly.** Across the matrix's 100 failures, **68 were reasoning, ordering
or planning failures** and **32 were malformed output**. H4, that most failures are not parsing
failures, is the one hypothesis the series **supports**.

The failure histogram from the dedicated sweep, 29 failures:

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

**The information content moves it enormously. The format does not move it at all.**

The control condition `D`, which is the same observation with no history, succeeds on **0% of
runs at every reliability**. That is the largest single effect in the matrix, and it has a
mechanism: the observation is memoryless, so the safe combination the agent read on turn 4 is
gone from its view by turn 8.

The other three comparisons move nothing:

| Hypothesis | Claim | Measured | Verdict |
|---|---|---|---|
| `H2` | Masking the legal action space raises the success rate | 62.5% masked, 62.5% unmasked | **falsified** |
| `H3` | A structured observation beats prose | 62.5% JSON, 62.5% prose | **falsified** |
| `H5` | The full history dilutes the context | 62.5% in 9.8 turns, 62.5% in 9.8 turns | **falsified** |

What the format *does* change is the bill. The same mission costs the frontier surrogate
**8,720 tokens** per solve with a prose observation and **23,007 tokens** with a JSON one:
JSON is **2.6x the tokens** for the same facts. The structured context brings it back down to
**8,944**, within 3% of prose.

> **Key insight.** The structured context is not cheaper than prose by accident. It is the only
> condition that keeps the JSON observation affordable, and it is the condition that would ship
> in an organisation's dashboard payload.

## RQ4: what does a solved mission cost?

**Tokens: 8,720 to 23,007 per solve, depending on the observation format.** The dollar cost is
**$0.00** because the surrogate is free, and the live cost needs a key. The token number is the
one that scales, and it scales with two things: the depth of the chain and the verbosity of the
observation.

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

- **No model was run.** Every number is a surrogate's. The live matrix is the same code with a
  provider behind it, and it is the criterion that is open.
- **The surrogate models one failure mode.** It forgets facts and guesses. A real model also
  hallucinates, misreads and loops, and the weights between the nine categories would change.
- **One adventure, then two.** Two worlds is enough to show the vocabulary transfers and not
  enough to say it transfers in general.
- **The sample is small.** Ten seeds per cell, with Wilson intervals, and no claim of
  significance below that.
- **The engine is deterministic; the agent is not.** Every transcript replays exactly, and no
  agent run is claimed to reproduce.
- **The prices are an estimate** and they go stale.

## What this means for running an organisation

The point of writing an organisation as an adventure was to find out how much of it survives.
Here is the short answer.

**What transfers as it is.** The observation contract, the context strategies, the budgets, the
transcript, the replay, the hash chain and the failure taxonomy all moved to the second world
without a change. An organisation running on this engine would have a dashboard payload for each
agent, a bounded budget, a replayable audit trail, and a per-run category that says whether the
agent got stuck, acted too early, or ran out of budget.

**What changes.** The verbs and the flags become the organisation's own, which is the point: the
engine learns nothing. The dashboard payload has to be a *summary*, not a transcript, because the
full history is both 2.6x the tokens and no better for the agent. And the memory has to live
somewhere: the observation is deliberately memoryless, so the context strategy is the only place
a discovered fact can survive.

**What it does not tell you.** Nothing here says an LLM can run an organisation. It says the
harness can hold an organisation still enough to be measured, and it says where the agent
fails. The next step is a real model against a real dashboard, and the measurement is the same
one this series already knows how to take.

> **Key takeaways**
>
> - The agent's view of the world is much smaller than the world: 109 distinct observations
>   across 1,504 reachable states.
> - The failures are reasoning failures, not malformed output: 68 of 100 in the matrix, and the
>   one hypothesis the series supports.
> - The observation is memoryless, so the context strategy is not an optimisation, it is the
>   only place a learned fact can survive.
> - The format of the observation changes the bill by 2.6x and the success rate by nothing.
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
```

Every artefact is on disk afterwards: a transcript and a metrics file per run, the matrix
summary in `results/`, and the transfer comparison in `results/transfer.md`.

## Reference

- `SPEC.md` §1.3 (the research questions), §12 (evaluation), §16 (the phases), §17 (threats to
  validity), §18 (the roadmap to organisation simulation)
- `docs/RESEARCH-CONTEXT.md` §7. Why our numbers are *not* comparable to TALES' numbers
- `experiments/`. The six experiments, each with its own README and its own acceptance criteria
