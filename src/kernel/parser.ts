/*
 * The command parser.
 *
 * Deterministic, grammar based, and no model anywhere near it. That is
 * deliberate: if the parser guessed at what the player meant, the
 * invalid-action rate would measure the parser instead of the agent.
 *
 * The parser resolves arguments to ids. It never rewrites intent.
 */

import type { Adventure, ArgSpec, Command, GameState, Id } from './types.js';

export type ParseResult =
  | { ok: true; command: Command }
  | { ok: false; message: string };

/** Verbs that read information rather than change the world. */
export const DESCRIBE_VERBS = ['look', 'inventory', 'help'] as const;

/**
 * The two refusals that name an object.
 *
 * The failure classifier reads these prefixes, so the shapes are exported
 * rather than written twice. A refusal that says what is possible is a
 * contract, and a contract that only one side knows is not a contract.
 */
export const NOT_VISIBLE_PREFIX = "You can't see anything called";
export const NOT_CARRYING_PREFIX = "You aren't carrying anything called";

const CONNECTIVES = [' with ', ' on ', ' to '];

export function parseCommand(
  adventure: Adventure,
  state: GameState,
  raw: string,
): ParseResult {
  const text = normalise(raw);
  if (text.length === 0) {
    return { ok: false, message: 'Say something.' };
  }

  const { verb, rest } = splitVerb(adventure, text);
  if (verb === null) {
    return {
      ok: false,
      message: `I don't know the command "${text.split(' ')[0]}". Try: ${verbList(adventure)}.`,
    };
  }

  const specs = adventure.actions.filter((spec) => spec.verb === verb);
  const first = specs[0];
  if (first === undefined) {
    return { ok: false, message: `I don't know the command "${verb}". Try: ${verbList(adventure)}.` };
  }

  const parts = splitArguments(rest, first.args);
  if (parts === null) {
    return {
      ok: false,
      message: `"${verb}" needs ${describeArgs(first.args)}.`,
    };
  }

  // A verb that takes no arguments must be the whole command. Without this,
  // a stray sentence that happens to begin with a short synonym ("i have no
  // idea") would be read as that verb, and prose would become an action.
  if (first.args.length === 0 && rest.trim().length > 0) {
    return {
      ok: false,
      message: `"${verb}" takes no arguments.`,
    };
  }

  const args: Record<string, string> = {};
  for (let index = 0; index < first.args.length; index += 1) {
    const spec = first.args[index]!;
    const value = parts[index] ?? '';
    if (spec.role === 'text') {
      args[spec.name] = value;
      continue;
    }
    const resolved = resolveArgument(adventure, state, spec, value);
    if ('error' in resolved) {
      return { ok: false, message: resolved.error };
    }
    args[spec.name] = resolved.id;
  }

  return { ok: true, command: { verb, args, raw: raw.trim() } };
}

function normalise(raw: string): string {
  return raw
    .replace(/^\s*[>›»]+\s*/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Find the verb. Two-word synonyms ("pick up") are tried before one-word
 * ones, because "pick" alone is not a verb here.
 */
function splitVerb(
  adventure: Adventure,
  text: string,
): { verb: string | null; rest: string } {
  const lookup = verbLookup(adventure);
  const words = text.split(' ');

  for (const count of [2, 1]) {
    if (words.length < count) continue;
    const phrase = words.slice(0, count).join(' ');
    const canonical = lookup.get(phrase);
    if (canonical !== undefined) {
      return { verb: canonical, rest: words.slice(count).join(' ') };
    }
  }
  return { verb: null, rest: '' };
}

/**
 * The verb table, built once per adventure.
 *
 * The parser is called once per turn and the oracle calls it hundreds of
 * thousands of times, so rebuilding this map on every call is the difference
 * between a search that finishes and one that does not.
 */
const verbTables = new WeakMap<Adventure, Map<string, string>>();

function verbLookup(adventure: Adventure): Map<string, string> {
  const cached = verbTables.get(adventure);
  if (cached !== undefined) return cached;

  const lookup = new Map<string, string>();
  for (const spec of adventure.actions) {
    lookup.set(spec.verb.toLowerCase(), spec.verb);
    for (const synonym of spec.synonyms ?? []) {
      lookup.set(synonym.toLowerCase(), spec.verb);
    }
  }
  verbTables.set(adventure, lookup);
  return lookup;
}

function verbList(adventure: Adventure): string {
  return [...new Set(adventure.actions.map((spec) => spec.verb))].join(', ');
}

function describeArgs(args: ArgSpec[]): string {
  if (args.length === 0) return 'no arguments';
  return args.map((arg) => `a ${arg.role}`).join(' and ');
}

/**
 * Split the remainder into the arguments the verb expects. Two-argument verbs
 * split on a connective; one-argument verbs take the rest of the line.
 */
function splitArguments(rest: string, args: ArgSpec[]): string[] | null {
  if (args.length === 0) return [];
  if (args.length === 1) return [rest.trim()];

  for (const connective of CONNECTIVES) {
    const index = rest.indexOf(connective);
    if (index !== -1) {
      return [rest.slice(0, index).trim(), rest.slice(index + connective.length).trim()];
    }
  }
  return null;
}

type Resolved = { id: Id } | { error: string };

function resolveArgument(
  adventure: Adventure,
  state: GameState,
  spec: ArgSpec,
  value: string,
): Resolved {
  const needle = value.trim().toLowerCase();
  if (needle.length === 0) {
    return { error: `Which ${spec.role.replace('object-in-', '')} did you mean?` };
  }

  if (spec.role === 'room') {
    const room = resolveRoom(adventure, state, needle);
    if (room !== null) return { id: room };
    return { error: `You can't go to "${value}".` };
  }

  const scope = scopeOf(spec.role, state);
  const matches = Object.values(adventure.objects).filter((object) => scope.includes(object.id));

  const exact = matches.filter((object) => matchesName(object, needle));
  if (exact.length === 1) return { id: exact[0]!.id };
  if (exact.length > 1) {
    return { error: `${describeMatches(exact)} match "${value}".` };
  }

  const partial = matches.filter((object) => partiallyMatches(object, needle));
  if (partial.length === 1) return { id: partial[0]!.id };
  if (partial.length > 1) {
    return { error: `${describeMatches(partial)} match "${value}".` };
  }

  if (spec.role === 'object-in-inventory') {
    return { error: `${NOT_CARRYING_PREFIX} "${value}".\n${carryingList(matches)}` };
  }
  return { error: `${NOT_VISIBLE_PREFIX} "${value}" here.\n${visibleList(matches)}` };
}

/**
 * What is possible, said plainly.
 *
 * An error that only says "no" teaches the agent nothing it can use. Listing
 * what is in the room, or what is in the bag, turns a refusal into a choice.
 */
function visibleList(matches: Array<{ name: string }>): string {
  if (matches.length === 0) return 'There is nothing here.';
  return `You can see: ${matches.map((match) => match.name).join(', ')}.`;
}

function carryingList(matches: Array<{ name: string }>): string {
  if (matches.length === 0) return 'You are carrying nothing.';
  return `You are carrying: ${matches.map((match) => match.name).join(', ')}.`;
}

function describeMatches(matches: Array<{ name: string }>): string {
  if (matches.length === 2) return `Two things match: ${matches[0]!.name} and ${matches[1]!.name}.`;
  return `Several things match: ${matches.map((match) => match.name).join(', ')}.`;
}

function scopeOf(role: ArgSpec['role'], state: GameState): Id[] {
  const inRoom = Object.entries(state.objects)
    .filter(([, object]) => object.at === state.roomId)
    .map(([id]) => id);
  switch (role) {
    case 'object-in-room':
      return inRoom;
    case 'object-in-inventory':
      return [...state.inventory];
    case 'object':
      return [...new Set([...inRoom, ...state.inventory])];
    default:
      return [];
  }
}

function matchesName(object: { id: string; name: string; aliases?: string[] }, needle: string): boolean {
  if (object.id.toLowerCase() === needle) return true;
  if (object.name.toLowerCase() === needle) return true;
  return (object.aliases ?? []).some((alias) => alias.toLowerCase() === needle);
}

/**
 * A looser match: the needle starts one of the object's words.
 *
 * "cable" should find every cable in the room and refuse to guess between
 * them. It should not match the cutter, because no word of that name
 * starts with "cable".
 */
function partiallyMatches(
  object: { name: string; aliases?: string[] },
  needle: string,
): boolean {
  const words = [object.name, ...(object.aliases ?? [])].flatMap((phrase) =>
    phrase.toLowerCase().split(/\s+/),
  );
  return words.some((word) => word.startsWith(needle));
}

/**
 * Resolve a room by id, by name, or by the direction word of one of the
 * exits from the current room, so "go north" and a room name both work.

 */
function resolveRoom(adventure: Adventure, state: GameState, needle: string): Id | null {
  for (const room of Object.values(adventure.rooms)) {
    if (room.id.toLowerCase() === needle || room.name.toLowerCase() === needle) {
      return room.id;
    }
  }
  const current = adventure.rooms[state.roomId];
  if (current !== undefined) {
    for (const doorId of current.exits) {
      const door = adventure.doors[doorId];
      if (door !== undefined && door.direction.toLowerCase() === needle) {
        return door.to;
      }
    }
  }
  return null;
}
