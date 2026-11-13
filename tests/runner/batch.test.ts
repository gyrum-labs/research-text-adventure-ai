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

import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildPlan,
  openLedger,
  persistPlan,
  readPlan,
  saveLedger,
  loadLedger,
  reserveCell,
  runBatch,
  summarise,
  worstCaseCost,
  type BatchLedger,
  type BatchCellRecord,
} from '../../src/runner/batch.js';
import { adventure as mission } from '../../src/adventures/mission-impossible/adventure.js';
import { adventure as hotfix } from '../../src/adventures/hotfix-2-4-1/adventure.js';
import type { LlmProvider } from '../../src/agents/llm/provider.js';
import type { Adventure } from '../../src/kernel/types.js';

const PRICES = { source: 'openrouter models api', checkedAt: '2026-11-13T00:00:00Z',
  inputPerMillion: 0.32, outputPerMillion: 0.89 };

// One turn per run, so a cell maps to exactly one provider call and the
// call counts in these checks are exact rather than approximate.
const BUDGETS = { maxTurns: 1, maxTotalTokens: 30_000, maxOutputTokensPerTurn: 300,
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

/**
 * A provider that answers as the priced model would, so the accounting has a
 * real price table to work from.
 */
function answeringProvider(calls: { count: number }): LlmProvider {
  return {
    id: 'openrouter', model: 'deepseek/deepseek-chat',
    async complete() {
      calls.count += 1;
      return { text: 'COMMAND: take keycard', usage: { inputTokens: 10, outputTokens: 2 } };
    },
  };
}

/** A provider that is up but cannot help, which is how a failed run happens. */
function unavailableProvider(): LlmProvider {
  return {
    id: 'openrouter', model: 'deepseek/deepseek-chat',
    async complete() { return { text: '', transientError: 'the provider is down' }; },
  };
}

describe('the worst-case cost of one run', () => {
  it('reserves the dearer token price for the output the budget allows', () => {
    const cost = worstCaseCost(BUDGETS, PRICES);
    // One turn of 300 output tokens is the output ceiling here; the rest of
    // the 30,000 token cap can only be input.
    expect(cost).toBeCloseTo((29_700 * 0.32 + 300 * 0.89) / 1_000_000, 10);
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
    const worst = worstCaseCost(BUDGETS, PRICES);
    // Room for one and a bit more, but not for the whole worst case again.
    ledger.maxTotalUsd = worst * 1.5;
    const first = ledger.cells[0]!;
    const second = ledger.cells[1]!;
    reserveCell(ledger, first);
    const gate = reserveCell(ledger, second);

    expect(gate.reserved).toBe(false);
    expect(second.status).toBe('unperformed');
    expect(second.chargeState).toBe('refused');
    expect(second.refusalReason).toContain('allowance');
    expect(ledger.reservedUsd).toBeCloseTo(worst, 10);
    expect(ledger.spentUsd).toBe(0);
  });
});

describe('running the batch', () => {
  it('runs every cell once, keeps each outcome, and replays each transcript', async () => {
    const root = tmpRoot();
    const plan = buildPlan(planInput());
    persistPlan(plan, root);
    const ledger = openLedger(plan);
    const calls = { count: 0 };

    await runBatch(plan, ledger, {
      root, providerFor: () => answeringProvider(calls),
      adventureFor: id => (id === hotfix.id ? hotfix : mission), now: () => Date.now(),
    });

    expect(ledger.cells).toHaveLength(20);
    expect(ledger.cells.every(cell => cell.status === 'attempted')).toBe(true);
    expect(ledger.cells.every(cell => cell.chargeState === 'settled')).toBe(true);
    expect(ledger.cells.every(cell => cell.replayOk === true)).toBe(true);
    expect(ledger.cells.every(cell => existsSync(cell.transcriptPath ?? ''))).toBe(true);
    expect(ledger.reservedUsd).toBe(0);
    // One turn per run means one call per cell, so no cell was run twice.
    expect(calls.count).toBe(20);
    expect(new Set(ledger.cells.map(cell => cell.transcriptPath)).size).toBe(20);
    // The mock answers as the priced model, so the books carry real money.
    expect(ledger.spentUsd).toBeGreaterThan(0);
  });

  it('keeps a failed run failed and never retries it', async () => {
    const root = tmpRoot();
    const plan = buildPlan(planInput());
    persistPlan(plan, root);
    const ledger = openLedger(plan);
    const calls = { count: 0 };
    const options = {
      root, adventureFor: (id: string) => (id === hotfix.id ? hotfix : mission), now: () => Date.now(),
    };

    await runBatch(plan, ledger, { ...options, providerFor: () => unavailableProvider() });
    const failed = ledger.cells.filter(cell => cell.outcome !== 'success');
    expect(failed.length).toBe(20);
    const outcomes = new Set(failed.map(cell => cell.outcome));
    expect(outcomes.size).toBeGreaterThan(0);
    const spentOnFailures = ledger.spentUsd;

    const second = runBatch(plan, ledger, { ...options, providerFor: () => answeringProvider(calls) });
    await second;

    // Nothing was outstanding, so the resume made no calls and replaced nothing.
    expect(calls.count).toBe(0);
    expect(ledger.cells.filter(cell => cell.outcome !== 'success')).toHaveLength(failed.length);
    expect(ledger.spentUsd).toBe(spentOnFailures);
  });

  it('resumes with only the outstanding cells', async () => {
    const root = tmpRoot();
    const plan = buildPlan(planInput());
    persistPlan(plan, root);
    const ledger = openLedger(plan);

    // An experiment that was interrupted after five cells: those are done and
    // paid for, the rest never started.
    for (const [index, cell] of ledger.cells.entries()) {
      if (index >= 5) break;
      cell.status = 'attempted';
      cell.chargeState = 'settled';
      cell.outcome = 'success';
      cell.costUsd = 0.001;
      ledger.spentUsd += cell.costUsd;
    }
    saveLedger(ledger, root);
    const reopened = loadLedger(root);
    const calls = { count: 0 };

    await runBatch(reopened.plan, reopened, {
      root, providerFor: () => answeringProvider(calls),
      adventureFor: id => (id === hotfix.id ? hotfix : mission), now: () => Date.now(),
    });

    expect(calls.count).toBe(15);
    expect(reopened.cells).toHaveLength(20);
    expect(reopened.cells.slice(0, 5).every(cell => cell.status === 'attempted')).toBe(true);
    expect(reopened.cells.slice(5).every(cell => cell.status === 'attempted')).toBe(true);
    // The cells that were already paid for were not paid for again.
    expect(reopened.cells.slice(0, 5).every(cell => cell.costUsd === 0.001)).toBe(true);
  });
});

describe('the report', () => {
  it('counts attempts and money without dressing them up', async () => {
    const root = tmpRoot();
    const plan = buildPlan(planInput());
    persistPlan(plan, root);
    const ledger = openLedger(plan);
    const calls = { count: 0 };
    await runBatch(plan, ledger, {
      root, providerFor: () => answeringProvider(calls),
      adventureFor: id => (id === hotfix.id ? hotfix : mission), now: () => Date.now(),
    });

    const report = summarise(ledger);
    expect(report.planned).toBe(20);
    expect(report.attempted).toBe(20);
    expect(report.outstanding).toBe(0);
    expect(report.unperformed).toBe(0);
    expect(report.sampleSize).toBe(20);
    expect(report.fraction).toBe(0);
    expect(report.costPerSolve).toBeNull();
    expect(report.spentUsd).toBeGreaterThan(0);
    expect(report.shortfall).toBeNull();
    expect(Object.keys(report.failures).length).toBeGreaterThan(0);
  });

  it('reports a shortfall and names the holds when cells were refused', () => {
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

  it('shows an unsettled hold as charge uncertainty, not as spend', () => {
    const plan = buildPlan(planInput());
    const ledger = openLedger(plan);
    const cell = ledger.cells[0]! as BatchCellRecord;
    cell.status = 'attempted';
    cell.chargeState = 'unsettled';
    cell.reservationUsd = plan.worstCasePerRunUsd;
    ledger.reservedUsd = plan.worstCasePerRunUsd;

    const report = summarise(ledger);
    expect(report.unsettledHolds).toBe(1);
    expect(report.unsettledUsd).toBe(plan.worstCasePerRunUsd);
    // The hold is not spend: nobody knows what it cost yet.
    expect(report.spentUsd).toBe(0);
  });
});

describe('the books survive a restart', () => {
  it('loads back with the same cells and the same money', () => {
    const root = tmpRoot();
    const plan = buildPlan(planInput());
    persistPlan(plan, root);
    const ledger = openLedger(plan);
    const first = ledger.cells[0]!;
    reserveCell(ledger, first);
    saveLedger(ledger, root);

    const reopened: BatchLedger = loadLedger(root);
    expect(reopened.cells[0]!.status).toBe('outstanding');
    expect(reopened.cells[0]!.chargeState).toBe('unsettled');
    expect(reopened.reservedUsd).toBeCloseTo(worstCaseCost(BUDGETS, PRICES), 10);
    expect(reopened.plan).toEqual(plan);
  });
});

describe('when the evidence cannot be recorded', () => {
  it('keeps the hold and still writes the books', async () => {
    const replay = await import('../../src/runner/replay.js');
    const spy = vi.spyOn(replay, 'replayTranscript').mockImplementation(() => {
      throw new Error('the transcript is unreadable');
    });
    try {
      const root = tmpRoot();
      const plan = buildPlan(planInput());
      persistPlan(plan, root);
      const ledger = openLedger(plan);
      const calls = { count: 0 };

      await runBatch(plan, ledger, {
        root, providerFor: () => answeringProvider(calls),
        adventureFor: id => (id === hotfix.id ? hotfix : mission), now: () => Date.now(),
      });

      // Every cell ran and none of them could be measured, so none of them is
      // settled: the holds stay, and the books say so.
      expect(ledger.cells.every(cell => cell.status === 'attempted')).toBe(true);
      expect(ledger.cells.every(cell => cell.chargeState === 'unsettled')).toBe(true);
      expect(ledger.cells.every(cell => (cell.reason ?? '').includes('transcript is unreadable'))).toBe(true);
      expect(ledger.spentUsd).toBe(0);
      expect(ledger.reservedUsd).toBeCloseTo(worstCaseCost(BUDGETS, PRICES) * 20, 6);
      // The books were written, so a resume can see exactly where things stand.
      expect(JSON.parse(readFileSync(join(root, 'ledger.json'), 'utf8')) as BatchLedger)
        .toEqual(ledger);
    } finally {
      spy.mockRestore();
    }
  });
});
