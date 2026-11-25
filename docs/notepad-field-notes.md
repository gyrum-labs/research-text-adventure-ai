# The notepad: what the freeze is, and what to tell the agent

Field notes for staff, 2026-11-25. Follows warp#23366 and warp#23409. Read from
the record that survived, at revision `1480db6`, world 1.0.5.

## In one paragraph

We give the agent a notepad instead of a transcript to read before each move.
With one model it has a characteristic failure: half the time the agent reads
the notepad, goes to the right room, and then examines the ticket in its hand
twice, and the run is ended by the loop guard with fourteen turns left. This
note shows the freeze from the recorded runs, separates what the model did
from what the runner did, states what the agent is told about the notepad
today (one line), and sets out what to tell it instead.

## The freeze, from the record

Five of the ten notepad runs (hotfix-2-4-1, deepseek-v4-flash, seeds 2, 4, 5, 6
and 10) are the same run:

```
turn 0  read on-call board      told: Release engineering holds the deploy
                                 credential and the release runbook.
turn 1  take incident ticket    told: You pick up the incident ticket.
turn 2  go north                moved to Release Engineering
turn 3  examine incident ticket told: You take a good look at the incident ticket.
turn 4  examine incident ticket told: You take a good look at the incident ticket.
        -> the loop guard ends the run: "returned to the same state 3 times
           in a row"
```

The first three moves are right. Then the agent examines a ticket it is
already carrying, twice, and the runner ends the run.

The notepad it was reading before turn 3, rendered again from the code that
made the record:

```
MAP:
  Platform On-call
    north -> Release Engineering
  Release Engineering  <- you are here
    south -> Platform On-call
    east -> Customer Success (locked)
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
OBJECTIVES:
  - Ship the 2.4.1 hotfix [not done]
  - Notify the customer [not done]
WHAT YOU HAVE BEEN TOLD:
  - You read the on-call board.
  - ON CALL. Release engineering holds the deploy credential and the release
    runbook. The customer success handover is sealed with an approval code.
  - You pick up the incident ticket.
MOVES:
  1. read on-call board -> You read the on-call board. ON CALL. Release
     engineering holds the deploy credential and the release runbook. ...
  2. take incident ticket -> You pick up the incident ticket.
  3. go north -> moved to Release Engineering
```

Read it as the agent must. It has been told the deploy credential and the
runbook are in this room. The objects list does not contain either. The one
object that could be hiding them is written as `shared inbox, closed`, which
reads as a fact and not as a lead. The agent is stuck between "they are here"
and "I cannot see them", and it goes looking in the only thing it can act on:
the ticket in its hand.

Two gaps in the notepad cause this:

1. **A lost affordance.** The inbox is a container that can be opened. The
   notepad reduces it to the word `closed`. The system prompt does say "Only
   containers can be opened", but the notepad never says which objects are
   containers.
2. **No leads.** The notepad states what is known and what was tried. It never
   states the open question: *you were told X is here, you have not found it,
   here is what you have not opened.*

## Two things happened, and only one was the model

The freeze as recorded is two things together.

- **What the model did.** It repeated a look that had already told it the same
  thing. That is a real failure of the model, and it is what Step 1 below is
  for.
- **What the runner did.** It ended the run on the third turn in a row that
  left the state unchanged. A look and a refused command both leave the state
  unchanged. The count starts again whenever the agent moves or changes
  something, so after arriving in a room an agent has two more turns there,
  and the third ends the run. The agent had fourteen turns left.

The second is the measuring instrument, not the model. The owner has decided
that the guard will record repeats and no longer end a run (warp#23474).
Under that rule this run would have gone on, and the freeze would be read as
turns spent without a change instead of as an ending.

**After a carried thing could be read (world 1.0.6).** The turn-5 freeze did
not appear in the re-record on the fixed world. The same guard ended nine of
the ten notepad runs all the same, later: at a median of six turns left, most
of them after `examine release gate`. In one of those runs the world had said
"The release gate is shut. It wants the incident ticket." one turn earlier.
Those runs are a separate recording and are not pooled with the table below.

## What the agent is told about the notepad today

Exactly one line, in the system prompt:

> You are shown a notepad of the world as you know it: every connection,
> object and told fact stated once, with one line per move.

The agent is not told that the notepad is its memory, that it should read it
instead of re-examining things, or what to do when the next move is not
obvious. And it cannot write in it: the notepad is built for it, from its
observations. The general rules are there ("Use descriptions already provided;
avoid repeating inspections that give no new information"), but they are
rules, not a method.

## What to tell it instead: two steps

### Step 1: a notepad that states its affordances and its leads

Keep the notepad system-built, so it stays deterministic and testable. Change
what it says:

- **Objects keep their affordances.** `shared inbox, container, closed, not
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
  > again to remind yourself. The answer is already on the notepad under
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

### Step 2: let the agent keep its own notes

The notepad is currently written *to* the agent. The stronger version lets the
agent write in it. This is the design to try after Step 1, and it needs one
addition to the reply format: an optional second line.

System prompt addition:

> ## You have been here before
> You have walked this building before, but you cannot remember it. Each turn
> you remember only what is written on your notepad. Nobody else writes on it:
> you do, and it is kept for you word for word.
>
> At the end of your reply you may add one line, `NOTES:`, and whatever you
> write there is copied to the top of your notepad for your next turn, exactly
> as you wrote it. You may rewrite it at any time: your newest note replaces
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

The sandbox already works this way. A staff member there keeps a notebook of
their own, in their own folder, and it is handed from shift to shift
(`docs/staff-sandbox.md`, on the sandbox branch). The page game's notebook,
written with `line+`, `line-` and `line=` on the reply, is planned and not
built.

## What the measurements say

Ten seeds per arm, hotfix-2-4-1 at 1.0.5, the limits as they were
(`strategy-followups-2026-11-25.md`):

| Model | Structured context | Notepad | Ended by the guard, notepad arm | Turns with no command, notepad arm |
|---|---|---|---|---|
| deepseek-v4-flash | 0 / 10 | 1 / 10 | 5 of 10, all on turn 5 | 5 of 109 |
| glm-5.3-flash | 2 / 10 | 8 / 10 | none | 33 of 157 |

Four things to hold together:

- Under the first model nothing can be said for the notepad: 1/10 against
  0/10, Fisher p = 1.00.
- Under the second model the notepad looked better, 8/10 against 2/10
  (p = 0.023). That result is withdrawn. The model reasons before it answers,
  and the 300-token output cap paid for the reasoning first: 37 per cent of
  the structured arm's turns came back with no command, and 21 per cent of the
  notepad arm's. With the cap alone raised to 1,500 on the next world version,
  the same seeds gave 10/10 and 8/10.
- The freeze is a deepseek behaviour in our data, and it has two parts, as
  above. GLM, reading the same notepad, never repeated a look into the guard.
- Individual runs do not repeat: same code, same seed, a different ending.
  Compare rates, never single runs.

## The experiment that would settle Step 1

Same harness, one new arm, one changed thing. Arms: the current notepad, and
the Step 1 notepad (affordances, leads, instruction). Both models, ten seeds,
hotfix-2-4-1.

It has to be run under the new limits (warp#23474). With the guard ending
runs, a freeze and an ending are the same event and cannot be told apart. With
the output cap at 300, one of the two models loses a fifth to two fifths of
its turns before it plays.

What would count as evidence under those limits:

- The first model's turns spent without a change fall in the Step 1 arm, and
- the notepad's solve rate against the structured context separates by more
  than ten runs can, which may need twenty seeds per arm.

The harness is ready: `batch --strategy <name>` makes the context the
variable, and the recorded plans show nothing else moved.

## What is measured and what is proposed

Measured: the freeze (five identical recorded runs), the page the agent was
shown (rendered again from the record's own revision), the one line the agent
is told, the solve rates above, the lack of run-by-run repeatability, and the
runner's part in the ending.

Proposed and not yet built: both steps above. Neither has been run.
