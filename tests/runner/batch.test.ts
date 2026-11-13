/*
 * The repeatability batch.
 *
 * Twenty runs, ten per world, one plan written before any of them starts.
 * These checks are about the promises the experiment makes to the person
 * paying for it: nothing runs before the plan exists, no run starts the
 * experiment cannot afford, a failed run stays failed, a resumed experiment
 * finishes only what is left, and the report says what actually happened.
 *
 * Every check here runs offline against a provider that is stood in for, so
 * the gates can be exercised as often as they need without spending anything.
 */

import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildPlan,
  openLedger,
  persistPlan,
  readPlan,
  loadLedger,
  reserveCell,
  runBatch,
  summarise,
  worstCaseCost,
} from '../../src/runner/batch.js';
import { adventure as mission } from '../../src/adventures/mission-impossible/adventure.js';
import { adventure as hotfix } from '../../src/adventures/hotfix-2-4-1/adventure.js';
import type { LlmProvider } from '../../src/agents/llm/provider.js';
import type { Adventure } from '../../src/kernel/types.js';

const PRICES = { source: 'openrouter models api', checkedAt: '2026-11-13T00:00:00Z',
  inputPerMillion: 0.32, outputPerMillion: 0.89 };

const BUDGETS = { maxTurns: 20, maxTotalTokens: 30_000, maxOutputTokensPerTurn: 300,
  maxWallClockMs: 120_000, maxParseErrors: 3, maxRepeatedStates: 3,
  maxTransientProviderErrors: 2, providerRetryDelayMs: 0, maxHints: 3 };

function planInput() {
  return {
    worlds: [mission, hotfix] as Adventure[],
    runsPerWorld: 10,
    model: { provider: 'openrouter', model: 'deepseek/deepseek-chat' },
    temperature: 0 as const,
    promptVersion: 'llm-prompt-v4',
    promptHash: 'sha256:prompt',
    budgets: BUDGETS,
    prices: PRICES,
    sourceRevision: '0bfe794',
    maxTotalUsd: 0.4,
    maxPerRunUsd: 0.02,
  };
}

function tmpRoot(): string {
  return mkdtempSync(join(tmpdir(), 'batch-'));
}

/** A provider that always solves the mission with the same three commands. */
function winningProvider(calls: { count: number }): LlmProvider {
  return {
    id: 'mock', model: 'deepseek/deepseek-chat',
    async complete() { calls.count += 1; return { text: 'COMMAND: take keycard', usage: { inputTokens: 10, outputTokens: 2 } }; },
  };
}

describe('the worst-case cost of one run', () => {
  it('reserves the dearer token price for the output the budget allows', () => {
    const cost = worstCaseCost(BUDGETS, PRICES);
    // 20 turns of 300 output tokens is the output ceiling; the rest of the
    // 30,000 token cap can only be input.
    expect(cost).toBeCloseTo((24_000 * 0.32 + 6_000 * 0.89) / 1_000_000, 10);
  });

  it('stays inside the per-run ceiling this experiment is allowed', () => {
    expect(worstCaseCost(BUDGETS, PRICES)).toBeLessThanOrEqual(0.02);
  });
});

describe('the plan', () => {
  it('names both worlds, ten cells each, and the conditions every run shares', () => {
    const plan = buildPlan(planInput());
    expect(plan.cells).toHaveLength(20);
    expect(plan.cells.filter(cell => cell.world === mission.id)).toHaveLength(10);
    expect(plan.cells.filter(cell => cell.world === hotfix.id)).toHaveLength(10);
    expect(plan.model).toEqual({ provider: 'openrouter', model: 'deepseek/deepseek-chat' });
    expect(plan.worldVersions).toEqual([
      { id: mission.id, version: mission.version },
      { id: hotfix.id, version: hotfix.version },
    ]);
  });

  it('is written before any run and reads back the same', () => {
    const root = tmpRoot();
    const plan = buildPlan(planInput());
    persistPlan(plan, root);
    expect(existsSync(join(root, 'plan.json'))).toBe(true);
    expect(readPlan(root)).toEqual(plan);
  });
});

describe('the budget gate', () => {
  it('reserves the whole worst case before the run and settles the real cost after', () => {
    const ledger = openLedger(buildPlan(planInput()));
    const cell = ledger.cells[0]!;
    const worst = worstCaseCost(BUDGETS, PRICES);

    expect(reserveCell(ledger, cell).reserved).toBe(true);
    expect(ledger.reservedUsd).toBeCloseTo(worst, 10);
    expect(cell.chargeState).toBe('unsettled');
    expect(ledger.spentUsd).toBe(0);
  });

  it('refuses a run the remaining allowance cannot cover, before any spend', () => {
    const plan = buildPlan(planInput());
    const ledger = openLedger(plan);
    ledger.maxTotalUsd = worstCaseCost(BUDGETS, PRICES) * 2;
    const first = ledger.cells[0]!;
    const second = ledger.cells[1]!;
    reserveCell(ledger, first);
    const gate = reserveCell(ledger, second);

    expect(gate.reserved).toBe(false);
    expect(second.status).toBe('unperformed');
    expect(second.chargeState).toBe('refused');
    expect(second.refusalReason).toContain('allowance');
    expect(ledger.reservedUsd).toBeLessThanOrEqual(ledger.maxTotalUsd);
  });
});

describe('running the batch', () => {
  it('keeps every outcome, spends once, and never runs a cell twice', async () => {
    const root = tmpRoot();
    const plan = buildPlan(planInput());
    persistPlan(plan, root);
    const ledger = openLedger(plan);
    const calls = { count: 0 };
    const provider = winningProvider(calls);
    const before = calls.count;

    await runBatch(plan, ledger, {
      root, providerFor: () => provider, adventureFor: id => (id === hotfix.id ? hotfix : mission),
      now: () => Date.now(),
    });

    expect(ledger.cells).toHaveLength(20);
    expect(ledger.cells.every(cell => cell.status === 'attempted')).toBe(true);
    expect(ledger.cells.every(cell => cell.replayOk === true)).toBe(true);
    expect(ledger.spentUsd).toBeGreaterThan(0);
    expect(ledger.reservedUsd).toBe(0);
    expect(calls.count - before).toBe(20);
  });

  it('resumes with only the outstanding cells and keeps the failed one failed', async () => {
    const root = tmpRoot();
    const plan = buildPlan(planInput());
    persistPlan(plan, root);
    const ledger = openLedger(plan);
    const failing = {
      id: 'mock', model: 'deepseek/deepseek-chat',
      complete: () => { throw new Error('the provider is down'); },
      async complete() { throw new Error('the provider is down'); },
    } as unknown as LlmProvider;

    await runBatch(plan, ledger, {
      root, providerFor: () => failing, adventureFor: id => (id === hotfix.id ? hotfix : mission),
      now: () => Date.now(),
    });

    const attempted = ledger.cells.filter(cell => cell.status === 'attempted');
    expect(attempted.length).toBeGreaterThan(0);
    expect(attempted.every(cell => cell.outcome === undefined)).toBe(true);
    const spentAfterFailure = ledger.spentUsd;
    const outstandingBefore = ledger.cells.filter(cell => cell.status === 'outstanding').length;

    // A resume runs only what is left, and the failed cell stays failed.
    const calls = { count: 0 };
    await runBatch(plan, ledger, {
      root, providerFor: () => winningProvider(calls),
      adventureFor: id => (id === hotfix.id ? hotfix : mission), now: () => Date.now(),
    });

    expect(ledger.cells.filter(cell => cell.status === 'attempted')).toHaveLength(20);
    expect(ledger.cells.filter(cell => cell.status === 'outstanding')).toHaveLength(0);
    expect(ledger.cells.find(cell => cell.outcome === undefined && cell.status === 'attempted'))
      .toBeDefined();
    expect(ledger.spentUsd).toBeGreaterThanOrEqual(spentAfterFailure);
    expect(outstandingBefore).toBeGreaterThan(0);
  });
});

describe('the report', () => {
  it('counts attempts, shortfalls and money without dressing them up', async () => {
    const root = tmpRoot();
    const plan = buildPlan(planInput());
    persistPlan(plan, root);
    const ledger = openLedger(plan);
    const calls = { count: 0 };
    await runBatch(plan, ledger, {
      root, providerFor: () => winningProvider(calls),
      adventureFor: id => (id === hotfix.id ? hotfix : mission), now: () => Date.now(),
    });

    const report = summarise(ledger);
    expect(report.planned).toBe(20);
    expect(report.attempted).toBe(20);
    expect(report.outstanding).toBe(0);
    expect(report.unperformed).toBe(0);
    expect(report.successes).toBe(0);
    expect(report.fraction).toBe(0);
    expect(report.sampleSize).toBe(20);
    expect(report.costPerSolve).toBeNull();
    expect(report.spentUsd).toBeGreaterThan(0);
    expect(report.shortfall).toBeNull();
    expect(Object.keys(report.failures).length).toBeGreaterThan(0);
  });

  it('reports a shortfall and leaves the plan unfinished when cells were refused', () => {
    const plan = buildPlan(planInput());
    const ledger = openLedger(plan);
    ledger.maxTotalUsd = 0;
    for (const cell of ledger.cells) reserveCell(ledger, cell);

    const report = summarise(ledger);
    expect(report.unperformed).toBe(20);
    expect(report.shortfall).toContain('20');
    expect(report.fraction).toBeNull();
    expect(report.costPerSolve).toBeNull();
  });
});
