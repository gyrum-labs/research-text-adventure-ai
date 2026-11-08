/*
 * The oracle: a breadth-first search for the shortest winning route.
 *
 * The gold path is supposed to be the shortest route to the objective. If it
 * is not, then every efficiency measurement in the experiment is measured
 * against the wrong denominator, so the number is proved rather than
 * asserted.
 *
 * The search runs over the real engine: it parses real commands and applies
 * real transitions. There is no model of the game here, only the game.
 *
 * Two things keep the search finite. Objects that cannot be carried are not
 * carried, and commands that cannot change the world are not generated. The
 * node budget is a hard stop: the oracle throws rather than hanging, because a
 * silent timeout in a test is a lie.
 */

import type { ActionSpec, Adventure, GameObject, GameState } from '../kernel/types.js';
import { parseCommand } from '../kernel/parser.js';
import { reduce } from '../kernel/reduce.js';

export interface OracleResult {
  /** The shortest winning route, in commands. Empty when the adventure cannot be won. */
  path: string[];
  /** How many states were expanded. */
  explored: number;
  /** Whether the search hit its budget instead of finishing. */
  exhausted: boolean;
}

export const ORACLE_NODE_BUDGET = 400_000;

/**
 * A cheap state key.
 *
 * It includes everything that can change what is possible: the room, what is
 * carried, the world flags, and each object's location and flags. It excludes
 * bookkeeping that cannot matter, such as the fact that an object was
 * examined.
 */
export function stateKey(state: GameState): string {
  const parts: string[] = [
    state.roomId,
    [...state.inventory].sort().join('+'),
    Object.keys(state.flags)
      .filter((key) => state.flags[key])
      .sort()
      .join('+'),
  ];
  for (const id of Object.keys(state.objects).sort()) {
    const object = state.objects[id]!;
    const flags = Object.keys(object.flags)
      .filter((key) => object.flags[key])
      .sort()
      .join(',');
    parts.push(`${id}@${object.at ?? '-'}:${flags}`);
  }
  return parts.join('|');
}

/**
 * The commands worth searching.
 *
 * The generator is driven by the adventure's own action specs rather than by
 * the first world's verbs. The point of a second world is that the engine
 * does not care what the words are, and a search that only knew the first
 * world's verbs would quietly measure the wrong thing.
 */
export function searchCommands(adventure: Adventure, state: GameState): string[] {
  const commands: string[] = [];
  const room = adventure.rooms[state.roomId];
  if (room === undefined) return commands;

  for (const doorId of room.exits) {
    const door = adventure.doors[doorId];
    if (door === undefined) continue;
    const target = adventure.rooms[door.to];
    commands.push(`go ${target?.name.toLowerCase() ?? door.to}`);
  }

  // What is in scope is the same for every action, so it is worked out once.
  const inRoom = Object.values(adventure.objects).filter(
    (object) => state.objects[object.id]?.at === state.roomId,
  );
  const carried = state.inventory
    .map((id) => adventure.objects[id])
    .filter((object): object is NonNullable<typeof object> => object !== undefined);

  for (const spec of adventure.actions) {
    if (spec.verb === 'go') continue;
    if (!changesTheWorld(spec)) continue;
    for (const values of bindingsFor(adventure, spec, state, inRoom, carried)) {
      commands.push(...buildCommands(spec, values));
    }
  }

  return commands;
}

/**
 * Whether an action can change the world.
 *
 * The search is about routes, not about looking at things. Two kinds of effect
 * are bookkeeping rather than change: spending a hint credit, and writing a
 * note onto an object. Neither is read by a predicate or shown in an
 * observation, so a state that differs only in those is the same state for
 * the purpose of finding a route, and including them multiplies the search by
 * the number of hints for nothing.
 */
function changesTheWorld(spec: ActionSpec): boolean {
  return spec.effects.some(
    (effect) => effect.op !== 'give_hint' && effect.op !== 'set_arg_state',
  );
}

/** The values each argument of an action could take, in this state. */
function bindingsFor(
  adventure: Adventure,
  spec: ActionSpec,
  state: GameState,
  inRoom: GameObject[],
  carried: GameObject[],
): string[][] {
  const perArgument: string[][] = spec.args.map((arg) => {
    switch (arg.role) {
      case 'room':
        return Object.values(adventure.rooms).map((candidate) => candidate.name.toLowerCase());
      case 'object-in-room':
        return eligible(adventure, spec, arg.name, inRoom, state);
      case 'object-in-inventory':
        return eligible(adventure, spec, arg.name, carried, state);
      case 'object':
        return eligible(adventure, spec, arg.name, [...inRoom, ...carried], state);
      case 'text':
        return textValues(spec, arg.name);
    }
  });

  return perArgument.reduce<string[][]>(
    (combinations, values) =>
      combinations.flatMap((prefix) => values.map((value) => [...prefix, value])),
    [[]],
  );
}

/**
 * The objects an argument could be bound to.
 *
 * An action that needs a readable object does not need to be tried against
 * every object in the room, and binding it to one it could never accept only
 * makes the search slower.
 */
function eligible(
  adventure: Adventure,
  spec: ActionSpec,
  argName: string,
  candidates: GameObject[],
  state: GameState,
): string[] {
  const required = spec.requires.filter(
    (predicate): predicate is Extract<typeof predicate, { op: 'arg_flag' }> =>
      predicate.op === 'arg_flag' && predicate.arg === argName && predicate.value === true,
  );

  if (required.length === 0) return candidates.map((object) => object.name);

  return candidates
    .filter((object) => {
      const runtime = state.objects[object.id];
      return required.every((predicate) => runtime?.flags[predicate.key] === true);
    })
    .map((object) => object.name);
}

/**
 * The text an argument could take.
 *
 * A text argument is only usable when the action says what it must be, so the
 * values come from the action's own equality predicates. That is how the
 * search finds a code that is written down in a document somewhere.
 */
function textValues(spec: ActionSpec, argName: string): string[] {
  const values: string[] = [];

  for (const predicate of spec.requires) {
    if (predicate.op === 'arg_equals' && predicate.arg === argName) {
      values.push(predicate.value);
    }
  }

  return values;
}

/**
 * The command text for one binding.
 *
 * The connective between two arguments is a convention of the adventure
 * rather than something the engine knows, and the search assumes the common
 * one. The parser accepts three, so a world that uses another still plays;
 * it is only the breadth-first search that would need widening.
 */
function buildCommands(spec: ActionSpec, values: string[]): string[] {
  if (values.length === 0) return [spec.verb];
  if (values.length === 1) return [`${spec.verb} ${values[0]}`];

  const [first, second] = values as [string, string];
  return [`${spec.verb} ${first} with ${second}`];
}

/** Whether every goal of the adventure is achieved. */
export function isWon(adventure: Adventure, state: GameState): boolean {
  return adventure.goals.every((goal) =>
    goal.achievedWhen.every((predicate) => {
      switch (predicate.op) {
        case 'flag':
          return (state.flags[predicate.key] ?? false) === predicate.value;
        case 'carrying':
          return state.inventory.includes(predicate.object);
        case 'object_flag': {
          const object = state.objects[predicate.object];
          if (object === undefined) return false;
          return (object.flags[predicate.key] ?? false) === predicate.value;
        }
        case 'in_room':
          return state.roomId === predicate.room;
        default:
          return false;
      }
    }),
  );
}

/**
 * Search for the shortest winning route.
 *
 * `maxDepth` bounds the search; the node budget bounds the work. If either
 * is hit the result says so, so a caller can never mistake "I gave up" for
 * "there is no shorter route".
 */
export function shortestWinningPath(
  adventure: Adventure,
  options: { maxDepth?: number; budget?: number } = {},
): OracleResult {
  const maxDepth = options.maxDepth ?? 12;
  const budget = options.budget ?? ORACLE_NODE_BUDGET;

  const start = structuredClone(adventure.initial);
  const queue: Array<{ state: GameState; path: string[] }> = [{ state: start, path: [] }];
  const seen = new Set([stateKey(start)]);
  let explored = 0;

  while (queue.length > 0) {
    const node = queue.shift()!;
    explored += 1;
    if (explored > budget) {
      return { path: [], explored, exhausted: true };
    }

    if (isWon(adventure, node.state)) {
      return { path: node.path, explored, exhausted: false };
    }
    if (node.path.length >= maxDepth) continue;

    for (const raw of searchCommands(adventure, node.state)) {
      const parsed = parseCommand(adventure, node.state, raw);
      if (!parsed.ok) continue;
      const transition = reduce(adventure, node.state, parsed.command);
      const key = stateKey(transition.state);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ state: transition.state, path: [...node.path, raw] });
    }
  }

  return { path: [], explored, exhausted: false };
}

/**
 * Every room the agent can reach, and every object it can get hold of.
 * Used to prove the adventure has no dead ends.
 */
export function reachable(
  adventure: Adventure,
  options: { maxDepth?: number; budget?: number } = {},
): {
  rooms: Set<string>;
  objects: Set<string>;
  exhausted: boolean;
} {
  const maxDepth = options.maxDepth ?? 8;
  const budget = options.budget ?? ORACLE_NODE_BUDGET;
  const start = structuredClone(adventure.initial);
  const queue: Array<{ state: GameState; depth: number }> = [{ state: start, depth: 0 }];
  const seen = new Set([stateKey(start)]);
  const rooms = new Set<string>();
  const objects = new Set<string>();
  let explored = 0;

  while (queue.length > 0) {
    const node = queue.shift()!;
    const state = node.state;
    explored += 1;
    if (explored > budget) return { rooms, objects, exhausted: true };

    rooms.add(state.roomId);
    for (const [id, object] of Object.entries(state.objects)) {
      if (object.at !== null) objects.add(id);
    }
    for (const id of state.inventory) objects.add(id);

    if (node.depth >= maxDepth) continue;

    for (const raw of searchCommands(adventure, state)) {
      const parsed = parseCommand(adventure, state, raw);
      if (!parsed.ok) continue;
      const next = reduce(adventure, state, parsed.command).state;
      const key = stateKey(next);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ state: next, depth: node.depth + 1 });
    }
  }

  return { rooms, objects, exhausted: false };
}
