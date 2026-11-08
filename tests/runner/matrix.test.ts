/*
 * The matrix and the hypotheses.
 *
 * The matrix is the deliverable, and its two hard promises are that every
 * failed run lands in exactly one category and that a cell which does not
 * have all of its runs is reported as incomplete rather than averaged.
 */

import { describe, expect, it } from 'vitest';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  costPerSolvedMission,
  failureHistogram,
  runMatrix,
  summariseMatrix,
  type MatrixConfig,
} from '../../src/runner/matrix.js';
import { evaluateHypotheses } from '../../src/runner/hypotheses.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';

const CONFIG: MatrixConfig = {
  models: [
    {
      id: 'one',
      label: 'one',
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

function scratch(): string {
  return mkdtempSync(join(tmpdir(), 'matrix-'));
}

describe('the matrix', () => {
  it('produces one summary row per model and condition', async () => {
    const runs = await runMatrix(adventure, CONFIG, { root: scratch() });
    const summaries = summariseMatrix(runs, CONFIG);

    expect(summaries).toHaveLength(CONFIG.models.length * CONFIG.conditions.length);
  });

  it('writes a transcript, a metrics file and a classification for every run', async () => {
    const root = scratch();
    const runs = await runMatrix(adventure, CONFIG, { root });

    expect(runs).toHaveLength(CONFIG.models.length * CONFIG.conditions.length * CONFIG.seeds);

    for (const run of runs) {
      const directory = join(root, run.model, run.condition);
      expect(existsSync(join(directory, `${run.seed}.jsonl`))).toBe(true);
      expect(existsSync(join(directory, `${run.seed}.metrics.json`))).toBe(true);
      expect(run.metrics).not.toBeNull();
    }
  });

  it('gives every failed run exactly one category', async () => {
    const runs = await runMatrix(adventure, CONFIG, { root: scratch() });

    for (const run of runs) {
      if (run.metrics?.outcome === 'success') {
        expect(run.metrics.failure).toBeNull();
        continue;
      }
      expect(run.metrics?.failure).toMatch(/^F[1-9]$/);
    }
  });

  it('reports a cell with missing runs as incomplete rather than averaging it', async () => {
    const root = scratch();
    const full = await runMatrix(adventure, CONFIG, { root });
    const summaries = summariseMatrix(full, CONFIG);

    expect(summaries.every((summary) => summary.complete)).toBe(true);

    // A cell with one of its runs missing.
    const partial = summariseMatrix(
      full.filter((run) => !(run.condition === 'D' && run.seed === 2)),
      CONFIG,
    );
    const cell = partial.find((summary) => summary.condition === 'D');

    expect(cell?.complete).toBe(false);
    expect(cell?.runs).toBe(1);
    expect(cell?.expected).toBe(2);
  });

  it('does not re-run a cell whose artefacts are already there', async () => {
    const root = scratch();
    await runMatrix(adventure, CONFIG, { root });

    const before = join(root, 'one', 'A', '1.jsonl');
    const first = (await import('node:fs')).readFileSync(before, 'utf8');

    const second = await runMatrix(adventure, CONFIG, { root });
    const after = (await import('node:fs')).readFileSync(before, 'utf8');

    expect(after).toBe(first);
    expect(second).toHaveLength(CONFIG.models.length * CONFIG.conditions.length * CONFIG.seeds);
  });

  it('aggregates the failures across the whole matrix', async () => {
    const runs = await runMatrix(adventure, CONFIG, { root: scratch() });
    const summaries = summariseMatrix(runs, CONFIG);
    const counts = failureHistogram(summaries);

    const failures = runs.filter((run) => run.metrics?.failure !== null).length;
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

    expect(total).toBe(failures);
  });

  it('reports the cost of a solved mission', async () => {
    const runs = await runMatrix(adventure, CONFIG, { root: scratch() });

    expect(costPerSolvedMission(runs)).toBeGreaterThanOrEqual(0);
  });
});

describe('the hypotheses', () => {
  it('are all decided or explicitly untested, never left blank', async () => {
    const runs = await runMatrix(adventure, CONFIG, { root: scratch() });
    const summaries = summariseMatrix(runs, CONFIG);
    const verdicts = evaluateHypotheses(summaries, runs);

    expect(verdicts).toHaveLength(5);
    for (const verdict of verdicts) {
      expect(['supported', 'falsified', 'untested']).toContain(verdict.verdict);
      expect(verdict.reason.length).toBeGreaterThan(0);
    }
  });

  it('each say what they compared', async () => {
    const runs = await runMatrix(adventure, CONFIG, { root: scratch() });
    const summaries = summariseMatrix(runs, CONFIG);
    const verdicts = evaluateHypotheses(summaries, runs);

    const h2 = verdicts.find((verdict) => verdict.id === 'H2');
    expect(h2?.reason).toContain('masked');
  });

  it('report the no-history control as a failure, since it never finds the fact', async () => {
    const runs = await runMatrix(adventure, CONFIG, { root: scratch() });
    const summaries = summariseMatrix(runs, CONFIG);
    const control = summaries.find((summary) => summary.condition === 'D');

    expect(control?.successes).toBe(0);
  });
});
