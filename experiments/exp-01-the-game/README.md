<!-- page-version: 1.0.0 status: draft last-reviewed: 2026-11-08 -->

# Experiment 01: The Game

*I lost an afternoon to a flaky harness before I wrote a single line of game logic. The lesson is
in this experiment: the environment is the thing you have to be able to trust, and you cannot
trust it until it is boring.*


> **The one idea:** build a world you can *trust*. Before you can measure an AI agent, you must be
> certain the environment it is measured in is deterministic, fair, and does not leak the answer.

> **Reader track**
>
> - **Ten minutes.** The why, the layout and the gold path.
> - **Thirty minutes.** The two baselines and the acceptance criteria.
> - **A day.** Write the first failing test, then the kernel.

## Why this is the first experiment

It is tempting to start with the agent. That is the interesting part. But if the environment is
flaky, leaky, or rigged, then the agent's result is meaningless, and you will spend a week
debugging a conclusion that was never real. So we start at the bottom and earn our way up.

The environment is a text adventure. You type commands, the world changes, and the world never
lies: if the vault door is locked, it is locked, and no amount of confident prose from a model
will open it.

## What you are building

Three things, in this order, each with its tests written first:

1. **The kernel** (`src/kernel/`). A pure function from `(state, command)` to `(new state,
   events)`. No I/O, no clock, no randomness. It knows rooms, objects, doors, flags, actions,
   goals and turns. It does not know what a bomb is.
2. **The adventure** (`src/adventures/mission-impossible/`). Pure *data*. Three rooms, nine
   objects, a 10-command gold path, and a lethal trap. No logic: every behaviour is declared
   through the kernel's ten predicates and ten effects.
3. **Two ways to play it**. A human at the terminal, and an agent. Both drive the *same* engine
   through the *same* commands and produce the *same* kind of transcript.

### The rule that makes the experiment valid

**The agent gets no special treatment.** Same engine, same grammar, same error messages, same
transcript format as the human. The only difference is who chooses the next command.

That is what makes "the agent solved it" mean the same thing as "a human solved it". And it is
why the human transcript is the reference the agent is compared against.

> **Margin note.** The 1979 original was a timed task, and the community's verdict on it
> was that the difficulty was "offset by the lack of options". We kept both halves: the budget is
> the antagonist, and the option space stays narrow on purpose.

## The adventure

```
   BRIEFING ROOM ──► SERVICE CORRIDOR ──[keycard]──► SERVER VAULT
     keycard             locker ──► wire cutters          bomb (3 wires)
     bulletin                  └─► defusal manual        safe ─[code]─► case
```

The agent is told only this:

> A booby-trapped case is locked in the server vault. Two objectives: disarm the bomb, and
> recover the case. Nothing else is known. You are in the briefing room. Discover the rest by
> exploring.

Everything else it has to find: the defusal manual is inside a closed locker, the manual names
both the safe wire *and* the safe code, the vault door needs a keycard from the first room, and
cutting the wrong wire ends the run.

**The gold path** (10 commands. The denominator for every efficiency measurement later):

```
take keycard · go corridor · open locker · take cutters · read manual
unlock vault door with keycard · go vault · cut yellow wire with cutters
unlock safe with 4821 · take case
```

## How to run it

```sh
npm run play      # you play it, at the terminal
npm run exp:01    # same thing, plus the scripted and random baselines
```

You should be able to finish the adventure yourself in a couple of minutes without reading the
gold path. That is the test of whether the adventure is fair.

## What you should see

```
> look
Briefing Room
A windowless office. A desk, a wall notice, and a door south to the service corridor.
You can see: keycard, bulletin, desk
Exits: south → Service Corridor
Carrying: (nothing)
Objectives:
  - Disarm the bomb  [not done]
  - Recover the case  [not done]

> take keycard
You pocket the keycard.

> go corridor
Service Corridor
A narrow corridor lined with dented lockers. A fluorescent tube flickers overhead.
You can see: locker (closed), extinguisher
Exits: north → Server Vault (locked), south → Briefing Room
Carrying: keycard
Objectives:
  - Disarm the bomb  [not done]
  - Recover the case  [not done]
```

And the two baselines, which are the real deliverable of this experiment:

| Policy | Expected | Why it matters |
|---|---|---|
| **Scripted** (the gold path) | Wins in 10 turns | Proves the adventure is solvable and the engine is right |
| **Random** (uniform over legal commands) | Fails 20/20 seeds | Proves the adventure is *not* trivially solvable. Otherwise a success rate means nothing |

If the random policy ever wins, the experiment is broken and you must fix the adventure before
moving on.

## The tests, in the order they get written

This is the TDD plan. Write the test, watch it fail, make it pass. Do not write two tests before
running the first.

**The kernel**

- `reduce` returns a new state and does not mutate the old one
- `reduce` returns the same result for the same inputs, twice, in separate processes
- an action whose preconditions fail changes nothing and emits `action_failed`
- an action whose preconditions hold applies its effects and emits `action_succeeded`
- the kernel imports nothing but `node:crypto` (architecture test)
- the kernel contains no clock, no randomness, no I/O (lint rule)

**The adventure**

- the scenario file loads and passes Zod validation
- the gold path wins, and both goals complete
- a BFS over the action space confirms 10 is the *shortest* winning path
- cutting the wrong wire ends the run as `failure`
- cutting a wire before reading the manual is refused, and is *not* fatal
- every room and every object is reachable. No dead ends (reachability check)
- brute-forcing the safe code cannot complete within the turn budget
- the random policy fails 20/20 seeds

**The two ways to play**

- a human transcript replays to an identical hash chain
- the agent's transcript replays to an identical hash chain
- both transcripts use the same format and the same command vocabulary

## Acceptance criteria

This experiment is done when all of these are true and the suite is green:

- [x] The kernel is pure, deterministic, and has no adventure-specific vocabulary
- [x] The adventure is pure data and validates at load
- [x] The gold path wins in 10 turns; BFS confirms it is shortest
- [x] The random policy fails 20/20 seeds
- [x] A human can play it to completion from the terminal
- [x] Every run produces a transcript that replays to an identical hash chain
- [x] Kernel line coverage is at least 90%

## Scaling path

The game is now trustworthy. Two questions remain, and they are the next two experiments:

- **What does the agent actually see?** → [Experiment 02](./exp-02-what-the-agent-sees/)
- **Can it play?** → [Experiment 03](./exp-03-the-agent-plays/)

## Reference

- `SPEC.md` §6 (data model), §7 (the adventure), §8 (command grammar), §13 (replay)
- `docs/ADVENTURES.md`. How to write a scenario, with worked examples
