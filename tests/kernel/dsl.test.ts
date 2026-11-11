/*
 * The DSL, on its own.
 *
 * The adventure exercises the predicates and the effects through its own
 * actions, which is how a game gets played. It is not how the DSL should be
 * tested: an adventure that happens not to use a predicate would leave it
 * untested, and a broken predicate would go unnoticed until the world that
 * needs it was written.
 *
 * So every predicate and every effect gets its own case here, including the
 * ones that must fail.
 */

import { describe, expect, it } from 'vitest';
import { evaluatePredicate, type EvalContext } from '../../src/kernel/predicates.js';
import { applyEffect, type EffectContext } from '../../src/kernel/effects.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';
import type { Command, Effect, GameState, Predicate } from '../../src/kernel/types.js';

function state(): GameState {
  return structuredClone(adventure.initial);
}

function context(overrides: Partial<EvalContext> = {}): EvalContext {
  const command: Command = { verb: 'take', args: {}, raw: 'take' };
  return {
    adventure,
    state: state(),
    command,
    bindings: {},
    isGoalComplete: () => false,
    ...overrides,
  };
}

function holds(predicate: Predicate, overrides: Partial<EvalContext> = {}): boolean {
  return evaluatePredicate(predicate, context(overrides));
}

function effectContext(bindings: Record<string, string> = {}, overrides: Partial<EffectContext> = {}): EffectContext {
  return { adventure, state: state(), bindings, ...overrides };
}

describe('the predicates', () => {
  it('in_room is true only in the named room', () => {
    expect(holds({ op: 'in_room', room: 'briefing' })).toBe(true);
    expect(holds({ op: 'in_room', room: 'vault' })).toBe(false);
  });

  it('object_in_room finds a named object in a named room', () => {
    expect(holds({ op: 'object_in_room', object: 'keycard', room: 'briefing' })).toBe(true);
    expect(holds({ op: 'object_in_room', object: 'keycard', room: 'vault' })).toBe(false);
    expect(holds({ op: 'object_in_room', object: 'nothing', room: 'briefing' })).toBe(false);
  });

  it('arg_in_room looks at the bound argument', () => {
    expect(holds({ op: 'arg_in_room', arg: 'target' }, { bindings: { target: 'keycard' } })).toBe(true);
    expect(holds({ op: 'arg_in_room', arg: 'target' }, { bindings: { target: 'bomb' } })).toBe(false);
    expect(holds({ op: 'arg_in_room', arg: 'target' }, { bindings: {} })).toBe(false);
  });

  it('carrying finds an object in the inventory', () => {
    expect(holds({ op: 'carrying', object: 'keycard' }, { state: { ...state(), inventory: ['keycard'] } })).toBe(true);
    expect(holds({ op: 'carrying', object: 'keycard' })).toBe(false);
  });

  it('flag reads a world flag, and an absent flag is false', () => {
    expect(holds({ op: 'flag', key: 'bomb_defused', value: true })).toBe(false);
    expect(
      holds({ op: 'flag', key: 'bomb_defused', value: true }, { state: { ...state(), flags: { bomb_defused: true } } }),
    ).toBe(true);
    expect(
      holds({ op: 'flag', key: 'bomb_defused', value: false }, { state: { ...state(), flags: { bomb_defused: true } } }),
    ).toBe(false);
  });

  it('object_flag reads a flag on a named object', () => {
    expect(holds({ op: 'object_flag', object: 'locker', key: 'closed', value: true })).toBe(true);
    expect(holds({ op: 'object_flag', object: 'locker', key: 'closed', value: false })).toBe(false);
    expect(holds({ op: 'object_flag', object: 'nothing', key: 'closed', value: true })).toBe(false);
  });

  it('arg_flag reads a flag on the bound argument, and respects the value', () => {
    expect(holds({ op: 'arg_flag', arg: 'target', key: 'readable', value: true }, { bindings: { target: 'bulletin' } })).toBe(true);
    expect(holds({ op: 'arg_flag', arg: 'target', key: 'readable', value: false }, { bindings: { target: 'bulletin' } })).toBe(false);
    expect(holds({ op: 'arg_flag', arg: 'target', key: 'readable', value: true }, { bindings: { target: 'desk' } })).toBe(false);
    expect(holds({ op: 'arg_flag', arg: 'target', key: 'readable', value: true }, { bindings: {} })).toBe(false);
  });

  it('arg_equals compares the binding, ignoring articles and case', () => {
    expect(holds({ op: 'arg_equals', arg: 'target', value: 'keycard' }, { bindings: { target: 'the Keycard' } })).toBe(true);
    expect(holds({ op: 'arg_equals', arg: 'target', value: 'keycard' }, { bindings: { target: 'keyring' } })).toBe(false);
  });

  it('goal_complete asks whether the goal is achieved', () => {
    expect(holds({ op: 'goal_complete', goal: 'disarm' }, { isGoalComplete: (id) => id === 'disarm' })).toBe(true);
    expect(holds({ op: 'goal_complete', goal: 'disarm' }, { isGoalComplete: () => false })).toBe(false);
  });

  it('hints_remaining counts the credits left', () => {
    expect(holds({ op: 'hints_remaining', count: 1 })).toBe(true);
    expect(holds({ op: 'hints_remaining', count: 4 })).toBe(false);
  });
});

describe('the effects', () => {
  function apply(effect: Effect, bindings: Record<string, string> = {}): GameState {
    const ctx = effectContext(bindings);
    return applyEffect(effect, ctx.state, ctx);
  }

  it('move_to moves the player', () => {
    expect(apply({ op: 'move_to', room: 'corridor' }).roomId).toBe('corridor');
  });

  it('set_flag sets a world flag', () => {
    expect(apply({ op: 'set_flag', key: 'bomb_defused', value: true }).flags['bomb_defused']).toBe(true);
  });

  it('set_arg_flag sets a flag on the bound argument', () => {
    const next = apply({ op: 'set_arg_flag', arg: 'target', key: 'unlocked', value: true }, { target: 'locker' });
    expect(next.objects['locker']!.flags['unlocked']).toBe(true);
  });

  it('set_arg_room moves the bound argument, or takes it out of the world', () => {
    expect(apply({ op: 'set_arg_room', arg: 'target', room: 'vault' }, { target: 'keycard' }).objects['keycard']!.at).toBe('vault');
    expect(apply({ op: 'set_arg_room', arg: 'target', room: null }, { target: 'keycard' }).objects['keycard']!.at).toBeNull();
  });

  it('add_to_inventory and remove_from_inventory move the bound argument', () => {
    const added = apply({ op: 'add_to_inventory', arg: 'target' }, { target: 'keycard' });
    expect(added.inventory).toContain('keycard');

    const removed = apply({ op: 'remove_from_inventory', arg: 'target' }, { target: 'keycard' });
    expect(removed.inventory).not.toContain('keycard');
  });

  it('reveal_container opens it and spills its contents into the room', () => {
    const next = apply({ op: 'reveal_container', arg: 'target' }, { target: 'locker' });

    expect(next.objects['locker']!.flags['closed']).toBe(false);
    expect(next.objects['cutters']!.at).toBe('briefing');
  });

  it('set_arg_state writes a string onto the bound argument', () => {
    const next = apply({ op: 'set_arg_state', arg: 'target', key: 'examined', value: 'true' }, { target: 'desk' });
    expect(next.objects['desk']!.state['examined']).toBe('true');
  });

  it('give_hint spends a credit', () => {
    expect(apply({ op: 'give_hint' }).hintsLeft).toBe(2);
  });

  it('finish ends the run', () => {
    expect(apply({ op: 'finish', outcome: 'success', reason: 'done' }).status).toBe('success');
    expect(apply({ op: 'finish', outcome: 'failure', reason: 'boom' }).status).toBe('failure');
  });

  it('never mutates the state it was given', () => {
    const before = state();
    const snapshot = JSON.stringify(before);

    const first = effectContext();
    applyEffect({ op: 'move_to', room: 'corridor' }, first.state, first);

    const second = effectContext({ target: 'keycard' });
    applyEffect({ op: 'add_to_inventory', arg: 'target' }, second.state, second);

    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
