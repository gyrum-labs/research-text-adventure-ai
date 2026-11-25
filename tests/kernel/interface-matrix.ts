/*
 * The interface, as a matrix.
 *
 * Every world. Every step along its solution. Everything in view or in the
 * pocket at that step. Every command the world's help lists. What the
 * engine answers to each, with nothing actually changed: every probe runs
 * on a copy of the state.
 *
 * The matrix is what the honesty test walks, and what the "nothing else
 * changed" check compares a change against. It is a picture of what the
 * engine says, taken all at once, so that a change can be seen whole.
 */

import { ADVENTURES, findGoldPath } from '../../src/adventures/index.js';
import { parseCommand } from '../../src/kernel/parser.js';
import { reduce } from '../../src/kernel/reduce.js';
import type { Adventure, GameState } from '../../src/kernel/types.js';

export type ProbeStatus = 'parse-error' | 'accepted' | 'refused';

/** One command tried once, and what the engine answered. */
export interface Probe {
  key: string;
  world: string;
  version: string;
  /** Which step along the solution the office was at. */
  step: number;
  verb: string;
  /** The object the command named, or null for a command that names none. */
  object: string | null;
  /** The second object a "with" command named, when there was one. */
  with: string | null;
  /** Whether the named object was in the pocket at the time. */
  carried: boolean;
  status: ProbeStatus;
  message: string;
}

/** The state at each step along a world's solution, starting with the office as found. */
export function statesAlong(adventure: Adventure): GameState[] {
  const states: GameState[] = [structuredClone(adventure.initial)];
  for (const raw of findGoldPath(adventure.id) ?? []) {
    const previous = structuredClone(states.at(-1)!);
    const parsed = parseCommand(adventure, previous, raw);
    if (parsed.ok) states.push(reduce(adventure, previous, parsed.command).state);
  }
  return states;
}

/** The first rule the parser reads for each verb a world's help lists: its name and its arguments. */
export function verbsOf(adventure: Adventure): Array<{ verb: string; args: Adventure['actions'][number]['args'] }> {
  const seen = new Set<string>();
  const verbs: Array<{ verb: string; args: Adventure['actions'][number]['args'] }> = [];
  for (const spec of adventure.actions) {
    if (seen.has(spec.verb)) continue;
    seen.add(spec.verb);
    verbs.push({ verb: spec.verb, args: spec.args });
  }
  return verbs;
}

/** Try one command against a copy of a state and report what the engine said. */
export function probe(adventure: Adventure, state: GameState, command: string): { status: ProbeStatus; message: string } {
  const parsed = parseCommand(adventure, structuredClone(state), command);
  if (!parsed.ok) return { status: 'parse-error', message: parsed.message };
  const transition = reduce(adventure, structuredClone(state), parsed.command);
  const said = transition.events.find(event => event.type === 'action_succeeded' || event.type === 'action_failed');
  return {
    status: transition.events.some(event => event.type === 'action_succeeded') ? 'accepted' : 'refused',
    message: said !== undefined && 'message' in said ? said.message : '',
  };
}

/** The whole matrix. */
export function probeInterface(): Probe[] {
  const probes: Probe[] = [];
  for (const adventure of Object.values(ADVENTURES)) {
    const verbs = verbsOf(adventure);
    statesAlong(adventure).forEach((state, step) => {
      const inRoom = Object.values(adventure.objects).filter(object => state.objects[object.id]?.at === state.roomId);
      const reachable = [...inRoom, ...state.inventory.map(id => adventure.objects[id]!).filter(object => object !== undefined)];

      const record = (parts: { verb: string; object: string | null; with: string | null; carried: boolean; command: string }): void => {
        const { status, message } = probe(adventure, state, parts.command);
        probes.push({
          key: [adventure.id, step, parts.verb, parts.object ?? '', parts.with ?? ''].join('|'),
          world: adventure.id, version: adventure.version, step, verb: parts.verb,
          object: parts.object, with: parts.with, carried: parts.carried, status, message,
        });
      };

      for (const { verb, args } of verbs) {
        if (args.length === 0) {
          record({ verb, object: null, with: null, carried: false, command: verb });
          continue;
        }
        if (args.some(arg => arg.role === 'text' || arg.role === 'room')) continue;
        for (const object of reachable) {
          const carried = state.inventory.includes(object.id);
          if (args.length === 1) {
            record({ verb, object: object.id, with: null, carried, command: `${verb} ${object.name}` });
            continue;
          }
          for (const second of state.inventory) {
            const other = adventure.objects[second];
            if (other === undefined) continue;
            record({ verb, object: object.id, with: other.id, carried, command: `${verb} ${object.name} with ${other.name}` });
          }
        }
      }
    });
  }
  return probes;
}
