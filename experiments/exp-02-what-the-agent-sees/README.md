<!-- page-version: 1.0.0 status: draft last-reviewed: 2026-11-08 -->

# Experiment 02: What the Agent Sees

*The single most expensive mistake in an agent evaluation is handing the model the answer and
then reporting how well it did. This experiment is about making sure that mistake is impossible
rather than merely unlikely.*


> **The one idea:** the agent's view of the world is deliberately *smaller* than the world, and
> that gap is the whole experiment.

> **Reader track**
>
> - **Ten minutes.** The why and the state/observation comparison.
> - **Thirty minutes.** The four context strategies and the leakage test.
> - **An hour.** The two bugs the experiment found, and what they mean for every later one.

## Why this is the second experiment

A game state contains everything: where the agent is, what it carries, what is locked, what each
object really is. If you hand all of that to the model, you have not tested anything. You have
handed it the solution.

So the world and the agent's view of it are two different things, and exactly one function
decides the difference. That function is the most important line of code in this project.

## What you are building

1. **The observation builder** (`src/kernel/observation.ts`). The *only* path from state to
   agent. It receives the state plus the public fields of the adventure, and nothing else. It
   cannot reach the gold path, the hint table, or the action predicates, because it never receives
   them.
2. **Three renderers**. The same observation, shown three ways: prose (for humans), JSON (for
   machines), and a structured "facts you know" block (for the model's context).
3. **The leakage test**. A proof, not a hope, that the agent never sees more than it earned.

## How to run it

```sh
npm run exp:02
```

It walks the gold path and prints, for each turn, the **full state** beside the **observation the
agent would receive**. The difference between the two columns *is* the experiment.

## What you should see

Turn 0, in the Briefing Room:

```
STATE                                    OBSERVATION
location: briefing                       location: Briefing Room
objects here: keycard, wall notice, desk visible: keycard, wall notice, desk
carrying: nothing                        carrying: nothing
vault door: locked                       (not mentioned — it is in another room)
locker holds: wire cutters, defusal manual(not mentioned — the locker is closed)
safe holds: case                         (not mentioned — the safe is closed)
safe code: 4821                          (not mentioned — not known yet)
goals: disarm, recover                   objectives: Disarm the bomb, Recover the case
```

Turn 5, after the manual has been read:

```
safe code: 4821                          safe code: 4821
safe holds: case                         (not mentioned — the safe is closed)
```

The agent learns a fact **only** by doing the thing that reveals it. That is the property to
protect.

## The tests, in the order they get written

- the observation's objects are a subset of (room contents ∪ inventory)
- a closed container's contents never appear in the observation
- the goals are disclosed; the method to achieve them is not
- no observation ever contains the gold path or the hint text
- the known-facts block is derived only from the agent's *own* observation history
- the four context strategies (`none`, `full`, `window`, `structured`) produce four different
  prompts from the same state
- the observation builder imports nothing from the authoring side of the adventure

## What we found

The experiment is green, and it found two things worth more than the green.

> **Key insight.** The whole world has 1,504 reachable states. The agent can tell only 109 of them
> apart. Everything else it reaches is the same view again, so the agent's world is a small,
> repeating set of situations, not a space it explores.

### The search is complete, not a sample

The first version of the leakage test enumerated states and ran out of room after 200,000 of
them. The reason was not the world but the action DSL: the agent can "unlock" anything it can
reach, and each unlock plants a flag that no predicate and no observation ever reads. The space
filled with states that differ only in a flag nobody can see.

`src/runner/reachable.ts` now keeps a state only when it differs in a way
that matters. A flag is meaningful when some predicate reads it, or when the observation reads
it. Everything else is bookkeeping. With that projection the search terminates on its own, and
the result is every state the agent can be in.

### Two bugs, both found by the leakage test

**The hint never reached the agent.** The reducer emitted the hint text as an event, the human
CLI printed it, and the observation never carried it. An agent that typed `hint` spent a credit
and received "You think hard." with no hint attached. The hint was unreachable for the only
audience that needed it.

The cause was two copies of the rule that decides what an agent reads: one in the runner and one
in the test. They had already drifted. The rule now lives in one function,
`messagesFromEvents`, and both the runner and the tests call it.

**The prose renderer dropped the messages.** `renderObservation` rendered the room, the objects
and the objectives, and silently left out what the world had just said. So the `text` and `json`
renderers did not agree on the facts, which is the one thing the three renderers have to do.

### A finding, not a bug: the observation is memoryless

A message lasts exactly one turn. Read the manual on turn 4 and the safe code is in the
observation on turn 5; take any action on turn 6 and the code is gone again, because the
observation carries no memory of it.

This is not a defect in the observation. It is the reason the `structured` context strategy
exists. The known-facts block carries forward what the agent has been told, so a learned fact
survives. Without it, an agent reads the manual and then forgets the code, which would look
exactly like an agent that never read it.

## Acceptance criteria

- [x] Exactly one function converts state into anything an agent can see
- [x] The leakage test passes for **every reachable state** of the adventure, not just a sample
- [x] The three renderers agree on the facts and differ only in presentation
- [x] The same state produces different prompts under different context strategies

> **Key takeaways**
>
> - The agent's view of the world is much smaller than the world. 109 distinct views across
>   1,504 reachable states.
> - A leak is a property of the whole state space, so the test has to be a search rather than a
>   sample.
> - "One function decides" is a claim you have to enforce in a test. Here a test walks the
>   source with the TypeScript parser and fails if any second function takes a state and returns
>   an observation.
> - Two copies of a rule will drift. The hint bug was not a logic error, it was a duplicated
>   rule.

## Scaling path

The agent can now see only what it has earned. Next: give it a way to act.
→ [Experiment 03](./exp-03-the-agent-plays/)

## Reference

- `SPEC.md` §9 (observation contract), §10.4 (context strategies)
- `docs/RESEARCH-CONTEXT.md` §4.3, §4.6. Why the information mask and the informative error
  message are the two decisions the literature supports
