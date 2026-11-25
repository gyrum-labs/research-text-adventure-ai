# The notepad: what the freeze is, and what to tell the agent

Field notes for staff · 2026-11-25 · follows warp#23366 and warp#23409

## In one paragraph

We give the agent a notepad instead of a transcript to read before each move.
On the hard level it is the best context we have tried, and the effect shows
up with a second model — but it has a characteristic failure: about half the
time, with one model, the agent reads the notepad and freezes into repeating
one useless move. This note shows the freeze from the recorded runs, states
what the agent is told about the notepad today (almost nothing), and sets out
what to tell it instead.

## The freeze, from the record

A typical freezing run (map arm, hotfix-2-4-1, seed 1, deepseek-v4-flash):

```
turn 0  read on-call board      OK   told: Release engineering holds the deploy
                                 credential and the release runbook.
turn 1  take incident ticket    OK
turn 2  go north                OK   now in Release Engineering
turn 3  examine incident ticket nothing new: "You take a good look at it."
turn 4  examine incident ticket nothing new
        -> loop guard stops the run
```

The first three moves are right. Then the agent examines a ticket it is
already carrying, three times, and is stopped. It is not forgetting that it
examined the ticket — the notepad's MOVES section lists it:

```
MOVES:
  1. read on-call board -> You read the on-call board. ON CALL. …
  2. take incident ticket -> You pick up the incident ticket.
  3. go north -> moved to Release Engineering
  4. examine incident ticket -> You take a good look at the incident ticket.
```

It repeats the move anyway. So this is not a memory failure. It is a "what
next" failure, and the notepad the agent was reading shows why:

```
YOU ARE AT: Release Engineering
CARRYING: incident ticket

OBJECTS KNOWN:
  - incident ticket, carried
  - on-call board, readable
  - shared inbox, closed
  - release-2.3.9
  - release-2.4.0
  - release-2.4.1
  - release gate

WHAT YOU HAVE BEEN TOLD:
  - You read the on-call board.
  - ON CALL. Release engineering holds the deploy credential and the release
    runbook. …
  - You pick up the incident ticket.
  - You take a good look at the incident ticket.
```

Read it as the agent must. It has been told the deploy credential and the
runbook are in this room. The objects list does not contain either. The one
object that could be hiding them is written as `shared inbox, closed` — which
reads as a fact, not as a lead. The agent is stuck between "they are here"
and "I cannot see them", and it goes looking in the only thing it can act on:
the ticket in its hand.

Two gaps in the notepad cause this:

1. **A lost affordance.** The inbox is a container that can be opened. The
   notepad reduces it to the word `closed`. The system prompt does say "Only
   containers can be opened", but the notepad never says which objects are
   containers.
2. **No leads.** The notepad states what is known and what was tried. It
   never states the open question: *you were told X is here, you have not
   found it, here is what you have not opened.*

## What the agent is told about the notepad today

Exactly one line, in the system prompt:

> You are shown a notepad of the world as you know it: every connection,
> object and told fact stated once, with one line per move.

The agent is not told that the notepad is its memory, that it should read it
instead of re-examining things, or what to do when the next move is not
obvious. And it cannot write in it: the notepad is built for it, from its
observations. The generic rules ("avoid repeating inspections that give no
new information") are there, but they are rules, not a method.

## What to tell it instead — two steps

### Step 1 — a notepad that states its affordances and its leads

Keep the notepad system-built, so it stays deterministic and testable. Change
what it says:

- **Objects keep their affordances.** `shared inbox — container, closed, not
  opened yet` instead of `shared inbox, closed`.
- **A LEADS section.** For every told fact naming a thing the agent has not
  found, say so and point at what is unopened in the current room:

  ```
  LEADS:
  - Told: Release engineering holds the deploy credential and the release
    runbook. Neither is in OBJECTS KNOWN yet.
  - Not opened here: shared inbox.
  ```

- **An instruction that teaches the method.** Replace the one line with:

  > ## Your notepad
  > Each turn you are shown your notepad. It is your only memory of this
  > building: treat it as what you know, and do not examine or read something
  > again to remind yourself — the answer is already on the notepad under
  > MOVES.
  > - OBJECTS lists what each thing can do. A thing marked *container* can be
  >   opened; its contents appear once it is open.
  > - LEADS lists what you were told is here but have not found. When you are
  >   unsure what to do next, take the first lead: open what has not been
  >   opened, read what is readable and unread.
  > - Before you repeat any move, check MOVES: if it is already listed and
  >   nothing has changed since, it will give you the same answer. Choose a
  >   different move.

This step is small, needs no change to how the agent replies, and can be
measured against the current notepad with the same ten-seed harness.

### Step 2 — let the agent keep its own notes

The notepad is currently written *to* the agent. The stronger version lets
the agent write in it. This is the design to try after Step 1, and it needs
one addition to the reply format: an optional second line.

System prompt addition:

> ## You have been here before
> You have walked this building before, but you cannot remember it. Each turn
> you remember only what is written on your notepad. Nobody else writes on it:
> you do, and it is kept for you word for word.
>
> At the end of your reply you may add one line, `NOTES:`, and whatever you
> write there is copied to the top of your notepad for your next turn, exactly
> as you wrote it. You may rewrite it at any time — your newest note replaces
> the old one.
>
> Use it for what you will need and cannot otherwise keep: what you came for
> and what is still outstanding; what you found and where; what you tried and
> what came back; and the next thing you intend to try. Write it for a
> colleague who wakes up here tomorrow with your notepad and nothing else.
>
> When you do not know what to do, read your own note first, then the notepad.

Reply format:

```
COMMAND: <one command>
NOTES: <one line, optional>
```

What this buys over Step 1: the agent records *intent* ("open the inbox
next: the runbook should be inside"), which no system-built notepad can
infer. What it costs: the note can be wrong, and a wrong note is carried
forward with the agent's full confidence. That is the thing to watch in the
transcripts.

## What the measurements say so far

Ten seeds per arm, hotfix-2-4-1, fixed strategy (`strategy-followups-2026-11-25.md`):

| Model | Baseline (structured) | Notepad (map) | Loops in the notepad arm |
|---|---|---|---|
| deepseek-v4-flash | 1 / 10 | 3 / 10 | 6 of 10, five of them on turn 5 |
| glm-5.3-flash | 2 / 10 | 6 / 10 | none |

Three things to hold together:

- The notepad is the better context in both models. Pooled, it solves 9 of
  20 against the baseline's 3 of 20 (Fisher p = 0.08); either model alone is
  still within what ten runs can produce by chance (deepseek p = 0.58, GLM
  p = 0.17). It is a consistent direction, not a proven effect.
- The freeze is a deepseek behaviour in our data. GLM, reading the same
  notepad, did not loop — it ran out of turns or solved. So the notepad's
  gaps are real, and whether they bite depends on the model.
- Individual runs do not repeat: same code, same seed, different outcome.
  Compare rates, never single runs.

## The experiment that would settle Step 1

Same harness, one new arm, one changed thing. Arms: the current notepad, and
the Step 1 notepad (affordances, leads, instruction). Both models, ten seeds,
hotfix-2-4-1. What would count as evidence:

- The turn-5 loops in the deepseek notepad arm fall, and
- the notepad's solve rate against the baseline clears the interval overlap
  that ten runs cannot clear today — which may need twenty seeds per arm.

The harness is ready: `batch --strategy <name>` makes the notepad the
variable, and the recorded plans prove nothing else moved.

## What is measured and what is proposed

Measured: the freeze (from recorded transcripts), the one line the agent is
told, the solve rates above, the lack of run-by-run repeatability.
Proposed and not yet built: both steps above. Neither has been run.
