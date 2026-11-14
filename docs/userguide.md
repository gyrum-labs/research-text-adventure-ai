<!-- page-version: 1.0.0 status: draft last-reviewed: 2026-11-08 -->

---
title: research-text-adventure-ai. User guide
status: living document
last-updated: 2026-11-07
---

> **This is a living document.** Screenshots, keyboard flows, and behaviour descriptions should match the current build. Refresh the images and the surrounding prose whenever the user-facing surface of research-text-adventure-ai changes.

# research-text-adventure-ai: user guide

*The hardest part of this project is not the agent. It is making a world in which an agent's
success and failure are both unambiguous. This guide is how you play in that world.*

> **This is a living document.** This project has no graphical UI yet. It is a library and a
> command-line tool. So this guide uses terminal output and diagrams in place of screenshots.

This guide is for someone who has never run this project before. It takes about ten minutes to
read and leaves you able to play the adventure yourself and understand what the experiment is
measuring.

## Concepts
> **Reader track**
>
> - **Five minutes.** Concepts and Getting started. You can play after that.
> - **Twenty minutes.** First use and Common workflows.
> - **An hour.** Troubleshooting as well, because it is where the real questions live.

Five nouns to hold in your head. `SPEC.md` Part 0 is the long version; this is the short one.

**Adventure.** The complete definition of one game. Its rooms, objects, doors, actions and
goals. It is *pure data*: no logic, no code, just declarations the engine reads. *Not* a running
program, and *not* the thing under test.

**Kernel.** The pure engine: it takes the current state and one command and returns the next
state. It never guesses, never asks the model anything, and never changes its mind. *Not* a game
framework. It is small enough to read in one sitting.

**State.** Everything true right now: which room the agent is in, what it carries, which doors
are open. A plain value that can be printed and compared. *Not* a process.

**Observation.** The part of the state the agent is allowed to see. Deliberately *smaller* than
the state. The agent cannot see inside a closed locker. *Not* the state, and not a summary of it.

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

**Step 1. Play it.** Type commands at the `>` prompt. The ten commands that finish the mission:

```
take keycard · go corridor · open locker · take cutters · read manual
unlock vault door with keycard · go vault · cut yellow wire with cutters
unlock safe with 4821 · take case
```

**Step 2. Watch a model try.** The same adventure, the same engine, no extra help:

```sh
npm run agent -- --provider mock                    # offline, free, deterministic
npm run agent -- --provider anthropic --model claude-sonnet-4.5
```

**Step 3. Read the evidence.** Every run writes a transcript and a metrics file under `runs/`.
The transcript is the record you can check:

```
{"type":"header","scenario":"mission-impossible","provider":"anthropic","seed":7,…}
{"type":"command","turn":1,"raw":"take keycard","verb":"take","args":{"target":"keycard"}}
{"type":"events","turn":1,"data":[{"type":"action_succeeded","message":"You pocket the keycard."}]}
{"type":"state","turn":1,"hash":"sha256:…"}
```

And you can check it yourself. Replaying a transcript re-runs its commands through the engine
and compares the hash chain:

```sh
npm run replay -- runs/<file>.jsonl
```

## Play and watch in the browser

Build the page and start the optional demo server:

```sh
npm run build:web
npm run serve
```

Open `http://127.0.0.1:8787/`. **Play** starts the game in browser memory. Type commands,
use the arrow keys for history, and type `reset` to start over. The status bar shows the
turn, goals and state hash.

Choose **Watch an agent**, select **Scripted reference run** or **Random agent**, then choose
**Start demo**. Observations and action messages appear as the server streams them. The final
status includes completed goals, outcome and hash. These demo policies make no model calls.

**Stop watching** disconnects the view; the bounded run may finish on the server. Switching back
to **Play** preserves your human game. If the server is unavailable, the page displays the error
and enables retry. See [`src/web/README.md`](../src/web/README.md) for the HTTP session configuration.

For a real model, set `OPENROUTER_API_KEY` and `AI_DEMO_MODEL` in the server environment.
Choose **AI agent** in Policy, then **Start AI run**. The view shows the model's actual
commands, feedback, token usage and final outcome. **Stop AI run** or switching to Play
cancels inference. Runs allow at most 20 turns, 30,000 tokens and 120 seconds; transcripts
are saved under `runs/browser/`. See the [AI server setup](../src/server/README.md#real-ai-demo)
for configuration, request limits and replay. The key stays on the server.

## Common workflows

Type `help` for the command forms accepted by the parser. Two-argument commands
use `with` between the target and the item or code. Parser errors and the model's
instructions use the same forms. Only the appropriate locks accept unlocking;
repeating an unlock reports that the object is already unlocked.
Visible items show whether they can be carried, and containers show their open or
locked state. Opening an open container reports that it is already open.

Use `examine <object>` to see an accessible object's public description. Use `read`
for written details; examining a manual does not reveal its unread contents. First-time
inspections count as progress. Repeating actions without changing gameplay state can
still stop an agent run as a loop; advancing the turn counter alone does not count.

| Flow | Command | What you get |
|---|---|---|
| Play the adventure | `npm run play` | The game at the terminal |
| Watch a model attempt it | `npm run agent -- --provider anthropic --model claude-sonnet-4.5` | A transcript and metrics under `runs/` |
| Run with no network or cost | `npm run agent -- --provider mock` | The same pipeline, deterministic |
| Check a recorded run | `npm run replay -- runs/<file>.jsonl` | Exit 0 if the engine reproduced the run exactly |
| Sweep the experiment matrix | `npm run sweep` | `results/summary.json` and `results/summary.md` |
| Plan the repeatability batch | `npx tsx src/cli/index.ts batch plan` | `runs/batch/plan.json`, with prices checked and dated |
| See what a batch would do | `npx tsx src/cli/index.ts batch dry-run` | The cells and their reservations. No model is called |
| Run the repeatability batch | `npx tsx src/cli/index.ts batch start` | Twenty runs, ten per world, every outcome kept |
| Report a finished batch | `npx tsx src/cli/index.ts batch report` | Dated findings with the fractions, costs and shortfalls |
| Read the docs in a browser | `pydocs .` | This repository's Markdown, with search and Mermaid |

For the full walkthrough of the experiment series, start at
[`experiments/README.md`](../experiments/README.md). Each experiment has its own README with the
idea, the tests and the acceptance criteria.

The 2026-11-13 batch ran twenty times across both worlds and is written up in
[`docs/batch-findings-2026-11-13.md`](batch-findings-2026-11-13.md); the same experiment was run
again on 2026-11-14 after the hotfix world's disclosure was corrected
([`docs/batch-findings-2026-11-14.md`](batch-findings-2026-11-14.md)), and a third time after the
gate accepted the ticket by its shown name
([`docs/batch-findings-third-run.md`](batch-findings-third-run.md)). Only `batch start` calls a
model; `plan`, `dry-run`, `status` and `report` read and write files.

> **Key takeaways**
>
> - The environment is the thing under suspicion. Build it first, and prove it.
> - The agent's view of the world is smaller than the world. That gap is the experiment.
> - One engine, three interfaces. A human run and an agent run mean the same thing.
> - The failure category is the finding. A bare success rate cannot tell you what to fix.
> - The organisation is the destination. The adventure is the rehearsal.

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
Something changed between the run and the replay. Most often the adventure data itself, which is
hashed into the transcript header. If the adventure was edited, the old transcript legitimately no
longer replays. The transcript header records the adventure hash so this is detectable rather than
mysterious.

**A run ends with `budget_exhausted` and no clear failure.**
The agent used its turns without winning. The failure classifier will tell you which category it
fell into; look for `F5` (exploration failure) or `F7` (budget exhaustion).

**The docs viewer shows an old version of a document.**
Readers cache the index at startup. Restart the reader after adding or removing documents.

The watcher prints each selected action as `> command` before the game response. This includes invalid attempts. The scripted and random demos make no model calls.
