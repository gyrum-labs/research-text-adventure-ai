/*
 * The adventure schema.
 *
 * The adventure is data, and data that is wrong at load time is a fixture that
 * lies for the rest of the experiment. The schema is the contract, and loading
 * validates against it so a typo fails loudly instead of quietly producing an
 * adventure with no way through.
 */

import { describe, expect, it } from 'vitest';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';
import { GOLD_PATH as hotfixGoldPath } from '../../src/adventures/hotfix-2-4-1/gold-path.js';
import { goldPathFor } from '../../src/adventures/index.js';
import { parseAdventure, validateAdventure } from '../../src/adventures/schema.js';

describe('the adventure registry', () => {
  it('gives each world its own gold path', () => {
    expect(goldPathFor('hotfix-2-4-1')).toBe(hotfixGoldPath);
    expect(goldPathFor('mission-impossible')).not.toBe(hotfixGoldPath);
    expect(goldPathFor('mission-impossible')).toHaveLength(10);
  });

  it('refuses an unknown world rather than replaying another world route', () => {
    expect(() => goldPathFor('no-such-world')).toThrow(/unknown adventure/);
  });
});

describe('the adventure schema', () => {
  it('accepts the adventure this project ships', () => {
    expect(parseAdventure(adventure)).toEqual(adventure);
  });

  it('rejects an adventure whose room has no exits', () => {
    const broken = {
      ...adventure,
      rooms: { briefing: { ...adventure.rooms.briefing!, exits: undefined } },
    };
    expect(() => parseAdventure(broken)).toThrow();
  });

  it('rejects an action with a predicate the kernel does not have', () => {
    const broken = {
      ...adventure,
      actions: [
        {
          ...adventure.actions[0]!,
          requires: [{ op: 'the_world_is_on_fire', value: true }],
        },
      ],
    };
    expect(() => parseAdventure(broken)).toThrow();
  });

  it('rejects an action with an effect the kernel does not have', () => {
    const broken = {
      ...adventure,
      actions: [{ ...adventure.actions[0]!, effects: [{ op: 'set_the_sky_blue' }] }],
    };
    expect(() => parseAdventure(broken)).toThrow();
  });

  it('rejects a state that places an object the adventure does not have', () => {
    const broken = {
      ...adventure,
      initial: {
        ...adventure.initial,
        objects: { ...adventure.initial.objects, ghost: { at: null, flags: {}, state: {} } },
      },
    };
    expect(() => validateAdventure(broken)).toThrow(/ghost/);
  });

  it('rejects a room that lists an object the adventure does not have', () => {
    const broken = {
      ...adventure,
      rooms: {
        ...adventure.rooms,
        briefing: { ...adventure.rooms.briefing!, contents: [...adventure.rooms.briefing!.contents, 'ghost'] },
      },
    };
    expect(() => validateAdventure(broken)).toThrow(/ghost/);
  });

  it('rejects a door that leads to a room the adventure does not have', () => {
    const broken = {
      ...adventure,
      doors: { ...adventure.doors, corridor_to_vault: { ...adventure.doors.corridor_to_vault!, to: 'moon' } },
    };
    expect(() => validateAdventure(broken)).toThrow(/moon/);
  });

  it('rejects a key the schema does not know', () => {
    const broken = { ...adventure, secretDifficulty: 3 };
    expect(() => parseAdventure(broken)).toThrow();
  });

  it('says which adventure failed when it fails', () => {
    const broken = { ...adventure, id: '' };
    expect(() => validateAdventure(broken)).toThrow(/adventure/);
  });
});
