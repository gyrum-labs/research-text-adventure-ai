/*
 * The adventures this project ships.
 *
 * Every adventure is validated when this module loads. An adventure that does
 * not match the schema is a broken fixture, and a broken fixture discovered at
 * load is worth a great deal more than a broken fixture discovered halfway
 * through a hundred runs.
 */

import type { Adventure } from '../kernel/types.js';
import { validateAdventure } from './schema.js';
import { adventure as missionImpossible } from './mission-impossible/adventure.js';
import { GOLD_PATH as missionImpossibleGoldPath } from './mission-impossible/gold-path.js';
import { adventure as hotfix } from './hotfix-2-4-1/adventure.js';
import { GOLD_PATH as hotfixGoldPath } from './hotfix-2-4-1/gold-path.js';

export const ADVENTURES: Record<string, Adventure> = {
  [missionImpossible.id]: validateAdventure(missionImpossible),
  [hotfix.id]: validateAdventure(hotfix),
};

/**
 * The shortest winning route through each world.
 *
 * The route belongs to the world, so the CLI's scripted policy asks for it by
 * id rather than importing one world's route and replaying it everywhere.
 */
const GOLD_PATHS: Record<string, string[]> = {
  [missionImpossible.id]: missionImpossibleGoldPath,
  [hotfix.id]: hotfixGoldPath,
};

export function goldPathFor(id: string): string[] {
  adventureById(id);
  return GOLD_PATHS[id]!;
}

export function adventureById(id: string): Adventure {
  const found = ADVENTURES[id];
  if (found === undefined) {
    throw new Error(`unknown adventure: ${id}. Known: ${Object.keys(ADVENTURES).join(', ')}`);
  }
  return found;
}
