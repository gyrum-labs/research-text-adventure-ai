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
STATE                               OBSERVATION
location: briefing                 location: Briefing Room
objects: keycard, bulletin, desk   visible: keycard, bulletin, desk
vault door: locked                 (not mentioned — it is in another room)
manual: inside locker              (not mentioned — the locker is closed)
safe code: 4821                    (not mentioned — not known yet)
goals: disarm, recover             objectives: disarm, recover
```

Turn 5, after the manual has been read:

```
manual: read                       visible: (manual is in your inventory)
safe code: 4821                    "The safe combination is 4821."
safe wire: yellow                  "The safe wire is the yellow one."
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

## Acceptance criteria

- [ ] Exactly one function converts state into anything an agent can see
- [ ] The leakage test passes for **every reachable state** of the adventure, not just a sample
- [ ] The three renderers agree on the facts and differ only in presentation
- [ ] The same state produces different prompts under different context strategies

## Scaling path

The agent can now see only what it has earned. Next: give it a way to act.
→ [Experiment 03](./exp-03-the-agent-plays/)

## Reference

- `SPEC.md` §9 (observation contract), §10.4 (context strategies)
- `docs/RESEARCH-CONTEXT.md` §4.3, §4.6. Why the information mask and the informative error
  message are the two decisions the literature supports
