/*
 * The form a world shows is the form a world accepts.
 *
 * An observation names an object, and an agent writes that name back when the
 * world asks what to unlock something with. If the world then compares that
 * text against a different spelling of the same object, the agent is refused
 * for writing what it was shown, and the refusal names the thing it provided.
 * The hotfix world did exactly that for its incident ticket, and seven batch
 * runs in a row stopped there. These checks hold every shipped world to the
 * rule that the shown form is the accepted form.
 */

import { describe, expect, it } from 'vitest';
import { ADVENTURES } from '../../src/adventures/index.js';
import { adventure as hotfix } from '../../src/adventures/hotfix-2-4-1/adventure.js';
import type { Adventure, Predicate } from '../../src/kernel/types.js';

/** Every spelling a world accepts for an object, mapped to the name it shows. */
function acceptedForms(adventure: Adventure): Map<string, string> {
  const shown = new Map<string, string>();
  for (const object of Object.values(adventure.objects)) {
    shown.set(object.id, object.name);
    shown.set(object.name, object.name);
    for (const alias of object.aliases ?? []) shown.set(alias, object.name);
  }
  return shown;
}

/**
 * The spellings a world requires where it asks for an object by text.
 *
 * Only arguments the world treats as text are checked: those are compared
 * literally, so the spelling matters. An argument resolved as an object is
 * compared against the object's identifier, which is the world's own business
 * and never shown to anybody.
 */
function requiredTextForms(adventure: Adventure): Array<{ required: string; names: string }> {
  const shown = acceptedForms(adventure);
  const found: Array<{ required: string; names: string }> = [];
  for (const rule of adventure.actions) {
    const roles = new Map(rule.args.map(arg => [arg.name, arg.role]));
    for (const predicate of rule.requires as Predicate[]) {
      if (predicate.op !== 'arg_equals') continue;
      if (roles.get(predicate.arg) !== 'text') continue;
      const name = shown.get(predicate.value);
      if (name !== undefined) found.push({ required: predicate.value, names: name });
    }
  }
  return found;
}

describe('the form a world shows is the form it accepts', () => {
  it('holds in every shipped world', () => {
    for (const adventure of Object.values(ADVENTURES)) {
      const mismatched = requiredTextForms(adventure).filter(entry => entry.required !== entry.names);
      const described = mismatched.map(form => `"${form.required}" where it shows "${form.names}"`);
      expect(described, `${adventure.id}: ${described.join('; ')}`).toEqual([]);
    }
  });

  it('would catch the world that required a spelling it never showed', () => {
    // The hotfix world as it shipped: the gate demanded the hyphenated alias
    // while observations showed the ticket with a space.
    const asShipped: Adventure = {
      ...hotfix,
      actions: hotfix.actions.map(rule => ({
        ...rule,
        requires: rule.requires.map(predicate =>
          predicate.op === 'arg_equals' && predicate.value === 'incident ticket'
            ? { ...predicate, value: 'incident-ticket' }
            : predicate),
      })),
    };
    const mismatched = requiredTextForms(asShipped).filter(entry => entry.required !== entry.names);
    expect(mismatched).toEqual([{ required: 'incident-ticket', names: 'incident ticket' }]);
  });
});

describe('unlocking the hotfix release gate', () => {
  it('accepts the name the world shows for the incident ticket', async () => {
    const { InMemorySession } = await import('../../src/session/in-memory.js');
    const { hashInitial } = await import('../../src/kernel/hash.js');
    const state = structuredClone(hotfix.initial);
    state.roomId = 'release_engineering';
    state.inventory = ['incident_ticket', 'deploy_credential'];
    for (const id of state.inventory) state.objects[id]!.at = null;
    const session = new InMemorySession('shown-form', hotfix);
    session.restore(state, hashInitial(state), 0);

    const turn = await session.send('unlock release gate with incident ticket');
    expect(turn.events.some(event => event.type === 'action_succeeded')).toBe(true);
    expect(turn.status).toBe('running');
  });

  it('wins on the shortest route it publishes', async () => {
    const { reduce } = await import('../../src/kernel/reduce.js');
    const { parseCommand } = await import('../../src/kernel/parser.js');
    const { GOLD_PATH } = await import('../../src/adventures/hotfix-2-4-1/gold-path.js');
    let state = structuredClone(hotfix.initial);
    for (const raw of GOLD_PATH) {
      const parsed = parseCommand(hotfix, state, raw);
      expect(parsed.ok, `${raw} did not parse`).toBe(true);
      if (parsed.ok) state = reduce(hotfix, state, parsed.command).state;
    }
    expect(state.status).toBe('success');
  });
});
