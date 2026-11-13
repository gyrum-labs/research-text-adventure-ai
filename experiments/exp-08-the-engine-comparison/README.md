<!-- page-version: 1.0.0 status: draft last-reviewed: 2026-11-12 -->

# Experiment 08: The Engine Comparison

*The control on our own work. If the same agent scores the same on somebody
else's engine, then the numbers this series reports are about the agent and
the scenario, and not about the design choices we made. If it scores worse,
the design choices are carrying weight, and the series should say which ones.*

> **The one idea:** run the agent against a world whose rules live in another
> engine, and see whether the score follows the agent or the engine.

> **Reader track**
>
> - **Ten minutes.** The table, and the two numbers it turns on.
> - **Thirty minutes.** The port, and what it cost to write.

## What you are building

A port of **Operation Nightingale** to [QuestKit](https://github.com/textadventures/questkit),
the maintained JavaScript toolkit of the Quest engine family, and the same agent
harness pointed at it.

| | Ours | QuestKit |
|---|---|---|
| World model | Rooms, objects, doors, verbs, goals, hints | Locations, objects, exits, commands, scripts |
| Where the rules live | Predicates and effects as data, in one kernel | Scripts written per verb, run by the engine |
| What the agent sees | What it has perceived | Everything in scope: the room and the bag |
| Determinism | A pure reducer and a hash chain | Ordinary mutable state |
| Validation | Every world is validated against a schema at load | None: the engine runs what the script says |
| Verbs the world must define | All of them | The core verbs come with the toolkit |

## How to run it

```sh
npm run exp:08 -- --matrix configs/matrix.live-questjs.json
```

The matrix names the models; the run reads `OPENROUTER_API_KEY` from the
environment and writes a transcript per run under `runs/exp-08/`.

## The port

`src/adventures/questkit-mission-impossible/` holds three files.

- `world.ts` is the world: the same three rooms, the same fourteen objects,
  the same four doors, the same ten-command gold path, declared in the
  toolkit's own vocabulary.
- `engine.ts` loads the toolkit's engine into a Node context, gives it the
  smallest interface that can collect its output, and compiles the world's
  sections the way the toolkit's own compiler does.
- `session.ts` puts the engine behind the session interface the Phase 5
  client uses, so the agent loop is the one the whole series uses and only
  the world changed.

Two things the port had to learn about the toolkit, both of which are the
kind of thing a comparison only finds by trying:

- **A command's pattern decides its arguments.** Two `#object#` slots in one
  pattern are one argument twice, so the second silently shadows the first.
- **The engine's `set` only takes three arguments when the value is truthy.**
  `set(exit, 'locked', false)` sets the wrong thing; `set(exit + '.locked',
  false)` sets the flag.

## What was measured

Sweep one covered condition A only: thirty runs, three models, ten seeds. The agent did no
better on the other engine, and worse for the one model our engine solves (4/10 to 0/10),
with the failure moving from hallucination to looping.

Sweep two ran the full five-condition grid, three models, ten seeds: 150 runs, of which 140
count. The frontier model's condition A swung from 0/10 in sweep one to 10/10 here, so the
table below is one sweep's evidence, not a verdict.

| Model | Ours A | Ours B | Ours C | Ours D | Ours E | QuestKit A | QuestKit B | QuestKit C | QuestKit D | QuestKit E |
|---|---|---|---|---|---|---|---|---|---|---|
| claude sonnet 4.5 | 0 | 9 | 7 | 0 | 8 | 10 | 0 | 9 | 0 | 0 |
| gpt-4.1-mini | 4 | 5 | 0 | 0 | 2 | 3 | 0 | 0 | 0 | 0 |
| glm 4.5 air | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | not run |

What reproduces across both engines and both sweeps is the no-history control: 0 solves
everywhere. What does not is the renderer effect: on our engine the frontier model needs a
JSON or structured view, and on QuestKit prose is its best condition.

The authoring cost runs the other way: the port's world definition is 431 lines and 11,323
bytes against our 569 lines and 18,578 bytes, because the toolkit hands over six verbs that
our world has to declare, with their arguments and their rules.

## The acceptance criteria

- [x] The adventure is ported to QuestJS's lineage, and the scripted gold
      path wins under it
- [x] The same agent harness runs against it: same prompt, same extraction
      ladder, same budgets, same transcript format, same taxonomy
- [x] The success rates of the two engines are compared over the same models
      and seeds, and the authoring cost of the same world in the two is
      measured
- [x] `RESULTS.md` says what the comparison found, including what it cannot
      settle

## Reference

- `SPEC.md` §16 Phase 8, P8.1 and P8.2
- `docs/ASL-RESEARCH.md`: the language the Quest engine family is written in
- `docs/MAPS.md`: both worlds, side by side
- QuestKit: <https://github.com/textadventures/questkit> (MIT)
