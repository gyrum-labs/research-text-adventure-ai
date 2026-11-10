/*
 * Experiment 04, as it is printed.
 *
 * The histogram is the deliverable, and a histogram that disagrees with the
 * runs behind it is worse than no histogram.
 */

import { describe, expect, it } from 'vitest';
import { histogram, renderHistogram, runSweep } from '../../src/cli/exp-04.js';
import { CATEGORIES } from '../../src/runner/classify.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('the sweep', () => {
  it('gives every failed run exactly one category', async () => {
    const runs = await runSweep(adventure, { seeds: 3, transcriptDir: mkdtempSync(join(tmpdir(), 'exp04-')) });

    const failed = runs.filter((run) => run.metrics.outcome !== 'success');
    expect(failed.length).toBeGreaterThan(0);

    for (const run of failed) {
      expect(run.metrics.failure, `${run.name} has no failure code`).not.toBeNull();
      expect(run.metrics.failure).toMatch(/^F[1-9]$/);
    }
  });

  it('leaves a successful run with no failure code', async () => {
    const runs = await runSweep(adventure, { seeds: 1, transcriptDir: mkdtempSync(join(tmpdir(), 'exp04-')) });

    const succeeded = runs.filter((run) => run.metrics.outcome === 'success');
    expect(succeeded.length).toBeGreaterThan(0);
    for (const run of succeeded) {
      expect(run.metrics.failure).toBeNull();
    }
  });

  it('puts a run in every category, so the histogram says something', async () => {
    const runs = await runSweep(adventure, { seeds: 5, transcriptDir: mkdtempSync(join(tmpdir(), 'exp04-')) });
    const counts = histogram(runs);

    for (const category of CATEGORIES) {
      expect(counts.get(category.code), `${category.code} has no runs`).toBeGreaterThan(0);
    }
  });

  it('classifies each fixture as the category it was built for', async () => {
    const runs = await runSweep(adventure, { seeds: 1, transcriptDir: mkdtempSync(join(tmpdir(), 'exp04-')) });
    const byName = new Map(runs.map((run) => [run.name, run.metrics.failure]));

    expect(byName.get('f1-malformed')).toBe('F1');
    expect(byName.get('f2-hallucination')).toBe('F2');
    expect(byName.get('f3-repeated-failure')).toBe('F3');
    expect(byName.get('f4-too-early')).toBe('F4');
    expect(byName.get('f5-no-exploration')).toBe('F5');
    expect(byName.get('f6-lethal-trap')).toBe('F6');
    expect(byName.get('f7-wandering')).toBe('F7');
    expect(byName.get('f8-provider-error')).toBe('F8');
    expect(byName.get('f9-abstention')).toBe('F9');
    expect(byName.get('gold-path')).toBeNull();
  });
});

describe('the histogram', () => {
  it('agrees with the per-run annotations', async () => {
    const runs = await runSweep(adventure, { seeds: 4, transcriptDir: mkdtempSync(join(tmpdir(), 'exp04-')) });
    const counts = histogram(runs);

    const counted = [...counts.values()].reduce((total, count) => total + count, 0);
    const failed = runs.filter((run) => run.metrics.failure !== null).length;

    expect(counted).toBe(failed);
  });

  it('draws every category, even the empty ones', async () => {
    const runs = await runSweep(adventure, { seeds: 1, transcriptDir: mkdtempSync(join(tmpdir(), 'exp04-')) });
    const drawn = renderHistogram(runs);

    for (const category of CATEGORIES) {
      expect(drawn).toContain(category.code);
      expect(drawn).toContain(category.name);
    }
    expect(drawn).toContain('runs ·');
  });
});
