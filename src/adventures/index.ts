/*
 * The adventures this project ships. One so far.
 *
 * Every adventure is validated when this module loads. An adventure that does
 * not match the schema is a broken fixture, and a broken fixture discovered at
 * load is worth a great deal more than a broken fixture discovered halfway
 * through a hundred runs.
 */

import type { Adventure } from '../kernel/types.js';
import { validateAdventure } from './schema.js';
import { adventure as missionImpossible } from './mission-impossible/adventure.js';

export const ADVENTURES: Record<string, Adventure> = {
  [missionImpossible.id]: validateAdventure(missionImpossible),
};

export function adventureById(id: string): Adventure {
  const found = ADVENTURES[id];
  if (found === undefined) {
    throw new Error(`unknown adventure: ${id}. Known: ${Object.keys(ADVENTURES).join(', ')}`);
  }
  return found;
}
