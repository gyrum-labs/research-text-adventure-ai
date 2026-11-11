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
import { runExp05, renderTable } from '../../src/cli/exp-05.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';
import type { CellSummary, MatrixConfig } from '../../src/runner/matrix.js';

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
    expect(rows.every((line) => line === line.trimEnd())).toBe(true);
  });

  it('pads the columns without leaving trailing whitespace', () => {
    const summary: CellSummary = {
      model: 'one',
      condition: 'A',
      expected: 1,
      runs: 1,
      complete: true,
      successes: 0,
      interval: { estimate: 0, lower: 0, upper: 0.5 },
      medianTurns: 0,
      costPerSolve: 0,
      tokensUsed: 0,
      tokensPerSolve: 0,
      failures: { F1: 1 },
    };

    const table = renderTable([summary], new Map([['one', 'model one']]));
    const lines = table.split('\n');

    expect(lines.every((line) => line === line.trimEnd())).toBe(true);
    expect(lines[0]).toContain('$/solve');
    expect(lines[2]).toContain('model one');
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

  it('writes to the directory the configuration names', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'exp05-'));
    const results = join(directory, 'results', 'live');
    // The run happens from a scratch directory, so a build that ignores the
    // configuration writes its fallback somewhere harmless instead of over
    // the results this repository keeps.
    const before = process.cwd();
    process.chdir(directory);
    try {
      await runExp05(adventure, {
        config: { ...CONFIG, resultsDir: results },
        root: join(directory, 'runs'),
      });
    } finally {
      process.chdir(before);
    }

    expect(existsSync(join(results, 'summary.json'))).toBe(true);
    expect(existsSync(join(directory, 'results', 'summary.json'))).toBe(false);
  });
});
