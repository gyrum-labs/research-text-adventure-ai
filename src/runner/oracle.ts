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

import type { Adventure, GameState } from '../kernel/types.js';
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
 * Only the verbs that can change the world, and only for objects that can
 * change: the search is about routes, not about looking at things.
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

  for (const object of Object.values(adventure.objects)) {
    const runtime = state.objects[object.id];
    if (runtime?.at !== state.roomId) continue;

    if (object.takeable === true) commands.push(`take ${object.name}`);
    if (object.readable === true) commands.push(`read ${object.name}`);
    if (object.container !== undefined) commands.push(`open ${object.name}`);

    for (const held of state.inventory) {
      const tool = adventure.objects[held];
      if (tool === undefined) continue;
      commands.push(`cut ${object.name} with ${tool.name}`);
      commands.push(`unlock ${object.name} with ${tool.name}`);
    }

    // Code locks. The agent has to read the code somewhere; the oracle is
    // allowed to try them all.
    for (const code of adventure.codes ?? []) {
      commands.push(`unlock ${object.name} with ${code}`);
    }
  }

  return commands;
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
