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
```

> An environment that says "nothing happened" gives the agent nothing to learn from, and an
> agent with nothing to learn from cannot finish a ten-step chain.

## What you should see

```
turn 1  THINK: The keycard is on the desk and the vault will need it.
       COMMAND: take keycard
       → You pocket the keycard.
turn 2  COMMAND: go corridor
       → Service Corridor. You can see: locker (closed), extinguisher.
turn 3  COMMAND: open locker
       → The locker creaks open. Inside: wire cutters, a defusal manual.
turn 4  COMMAND: take defusal manual
       → You take the defusal manual.
turn 5  COMMAND: read manual
       → Safe combination: 4821. The safe wire is the yellow one.
```

And, when it goes wrong, an error the agent can act on:

```
turn 6  COMMAND: unlock vault door with wire cutters
       → The vault door needs a keycard. You do not have one.
turn 7  COMMAND: take keycard
       → You cannot see anything called "keycard" here.
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

- [ ] A full run completes offline against the `Mock` provider
- [ ] At least two real providers work against their live APIs
- [ ] Every budget and every guard has a test that proves the run terminates correctly
- [ ] The agent survives a bad command and recovers, or the run fails with a clear reason
- [ ] A transcript contains no secret material

## Scaling path

The agent plays. Now: what did it actually do, and why did it fail?
→ [Experiment 04](./exp-04-why-it-failed/)

## Reference

- `SPEC.md` §10 (agent protocol), §11 (runner, budgets, guards), §8.2 (error contract)
