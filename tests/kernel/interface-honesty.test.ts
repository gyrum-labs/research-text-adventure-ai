/*
 * The interface tells the truth.
 *
 * The engine may say no. It may not say something false. Everything a world
 * tells an agent about what is in reach has to be true of the world, because
 * an agent believes what it is told: recorded runs show one repeating a
 * command ten times because the engine said it could not see a thing it was
 * holding.
 *
 * The first group walks every world, every step along its solution,
 * everything in view or in the pocket, and every command the help lists.
 * The second holds the change that made carried things readable to its word:
 * nothing else about what the engine says may have moved.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ADVENTURES, adventureById } from '../../src/adventures/index.js';
import { CARRIED_PREFIX, NOT_VISIBLE_PREFIX, parseCommand } from '../../src/kernel/parser.js';
import type { GameState } from '../../src/kernel/types.js';
import { probe, probeInterface, statesAlong, verbsOf } from './interface-matrix.js';

interface Baseline {
  worlds: Record<string, string>;
  answers: Record<string, [status: string, message: string]>;
}

const baseline = JSON.parse(
  readFileSync(new URL('./interface-baseline.json', import.meta.url), 'utf8'),
) as Baseline;

/** The world with the named object in the pocket, wherever it started. */
function carrying(world: string, objectId: string): GameState {
  const state = structuredClone(adventureById(world).initial);
  if (!state.inventory.includes(objectId)) {
    state.inventory.push(objectId);
    state.objects[objectId] = { ...state.objects[objectId]!, at: null };
  }
  return state;
}

/** The things a world's own read rules can read. */
function readableIn(world: string): string[] {
  return adventureById(world).actions
    .filter(action => action.verb === 'read')
    .map(action => action.requires.find(predicate => predicate.op === 'arg_equals' && predicate.arg === 'target'))
    .filter((predicate): predicate is { op: 'arg_equals'; arg: string; value: string } => predicate !== undefined)
    .map(predicate => predicate.value);
}

describe('the interface tells the truth', () => {
  it('never says that something in view or in the pocket cannot be seen', () => {
    const lies = probeInterface().filter(one => one.message.startsWith(NOT_VISIBLE_PREFIX));
    expect(lies.map(one => one.key)).toEqual([]);
  });

  it('walks enough of the interface for that to mean something', () => {
    const probes = probeInterface();
    const worlds = new Set(probes.map(one => one.world));
    const carried = probes.filter(one => one.carried);
    expect([...worlds].sort()).toEqual(Object.keys(ADVENTURES).sort());
    expect(probes.length).toBeGreaterThan(800);
    expect(new Set(carried.map(one => one.verb)).size).toBeGreaterThanOrEqual(6);
    expect(new Set(carried.map(one => one.object)).size).toBeGreaterThanOrEqual(5);
  });

  it('tells a staff member the truth when a command does not take what they are carrying', () => {
    const hotfix = adventureById('hotfix-2-4-1');
    const refused = parseCommand(hotfix, carrying('hotfix-2-4-1', 'incident_ticket'), 'open incident ticket');
    expect(refused.ok).toBe(false);
    expect(refused.ok === false && refused.message.startsWith(CARRIED_PREFIX)).toBe(true);
    expect(refused.ok === false && refused.message).toContain('You are carrying the "incident ticket"');
    expect(refused.ok === false && refused.message).toContain('"open" only works on something in the room');
    // It still says what is possible, as every refusal must.
    expect(refused.ok === false && refused.message).toContain('Use: open <target>.');
    expect(refused.ok === false && refused.message).toContain('incident ticket.');
  });

  it('still says a thing is out of sight when it really is', () => {
    const hotfix = adventureById('hotfix-2-4-1');
    const refused = parseCommand(hotfix, structuredClone(hotfix.initial), 'open customer handover');
    expect(refused.ok).toBe(false);
    expect(refused.ok === false && refused.message.startsWith(NOT_VISIBLE_PREFIX)).toBe(true);
  });

  it('every command that takes only what is in the room says so when it names something carried', () => {
    // Said for each command by name, in every world, so that a command added
    // later is held to it too. Review 1 of PR #51 read the branch for things
    // that must be carried as this one. Kept apart, and each named.
    const checked: string[] = [];
    for (const world of Object.keys(ADVENTURES)) {
      const adventure = adventureById(world);
      const inPocket = Object.values(adventure.objects).find((object) => object.takeable) ?? Object.values(adventure.objects)[0]!;
      for (const { verb, args } of verbsOf(adventure)) {
        const target = args.find((arg) => arg.role === 'object-in-room');
        if (target === undefined) continue;
        const state = carrying(world, inPocket.id);
        let command = `${verb} ${inPocket.name}`;
        for (const arg of args) {
          if (arg === target) continue;
          // A second argument, made valid, so that the target is the only thing wrong.
          if (arg.role === 'text') {
            command += ' with 0000';
            continue;
          }
          const other = Object.values(adventure.objects).find((object) => object.id !== inPocket.id)!;
          state.inventory.push(other.id);
          state.objects[other.id] = { ...state.objects[other.id]!, at: null };
          command += ` with ${other.name}`;
        }
        const refused = parseCommand(adventure, state, command);
        expect(refused.ok, `${world}: ${command}`).toBe(false);
        expect(refused.ok === false && refused.message.startsWith(CARRIED_PREFIX), `${world}: ${command}`).toBe(true);
        checked.push(verb);
      }
    }
    expect([...new Set(checked)].sort()).toEqual(
      expect.arrayContaining(['claim', 'cut', 'deploy', 'examine', 'open', 'take', 'unlock']),
    );
  });
});

describe('nothing else changed when carried things became readable', () => {
  it('every answer is as it was, except where a carried thing was called out of sight, and the ticket', () => {
    const now = probeInterface();
    expect(now.map(one => one.key)).toEqual(Object.keys(baseline.answers));

    const unexpected: string[] = [];
    const intended = { truthful: 0, ticket: 0 };
    for (const one of now) {
      const was = baseline.answers[one.key]!;
      if (was[0] === one.status && was[1] === one.message) continue;
      // The ticket itself: readable from the desk, and from the pocket at
      // every step after it is picked up.
      if (one.world === 'hotfix-2-4-1' && one.object === 'incident_ticket' && one.verb === 'read') {
        intended.ticket += 1;
        continue;
      }
      // A refusal that claimed a carried thing was out of sight. It now tells
      // the truth about why the command is refused, or gives the world's own
      // reason that a carried thing has nothing to read.
      if (one.carried && was[1].startsWith(NOT_VISIBLE_PREFIX) && !one.message.startsWith(NOT_VISIBLE_PREFIX)) {
        intended.truthful += 1;
        continue;
      }
      unexpected.push(one.key);
    }
    expect(unexpected).toEqual([]);
    expect(intended).toEqual({ truthful: 188, ticket: 11 });
  });

  it('and the version moved, so results from before are never pooled with results from after', () => {
    expect(baseline.worlds['hotfix-2-4-1']).toBe('1.0.5');
    expect(adventureById('hotfix-2-4-1').version).toBe('1.0.6');
    for (const [world, version] of Object.entries(baseline.worlds)) {
      if (world === 'hotfix-2-4-1') continue;
      expect(adventureById(world).version, world).toBe(version);
    }
  });
});

describe('a carried thing can be read', () => {
  it('everywhere, for everything a world says can be read: where it stands, and in the hand', () => {
    let checked = 0;
    for (const world of Object.keys(ADVENTURES)) {
      const adventure = adventureById(world);
      for (const object of readableIn(world)) {
        const named = adventure.objects[object]!;
        // A readable thing may start out of sight, inside something closed.
        // Find it where the world puts it on the way to the solution.
        const standing = statesAlong(adventure).find(state => state.objects[object]?.at === state.roomId);
        expect(standing, `${world}: ${named.name} is never in the room`).toBeDefined();
        for (const [where, state] of [['in the room', standing!], ['carried', carrying(world, object)]] as const) {
          const read = probe(adventure, structuredClone(state), `read ${named.name}`);
          expect(read.status, `${world}: read ${named.name} ${where}`).toBe('accepted');
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(4);
  });

  it('the incident ticket says what an incident ticket says, and never which move to make', () => {
    const hotfix = adventureById('hotfix-2-4-1');
    const fromTheDesk = probe(hotfix, structuredClone(hotfix.initial), 'read incident ticket');
    const inHand = probe(hotfix, carrying('hotfix-2-4-1', 'incident_ticket'), 'read incident ticket');
    expect(fromTheDesk.status).toBe('accepted');
    expect(inHand.status).toBe('accepted');
    expect(inHand.message).toBe(fromTheDesk.message);
    expect(inHand.message).toMatch(/^You read the incident ticket\.\n\nINC-4471\. Severity 1\./);
    for (const fact of ['2.4.1 hotfix has not shipped', 'customer SLA expires at 17:00', 'the hotfix shipped, and the customer told']) {
      expect(inHand.message).toContain(fact);
    }
    expect(inHand.message).not.toMatch(/gate|unlock|7311|approval|east|Customer Success|runbook|credential|go |claim /i);
    // And it is offered as readable, because it is.
    expect(hotfix.objects['incident_ticket']?.readable).toBe(true);
  });

  it('reading it changes nothing that matters, so it is not a move in disguise', () => {
    const hotfix = adventureById('hotfix-2-4-1');
    const state = carrying('hotfix-2-4-1', 'incident_ticket');
    const parsed = parseCommand(hotfix, state, 'read incident ticket');
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.command.args['target']).toBe('incident_ticket');
  });
});
