<!-- page-version: 1.0.0 status: draft last-reviewed: 2026-11-08 -->

# Experiment 06: An Organisation

*The whole point of writing an organisation as an adventure is that it might not work. If the
metaphor survives the transfer, the game was a rehearsal. If it does not, we learn exactly how
much machinery a real simulation would need.*


> **The one idea:** the adventure vocabulary has to survive contact with a real organisation. Or
> the whole idea was a metaphor that does not pay.

> **Reader track**
>
> - **Ten minutes.** The mapping table and the central assertion.
> - **Thirty minutes.** The tests, especially the one that fails if the kernel changed.

## What you are building

An organisation, written as an adventure. **The kernel does not change.** That is the test.

| Kernel | Adventure | Organisation |
|---|---|---|
| Room | Service Corridor | A team, a queue, a system |
| Object | Wire cutters | A ticket, an artefact, a credential |
| Door | The vault door | A handoff, a dependency, an escalation |
| Flag | `bomb_defused` | Ticket status, budget consumed, SLA state |
| Goal | Disarm the bomb | An assigned objective |
| Observation | The room description | "Your dashboard": your queue, your blockers, your standing instructions |
| Command | `take keycard` | A tool call: read a ticket, post a comment, deploy |

## How to run it

```sh
npm run exp:06
```

## What you should see

The same agent harness, the same prompts, the same budgets. Pointed at a different world:

```
TASK: release the 2.4.1 hotfix before the customer SLA expires.
  rooms:   platform, release-engineering, customer-success
  objects: incident-ticket, hotfix-branch, approval, chris
  doors:   platform → release-engineering (needs incident-ticket)
           release-engineering → customer-success (needs approval)
  goals:   ship the hotfix · notify the customer
```

And then the same two questions we asked of the game:

1. **Can it finish?** The success rate, the histogram, the cost.
2. **Does it fail the same way?** If the failure categories in the organisation are the same
   categories as in the game, the taxonomy transfers. And the game was a valid rehearsal.

The measured answer:

```
world                scripted    turns   random baseline
-------------------  ----------  ------  ---------------
mission-impossible   success     10      0/20 solved
hotfix-2-4-1         success     10      0/20 solved
```

## The tests, in the order they get written

- **The kernel's file hashes match its manifest.** The kernel is untouched. This is the
  experiment's central assertion, and it is a test, not a promise.
- the kernel mentions no organisation vocabulary, so it has not been tuned to either world
- the organisation's gold path wins, and BFS confirms it is shortest
- the random policy fails on this world too
- the failure classifier classifies organisation failures without modification. If it needs a new
  category, that is a finding, and it gets written down
- the organisation adventure is reachable in every dimension (no dead ends)

## Acceptance criteria

- [x] The organisation adventure is authored with **no change to `src/kernel`**. Enforced by a
      test that fails if the kernel's diff is non-empty
- [x] Its gold path wins; BFS confirms it is shortest; the random policy fails
- [x] The same agent harness runs it with no code change
- [x] `RESULTS.md` compares the two worlds: success rate, failure histogram, cost
- [x] A one-page "what this means for running an organisation" section is written

## What we found

> **Key insight.** The vocabulary transfers, and the constraint it found is worth more than the
> transfer: **two actions with the same verb must agree on their argument shapes**, because the
> parser resolves the arguments before the engine chooses between the candidate actions.

The organisation wanted one `unlock` that took a held object and another that took a typed code,
and it could not have both. The first world never found this, because it never had two actions
that wanted different shapes. It would have been invisible in a single-world project.

### The world changed more than the nouns

| | The game | The organisation |
|---|---|---|
| Verbs | `take`, `cut`, `unlock` | `claim`, `deploy`, `unlock` |
| The flag a verb asks for | `takeable` | `claimable` |
| The credential | a keycard in the bag | the incident ticket in the bag |
| The gated action | cut one of three wires | deploy one of three releases |
| The failure | the bomb goes off | the wrong release goes out |

The kernel's object type has a fixed set of fields, so the organisation's `claimable` flag lives
in the runtime state, where the flags are free-form, and the kernel reads whatever key the action
asks for. No kernel change was needed, and the manifest proves it.

### The taxonomy transfers; the distributions do not

Every failure in both worlds landed in one of the existing nine categories, and the classifier
needed no new rule to sort them. That is the transfer claim.

The proportions are different, and that is a finding about the worlds rather than about the
taxonomy. The game's random baseline spread across `F3`, `F4` and `F5`; the organisation's
spread entirely across `F5`. Its chain is harder to get wrong early, because every gate names
what it wants, and a random agent mostly fails by never finding the runbook at all.

## The honest reading

If this experiment fails. If the organisation cannot be written as an adventure without bending
the kernel. Then the game was still worth building, because we now know where the metaphor
breaks, and we know exactly how much machinery a real organisation simulation would need. That is
a more useful answer than an untested assumption that it would work.

## Reference

- `SPEC.md` §18 (roadmap to organisation simulation), §16 Phase 7
- `docs/RESEARCH-CONTEXT.md` §4.4 (Voyager's skill library) and §4.5 (WebArena)
- `RESULTS.md`. What the whole series found
