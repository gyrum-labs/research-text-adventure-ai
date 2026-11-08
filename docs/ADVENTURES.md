<!-- page-version: 1.0.0 status: draft last-reviewed: 2026-11-08 -->

# Adventure Authoring Guide

How to write an adventure for the kernel. The Mission Impossible adventure itself is specified in
`SPEC.md` §7. This document explains the *mechanics* you use to express it, and shows a worked
example.

An adventure is **pure data**. It contains no logic. Everything it can do is declared through the
predicate/effect vocabulary in `SPEC.md` §5.1.

---

## 1. The shape of an adventure file

```ts
import type { Adventure } from '../../kernel/types';

export const adventure: Adventure = {
  id: 'mission-impossible',
  title: 'Operation Nightingale',
  version: '1.0.0',

  brief: `Mission brief. A booby-trapped case is locked in the server vault. You have two
objectives: disarm the bomb, and recover the case. Nothing else is known. You are in the
briefing room. Discover the rest by exploring.`,

  outcomeText: {
    success: 'The bomb is dead and the case is in your hands. Exfiltration complete.',
    failure: 'The blast takes the vault with it. Mission failed.',
  },

  rooms: { /* … */ },
  objects: { /* … */ },
  doors: { /* … */ },
  actions: [ /* … */ ],
  goals: [ /* … */ ],
  hints: [ /* … */ ],
  initial: { /* … */ },
};
```

**The brief is the only mission-level information the agent receives.** It states the objectives
and nothing about the method. `tests/leakage.test.ts` enforces the boundary; see §7.

---

## 2. Nodes, objects and doors

### Nodes

```ts
rooms: {
  corridor: {
    id: 'corridor',
    name: 'Service Corridor',
    description: 'A narrow corridor lined with dented lockers. A fluorescent tube flickers overhead.',
    contents: ['locker', 'extinguisher'],
    exits: ['corridor_to_briefing', 'corridor_to_vault'],
  },
}
```

`contents` lists the objects present when the agent arrives. `exits` lists door ids.

### GameObjects

```ts
objects: {
  locker: {
    id: 'locker',
    name: 'locker',
    aliases: ['metal locker', 'lockers'],
    description: 'A tall steel locker with a dented door.',
    container: { closed: true, contains: ['cutters', 'manual'] },
  },
  manual: {
    id: 'manual',
    name: 'defusal manual',
    aliases: ['manual', 'booklet', 'instructions'],
    description: 'A stapled booklet, swollen with damp.',
    readable: true,
    detail: `DEFUSAL PROCEDURE. Safe combination: 4821. The safe wire is the YELLOW one.
Do not cut the others.`,
  },
}
```

Notes:
- `description` is what the agent sees on arrival or in the visible list.
- `detail` is what `read` or `examine` reveals. **This is the only way to disclose a fact that the
  agent must discover.** Putting the safe code in the manual's `detail` is what makes reading the
  manual a hard gate.
- `aliases` are declared by the author and are the *only* strings the parser may resolve loosely.
- `container.contents` is hidden while `closed` is true. The agent sees that the locker is closed,
  not what is inside.

### Connections

```ts
doors: {
  corridor_to_vault: {
    id: 'corridor_to_vault',
    from: 'corridor',
    to: 'vault',
    direction: 'north',
    label: 'vault door',
    locked: true,
    requiresAction: { verb: 'unlock', object: 'keycard' },
  },
}
```

A locked door refuses traversal until an action sets the matching flag. The door's
`label` is how it appears in the exits list, and how `go` resolves it.

---

## 3. Actions

Every action is an `ActionSpec` with arguments, preconditions, effects and prose.

```ts
{
  verb: 'take',
  synonyms: ['get', 'grab', 'pick up'],
  args: [{ name: 'target', role: 'object-in-room' }],
  requires: [{ op: 'object_in_room', object: 'keycard', room: 'briefing' }],
  effects: [
    { op: 'remove_entity_from_node', object: 'keycard' },   // see §5 for the actual op set
    { op: 'add_to_inventory', object: 'keycard' },
  ],
  text: {
    success: 'You pocket the keycard.',
    failure: "You can't take that.",
  },
}
```

The canonical op and predicate sets are fixed by `SPEC.md` §5.1:

**Predicates:** `at`, `entity_at`, `in_inventory`, `flag`, `entity_flag`, `goal_complete`
**Effects:** `move`, `set_flag`, `set_entity_flag`, `set_entity_at`, `add_inventory`,
`remove_inventory`, `set_entity_state`, `finish`

If a mechanic you need cannot be expressed with these, **extend the kernel deliberately and record
an ADR** (`docs/ARCHITECTURE.md` §4). Do not smuggle logic into an adventure.

### 3.1 Worked examples of each mechanic

**Reading something (reveals a fact):**

```ts
{
  verb: 'read',
  synonyms: ['study', 'peruse'],
  args: [{ name: 'target', role: 'object-in-room' }],
  requires: [{ op: 'object_flag', object: 'manual', key: 'readable', value: true }],
  effects: [{ op: 'set_object_flag', object: 'manual', key: 'read', value: true }],
  text: {
    success: 'You read the defusal manual. Safe combination: 4821. The safe wire is the YELLOW one.',
    failure: "There's nothing written on that.",
  },
}
```

The fact is now in the game state *and* in the transcript, so the agent can refer to it later.

**Unlocking a door with a key:**

```ts
{
  verb: 'unlock',
  args: [
    { name: 'target', role: 'object-in-room' },
    { name: 'with', role: 'text' },
  ],
  requires: [
    { op: 'object_in_room', object: 'keycard', room: 'briefing' },
    { op: 'flag', key: 'has_keycard', value: true },
  ],
  effects: [{ op: 'set_object_flag', object: 'vault_door', key: 'unlocked', value: true }],
  text: {
    success: 'The keycard chirps and the vault door clicks open.',
    failure: 'The vault door needs a keycard. You do not have one.',
  },
}
```

**A code lock (the safe):**

```ts
{
  verb: 'unlock',
  // same verb, distinguished by a `requires` on the object flag
  requires: [
    { op: 'object_in_room', object: 'safe', room: 'vault' },
    { op: 'flag', key: 'manual_read', value: true },
  ],
  effects: [{ op: 'set_object_flag', object: 'safe', key: 'open', value: true }],
  text: {
    success: '4821. The safe clicks open.',
    failure: 'The safe needs a four-digit code. You do not have one.',
  },
}
```

> **Note.** When two actions share a verb, the reducer picks the first whose `requires` all hold,
> and whose arguments resolve. Order actions in the file from most specific to least. The code
> check for the safe should be a distinct verb (`enter <code>`) if the two `unlock` uses become
> ambiguous. `SPEC.md` §8.1 lists `enter` as the intended verb for codes.

**A lethal action. The trap:**

```ts
{
  verb: 'cut',
  args: [
    { name: 'target', role: 'object-in-room' },
    { name: 'with', role: 'object-in-inventory' },
  ],
  requires: [
    { op: 'carrying', object: 'cutters' },
    { op: 'flag', key: 'manual_read', value: true },   // the manual is a hard gate
    { op: 'object_flag', object: 'bomb', key: 'wire_is_yellow', value: true },
  ],
  effects: [
    { op: 'set_flag', key: 'bomb_defused', value: true },
  ],
  text: {
    success: 'The yellow wire parts with a snap. The display settles to zeros.',
    failure: 'You cut the wrong wire.',
  },
}
```

And the failure of the wrong wire is expressed by a **second action spec** whose `effects` include
`{ op: 'finish', outcome: 'failure', reason: '...' }`.

**The ordering trap**, cutting before reading the manual, is the same `cut` action with a
`requires` on `manual_read`. Because the preconditions fail, the reducer emits `action_failed`
and the state does not change: **a recoverable mistake**, not a loss. Contrast with cutting the
wrong wire, which is irreversible.

That distinction, recoverable failure vs irreversible failure, is the single most important
lever for making an adventure hard but fair, and it is worth getting right in every adventure you
write.

---

## 4. Goals

Goals are graded on the **end state**, not the path (ADR-009):

```ts
goals: [
  {
    id: 'disarm',
    text: 'Disarm the bomb',
    requires: [{ op: 'flag', key: 'bomb_defused', value: true }],
    achievedWhen: [{ op: 'flag', key: 'bomb_defused', value: true }],
  },
  {
    id: 'recover',
    text: 'Recover the case',
    requires: [{ op: 'flag', key: 'case_recovered', value: true }],
    achievedWhen: [{ op: 'flag', key: 'case_recovered', value: true }],
  },
]
```

`text` is **disclosed to the agent**. It is the objective. `achievedWhen` is the success check.
A run succeeds only when every goal is achieved.

---

## 5. Hints

Hints are a last-resort affordance, identical across all experimental conditions, and every use is
recorded as `hintsUsed`.

```ts
hints: [
  { id: 'h1', text: 'Maintenance lockers are usually not locked.' },
  { id: 'h2', text: 'A defusal manual would say which wire to cut.' },
  { id: 'h3', text: 'The vault needs a keycard, not a code.' },
]
```

A hint must be **true and vague**. It must not name the object to act on, the correct order, or the
solution. "The defusal manual is in the corridor locker" is a hint; "read the manual then cut the
yellow wire" is a spoiler and must never be a hint.

---

## 6. Initial state

```ts
initial: {
  roomId: 'briefing',
  inventory: [],
  objects: {
    keycard: { at: 'briefing', flags: {}, state: {} },
    manual:  { at: null, flags: {}, state: {} },   // null = inside the locker
    // …
  },
  flags: {},
  turn: 0,
  hintsLeft: 3,
  status: 'running',
}
```

GameObjects inside a container have `at: null`; opening the container sets their `at` to the current
room and closing it sets it back to `null`.

---

## 7. The authoring checklist

Before an adventure is accepted, every box must be ticked:

- [ ] **Brief states objectives, not method.** No object names, no order, no solution.
- [ ] **Every fact the agent needs is discoverable in-world** (a readable, an examinable detail, or
      an observable). Nothing required is only in the brief.
- [ ] **At least one fact requires reading.** Otherwise the task reduces to a navigation problem.
- [ ] **The gold path exists and is recorded** in the adventure's `gold-path.ts`.
- [ ] **BFS confirms the gold path is shortest.** (`SPEC.md` P1.3)
- [ ] **A random policy cannot solve it.** (`SPEC.md` P1.4) If it can, the adventure is too easy.
- [ ] **There is at least one recoverable failure** (wrong order, missing prerequisite) and at
      least one irreversible one. Or a deliberate, documented decision not to.
- [ ] **No brute-force path exists** within the turn budget. A 4-digit code with 30 turns is safe;
      a 2-digit code is not.
- [ ] **The adventure loads under Zod validation** and fails fast with a readable message if not.
- [ ] **It contains no adventure-specific logic.** Only data.

---

## 8. Writing the second adventure (Phase 7)

The organisation-simulation adventure is written with the same vocabulary. The mapping is in
`SPEC.md` §18.1; in brief:

| Kernel term | Organisation term |
|---|---|
| Room | A team, a system, a queue |
| GameObject | A ticket, an artefact, a credential, a message |
| Door | A handoff, a dependency, an escalation path |
| Flag | Ticket status, budget consumed, SLA state |
| Goal | An objective or KPI |
| Observation | "Your dashboard": your queue, your blockers, your standing instructions |
| Command | A tool call |

**The test is simple:** if writing the second adventure requires a change to `src/kernel`, the
kernel was not truly adventure-native, and ADR-002 was wrong. That is the whole point of Phase 7.

---

## 9. Checklist for the author

The fastest way to catch a leak is to ask, for each required fact:

> *Can the agent learn this without being told?*

If the answer is no, because the fact only exists in `requires`/`effects` or in the gold path,
the adventure is broken, and `tests/leakage.test.ts` will say so.
