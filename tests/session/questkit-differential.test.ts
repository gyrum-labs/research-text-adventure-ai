/*
 * Are the two worlds the same game?
 *
 * The engine comparison is only a comparison of engines if the two sides
 * hold the same world: the same rooms, the same objects with the same names
 * and synonyms, the same doors with the same locks, the same verbs, and the
 * same ten commands to win. This test says that, and fails when it stops
 * being true.
 *
 * The claim used to live in prose, where nothing could check it.
 */

import { describe, expect, it } from 'vitest';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';
import { GOLD_PATH as OUR_GOLD_PATH } from '../../src/adventures/mission-impossible/gold-path.js';
import {
  GOLD_PATH as PORT_GOLD_PATH,
  QUESTKIT_ADVENTURE,
} from '../../src/session/questkit-mission-impossible/session.js';
import { WORLD } from '../../src/session/questkit-mission-impossible/world.js';
import type { Section } from '../../src/session/questkit-mission-impossible/engine.js';

/** The port's sections, by kind. */
function sectionsOf(type: Section['type']): Section[] {
  return WORLD.filter((section) => section.type === type);
}

/** The attributes of one section. */
function attributesOf(section: Section): Record<string, unknown> {
  return section.attributes ?? {};
}

/**
 * Which command answers each of our verbs.
 *
 * Six of them come from the toolkit's own library and the port never
 * declares them; the rest the port declares itself. Naming the mapping is
 * the point: a verb our world has and the port cannot answer would be a
 * difference in the game, not in the engine.
 */
const VERB_TO_COMMAND: Record<string, string> = {
  look: 'look',
  examine: 'lookat',
  take: 'take',
  inventory: 'inventory',
  open: 'open',
  read: 'read',
  unlock: 'unlock',
  cut: 'cut',
  go: 'go',
  wait: 'wait',
  hint: 'hint',
  help: 'help',
};

/** The verbs the toolkit answers without the port declaring them. */
const TOOLKIT_COMMANDS = ['look', 'lookat', 'take', 'inventory', 'drop', 'undo'];

describe('the two worlds', () => {
  it('hold the same rooms', () => {
    const ours = Object.keys(adventure.rooms).sort();
    const theirs = sectionsOf('location')
      .map((section) => section.name)
      .sort();

    expect(theirs).toEqual(ours);
  });

  it('hold the same objects', () => {
    const ours = Object.keys(adventure.objects).sort();
    const theirs = sectionsOf('object')
      .map((section) => section.name)
      .filter((name) => name !== 'player')
      .sort();

    expect(theirs).toEqual(ours);
  });

  it('name the objects the same way, synonyms included', () => {
    for (const [id, object] of Object.entries(adventure.objects)) {
      const section = sectionsOf('object').find((entry) => entry.name === id);
      expect(section, `the port has no object called ${id}`).toBeDefined();

      const attributes = attributesOf(section!);
      expect(attributes['alias'], `${id} is shown under another name`).toBe(object.name);
      expect([...(attributes['alt'] as string[] ?? [])].sort()).toEqual(
        [...(object.aliases ?? [])].sort(),
      );
    }
  });

  it('hold the same doors, with the same locks', () => {
    const ours = Object.keys(adventure.doors).sort();
    const theirs = sectionsOf('exit')
      .map((section) => section.name)
      .sort();

    expect(theirs).toEqual(ours);

    for (const [id, door] of Object.entries(adventure.doors)) {
      const section = sectionsOf('exit').find((entry) => entry.name === id);
      expect(section, `the port has no door called ${id}`).toBeDefined();

      const attributes = attributesOf(section!);
      expect(attributes['parent']).toBe(door.from);
      expect(attributes['to']).toBe(door.to);
      expect(attributes['locked'] === true).toBe(door.locked === true);
    }
  });

  it('answer every verb our world answers', () => {
    const ours = [...new Set(adventure.actions.map((action) => action.verb))].sort();
    const declared = sectionsOf('command').map((section) => section.name);

    for (const verb of ours) {
      const command: string = VERB_TO_COMMAND[verb] ?? '';
      expect(
        declared.includes(command) || TOOLKIT_COMMANDS.includes(command),
        `the port cannot answer ${verb}`,
      ).toBe(true);
    }
  });

  it('are won by the same ten commands', () => {
    expect(PORT_GOLD_PATH).toEqual(OUR_GOLD_PATH);
  });

  it('ask for the same objectives', () => {
    const ours = adventure.goals.map((goal) => ({ id: goal.id, text: goal.text }));
    const theirs = QUESTKIT_ADVENTURE.goals.map((goal) => ({ id: goal.id, text: goal.text }));

    expect(theirs).toEqual(ours);
    expect(ours.map((goal) => goal.id).sort()).toEqual(['disarm', 'recover']);
  });

  it('give the agent the same brief', () => {
    const brief = sectionsOf('game')[0]!;
    expect(attributesOf(brief)['description']).toBe(adventure.brief);
  });
});
