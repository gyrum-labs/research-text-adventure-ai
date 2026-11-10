/*
 * Kernel types — the whole vocabulary of the engine.
 *
 * The kernel speaks the adventure's language: rooms, objects, doors, flags,
 * actions, goals, turns. It never mentions anything specific to one
 * adventure — the Mission Impossible scenario is data that happens to use
 * these words.
 *
 * Everything here is plain data. The engine is `reduce()` in `reduce.ts`.
 */

export type Id = string;

// ---------------------------------------------------------------------------
// Adventure — a complete game definition. Pure data; no logic.
// ---------------------------------------------------------------------------

export interface Adventure {
  id: string;
  title: string;
  version: string;
  /** The mission briefing. Given to the agent verbatim. Must not reveal the solution. */
  brief: string;
  /** Shown when the adventure is solved or failed. */
  outcomeText: { success: string; failure: string };
  rooms: Record<Id, Room>;
  objects: Record<Id, GameObject>;
  doors: Record<Id, Door>;
  actions: ActionSpec[];
  goals: GoalSpec[];
  hints: HintSpec[];
  /** The codes in play in this adventure. The oracle searches them; the agent
   *  still has to read them somewhere. */
  codes?: string[];
  initial: GameState;
}

export interface Room {
  id: Id;
  name: string;
  /** Prose shown on arrival. */
  description: string;
  /** Object ids present in this room. */
  contents: Id[];
  /** Door ids leading out of this room. */
  exits: Id[];
}

export interface GameObject {
  id: Id;
  name: string;
  /** Extra words that resolve to this object (e.g. "cutter", "pliers"). */
  aliases?: string[];
  description: string;
  /** Rendered only when `examine`d or `read` — may reveal detail not in `description`. */
  detail?: string;
  /** Container semantics: opening reveals `contains`. */
  container?: { closed: boolean; contains: Id[] };
  /** Readable: `read` yields `detail`. */
  readable?: boolean;
  /** Takeable: the object can be picked up and carried. */
  takeable?: boolean;
}

export interface Door {
  id: Id;
  from: Id;
  to: Id;
  /** Direction word shown to the player, e.g. "north", "back", "side door". */
  direction: string;
  label: string;
  /** If set, traversing requires an action (e.g. `unlock`) with this object. */
  requiresAction?: { verb: string; object: Id };
  /** If true, traversal is refused until the named object carries the `unlocked` flag. */
  locked?: boolean;
  /** Message shown when traversal is refused. */
  lockedMessage?: string;
}

export interface ActionSpec {
  /** Canonical verb, e.g. "take". */
  verb: string;
  /** Player-facing synonyms, e.g. ["get", "grab"]. */
  synonyms?: string[];
  /** Argument shapes. The role constrains where an argument may be resolved from. */
  args: ArgSpec[];
  /** All must hold for the action to succeed. */
  requires: Predicate[];
  /** Applied on success. */
  effects: Effect[];
  /** Prose for success and failure. `{arg}` interpolates the resolved argument. */
  text: { success: string; failure: string };
}

export type ArgSpec = {
  name: string;
  role: 'room' | 'object' | 'object-in-room' | 'object-in-inventory' | 'text';
};

export interface GoalSpec {
  id: Id;
  /** Mission text. Disclosed to the agent — the objective, not the method. */
  text: string;
  requires: Predicate[];
  /** True when the agent has demonstrably achieved it. */
  achievedWhen: Predicate[];
}

export interface HintSpec {
  id: Id;
  /** The fact revealed. Deliberately vague — a nudge, not the answer. */
  text: string;
}

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

export interface GameState {
  roomId: Id;
  inventory: Id[];
  /** Per-object runtime facts: where it is, and mutable flags. */
  objects: Record<Id, GameObjectState>;
  /** World-level facts (e.g. `bomb_defused`). */
  flags: Record<string, boolean>;
  /** Turn counter. The kernel's only notion of time. */
  turn: number;
  /** Remaining hint credits. */
  hintsLeft: number;
  status: 'running' | 'success' | 'failure';
}

export interface GameObjectState {
  /** Room id, or null when the object is inside a closed container or carried. */
  at: Id | null;
  flags: Record<string, boolean>;
  state: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Commands, events, observations
// ---------------------------------------------------------------------------

export interface Command {
  verb: string;
  /** Resolved arguments, by name. Object roles hold the object id; text roles hold the raw text. */
  args: Record<string, string>;
  /** The raw text the player produced — kept for transcripts and error messages. */
  raw: string;
}

export type Event =
  | { type: 'command'; raw: string; verb: string; args: Record<string, string>; turn: number }
  | { type: 'parse_error'; raw: string; message: string; turn: number }
  | { type: 'invalid_action'; verb: string; message: string; turn: number }
  | { type: 'action_succeeded'; verb: string; message: string; turn: number }
  | { type: 'action_failed'; verb: string; message: string; turn: number }
  | { type: 'state_changed'; summary: string; turn: number }
  | { type: 'hint_given'; text: string; turn: number }
  | { type: 'goal_completed'; goal: Id; text: string; turn: number }
  | {
      type: 'run_ended';
      outcome: RunOutcome;
      reason: string;
      turn: number;
    };

export interface Transition {
  state: GameState;
  events: Event[];
  /** True when the transition changed the state. */
  changed: boolean;
}

/** The slice of the state the agent is allowed to see. Smaller than the state, on purpose. */
export interface Observation {
  turn: number;
  room: { id: Id; name: string; description: string };
  visible: Array<{ id: Id; name: string; description: string; readable?: boolean }>;
  inventory: Array<{ id: Id; name: string; description: string }>;
  exits: Array<{ direction: string; label: string; toName: string; status: 'open' | 'locked' }>;
  messages: string[];
  goals: Array<{ id: Id; text: string; status: 'complete' | 'incomplete' }>;
  /** Only populated in the masked condition. */
  legalActions?: string[];
}

// ---------------------------------------------------------------------------
// The specification DSL.
//
// Ten predicates and ten effects. Each one earns its place.
//
// The `arg_*` family refers to the object bound to a command argument, which
// is what keeps actions generic: one `take` spec serves every object, and
// one `cut` spec shape serves every cable.
//
// The `object_*` family names a fixed object, which is how one action can
// refer to another ("the side door is unlocked").
// ---------------------------------------------------------------------------

export type Predicate =
  /** The player is in this room. */
  | { op: 'in_room'; room: Id }
  /** This named object is in this room. */
  | { op: 'object_in_room'; object: Id; room: Id }
  /** The object bound to `arg` is in the player's current room. */
  | { op: 'arg_in_room'; arg: string }
  /** This named object is in the player's inventory. */
  | { op: 'carrying'; object: Id }
  /** A world-level fact. */
  | { op: 'flag'; key: string; value: boolean }
  /** A flag on a named object. */
  | { op: 'object_flag'; object: Id; key: string; value: boolean }
  /** A flag on the object bound to `arg`. */
  | { op: 'arg_flag'; arg: string; key: string; value: boolean }
  /** The bound argument's value (object id, or raw text for text roles) equals this. */
  | { op: 'arg_equals'; arg: string; value: string }
  /** A goal has been achieved. */
  | { op: 'goal_complete'; goal: Id }
  /** At least this many hint credits remain. */
  | { op: 'hints_remaining'; count: number };

export type Effect =
  /** Move the player to a room. */
  | { op: 'move_to'; room: Id }
  /** Set a world-level fact. */
  | { op: 'set_flag'; key: string; value: boolean }
  /** Set a flag on the object bound to `arg`. */
  | { op: 'set_arg_flag'; arg: string; key: string; value: boolean }
  /** Move the object bound to `arg` to a room, or out of the world (null). */
  | { op: 'set_arg_room'; arg: string; room: Id | null }
  /** Put the object bound to `arg` in the inventory. */
  | { op: 'add_to_inventory'; arg: string }
  /** Take the object bound to `arg` out of the inventory. */
  | { op: 'remove_from_inventory'; arg: string }
  /** Open the container bound to `arg` and spill its contents into the room. */
  | { op: 'reveal_container'; arg: string }
  /** Set a string value on the object bound to `arg`. */
  | { op: 'set_arg_state'; arg: string; key: string; value: string }
  /** Spend one hint credit. */
  | { op: 'give_hint' }
  /** End the run. */
  | { op: 'finish'; outcome: 'success' | 'failure'; reason: string };

/** How a run ended, from the runner's point of view. */
export type RunOutcome =
  | 'success'
  | 'failure'
  | 'budget_exhausted'
  | 'loop_detected'
  | 'provider_error'
  | 'provider_stopped';
