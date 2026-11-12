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
import { commandHelp, commandSyntax } from './parser.js';

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

  const context = makeContext(adventure, state, command);
  const best = selectCandidate(candidates, context);

  if (best === undefined || best.satisfied !== best.total) {
    const message = failureMessage(best?.spec, command, context);
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
 *   2. otherwise the closest matching action supplies its failure message.
 * Object/room identity selectors must match first; private text values are
 * prerequisites, never public selectors or recommendations.
 */
function selectCandidate(candidates: ActionSpec[], context: EvalContext): Candidate | undefined {
  const applicable = candidates.filter(spec => spec.requires.every(predicate =>
    predicate.op !== 'arg_equals' ||
    spec.args.find(arg => arg.name === predicate.arg)?.role === 'text' ||
    evaluatePredicate(predicate, context)));
  const scored: Candidate[] = applicable.map((spec, order) => {
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

  return scored[0];
}

function failureMessage(spec: ActionSpec | undefined, command: Command, context: EvalContext): string {
  if (spec === undefined) {
    const shape = context.adventure.actions.find(action => action.verb === command.verb)!;
    const attempted = commandSyntax(shape).replace(/<(\w+)>/g,
      (_match, name: string) => interpolate(`{${name}}`, context.adventure, command.args));
    return `You cannot ${attempted}.`;
  }
  for (const predicate of spec.requires) {
    if (predicate.op !== 'arg_flag') continue;
    const object = context.state.objects[context.bindings[predicate.arg] ?? ''];
    if (object === undefined) continue;
    const already = predicate.key === 'unlocked' && !predicate.value && object.flags['unlocked'] === true ||
      predicate.key === 'locked' && predicate.value && object.flags['locked'] === false;
    if (already) {
      const name = context.adventure.objects[context.bindings[predicate.arg]!]!.name;
      return `The ${name} is already unlocked.`;
    }
  }
  return interpolate(spec.text.failure, context.adventure, command.args);
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
 * `{commands}` inserts the same public syntax used by parser errors and models.
 */
export function interpolate(
  template: string,
  adventure: Adventure,
  args: Record<string, string>,
): string {
  return template.replace(/\{(\w+)(\.description)?\}/g, (match, name: string, description: string | undefined) => {
    if (name === 'commands' && description === undefined) return commandHelp(adventure);
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
