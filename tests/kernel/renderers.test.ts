/*
 * The three renderers.
 *
 * The same observation, shown three ways: prose for a person, JSON for a
 * machine, and a structured version for a model's context. They must agree on
 * the facts. If they drift, a human transcript and an agent transcript stop
 * being comparable, and every measurement taken from them is measuring the
 * renderer rather than the agent.
 */

import { describe, expect, it } from 'vitest';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';
import { buildObservation } from '../../src/kernel/observation.js';
import {
  renderObservation,
  renderObservationJson,
  renderObservationStructured,
  renderObservationWith,
} from '../../src/kernel/render.js';
import type { Observation } from '../../src/kernel/types.js';

/** A state with something in the room, something carried and a locked door. */
function busyObservation(): Observation {
  const state = structuredClone(adventure.initial);
  state.roomId = 'corridor';
  state.inventory = ['keycard'];
  state.objects['keycard']!.at = null;
  state.objects['cutters']!.at = 'corridor';
  state.objects['manual']!.at = 'corridor';
  state.objects['locker']!.flags['closed'] = false;
  return buildObservation(adventure, state, ['You open the locker.']);
}

describe('the three renderers', () => {
  const observation = busyObservation();

  it('all carry the same facts', () => {
    const text = renderObservation(observation);
    const structured = renderObservationStructured(observation);

    for (const object of observation.visible) {
      expect(text, `the prose lost "${object.name}"`).toContain(object.name);
      expect(structured, `the structured rendering lost "${object.name}"`).toContain(object.name);
    }

    for (const object of observation.inventory) {
      expect(text).toContain(object.name);
      expect(structured).toContain(object.name);
    }

    for (const exit of observation.exits) {
      expect(text).toContain(exit.toName);
      expect(structured).toContain(exit.toName);
    }

    for (const goal of observation.goals) {
      expect(text).toContain(goal.text);
      expect(structured).toContain(goal.text);
    }

    for (const message of observation.messages) {
      expect(text, 'the prose lost a message').toContain(message);
      expect(structured, 'the structured rendering lost a message').toContain(message);
    }

    expect(text).toContain(observation.room.name);
    expect(structured).toContain(observation.room.name);
  });

  it('render JSON that is exactly the observation', () => {
    expect(JSON.parse(renderObservationJson(observation))).toEqual(observation);
  });

  it('render JSON with a stable key order', () => {
    const parsed = JSON.parse(renderObservationJson(observation)) as Record<string, unknown>;

    expect(Object.keys(parsed)).toEqual([
      'turn',
      'room',
      'visible',
      'inventory',
      'exits',
      'messages',
      'goals',
    ]);
    expect(Object.keys(parsed['room'] as object)).toEqual(['id', 'name', 'description']);
    expect(Object.keys((parsed['exits'] as object[])[0] as object)).toEqual([
      'direction',
      'label',
      'toName',
      'status',
    ]);
  });

  it('render the same JSON every time, so transcripts diff cleanly', () => {
    expect(renderObservationJson(observation)).toBe(renderObservationJson(observation));
  });

  it('differ in presentation, not in content', () => {
    const text = renderObservation(observation);
    const structured = renderObservationStructured(observation);
    const json = renderObservationJson(observation);

    expect(text).not.toBe(structured);
    expect(text).not.toBe(json);
    expect(structured).not.toBe(json);
  });

  it('give the structured rendering an explicit facts block', () => {
    const structured = renderObservationStructured(observation);

    expect(structured).toContain('Facts you know:');
    expect(structured).toContain('Location:');
    expect(structured).toContain('Carrying:');
    expect(structured).toContain('Objectives:');
  });

  it('dispatch on the variant', () => {
    expect(renderObservationWith(observation, 'text')).toBe(renderObservation(observation));
    expect(renderObservationWith(observation, 'json')).toBe(renderObservationJson(observation));
    expect(renderObservationWith(observation, 'text-structured')).toBe(
      renderObservationStructured(observation),
    );
  });
});
