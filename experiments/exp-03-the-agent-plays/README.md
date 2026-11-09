<!-- page-version: 1.0.0 status: draft last-reviewed: 2026-11-08 -->

# Experiment 03: The Agent Plays

*I expected the interesting part of this project to be the agent loop. It was the error message.*


> **The one idea:** a model can drive a state machine reliably, if you give it a clean loop, an
> honest error message, and a hard limit on how much it may cost.

> **Reader track**
>
> - **Ten minutes.** The four pieces and the transcript format.
> - **Thirty minutes.** The tests and the acceptance criteria.

## What you are building

The agent loop, and the four pieces that make it trustworthy:

1. **The provider port** (`src/agents/llm/provider.ts`). One interface, four implementations:
   Anthropic, an OpenAI-compatible endpoint, a local Ollama, and a `Mock` that replays scripted
   responses. Plain `fetch`, no vendor SDKs.
2. **The prompt**. The mission brief, the verb list, the rules, and the output envelope. A pure
   function of `(adventure, observation, context)`, so it can be unit-tested and hashed.
3. **The extraction chain**. A deterministic ladder that turns a model response into one command,
   recording *which rung* worked so formatting drift is measured rather than hidden.
4. **The runner**. The loop, the budgets, the guards, the transcript.

## How to run it

```sh
npm run exp:03 -- --provider mock                       # offline, free, deterministic
npm run exp:03 -- --provider anthropic --model claude-sonnet-4.5
npm run exp:03 -- --provider openai --model deepseek/deepseek-chat \
  --base-url https://openrouter.ai/api/v1 --api-key-env OPENROUTER_API_KEY
```

> An environment that says "nothing happened" gives the agent nothing to learn from, and an
> agent with nothing to learn from cannot finish a ten-step chain.

## What you should see

```
turn 1  COMMAND: take keycard
        → You take the keycard.
turn 2  COMMAND: go corridor
turn 3  COMMAND: open locker
        → You open the locker.
turn 4  COMMAND: take cutters
        → You take the wire cutters.
turn 5  COMMAND: read manual
        → You read the defusal manual.  DEFUSAL PROCEDURE. Safe combination: 4821. The safe wire is the YELLOW one. Cut nothing else.
```

The `THINK:` lines are in the model's answer, and the command is taken from the `COMMAND:`
line below it. The runner prints the command and what the world said back.

And, when it goes wrong, an error the agent can act on:

```
turn 6  COMMAND: unlock vault door with cutters
        → The vault door does not open. The combination must be four digits.
turn 7  COMMAND: take keycard
        → You can't see anything called "keycard" here.
        You can see: locker, fire extinguisher, vault door.
```

That second message matters more than it looks. An environment that says "nothing happened" gives
the agent nothing to learn from. Which is a documented cause of agent failure in the literature
(`docs/RESEARCH-CONTEXT.md` §4.6).

## The tests, in the order they get written

- the `Mock` provider drives a complete run with **zero** network calls
- the prompt is a pure function and its hash is recorded in every transcript
- the extraction chain is tried in order and records which rung produced the command
- a response with no command at all is counted, not silently dropped
- the runner stops on: turn budget, token budget, wall-clock budget, repeated state, provider
  errors. Each with the right outcome code
- no API key appears in any transcript, log or metric file
- an invalid command does not end the run; the agent gets the error and continues

## Acceptance criteria

- [x] A full run completes offline against the `Mock` provider
- [x] At least two real providers work against their live APIs
- [x] Every budget and every guard has a test that proves the run terminates correctly
- [x] The agent survives a bad command and recovers, or the run fails with a clear reason
- [x] A transcript contains no secret material

## What we found

The loop works, and it was not the interesting part. Two other things were.

> **Key insight.** The error message is the experiment. A refusal that says only "no" tells the
> agent nothing it can act on, and an agent with nothing to act on cannot finish a ten-step
> chain. The parser now says what was attempted, what was wrong, and what is possible.

### The error contract, fixed

Before this, the parser refused an unknown object with `You can't see any "keycard" here.` That
is a correct statement and a useless one. It is now:

```
You can't see anything called "the brass key" here.
You can see: keycard, wall notice, desk.
```

The same applies to a tool the agent is not carrying: `You aren't carrying anything called
"cutters".` followed by what the agent is carrying.

### Two ways prose became a command

The extraction ladder falls back to the last line of a response when there is no `COMMAND:`
line, and to the first line when the last does not parse. That fallback is what makes the
loop tolerant of a model that forgets the envelope, and it is also a way for prose to be
mistaken for an action.

The parser let it happen. A verb that takes no arguments accepted trailing words, so the
sentence "I have no idea what to do" was read as the `inventory` command, because the
adventure declares `i` as a synonym and the parser ignored the rest of the line. A verb that
takes no arguments is now the whole command, and the sentence is refused.

### The observation is memoryless, and that is the finding

A message lasts exactly one turn. The agent reads the manual on turn 5 and the safe code is in
its view on turn 6; take any action on turn 7 and the code is gone from the observation,
because the observation carries no memory of it.

This is not a defect in the observation, it is the reason the `structured` context strategy
exists. The known-facts block carries forward what the agent has been told, so a learned fact
survives. Experiment 05 will measure whether that difference actually buys anything.

### Two real providers, against their live APIs

The criterion is met, and it was met by reaching two vendors rather than by writing a new code
path. Every run below went over the network to a live API, with a real key, through an adapter the
harness already had.

| Adapter | Provider | Model | Endpoint | Key variable | Turns | Tokens | Parse errors |
|---|---|---|---|---|---|---|---|
| OpenAI-compatible | OpenRouter | `deepseek/deepseek-chat` | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` | 10 | 6 611 | 1 |
| OpenAI-compatible | Z.ai | `glm-4.6` | `https://api.z.ai/api/paas/v4` | `ZAI_API_KEY` | 9 | 6 843 | 0 |
| Anthropic | Z.ai | `glm-4.6` | `https://api.z.ai/api/anthropic` | `ZAI_API_KEY` | 8 | 5 855 | 1 |

Two of the four adapters in the port are now proved against a live API, and Z.ai serves both
wire formats, so the same key reached two different protocols. The command is the same either way.
The endpoint and the variable the key is read from are named on the command line, so the run does
not change when the vendor does, and it does not change when the protocol does either.

```sh
npm run exp:03 -- --provider openai --model deepseek/deepseek-chat \
  --base-url https://openrouter.ai/api/v1 --api-key-env OPENROUTER_API_KEY

npm run exp:03 -- --provider anthropic --model glm-4.6 \
  --base-url https://api.z.ai/api/anthropic --api-key-env ZAI_API_KEY
```

No run finished the mission, and that is a finding rather than a shortfall in the criterion. Every
agent read the wall notice, took the keycard and unlocked the vault door. None found the wire
cutters, so none could reach the manual, and all three ended on the loop guard: an agent that
returns to the same state three times is stopped, and examining things without acting never
changes the state at all. The stops were at turns 10, 9 and 8, and they were not a parse error, a
budget or a provider failure.

The key never reached the transcript, the run result or an error message. The tests against a
local server that speaks each wire format already proved that, and the live runs show it again.

## The budgets

Every one of these terminates the run with an outcome code that names it.

| Budget | Default | What it stops |
|---|---|---|
| `maxTurns` | 30 | `budget_exhausted` |
| `maxHints` | 3 | The agent is told it has no hints left, and carries on |
| `maxOutputTokensPerTurn` | 500 | The request carries the limit |
| `maxTotalTokens` | 20 000 | `budget_exhausted` |
| `maxWallClockMs` | 300 000 | `budget_exhausted` |
| `maxTransientProviderErrors` | 3 | `provider_error` |
| `maxParseErrors` | 10 | `budget_exhausted` |
| `maxRepeatedStates` | 3 | `loop_detected` |

The clock is injected, so the wall-clock budget is proved by a test rather than waited for.

> **Key takeaways**
>
> - The provider is a port with four adapters and no vendor SDKs. The mock one drives the whole
>   harness offline and free, which is what makes the experiment reproducible.
> - The extraction ladder records which rung produced each command, so formatting drift is a
>   metric rather than a mystery.
> - An error message is part of the environment. A refusal that names what is possible is
>   usable; one that says "no" is not.
> - A measurement you cannot run is not a measurement. The live-provider check is written and
>   wired, but it is unticked because there is no key here to run it with.

## Scaling path

The agent plays. Now: what did it actually do, and why did it fail?
→ [Experiment 04](./exp-04-why-it-failed/)

## Reference

- `SPEC.md` §10 (agent protocol), §11 (runner, budgets, guards), §8.2 (error contract)
