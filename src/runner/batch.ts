/*
 * The repeatability batch.
 *
 * One plan, twenty runs, ten per world. The plan is written before anything
 * runs, every cell reserves its worst case before it dispatches, and nothing
 * is ever retried: a run that failed stays failed, a run that was interrupted
 * keeps its hold, and a resumed experiment finishes only the cells that are
 * still outstanding.
 *
 * The point of all this ceremony is that the person paying for the batch can
 * read the record afterwards and know it says what happened rather than what
 * somebody hoped would happen.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Adventure } from '../kernel/types.js';
import type { LlmProvider } from '../agents/llm/provider.js';
import type { RunBudgets } from './run.js';
import { run } from './run.js';
import { LlmPolicy } from '../agents/llm/policy.js';
import { Transcript, readTranscript } from './transcript.js';
import { computeMetrics } from './metrics.js';
import { replayTranscript } from './replay.js';
import { goldPathFor } from '../adventures/index.js';

/** Where the published prices the reservation is computed from came from. */
export interface PriceEvidence {
  source: string;
  /** When the price was checked, as an ISO timestamp. */
  checkedAt: string;
  inputPerMillion: number;
  outputPerMillion: number;
}

/**
 * The limits every cell is held to.
 *
 * They are the profile the roadmap pins — twenty turns, thirty thousand total
 * tokens, three hundred output tokens per request, two minutes — and they live
 * here rather than in the server, because the batch is a research profile and
 * the CLI may not reach the server layer.
 */
export const BATCH_BUDGETS: Readonly<RunBudgets> = Object.freeze({
  ...{
    maxTurns: 20,
    maxHints: 3,
    maxOutputTokensPerTurn: 300,
    maxTotalTokens: 30_000,
    maxWallClockMs: 120_000,
    maxTransientProviderErrors: 2,
    providerRetryDelayMs: 1_000,
    maxParseErrors: 10,
    maxRepeatedStates: 3,
  },
});

/** The plan, written before any cell runs. */
export interface BatchPlan {
  createdAt: string;
  /** The revision the plan was written against. */
  sourceRevision: string;
  /** The worlds the batch covers, with the version each one was at. */
  worldVersions: Array<{ id: string; version: string }>;
  /** One cell per world and seed, in the order they will run. */
  cells: Array<{ world: string; seed: number }>;
  model: { provider: string; model: string };
  temperature: number;
  promptVersion: string;
  promptHash: string;
  budgets: RunBudgets;
  prices: PriceEvidence;
  /** The worst case this experiment will reserve for one cell. */
  worstCasePerRunUsd: number;
  /** The most the whole experiment may spend. */
  maxTotalUsd: number;
  maxPerRunUsd: number;
}

/** What one cell became. */
export interface BatchCellRecord {
  world: string;
  seed: number;
  /** outstanding: not run. attempted: dispatched, whatever happened. unperformed: refused. */
  status: 'outstanding' | 'attempted' | 'unperformed';
  reservationUsd: number;
  /**
   * none: nothing dispatched. unsettled: dispatched and the cost is unknown,
   * so the hold stays. settled: the real cost is known. refused: never
   * dispatched because the allowance could not cover it.
   */
  chargeState: 'none' | 'unsettled' | 'settled' | 'refused';
  transcriptPath?: string;
  outcome?: string;
  reason?: string;
  turns?: number;
  tokensUsed?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  replayOk?: boolean;
  refusalReason?: string;
}

/** The experiment's own books: what was planned, spent, and held. */
export interface BatchLedger {
  plan: BatchPlan;
  cells: BatchCellRecord[];
  spentUsd: number;
  reservedUsd: number;
  maxTotalUsd: number;
}

/** What building a plan needs. */
export interface BatchPlanInput {
  worlds: Adventure[];
  runsPerWorld: number;
  model: { provider: string; model: string };
  temperature: number;
  promptVersion: string;
  promptHash: string;
  budgets: RunBudgets;
  prices: PriceEvidence;
  sourceRevision: string;
  maxTotalUsd: number;
  maxPerRunUsd: number;
}

/**
 * The most one run could cost, from the published prices.
 *
 * Output is the dearer token and is capped by the turns times the per-request
 * output ceiling; the rest of the total token cap can only be input.
 */
export function worstCaseCost(budgets: RunBudgets, prices: PriceEvidence): number {
  const outputTokens = budgets.maxTurns * budgets.maxOutputTokensPerTurn;
  const inputTokens = Math.max(0, budgets.maxTotalTokens - outputTokens);
  return (inputTokens * prices.inputPerMillion + outputTokens * prices.outputPerMillion) / 1_000_000;
}

/** Build the plan. Nothing here runs anything. */
export function buildPlan(input: BatchPlanInput): BatchPlan {
  const budgets = input.budgets;
  const worstCasePerRunUsd = worstCaseCost(budgets, input.prices);
  if (worstCasePerRunUsd > input.maxPerRunUsd) {
    throw new Error(
      `the worst case for one run is $${worstCasePerRunUsd.toFixed(6)}, above the $${input.maxPerRunUsd} this experiment is allowed`,
    );
  }
  const cells: Array<{ world: string; seed: number }> = [];
  for (const world of input.worlds) {
    for (let seed = 1; seed <= input.runsPerWorld; seed += 1) cells.push({ world: world.id, seed });
  }
  return {
    createdAt: new Date().toISOString(),
    sourceRevision: input.sourceRevision,
    worldVersions: input.worlds.map(world => ({ id: world.id, version: world.version })),
    cells,
    model: input.model,
    temperature: input.temperature,
    promptVersion: input.promptVersion,
    promptHash: input.promptHash,
    budgets,
    prices: input.prices,
    worstCasePerRunUsd,
    maxTotalUsd: input.maxTotalUsd,
    maxPerRunUsd: input.maxPerRunUsd,
  };
}

/** Write the plan. It is the record that the experiment was decided before it ran. */
export function persistPlan(plan: BatchPlan, root: string): void {
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
}

/** Read the plan back. */
export function readPlan(root: string): BatchPlan {
  return JSON.parse(readFileSync(join(root, 'plan.json'), 'utf8')) as BatchPlan;
}

/** Open the books for a plan: every cell outstanding, nothing spent, nothing held. */
export function openLedger(plan: BatchPlan): BatchLedger {
  return {
    plan,
    maxTotalUsd: plan.maxTotalUsd,
    cells: plan.cells.map(cell => ({
      world: cell.world,
      seed: cell.seed,
      status: 'outstanding' as const,
      reservationUsd: 0,
      chargeState: 'none' as const,
    })),
    spentUsd: 0,
    reservedUsd: 0,
  };
}

/** Read the books from disk, so a resume continues the same experiment. */
export function loadLedger(root: string): BatchLedger {
  const ledger = JSON.parse(readFileSync(join(root, 'ledger.json'), 'utf8')) as BatchLedger;
  return { ...ledger, plan: readPlan(root) };
}

/** Write the books. Called after every cell, so an interruption loses nothing. */
export function saveLedger(ledger: BatchLedger, root: string): void {
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'ledger.json'), `${JSON.stringify(ledger, null, 2)}\n`);
}

/**
 * Reserve a cell's worst case before it dispatches.
 *
 * This is the gate that keeps the experiment inside its allowance: a cell
 * whose reservation does not fit is refused before a single token is sent,
 * and stays refused rather than being quietly retried later.
 */
export function reserveCell(ledger: BatchLedger, cell: BatchCellRecord): { reserved: boolean } {
  // A cell already holding an unresolved charge is not dispatched again: the
  // provider may have billed for the attempt nobody could account for.
  if (cell.status !== 'outstanding' || cell.chargeState !== 'none') return { reserved: false };
  const worst = ledger.plan.worstCasePerRunUsd;
  const available = ledger.maxTotalUsd - ledger.spentUsd - ledger.reservedUsd;
  if (worst > available) {
    cell.status = 'unperformed';
    cell.chargeState = 'refused';
    cell.reservationUsd = 0;
    cell.refusalReason =
      `the $${worst.toFixed(6)} reservation exceeds the $${Math.max(0, available).toFixed(6)} allowance left in this experiment`;
    return { reserved: false };
  }
  cell.reservationUsd = worst;
  cell.chargeState = 'unsettled';
  ledger.reservedUsd = round(ledger.reservedUsd + worst);
  return { reserved: true };
}

/** Settle a cell that came back, swapping the hold for what it really cost. */
function settleCell(ledger: BatchLedger, cell: BatchCellRecord, costUsd: number): void {
  ledger.reservedUsd = round(Math.max(0, ledger.reservedUsd - cell.reservationUsd));
  cell.chargeState = 'settled';
  cell.reservationUsd = 0;
  cell.costUsd = round(costUsd);
  ledger.spentUsd = round(ledger.spentUsd + costUsd);
}

function round(value: number): number {
  return Math.round(value * 1e9) / 1e9;
}

/** What running a cell needs. The provider is injected so the gates run offline. */
export interface BatchRunOptions {
  readonly root: string;
  readonly providerFor: (cell: { world: string; seed: number }) => LlmProvider;
  readonly adventureFor: (world: string) => Adventure;
  readonly now?: () => number;
}

/**
 * Run every outstanding cell, in the plan's order, once each.
 *
 * An interrupted or failed cell keeps its hold as an unsettled charge, because
 * the provider may still bill for a request that was cut off. Nothing is
 * retried here; a later call runs only the cells still outstanding.
 */
export async function runBatch(
  plan: BatchPlan,
  ledger: BatchLedger,
  options: BatchRunOptions,
): Promise<BatchLedger> {
  const runsDir = join(options.root, 'runs');
  mkdirSync(runsDir, { recursive: true });

  // A cell left holding an unresolved charge by an interrupted attempt is not
  // safe to run again: the provider may have billed for it. It counts as
  // attempted with an unknown outcome, and the hold stays on the books.
  for (const record of ledger.cells) {
    if (record.status === 'outstanding' && record.chargeState === 'unsettled') {
      record.status = 'attempted';
    }
  }

  for (const record of ledger.cells) {
    if (record.status !== 'outstanding') continue;
    if (!reserveCell(ledger, record).reserved) continue;

    const adventure = options.adventureFor(record.world);
    const provider = options.providerFor(record);
    const policy = new LlmPolicy({
      adventure, provider, strategy: 'structured', renderer: 'json',
      thinking: false, temperature: plan.temperature,
      maxOutputTokens: plan.budgets.maxOutputTokensPerTurn,
    });
    const runId = `${record.world}/${record.seed}`;
    const transcriptPath = join(runsDir, record.world, `${record.seed}.jsonl`);
    const transcript = new Transcript(transcriptPath, {
      type: 'header', runId, adventure: adventure.id, adventureVersion: adventure.version,
      adventureHash: plan.promptHash, policy: policy.id, provider: provider.id, model: provider.model,
      seed: record.seed, maxTurns: plan.budgets.maxTurns,
      startedAt: (options.now ?? ((): number => Date.now()))().toString(),
      engineVersion: '0.1.0',
    });

    record.transcriptPath = transcriptPath;
    let outcome: string | undefined;
    let reason: string | undefined;
    let turns: number | undefined;
    try {
      const result = await run({ adventure, policy, budgets: plan.budgets, transcript });
      outcome = result.outcome;
      reason = result.reason;
      turns = result.turns;
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
      // The hold stays: an interrupted request may still be billed.
      saveLedger(ledger, options.root);
      continue;
    } finally {
      transcript.close();
    }

    record.status = 'attempted';
    record.outcome = outcome;
    record.reason = reason;
    record.turns = turns;
    // The price table is keyed on adapter and model together, as the matrix does.
    const metrics = computeMetrics(readTranscript(transcriptPath), adventure,
      { model: `${provider.id}/${provider.model}`, goldPathLength: goldPathFor(adventure.id).length });
    record.tokensUsed = metrics.tokensUsed;
    record.inputTokens = metrics.inputTokens;
    record.outputTokens = metrics.outputTokens;
    record.replayOk = replayTranscript(transcriptPath, adventure).ok;
    // The cost is computed from the prices the plan recorded and dated, not
    // from the adapter's name, because a price table keyed by adapter and
    // model will silently price an unknown combination at zero.
    const costUsd =
      (metrics.inputTokens * plan.prices.inputPerMillion +
        metrics.outputTokens * plan.prices.outputPerMillion) / 1_000_000;
    settleCell(ledger, record, costUsd);
    saveLedger(ledger, options.root);
  }
  return ledger;
}
/** What the experiment can honestly say when it is done, or stopped. */
export interface BatchReport {
  planned: number;
  attempted: number;
  outstanding: number;
  unperformed: number;
  successes: number;
  /** successes over attempts, or null when nothing was attempted. */
  fraction: number | null;
  sampleSize: number;
  /** Cost per solved mission, or null when nothing was solved. */
  costPerSolve: null | number;
  spentUsd: number;
  /** Cells whose true cost is unknown because the request was cut off. */
  unsettledHolds: number;
  unsettledUsd: number;
  failures: Record<string, number>;
  /** Why the plan was not finished, when it was not. */
  shortfall: null | string;
}

/** Recount the experiment from the books, without embellishment. */
export function summarise(ledger: BatchLedger): BatchReport {
  const attempted = ledger.cells.filter(cell => cell.status === 'attempted');
  const unperformed = ledger.cells.filter(cell => cell.status === 'unperformed');
  const outstanding = ledger.cells.filter(cell => cell.status === 'outstanding');
  const successes = attempted.filter(cell => cell.outcome === 'success').length;
  const failures: Record<string, number> = {};
  for (const cell of attempted) {
    if (cell.outcome === 'success') continue;
    const key = cell.reason ?? cell.outcome ?? 'unknown';
    failures[key] = (failures[key] ?? 0) + 1;
  }
  const shortfall =
    outstanding.length + unperformed.length > 0
      ? `${outstanding.length + unperformed.length} of ${ledger.cells.length} planned cells did not run`
      : null;
  return {
    planned: ledger.cells.length,
    attempted: attempted.length,
    outstanding: outstanding.length,
    unperformed: unperformed.length,
    successes,
    fraction: attempted.length === 0 ? null : successes / attempted.length,
    sampleSize: attempted.length,
    costPerSolve: successes === 0 ? null : ledger.spentUsd / successes,
    spentUsd: ledger.spentUsd,
    unsettledHolds: ledger.cells.filter(cell => cell.chargeState === 'unsettled').length,
    unsettledUsd: round(ledger.reservedUsd),
    failures,
    shortfall,
  };
}

/** Whether the books are already on disk, so a caller knows this is a resume. */
export function ledgerExists(root: string): boolean {
  return existsSync(join(root, 'ledger.json'));
}
