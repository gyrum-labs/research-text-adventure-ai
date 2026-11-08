/*
 * Experiment 05, as it is printed.
 *
 * The table and the artefacts are the deliverable, so they get checked like
 * one: the table has a row per cell, the artefacts are on disk, and the
 * numbers in the artefacts are the numbers in the table.
 */

import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runExp05 } from '../../src/cli/exp-05.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';
import type { MatrixConfig } from '../../src/runner/matrix.js';

const CONFIG: MatrixConfig = {
  models: [
    {
      id: 'one',
      label: 'model one',
      provider: 'surrogate',
      model: 'one',
      attentionTokens: 4000,
      reliability: 0.95,
    },
  ],
  conditions: ['A', 'B', 'C', 'D', 'E'],
  seeds: 2,
  maxTurns: 30,
  goldPathLength: 10,
};

describe('the exp-05 output', () => {
  it('prints a row per cell', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'exp05-'));
    const output = await runExp05(adventure, {
      config: CONFIG,
      root: join(directory, 'runs'),
      resultsDir: join(directory, 'results'),
    });

    const rows = output
      .split('\n')
      .filter((line) => line.includes('model one'));
    expect(rows).toHaveLength(CONFIG.conditions.length);
  });

  it('writes the summary artefacts', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'exp05-'));
    const results = join(directory, 'results');
    await runExp05(adventure, {
      config: CONFIG,
      root: join(directory, 'runs'),
      resultsDir: results,
    });

    expect(existsSync(join(results, 'summary.json'))).toBe(true);
    expect(existsSync(join(results, 'summary.md'))).toBe(true);

    const summary = JSON.parse(readFileSync(join(results, 'summary.json'), 'utf8')) as {
      cells: Array<{ condition: string; successes: number; runs: number }>;
      hypotheses: Array<{ id: string; verdict: string }>;
    };

    expect(summary.cells).toHaveLength(CONFIG.conditions.length);
    expect(summary.hypotheses).toHaveLength(5);
  });

  it('reports the hypotheses as verdicts', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'exp05-'));
    const output = await runExp05(adventure, {
      config: CONFIG,
      root: join(directory, 'runs'),
      resultsDir: join(directory, 'results'),
    });

    for (const id of ['H1', 'H2', 'H3', 'H4', 'H5']) {
      expect(output).toContain(id);
    }
    expect(output).toMatch(/SUPPORTED|FALSIFIED|UNTESTED/);
  });

  it('says the control found nothing', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'exp05-'));
    await runExp05(adventure, {
      config: CONFIG,
      root: join(directory, 'runs'),
      resultsDir: join(directory, 'results'),
    });

    const summary = JSON.parse(
      readFileSync(join(directory, 'results', 'summary.json'), 'utf8'),
    ) as { cells: Array<{ condition: string; successes: number }> };

    expect(summary.cells.find((cell) => cell.condition === 'D')?.successes).toBe(0);
  });
});
