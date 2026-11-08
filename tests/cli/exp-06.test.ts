/*
 * Experiment 06, as it is printed.
 *
 * The claim under test is a transfer claim, so the test is that the classifier
 * needed no new rule for the second world.
 */

import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runExp06 } from '../../src/cli/exp-06.js';

describe('the exp-06 output', () => {
  it('plays both worlds with the same harness', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'exp06-'));
    const output = await runExp06({
      root: join(directory, 'runs'),
      resultsDir: join(directory, 'results'),
    });

    expect(output).toContain('mission-impossible');
    expect(output).toContain('hotfix-2-4-1');
    expect(output).toContain('success');
  });

  it('says the taxonomy transfers', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'exp06-'));
    const output = await runExp06({
      root: join(directory, 'runs'),
      resultsDir: join(directory, 'results'),
    });

    expect(output).toContain('The taxonomy transfers: yes');
  });

  it('writes the comparison artefacts', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'exp06-'));
    const results = join(directory, 'results');
    await runExp06({ root: join(directory, 'runs'), resultsDir: results });

    const summary = JSON.parse(readFileSync(join(results, 'transfer.json'), 'utf8')) as {
      worlds: Array<{ id: string; goldPathLength: number; scripted: { outcome: string } }>;
      taxonomyCoversBothWorlds: boolean;
    };

    expect(summary.worlds).toHaveLength(2);
    expect(summary.taxonomyCoversBothWorlds).toBe(true);
    for (const world of summary.worlds) {
      expect(world.goldPathLength).toBe(10);
      expect(world.scripted.outcome).toBe('success');
    }
  });
});
