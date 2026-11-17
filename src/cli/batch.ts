/*
 * The batch CLI: run the repeatability experiment on purpose.
 *
 * Nothing here calls a model unless the operator asked for the batch to run.
`plan`, `status`, `dry-run` and `report` read and write files only, so the
safe commands are safe by construction rather than by caution.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { ADVENTURES, adventureById } from '../adventures/index.js';
import { PROMPT_VERSION } from '../agents/llm/prompt.js';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../kernel/hash.js';
import { BATCH_BUDGETS } from '../runner/batch.js';
import { createProvider } from './provider.js';
import {
  buildPlan,
  persistPlan,
  readPlan,
  openLedger,
  loadLedger,
  saveLedger,
  ledgerExists,
  reserveCell,
  runBatch,
  summarise,
  type BatchPlan,
  type BatchLedger,
} from '../runner/batch.js';
import type { PriceEvidence } from '../runner/batch.js';
export type { PriceEvidence };
import type { FetchLike } from '../session/http.js';

/** How long the price catalogue may take to answer before the plan gives up. */
const PRICES_TIMEOUT_MS = 10_000;

/**
 * The dated published prices for a model, from the provider's own catalogue.
 *
 * The seam: the provider is OpenRouter's models API (GET /api/v1/models), the
 * consumer is this CLI's batch planner on the operator's side only — the demo
 * server and the browser never call it. The contract is external, read-only,
 * and consumed without a cache: a plan must carry today's dated prices, so
 * failure is fail-fast with a named reason, never a silent zero price or a
 * stale table. The fetch is bounded so an unreachable API cannot hang the
 * operator's terminal.
 */
export async function pricesFor(model: string, fetchLike?: FetchLike): Promise<PriceEvidence> {
  const get = fetchLike ?? ((url: string) => fetch(url, { signal: AbortSignal.timeout(PRICES_TIMEOUT_MS) }));
  let response: Response;
  try {
    response = await get('https://openrouter.ai/api/v1/models');
  } catch (error) {
    const reason = error instanceof Error && error.name === 'TimeoutError'
      ? `no answer within ${PRICES_TIMEOUT_MS / 1000}s`
      : error instanceof Error ? error.message : String(error);
    throw new Error(`could not read the published prices: ${reason}`);
  }
  if (!response.ok) throw new Error(`could not read the published prices (${response.status})`);
  const body = await response.json() as { data?: Array<{ id?: string; pricing?: { prompt?: string; completion?: string } }> };
  const entry = body.data?.find(candidate => candidate.id === model);
  const prompt = entry?.pricing?.prompt;
  const completion = entry?.pricing?.completion;
  if (prompt === undefined || completion === undefined) {
    throw new Error(`the provider publishes no prices for ${model}, so a run could not be reserved`);
  }
  return {
    source: 'OpenRouter models API, https://openrouter.ai/api/v1/models',
    checkedAt: new Date().toISOString(),
    inputPerMillion: Number(prompt) * 1_000_000,
    outputPerMillion: Number(completion) * 1_000_000,
  };
}

/** The model the batch runs, and the endpoint that serves it. */
export const BATCH_MODEL = {
  provider: 'openai',
  model: 'deepseek/deepseek-chat',
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKeyEnv: 'OPENROUTER_API_KEY',
};

export interface BatchOptions {
  root: string;
  runs: number;
  model: string;
  maxTotalUsd: number;
  maxPerRunUsd: number;
  /** One world, when the experiment is about that world alone. */
  world?: string;
}

/** The source revision the plan is written against. */
function sourceRevision(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

/** The prompt the batch will send, hashed so the plan names it exactly. */
function promptHash(): string {
  const policy = {
    strategy: 'structured', renderer: 'json', thinking: false, temperature: 0,
    maxOutputTokens: BATCH_BUDGETS.maxOutputTokensPerTurn, promptVersion: PROMPT_VERSION,
  };
  return `sha256:${createHash('sha256').update(canonicalJson(policy)).digest('hex')}`;
}

/** The plan this invocation would run, against the prices it was given. */
export function planFor(options: BatchOptions, prices: PriceEvidence): BatchPlan {
  const worlds = options.world === undefined
    ? Object.values(ADVENTURES)
    : [adventureById(options.world)];
  return buildPlan({
    worlds,
    runsPerWorld: options.runs,
    model: { provider: BATCH_MODEL.provider, model: options.model },
    temperature: 0,
    promptVersion: PROMPT_VERSION,
    promptHash: promptHash(),
    budgets: BATCH_BUDGETS,
    prices,
    sourceRevision: sourceRevision(),
    maxTotalUsd: options.maxTotalUsd,
    maxPerRunUsd: options.maxPerRunUsd,
  });
}

/** Load the books, or open fresh ones from the plan on disk. */
export function booksFor(options: BatchOptions): { plan: BatchPlan; ledger: ReturnType<typeof openLedger> } {
  const plan = readPlan(options.root);
  const ledger = ledgerExists(options.root) ? loadLedger(options.root) : openLedger(plan);
  return { plan, ledger };
}

/** Write the plan and the empty books. Never calls a model. */
export async function writePlan(options: BatchOptions, prices: PriceEvidence): Promise<BatchPlan> {
  const plan = planFor(options, prices);
  persistPlan(plan, options.root);
  if (!ledgerExists(options.root)) saveLedger(openLedger(plan), options.root);
  return plan;
}

/** Show what the batch would do, and what it would reserve. Never calls a model. */
export async function describeBatch(options: BatchOptions, prices: PriceEvidence): Promise<string> {
  const plan = planFor(options, prices);
  const ledger = ledgerExists(options.root) ? loadLedger(options.root) : openLedger(plan);
  const outstanding = ledger.cells.filter(cell => cell.status === 'outstanding');
  const lines = [
    `plan ${plan.createdAt} at ${plan.sourceRevision}`,
    `worlds ${plan.worldVersions.map(world => `${world.id}@${world.version}`).join(', ')}`,
    `model ${plan.model.provider}/${plan.model.model} temperature ${plan.temperature}`,
    `limits ${plan.budgets.maxTurns} turns / ${plan.budgets.maxTotalTokens} tokens / ${plan.budgets.maxOutputTokensPerTurn} output per request`,
    `prices ${plan.prices.inputPerMillion} in, ${plan.prices.outputPerMillion} out per million (checked ${plan.prices.checkedAt})`,
    `worst case $${plan.worstCasePerRunUsd.toFixed(6)} per run, ceiling $${plan.maxTotalUsd}`,
    `cells ${ledger.cells.length}, outstanding ${outstanding.length}`,
  ];
  // Previewed on a throwaway set of books, so a dry run leaves nothing behind.
  const preview: BatchLedger = { ...ledger, cells: outstanding.map(cell => ({ ...cell })), spentUsd: 0, reservedUsd: 0 };
  for (const cell of preview.cells.slice(0, 5)) {
    const reservation = reserveCell(preview, cell);
    lines.push(
      `  ${cell.world}/${cell.seed} -> ${reservation.reserved ? `reserve $${cell.reservationUsd.toFixed(6)}` : cell.refusalReason}`,
    );
  }
  if (outstanding.length > 5) lines.push(`  … and ${outstanding.length - 5} more`);
  return lines.join('\n');
}

/** Run the outstanding cells. This is the only command that calls a model. */
export async function startBatch(options: BatchOptions): Promise<string> {
  if (!existsSync(join(options.root, 'plan.json'))) {
    throw new Error('there is no plan on disk. Run `batch plan` before `batch start`.');
  }
  const { plan, ledger } = booksFor(options);
  await runBatch(plan, ledger, {
    root: options.root,
    providerFor: () => createProvider(BATCH_MODEL.provider as 'openai', options.model, {
      baseUrl: BATCH_MODEL.baseUrl, apiKeyEnv: BATCH_MODEL.apiKeyEnv,
    }),
    adventureFor: world => adventureById(world),
    now: () => Date.now(),
  });
  return describeLedger(ledger);
}

/** The honest summary, as text. Never calls a model. */
export function describeLedger(ledger: ReturnType<typeof openLedger>): string {
  const report = summarise(ledger);
  const percent = report.fraction === null ? 'n/a' : (100 * report.fraction).toFixed(1);
  const lines = [
    `planned ${report.planned}, attempted ${report.attempted}, outstanding ${report.outstanding}, unperformed ${report.unperformed}`,
    `successes ${report.successes} of ${report.sampleSize} attempted (${percent}%)`,
    `spend $${report.spentUsd.toFixed(6)}, unsettled holds ${report.unsettledHolds} worth $${report.unsettledUsd.toFixed(6)}`,
    `cost per solve ${report.costPerSolve === null ? 'not applicable: nothing was solved' : `$${report.costPerSolve.toFixed(6)}`}`,
  ];
  for (const [reason, count] of Object.entries(report.failures)) {
    lines.push(`  ${count} × ${reason}`);
  }
  if (report.shortfall !== null) lines.push(`shortfall: ${report.shortfall}`);
  return lines.join('\n');
}

/** Write the dated findings next to the run. Never calls a model. */
export function publishReport(options: BatchOptions): string {
  const { ledger } = booksFor(options);
  const report = summarise(ledger);
  const dir = join(options.root, 'findings');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(path, `${JSON.stringify({ generatedAt: new Date().toISOString(), ...report }, null, 2)}\n`);
  return path;
}
