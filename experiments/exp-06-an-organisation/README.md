# Experiment 06 — An Organisation

> **The one idea:** the adventure vocabulary has to survive contact with a real organisation — or
> the whole idea was a metaphor that does not pay.

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

The same agent harness, the same prompts, the same budgets — pointed at a different world:

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
   categories as in the game, the taxonomy transfers — and the game was a valid rehearsal.

## The tests, in the order they get written

- **`git diff --stat src/kernel` is empty.** The kernel is untouched. This is the experiment's
  central assertion, and it is a test, not a promise.
- the organisation's gold path wins, and BFS confirms it is shortest
- the random policy fails on this world too
- the failure classifier classifies organisation failures without modification — if it needs a new
  category, that is a finding, and it gets written down
- the organisation adventure is reachable in every dimension (no dead ends)

## Acceptance criteria

- [ ] The organisation adventure is authored with **no change to `src/kernel`** — enforced by a
      test that fails if the kernel's diff is non-empty
- [ ] Its gold path wins; BFS confirms it is shortest; the random policy fails
- [ ] The same agent harness runs it with no code change
- [ ] `RESULTS.md` compares the two worlds: success rate, failure histogram, cost
- [ ] A one-page "what this means for running an organisation" section is written

## The honest reading

If this experiment fails — if the organisation cannot be written as an adventure without bending
the kernel — then the game was still worth building, because we now know where the metaphor
breaks, and we know exactly how much machinery a real organisation simulation would need. That is
a more useful answer than an untested assumption that it would work.

## Reference

- `SPEC.md` §18 (roadmap to organisation simulation), §16 Phase 7
- `docs/RESEARCH-CONTEXT.md` §4.4 (Voyager's skill library) and §4.5 (WebArena)
