/*
 * Predicate evaluation. Ten predicates, no cleverness: each one answers a
 * question about the current state and the command being applied.
 */

import type { Adventure, Command, GameState, Id, Predicate } from './types.js';

/** Everything a predicate may need to look at. */
export interface EvalContext {
  adventure: Adventure;
  state: GameState;
  command: Command;
  /** Resolved argument bindings: argument name -> object id (or raw text). */
  bindings: Record<string, string>;
  /** Whether a goal has been achieved. */
  isGoalComplete: (goalId: Id) => boolean;
}

/**
 * Compare two values the way a player means them. "the key", "my key"
 * and "key" are the same thing to the person typing, and the engine has
 * no business pretending otherwise.
 */
function normalise(value: string | undefined): string {
  if (value === undefined) return '';
  return value
    .toLowerCase()
    .replace(/\b(the|a|an|my|some)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function evaluatePredicate(predicate: Predicate, ctx: EvalContext): boolean {
  switch (predicate.op) {
    case 'in_room':
      return ctx.state.roomId === predicate.room;

    case 'object_in_room': {
      const object = ctx.state.objects[predicate.object];
      return object !== undefined && object.at === predicate.room;
    }

    case 'arg_in_room': {
      const bound = ctx.bindings[predicate.arg];
      if (bound === undefined) return false;
      const object = ctx.state.objects[bound];
      return object !== undefined && object.at === ctx.state.roomId;
    }

    case 'carrying':
      return ctx.state.inventory.includes(predicate.object);

    case 'flag':
      return (ctx.state.flags[predicate.key] ?? false) === predicate.value;

    case 'object_flag': {
      const object = ctx.state.objects[predicate.object];
      if (object === undefined) return false;
      return (object.flags[predicate.key] ?? false) === predicate.value;
    }

    case 'arg_flag': {
      const bound = ctx.bindings[predicate.arg];
      if (bound === undefined) return false;
      const object = ctx.state.objects[bound];
      if (object === undefined) return false;
      return (object.flags[predicate.key] ?? false) === predicate.value;
    }

    case 'arg_equals':
      return normalise(ctx.bindings[predicate.arg]) === normalise(predicate.value);

    case 'goal_complete':
      return ctx.isGoalComplete(predicate.goal);

    case 'hints_remaining':
      return ctx.state.hintsLeft >= predicate.count;
  }
}
