import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Command, GameState } from '../../src/kernel/types.js';
import { canonicalJson, hashInitial, hashNext } from '../../src/kernel/hash.js';
import { reduce } from '../../src/kernel/reduce.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';

function command(verb: string, args: Record<string, string> = {}): Command {
  return { verb, args, raw: verb };
}

describe('the hash chain', () => {
  it('gives the same hash for the same state', () => {
    const first = hashInitial(adventure.initial);
    const second = hashInitial(structuredClone(adventure.initial));
    expect(first).toBe(second);
  });

  it('changes when the state changes', () => {
    const next = { ...adventure.initial, turn: 1 };
    expect(hashNext(hashInitial(adventure.initial), next)).not.toBe(hashInitial(adventure.initial));
  });

  it('ignores key order when hashing', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });
});

describe('the reducer', () => {
  it('does not mutate the state it is given', () => {
    const before = structuredClone(adventure.initial);
    const transition = reduce(adventure, adventure.initial, command('look'));
    expect(adventure.initial).toEqual(before);
    expect(transition.state).not.toBe(adventure.initial);
  });

  it('produces the same result for the same command', () => {
    const first = reduce(adventure, adventure.initial, command('look'));
    const second = reduce(adventure, adventure.initial, command('look'));
    expect(first.state).toEqual(second.state);
  });

  it('emits a command event and an action event', () => {
    const transition = reduce(adventure, adventure.initial, command('look'));
    const types = transition.events.map((event) => event.type);
    expect(types).toContain('command');
    expect(types).toContain('action_succeeded');
  });

  it('refuses an action whose preconditions fail, and changes nothing', () => {
    // The vault door cannot be unlocked before the keycard is in hand.
    const transition = reduce(
      adventure,
      adventure.initial,
      command('unlock', { target: 'vault_door', with: 'keycard' }),
    );
    expect(transition.changed).toBe(false);
    expect(transition.events.some((event) => event.type === 'action_failed')).toBe(true);
    expect(transition.state.turn).toBe(1);
  });

  it('applies effects only when every precondition holds', () => {
    const withKeycard: GameState = {
      ...adventure.initial,
      roomId: 'corridor',
      inventory: ['keycard'],
    };
    const transition = reduce(
      adventure,
      withKeycard,
      command('unlock', { target: 'vault_door', with: 'keycard' }),
    );
    expect(transition.changed).toBe(true);
    expect(transition.state.objects['vault_door']?.flags['unlocked']).toBe(true);
  });

  it('advances the turn counter', () => {
    const transition = reduce(adventure, adventure.initial, command('look'));
    expect(transition.state.turn).toBe(1);
  });

  it('emits a run_ended event when the world finishes', () => {
    const state: GameState = {
      ...adventure.initial,
      roomId: 'vault',
      inventory: ['cutters'],
      flags: { ...adventure.initial.flags, manual_read: true },
      status: 'failure',
    };
    const transition = reduce(
      adventure,
      state,
      command('cut', { target: 'wire_red', with: 'cutters' }),
    );
    expect(transition.state.status).toBe('failure');
    expect(transition.events.some((event) => event.type === 'run_ended')).toBe(true);
  });
});

describe('the kernel vocabulary', () => {
  it('never names an object from the adventure', () => {
    // The kernel speaks the game's language: rooms, objects, doors. What it must
    // never do is know anything about *this* adventure. If the fixture's
    // objects ever appear in the kernel's source, the environment has learned
    // the answer.
    const fixture = [
      'keycard',
      'bomb',
      'locker',
      'wire',
      'safe',
      'manual',
      'cutters',
      'nightingale',
      'vault',
    ];
    const root = fileURLToPath(new URL('../../src/kernel/', import.meta.url));
    for (const name of readdirSync(root)) {
      if (!name.endsWith('.ts')) continue;
      const source = readFileSync(join(root, name), 'utf8').toLowerCase();
      for (const word of fixture) {
        expect(source, `src/kernel/${name} mentions "${word}"`).not.toMatch(
          new RegExp(`\\b${word}\\b`),
        );
      }
    }
  });
});
