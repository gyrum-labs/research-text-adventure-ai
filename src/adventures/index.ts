/*
 * The adventures this project ships. One so far.
 */

import type { Adventure } from '../kernel/types.js';
import { adventure as missionImpossible } from './mission-impossible/adventure.js';

export const ADVENTURES: Record<string, Adventure> = {
  [missionImpossible.id]: missionImpossible,
};

export function adventureById(id: string): Adventure {
  const found = ADVENTURES[id];
  if (found === undefined) {
    throw new Error(`unknown adventure: ${id}. Known: ${Object.keys(ADVENTURES).join(', ')}`);
  }
  return found;
}
