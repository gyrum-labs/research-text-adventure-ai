/*
 * The reducer: the whole engine.
 *
 * `reduce(adventure, state, command)` is a pure function. It never mutates
 * the state it is given, never reads a clock, never asks anybody anything,
 * and never changes its mind. The same command on the same state always
 * produces the same result, which is what makes a run replayable.
 *
 * The reducer is also the only place the world's rules live. It picks the
 * action that matches the command, checks that action's preconditions, and
 * applies its effects if they hold.
 */

import type {
  ActionSpec,
  Adventure,
  Command,
  Event,
  GameState,
  Id,
  Predicate,
  Transition,
} from './types.js';
import { evaluatePredicate, type EvalContext } from './predicates.js';
import { achievedGoalIds } from './goals.js';
import { applyEffect } from './effects.js';

interface Candidate {
  spec: ActionSpec;
  satisfied: number;
  total: number;
  order: number;
}

export function reduce(adventure: Adventure, state: GameState, command: Command): Transition {
  const events: Event[] = [];
  const turn = state.turn;

  events.push({
    type: 'command',
    raw: command.raw,
    verb: command.verb,
    args: { ...command.args },
    turn,
  });

  const candidates = adventure.actions.filter((spec) => spec.verb === command.verb);
  if (candidates.length === 0) {
    events.push({
      type: 'invalid_action',
      verb: command.verb,
      message: `Nothing here responds to "${command.verb}".`,
      turn,
    });
    return { state: { ...state, turn: turn + 1 }, events, changed: false };
  }

  const best = selectCandidate(adventure, state, command, candidates);

  if (best.satisfied !== best.total) {
    const message = interpolate(best.spec.text.failure, adventure, command.args);
    events.push({ type: 'action_failed', verb: command.verb, message, turn });
    return { state: { ...state, turn: turn + 1 }, events, changed: false };
  }

  let next = state;
  for (const effect of best.spec.effects) {
    next = applyEffect(effect, next, { adventure, state: next, bindings: command.args });
  }
  next = { ...next, turn: turn + 1 };

  const message = interpolate(best.spec.text.success, adventure, command.args);
  events.push({ type: 'action_succeeded', verb: command.verb, message, turn });

  if (next.hintsLeft < state.hintsLeft) {
    const given = adventure.hints.length - next.hintsLeft;
    const hint = adventure.hints[given - 1];
    if (hint !== undefined) {
      events.push({ type: 'hint_given', text: hint.text, turn });
    }
  }

  const before = achievedGoalIds(adventure, state);
  const after = achievedGoalIds(adventure, next);
  for (const goalId of after) {
    if (!before.includes(goalId)) {
      const goal = adventure.goals.find((candidate) => candidate.id === goalId);
      events.push({ type: 'goal_completed', goal: goalId, text: goal?.text ?? goalId, turn });
    }
  }

  const finishEffect = best.spec.effects.find((effect) => effect.op === 'finish');
  if (after.length === adventure.goals.length && next.status === 'running') {
    next = { ...next, status: 'success' };
  }

  events.push({ type: 'state_changed', summary: summarize(adventure, next), turn });

  if (next.status !== 'running') {
    const reason =
      finishEffect && finishEffect.op === 'finish'
        ? finishEffect.reason
        : 'Every objective was met.';
    events.push({ type: 'run_ended', outcome: next.status, reason, turn });
  }

  return { state: next, events, changed: true };
}

/**
 * Choose the action spec a command means.
 *
 * Several actions can share a verb (four ways to `go`, three wires to `cut`),
 * so the spec is picked by how well the command fits it:
 *
 *   1. an action whose preconditions all hold wins outright;
 *   2. otherwise the action that comes closest wins, so the failure message
 *      comes from the action the player most likely meant.
 */
function selectCandidate(
  adventure: Adventure,
  state: GameState,
  command: Command,
  candidates: ActionSpec[],
): Candidate {
  const context = makeContext(adventure, state, command);
  const scored: Candidate[] = candidates.map((spec, order) => {
    const satisfied = spec.requires.filter((predicate) => evaluatePredicate(predicate, context)).length;
    return { spec, satisfied, total: spec.requires.length, order };
  });

  scored.sort((a, b) => {
    const aComplete = a.satisfied === a.total ? 1 : 0;
    const bComplete = b.satisfied === b.total ? 1 : 0;
    if (aComplete !== bComplete) return bComplete - aComplete;

    const aRatio = a.total === 0 ? 1 : a.satisfied / a.total;
    const bRatio = b.total === 0 ? 1 : b.satisfied / b.total;
    if (aRatio !== bRatio) return bRatio - aRatio;

    if (a.satisfied !== b.satisfied) return b.satisfied - a.satisfied;
    return a.order - b.order;
  });

  return scored[0]!;
}

function makeContext(
  adventure: Adventure,
  state: GameState,
  command: Command,
): EvalContext {
  const context: EvalContext = {
    adventure,
    state,
    command,
    bindings: command.args,
    isGoalComplete: (goalId: Id) => {
      const goal = adventure.goals.find((candidate) => candidate.id === goalId);
      if (goal === undefined) return false;
      return goal.achievedWhen.every((predicate) => evaluatePredicate(predicate, context));
    },
  };
  return context;
}

/**
 * Substitute `{arg}` in an action's prose.
 *
 * An argument that resolved to an object is shown by its name, so the player
 * reads "You pocket the key" rather than "You pocket the key_id". A
 * text argument is shown as it was typed. `{arg.description}` exposes only
 * an object's public description; private detail fields are not supported.
 */
export function interpolate(
  template: string,
  adventure: Adventure,
  args: Record<string, string>,
): string {
  return template.replace(/\{(\w+)(\.description)?\}/g, (match, name: string, description: string | undefined) => {
    const value = args[name];
    if (value === undefined) return match;
    const object = adventure.objects[value];
    if (description !== undefined) return object?.description ?? match;
    if (object !== undefined) return object.name;
    const room = adventure.rooms[value];
    if (room !== undefined) return room.name;
    return value;
  });
}

function summarize(adventure: Adventure, state: GameState): string {
  const room = adventure.rooms[state.roomId];
  const carried = state.inventory.length;
  return `in ${room?.name ?? state.roomId}, carrying ${carried}`;
}

/** The predicates a goal needs, for documentation and tests. */
export function describeGoal(adventure: Adventure, goalId: Id): Predicate[] {
  return adventure.goals.find((goal) => goal.id === goalId)?.requires ?? [];
}
