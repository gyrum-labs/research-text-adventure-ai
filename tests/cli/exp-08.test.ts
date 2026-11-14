/*
 * The engine comparison's artefacts.
 *
 * A comparison whose numbers live only in a log cannot be audited: the log
 * dies with the worktree and the prose outlives the evidence. So the
 * experiment writes its summary beside the transcripts, like every other
 * experiment here, and this test holds the artefacts to the runs they
 * summarise — played by the surrogate, offline, deterministically.
 */

import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildArtefacts, cellCounts, runComparison, type ComparisonCell } from '../../src/cli/exp-08.js';
import { SurrogateProvider } from '../../src/agents/surrogate.js';
import { MISSION_IMPOSSIBLE_PLAN } from '../../src/agents/surrogate.js';

const surrogate = {
  id: 'surrogate',
  make: (seed: number) =>
    new SurrogateProvider({
      plan: MISSION_IMPOSSIBLE_PLAN,
      attentionTokens: 4000,
      reliability: 1,
      seed,
    }),
};

describe('the engine comparison artefacts', () => {
  it('writes a summary beside the transcripts', async () => {
    const directory = join(tmpdir(), `exp08-${Date.now()}`);
    const cells = await runComparison({
      models: [surrogate],
      conditions: ['A'],
      seeds: 2,
      root: join(directory, 'runs'),
      resultsDir: join(directory, 'results'),
    });

    const results = join(directory, 'results');
    expect(existsSync(join(results, 'summary.json'))).toBe(true);
    expect(existsSync(join(results, 'summary.md'))).toBe(true);

    const summary = JSON.parse(readFileSync(join(results, 'summary.json'), 'utf8')) as {
      engine: string;
      cells: Array<{ outcome: string }>;
      totals: { runs: number; solved: number };
    };

    expect(summary.engine).toBe('questkit');
    expect(summary.cells).toHaveLength(2);
    expect(summary.totals.runs).toBe(2);
    expect(summary.totals.solved).toBe(2);
    expect(cells.every((cell) => cell.outcome === 'success')).toBe(true);
  });

  it('agrees with itself when asked for counts', () => {
    const cells: ComparisonCell[] = [
      { model: 'one', condition: 'A', seed: 1, outcome: 'success', turns: 10, parseErrors: 0, invalidActions: 0, tokensUsed: 100, failure: null },
      { model: 'one', condition: 'A', seed: 2, outcome: 'budget_exhausted', turns: 30, parseErrors: 2, invalidActions: 5, tokensUsed: 300, failure: 'F3' },
    ];

    const counts = cellCounts(cells);
    expect(counts).toEqual([
      { model: 'one', condition: 'A', runs: 2, solved: 1, medianTurns: 30, parseErrors: 2 },
    ]);

    const { md } = buildArtefacts(cells);
    expect(md).toContain('Solved 1 of 2 runs');
    expect(md).toContain('F3: 1');
  });

  it('writes nothing when no results directory is named', async () => {
    const directory = join(tmpdir(), `exp08-noart-${Date.now()}`);
    await runComparison({
      models: [surrogate],
      conditions: ['A'],
      seeds: 1,
      root: join(directory, 'runs'),
    });

    expect(existsSync(join(directory, 'results'))).toBe(false);
  });
});
