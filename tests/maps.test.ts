/*
 * The maps cannot go stale.
 *
 * A map that no longer matches the code is worse than no map, because a
 * reader believes it. This test compares the committed file with what the
 * generator draws from the adventures and the phase plan, so a world that
 * changes without its map failing CI.
 *
 * The verb tables get their own checks, because a generated table can match
 * its generator exactly and still be wrong. This one listed a row for every
 * action rule and called the result verbs.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADVENTURES } from '../src/adventures/index.js';
import { buildMaps, verbTable } from '../src/maps/maps.js';

const ROOT = join(import.meta.dirname, '..');

/** The verb table of one world, as [verb, also, takes] rows. */
function verbRows(maps: string, title: string): string[][] {
  const heading = maps.indexOf('### The verbs', maps.indexOf(`## ${title}`));
  const end = maps.indexOf('### The goals', heading);
  return maps
    .slice(heading, end)
    .split('\n')
    .filter((line) => line.startsWith('| `'))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.replaceAll('`', '').trim()));
}

/** The part of a world's section that runs from its title to its rooms. */
function worldHeader(maps: string, title: string): string {
  const start = maps.indexOf(`## ${title}`);
  return maps.slice(start, maps.indexOf('### The rooms', start));
}

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

describe('the verb tables', () => {
  const worlds = Object.values(ADVENTURES);

  // regression: the table rendered one row per action rule, so a world that
  // declares four `go` rules showed four identical `go` rows, and every
  // synonym cell opened with a stray comma.
  it('give every verb exactly one row, however many rules share it', () => {
    const maps = buildMaps(ROOT);
    for (const world of worlds) {
      const verbs = [...new Set(world.actions.map((rule) => rule.verb))];
      // The worlds do declare several rules under one verb, or this proves nothing.
      expect(world.actions.length).toBeGreaterThan(verbs.length);
      expect(verbRows(maps, world.title).map((row) => row[0])).toEqual(verbs);
    }
  });

  it('open no synonym cell with a stray comma', () => {
    const maps = buildMaps(ROOT);
    for (const world of worlds) {
      for (const [, also] of verbRows(maps, world.title)) {
        expect(also).not.toMatch(/^,|,\s*,|,\s*$/);
      }
    }
  });

  it('keep the synonyms in the order the author wrote them', () => {
    const maps = buildMaps(ROOT);
    for (const world of worlds) {
      const rows = new Map(verbRows(maps, world.title).map((row) => [row[0], row]));
      const firstRuleOf = new Set<string>();
      for (const rule of world.actions) {
        if (firstRuleOf.has(rule.verb)) continue;
        firstRuleOf.add(rule.verb);
        // The merged list opens with the first rule's own synonyms.
        const synonyms = (rule.synonyms ?? []).join(', ');
        const also = rows.get(rule.verb)?.[1];
        expect(also?.startsWith(synonyms)).toBe(true);
      }
    }
  });

  // regression: the header counted the action rules and called them verbs, so
  // it said "19 verbs" above a table of twelve.
  it('agree with the world header on how many verbs there are', () => {
    const maps = buildMaps(ROOT);
    for (const world of worlds) {
      const listed = verbRows(maps, world.title).length;
      expect(worldHeader(maps, world.title)).toContain(`· ${listed} verbs (${world.actions.length} rules) ·`);
    }
  });
});

describe('the verb table generator', () => {
  it('merges the rules of one verb into a single row', () => {
    const table = verbTable([
      { verb: 'go', synonyms: ['walk'], args: [{ name: 'target' }] },
      { verb: 'go', synonyms: ['walk', 'move'], args: [{ name: 'target' }] },
      { verb: 'go', args: [{ name: 'target' }] },
      { verb: 'look', args: [] },
    ]);
    expect(table.split('\n')).toEqual([
      '| Verb | Also | Takes |',
      '|---|---|---|',
      '| `go` | walk, move | target |',
      '| `look` |  |  |',
    ]);
  });

  it('drops an empty synonym entry instead of leaving a stray comma', () => {
    const table = verbTable([{ verb: 'take', synonyms: ['', 'get', 'grab'], args: [{ name: 'target' }] }]);
    expect(table).toContain('| `take` | get, grab | target |');
  });

  it('keeps the header and separator ahead of the rows, whatever a verb is called', () => {
    const table = verbTable([{ verb: '---', args: [] }, { verb: 'Verb', args: [] }]);
    expect(table.split('\n').slice(0, 2)).toEqual(['| Verb | Also | Takes |', '|---|---|---|']);
  });
});
