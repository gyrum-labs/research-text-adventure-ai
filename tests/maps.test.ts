/*
 * The maps cannot go stale.
 *
 * A map that no longer matches the code is worse than no map, because a
 * reader believes it. This test compares the committed file with what the
 * generator draws from the adventures and the phase plan, so a world that
 * changes without its map failing CI.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildMaps } from '../src/maps/maps.js';

const ROOT = join(import.meta.dirname, '..');

describe('the generated maps', () => {
  it('match what the repository says today', () => {
    const committed = readFileSync(join(ROOT, 'docs', 'MAPS.md'), 'utf8');
    expect(committed).toBe(buildMaps(ROOT));
  });

  it('cover every world the repository ships', () => {
    const maps = buildMaps(ROOT);
    expect(maps).toContain('## Operation Nightingale');
    expect(maps).toContain('## The 2.4.1 Hotfix');
    expect(maps).toContain('```mermaid');
  });

  it('draw the gold path of every world', () => {
    const maps = buildMaps(ROOT);
    expect(maps).toContain('take keycard');
    expect(maps).toContain('claim incident ticket');
  });
});
