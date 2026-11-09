/*
 * The live matrix configuration.
 *
 * A live matrix is only worth running if every model in it can be reached and
 * can be priced. The configuration names the endpoint and the variable the key
 * is read from, and the price table is what turns a run into a cost.
 *
 * A model that is missing from either is a model whose numbers would be a
 * fiction, so the test is here rather than in a reviewer's memory.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRICES } from '../../src/runner/metrics.js';
import type { MatrixConfig } from '../../src/runner/matrix.js';

const REPO_ROOT = new URL('../..', import.meta.url).pathname;

const CONFIG = JSON.parse(
  readFileSync(join(REPO_ROOT, 'configs/matrix.live.json'), 'utf8'),
) as MatrixConfig;

const TURN_BOUND = JSON.parse(
  readFileSync(join(REPO_ROOT, 'configs/matrix.live-turnbound.json'), 'utf8'),
) as MatrixConfig;

describe('the live matrix configuration', () => {
  it('names an endpoint and a key variable for every model', () => {
    for (const model of CONFIG.models) {
      expect(model.provider, model.id).not.toBe('surrogate');
      expect(model.baseUrl, model.id).toBeTruthy();
      expect(model.apiKeyEnv, model.id).toBeTruthy();
    }
  });

  it('prices every model, so the cost column is a number and not a shrug', () => {
    for (const model of CONFIG.models) {
      const key = `${model.provider}/${model.model}`;
      expect(PRICES[key], key).toBeDefined();
    }
  });

  it('runs the same grid as the offline matrix', () => {
    expect(CONFIG.conditions).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(CONFIG.seeds).toBe(10);
    expect(CONFIG.maxTurns).toBe(30);
    expect(CONFIG.goldPathLength).toBe(10);
  });

  it('asks for as many models as the offline matrix does', () => {
    expect(CONFIG.models).toHaveLength(4);
  });

  it('writes somewhere of its own, so the offline results are not overwritten', () => {
    expect(CONFIG.runsDir).toBe('runs/live');
    expect(CONFIG.resultsDir).toBe('results/live');
  });

  it('holds the shipped budgets, so the live matrix is the same matrix', () => {
    expect(CONFIG.budgets).toBeUndefined();
  });
});

describe('the turn-bound live matrix configuration', () => {
  it('runs the same grid as the offline matrix', () => {
    expect(TURN_BOUND.conditions).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(TURN_BOUND.seeds).toBe(10);
    expect(TURN_BOUND.maxTurns).toBe(30);
    expect(TURN_BOUND.goldPathLength).toBe(10);
    expect(TURN_BOUND.models).toHaveLength(4);
  });

  it('names the same models as the other live configuration', () => {
    expect(TURN_BOUND.models.map((model) => model.id)).toEqual(
      CONFIG.models.map((model) => model.id),
    );
  });

  it('lets the turn budget bind, rather than the token ceiling or the loop guard', () => {
    expect(TURN_BOUND.budgets?.maxTotalTokens).toBe(250000);
    expect(TURN_BOUND.budgets?.maxRepeatedStates).toBe(30);
  });

  it('writes somewhere of its own, so the other live results are not overwritten', () => {
    expect(TURN_BOUND.runsDir).toBe('runs/live-turnbound');
    expect(TURN_BOUND.resultsDir).toBe('results/live-turnbound');
  });
});
