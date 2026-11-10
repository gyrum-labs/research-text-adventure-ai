/*
 * Goal evaluation.
 *
 * A goal is achieved when its `achievedWhen` predicates hold. Goals are
 * checked on the end state, never on the route taken, so two different
 * ways of finishing count equally.
 *
 * This is the single implementation. The reducer uses it to notice a goal
 * completing, and the observation builder uses it to tell the agent which
 * objectives are done. Two copies of this rule would eventually disagree,
 * and then the agent would be told something the engine does not believe.
 */

import type { Adventure, GameObjectState, GameState, GoalSpec, Id, Predicate } from './types.js';

/**
 * Whether a goal's predicate holds, given only the state.
 *
 * Goals describe the world, not a command, so the predicates that need a
 * command binding cannot apply to one.
 */
export function predicateHolds(state: GameState, predicate: Predicate): boolean {
  switch (predicate.op) {
    case 'flag':
      return (state.flags[predicate.key] ?? false) === predicate.value;
    case 'carrying':
      return state.inventory.includes(predicate.object);
    case 'object_flag':
      return objectFlagHolds(state.objects[predicate.object], predicate.key, predicate.value);
    case 'in_room':
      return state.roomId === predicate.room;
    case 'object_in_room':
      return state.objects[predicate.object]?.at === predicate.room;
    default:
      return false;
  }
}

function objectFlagHolds(
  object: GameObjectState | undefined,
  key: string,
  value: boolean,
): boolean {
  if (object === undefined) return false;
  return (object.flags[key] ?? false) === value;
}

export function isGoalAchieved(goal: GoalSpec, state: GameState): boolean {
  return goal.achievedWhen.every((predicate) => predicateHolds(state, predicate));
}

export function achievedGoalIds(adventure: Adventure, state: GameState): Id[] {
  return adventure.goals
    .filter((goal) => isGoalAchieved(goal, state))
    .map((goal) => goal.id);
}

export function allGoalsAchieved(adventure: Adventure, state: GameState): boolean {
  return adventure.goals.every((goal) => isGoalAchieved(goal, state));
}
