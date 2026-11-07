---
title: research-text-adventure-ai — user guide
status: living document
last-updated: 2026-11-07
---

> **This is a living document.** Screenshots, keyboard flows, and behaviour descriptions should match the current build — refresh the images and the surrounding prose whenever the user-facing surface of research-text-adventure-ai changes.

# research-text-adventure-ai — user guide

> **This is a living document.** This project has no graphical UI yet — it is a library and a
> command-line tool — so this guide uses terminal output and diagrams in place of screenshots.

This guide is for someone who has never run this project before. It takes about ten minutes to
read and leaves you able to play the adventure yourself and understand what the experiment is
measuring.

## Concepts

Five nouns to hold in your head. `SPEC.md` Part 0 is the long version; this is the short one.

**Adventure.** The complete definition of one game — its rooms, objects, doors, actions and
goals. It is *pure data*: no logic, no code, just declarations the engine reads. *Not* a running
program, and *not* the thing under test.

**Kernel.** The pure engine: it takes the current state and one command and returns the next
state. It never guesses, never asks the model anything, and never changes its mind. *Not* a game
framework — it is small enough to read in one sitting.

**State.** Everything true right now: which room the agent is in, what it carries, which doors
are open. A plain value that can be printed and compared. *Not* a process.

**Observation.** The part of the state the agent is allowed to see. Deliberately *smaller* than
the state — the agent cannot see inside a closed locker. *Not* the state, and not a summary of it.

**Turn.** One action and its consequences. The kernel's only unit of time. *Not* a "round" of
anything.

## Getting started

**Prerequisites.** Node 20 or newer. Git. That is all the project itself needs; an LLM provider
key is only needed for the agent runs, and the mock provider needs none.

```sh
git clone https://github.com/gyrum-labs/research-text-adventure-ai.git
cd research-text-adventure-ai
npm install
```

**First launch.** Play the adventure yourself:

```sh
npm run play
```

You should see this:

```
Briefing Room
A windowless office. A desk, a wall notice, and a door south to the service corridor.
You can see: keycard, bulletin, desk
Exits: south → Service Corridor
Carrying: (nothing)
Objectives:
  - Disarm the bomb  [not done]
  - Recover the case  [not done]

> _
```

**Confirming it is healthy.** The suite is the check. It must be green before anything else is
trusted:

```sh
npm run check     # typecheck + lint + tests
```

## First use

The simplest end-to-end workflow: play the adventure, then watch a model attempt the same thing.

**Step 1 — play it.** Type commands at the `>` prompt. The ten commands that finish the mission:

```
take keycard · go corridor · open locker · take cutters · read manual
unlock vault door with keycard · go vault · cut yellow wire with cutters
unlock safe with 4821 · take case
```

**Step 2 — watch a model try.** The same adventure, the same engine, no extra help:

```sh
npm run agent -- --provider mock                    # offline, free, deterministic
npm run agent -- --provider anthropic --model claude-sonnet-4.5
```

**Step 3 — read the evidence.** Every run writes a transcript and a metrics file under `runs/`.
The transcript is the record you can check:

```
{"type":"header","scenario":"mission-impossible","provider":"anthropic","seed":7,…}
{"type":"command","turn":1,"raw":"take keycard","verb":"take","args":{"target":"keycard"}}
{"type":"events","turn":1,"data":[{"type":"action_succeeded","message":"You pocket the keycard."}]}
{"type":"state","turn":1,"hash":"sha256:…"}
```

And you can check it yourself — replaying a transcript re-runs its commands through the engine
and compares the hash chain:

```sh
npm run replay -- runs/<file>.jsonl
```

## Common workflows

| Flow | Command | What you get |
|---|---|---|
| Play the adventure | `npm run play` | The game at the terminal |
| Watch a model attempt it | `npm run agent -- --provider anthropic --model claude-sonnet-4.5` | A transcript and metrics under `runs/` |
| Run with no network or cost | `npm run agent -- --provider mock` | The same pipeline, deterministic |
| Check a recorded run | `npm run replay -- runs/<file>.jsonl` | Exit 0 if the engine reproduced the run exactly |
| Sweep the experiment matrix | `npm run sweep` | `results/summary.json` and `results/summary.md` |
| Read the docs in a browser | `pydocs .` | This repository's Markdown, with search and Mermaid |

For the full walkthrough of the experiment series, start at
[`experiments/README.md`](../experiments/README.md) — each experiment has its own README with the
idea, the tests and the acceptance criteria.

## Troubleshooting

**`npm run play` says the command is not found.**
The project is not installed yet. Run `npm install` in the repository root.

**The agent's first command is nonsense.**
Expected, and informative. That is why `invalidActionRate` is a metric: the agent is told what it
did wrong and gets another turn. If the run ends immediately, look for a `parse_error` event in
the transcript.

**`npm run agent` fails with an authentication error.**
The provider key is missing from the environment. Use `--provider mock` to exercise the whole
pipeline without a key, and check the key's environment variable name against the provider
adapter's documentation.

**The replay says the hash chain does not match.**
Something changed between the run and the replay — most often the adventure data itself, which is
hashed into the transcript header. If the adventure was edited, the old transcript legitimately no
longer replays. The transcript header records the adventure hash so this is detectable rather than
mysterious.

**A run ends with `budget_exhausted` and no clear failure.**
The agent used its turns without winning. The failure classifier will tell you which category it
fell into; look for `F5` (exploration failure) or `F7` (budget exhaustion).

**The docs viewer shows an old version of a document.**
Readers cache the index at startup. Restart the reader after adding or removing documents.
