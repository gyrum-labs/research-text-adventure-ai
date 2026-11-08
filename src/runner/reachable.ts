/*
 * Every state the agent can reach.
 *
 * The obvious way to enumerate reachable states is to walk the world and keep
 * everything you find. That explodes, because the action DSL lets an agent
 * "unlock" anything it can reach, and each unlock plants a flag that no
 * predicate and no observation ever reads. The space fills with states that
 * differ only in a flag nobody can see.
 *
 * So the search keeps states only when they differ in a way that matters. A
 * flag is meaningful when some predicate reads it, or when the observation
 * reads it. Everything else is bookkeeping: it changes the world without
 * changing what is possible or what can be seen.
 *
 * With that projection the search terminates, and the result is complete: it
 * is every state the agent can be in, not a sample and not a depth-truncated
 * approximation.
 */

import type { Adventure, GameState, Id } from '../kernel/types.js';
import { parseCommand } from '../kernel/parser.js';
import { reduce } from '../kernel/reduce.js';
import { searchCommands } from './oracle.js';

export interface ReachableResult {
  /** One representative state per meaningful equivalence class. */
  states: GameState[];
  /** How many states were expanded. */
  explored: number;
  /** True when the search hit its budget instead of finishing. */
  exhausted: boolean;
}

export const REACHABLE_BUDGET = 200_000;

/**
 * The flags worth distinguishing.
 *
 * `arg_flag` applies to whichever object a command names, so its key matters
 * for every object. `object_flag` names one object, so its key matters only
 * there. A door's `unlocked` flag matters because the observation reads it
 * when it reports whether an exit is open.
 */
function meaningfulFlags(adventure: Adventure): {
  perObject: Set<string>;
  perObjectKey: Map<Id, Set<string>>;
  world: Set<string>;
} {
  const perObject = new Set<string>();
  const perObjectKey = new Map<Id, Set<string>>();
  const world = new Set<string>();

  const note = (predicate: {
    op: string;
    key?: string;
    object?: Id;
  }): void => {
    if (predicate.op === 'arg_flag' && predicate.key !== undefined) {
      perObject.add(predicate.key);
    } else if (predicate.op === 'object_flag' && predicate.key !== undefined) {
      const keys = perObjectKey.get(predicate.object ?? '') ?? new Set<string>();
      keys.add(predicate.key);
      perObjectKey.set(predicate.object ?? '', keys);
    } else if (predicate.op === 'flag' && predicate.key !== undefined) {
      world.add(predicate.key);
    }
  };

  for (const spec of adventure.actions) {
    for (const predicate of spec.requires) note(predicate);
  }
  for (const goal of adventure.goals) {
    for (const predicate of [...goal.requires, ...goal.achievedWhen]) note(predicate);
  }

  for (const door of Object.values(adventure.doors)) {
    const object = door.requiresAction?.object;
    if (object === undefined) continue;
    const keys = perObjectKey.get(object) ?? new Set<string>();
    keys.add('unlocked');
    perObjectKey.set(object, keys);
  }

  return { perObject, perObjectKey, world };
}

/**
 * The key for a state, counting only what matters.
 *
 * The messages matter because they are the only channel through which the
 * engine's prose reaches the agent.
 */
function meaningfulKey(
  adventure: Adventure,
  state: GameState,
  messages: string[],
  flags: ReturnType<typeof meaningfulFlags>,
): string {
  const parts: string[] = [state.roomId, [...state.inventory].sort().join('+'), String(state.hintsLeft)];

  for (const id of Object.keys(state.objects).sort()) {
    const object = state.objects[id]!;
    const keys = new Set([...flags.perObject, ...(flags.perObjectKey.get(id) ?? [])]);
    const held = [...keys]
      .filter((key) => object.flags[key] === true)
      .sort()
      .join(',');
    parts.push(`${id}@${object.at ?? '-'}:${held}`);
  }

  const world = Object.keys(state.flags)
    .filter((key) => flags.world.has(key) && state.flags[key] === true)
    .sort()
    .join(',');
  parts.push(`w:${world}`);
  parts.push(`m:${messages.join('|')}`);

  return parts.join('|');
}

/**
 * Every state the agent can reach, one representative per meaningful class.
 *
 * The command set is the oracle's, plus `hint`: a hint is a real way for the
 * agent to reach a state, and it carries text into the observation.
 */
export function reachableStates(
  adventure: Adventure,
  options: { budget?: number; withMessages?: boolean } = {},
): ReachableResult {
  const budget = options.budget ?? REACHABLE_BUDGET;
  const withMessages = options.withMessages ?? true;
  const flags = meaningfulFlags(adventure);

  const start = structuredClone(adventure.initial);
  const queue: Array<{ state: GameState; messages: string[] }> = [
    { state: start, messages: [] },
  ];
  const seen = new Set([meaningfulKey(adventure, start, [], flags)]);
  const states: GameState[] = [];
  let explored = 0;

  while (queue.length > 0) {
    const node = queue.shift()!;
    explored += 1;
    if (explored > budget) return { states, explored, exhausted: true };
    states.push(node.state);

    for (const raw of [...searchCommands(adventure, node.state), 'hint']) {
      const parsed = parseCommand(adventure, node.state, raw);
      if (!parsed.ok) continue;
      const transition = reduce(adventure, node.state, parsed.command);
      const messages = transition.events
        .filter(
          (event): event is Extract<typeof event, { message: string }> =>
            'message' in event && typeof event.message === 'string',
        )
        .map((event) => event.message)
        .filter((message) => message.length > 0);

      const key = meaningfulKey(
        adventure,
        transition.state,
        withMessages ? messages : [],
        flags,
      );
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ state: transition.state, messages });
    }
  }

  return { states, explored, exhausted: false };
}
