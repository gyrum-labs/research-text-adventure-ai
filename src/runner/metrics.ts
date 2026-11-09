/*
 * The metrics.
 *
 * Objective numbers per run. A success rate on its own says nothing about
 * what to fix, so each run also carries the process numbers: how often the
 * agent acted on something it could not see, how often it wasted a turn, how
 * far into the run it found the fact it needed.
 *
 * Every metric is computed from the transcript, so the numbers and the
 * evidence agree by construction.
 */

import type { Adventure, RunOutcome } from '../kernel/types.js';
import type { TranscriptRecord } from './transcript.js';
import { NOT_CARRYING_PREFIX, NOT_VISIBLE_PREFIX } from '../kernel/parser.js';
import type { ClassifiableRun, ClassifiableTurn, FailureCode } from './classify.js';
import { classifyFailure, orderingViolations } from './classify.js';

/** Dollars per million tokens, in and out. */
export interface ModelPrice {
  input: number;
  output: number;
}

/**
 * The prices this project estimates with.
 *
 * They are an estimate and they go stale. They are here so that the cost
 * metric is a number rather than a shrug, and so that the place to refresh
 * them is one table.
 */
export const PRICES: Record<string, ModelPrice> = {
  'anthropic/claude-sonnet-4.5': { input: 3, output: 15 },
  'openai/gpt-4o': { input: 2.5, output: 10 },
  'ollama/llama3.1': { input: 0, output: 0 },
  'mock/mock-model': { input: 0, output: 0 },
  // The live matrix. The key is the adapter and the model as the transcript
  // records them, so an OpenAI-compatible endpoint serving somebody else's
  // model has its own price and does not borrow the default one.
  // The prices are the published list prices, per million tokens.
  'openai/anthropic/claude-sonnet-4.5': { input: 3, output: 15 },
  'openai/openai/gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'openai/glm-5.3': { input: 1.4, output: 4.4 },
  'openai/glm-4.5-air': { input: 0.2, output: 1.1 },
};

export interface RunMetrics {
  outcome: RunOutcome | null;
  /** How many objectives were met. */
  goalsCompleted: number;
  turnsUsed: number;
  /** The length of the shortest winning route, for the efficiency denominator. */
  goldPathLength: number;
  /** goldPathLength / turnsUsed. Higher is better; 1.0 is a perfect run. */
  efficiency: number;
  /** turnsUsed / goldPathLength. 1.0 is optimal. */
  wasteRatio: number;
  hintsUsed: number;
  /** Invalid actions divided by total commands. */
  invalidActionRate: number;
  /** Responses the extractor could not turn into a command, over total turns. */
  unparsableRate: number;
  /** Commands naming an object that was not in scope, over total commands. */
  hallucinationRate: number;
  /** Commands that changed nothing, over total commands. */
  repeatStateRate: number;
  /** Turns before the first state-changing action. */
  explorationSteps: number;
  /** After a failure, did the agent try something different within two turns? */
  recoveryRate: number;
  /** Uses of a gated action before the gate was discovered. */
  orderingViolations: number;
  tokensUsed: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  wallClockMs: number;
  msPerTurn: number;
  /** The failure code, or null for a successful run. */
  failure: FailureCode | null;
}

/** The options the metrics need that the transcript does not carry. */
export interface MetricsOptions {
  /** The length of the shortest winning route. */
  goldPathLength: number;
  /** The provider and model, for the price lookup. */
  model?: string;
  /** The prices to use, overriding the table. */
  prices?: ModelPrice;
}

/**
 * Read a run out of a transcript.
 *
 * The transcript is the record, and the classifier and the metrics both read
 * it rather than the live objects, so a run can be judged long after it
 * happened.
 */
export function runFromRecords(records: TranscriptRecord[]): ClassifiableRun {
  const turns = new Map<number, ClassifiableTurn>();

  const turnAt = (turn: number): ClassifiableTurn => {
    let found = turns.get(turn);
    if (found === undefined) {
      found = {
        turn,
        command: null,
        parseError: null,
        outcome: 'none',
        visible: [],
        inventory: [],
        response: '',
      };
      turns.set(turn, found);
    }
    return found;
  };

  let outcome: RunOutcome | null = null;

  for (const record of records) {
    const type = String(record['type'] ?? '');

    if (type === 'observation') {
      const turn = Number(record['turn'] ?? 0);
      const observation = record['data'] as {
        visible?: Array<{ name: string }>;
        inventory?: Array<{ name: string }>;
      };
      const found = turnAt(turn);
      found.visible = (observation?.visible ?? []).map((object) => object.name);
      found.inventory = (observation?.inventory ?? []).map((object) => object.name);
      continue;
    }

    if (type === 'command') {
      const turn = Number(record['turn'] ?? 0);
      turnAt(turn).command = {
        raw: String(record['raw'] ?? ''),
        verb: String(record['verb'] ?? ''),
        args: (record['args'] as Record<string, string>) ?? {},
      };
      continue;
    }

    if (type === 'parse_error') {
      const turn = Number(record['turn'] ?? 0);
      turnAt(turn).parseError = String(record['message'] ?? '');
      continue;
    }

    if (type === 'response') {
      const turn = Number(record['turn'] ?? 0);
      turnAt(turn).response = String(record['text'] ?? '');
      continue;
    }

    if (type === 'events') {
      const turn = Number(record['turn'] ?? 0);
      const events = (record['data'] as Array<{ type: string }>) ?? [];
      turnAt(turn);
      for (const event of events) {
        if (event.type === 'action_succeeded') turnAt(turn).outcome = 'succeeded';
        else if (event.type === 'action_failed') turnAt(turn).outcome = 'failed';
        else if (event.type === 'run_ended') {
          outcome = (event as unknown as { outcome: RunOutcome }).outcome;
        }
      }
      continue;
    }
  }

  return { outcome, turns: [...turns.values()].sort((left, right) => left.turn - right.turn) };
}

/** The object a refusal names, if it names one. */
function refusedObject(message: string): string | null {
  if (!message.startsWith(NOT_VISIBLE_PREFIX) && !message.startsWith(NOT_CARRYING_PREFIX)) {
    return null;
  }
  const match = message.match(/"([^"]+)"/);
  return match === null ? null : match[1]!;
}

function sameName(left: string, right: string): boolean {
  const strip = (value: string): string =>
    value
      .toLowerCase()
      .replace(/\b(the|a|an|my|some)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  return strip(left) === strip(right);
}

/** Count the turns whose refusal named something out of scope. */
function hallucinations(run: ClassifiableRun): number {
  let count = 0;
  for (const turn of run.turns) {
    if (turn.parseError === null) continue;
    const named = refusedObject(turn.parseError);
    if (named === null) continue;
    const inScope = [...turn.visible, ...turn.inventory].some((name) => sameName(name, named));
    if (!inScope) count += 1;
  }
  return count;
}

/** The state hashes the run recorded, one per turn. */
function stateHashes(records: TranscriptRecord[]): string[] {
  const hashes: string[] = [];
  for (const record of records) {
    if (String(record['type'] ?? '') !== 'state') continue;
    hashes.push(String(record['hash'] ?? ''));
  }
  return hashes;
}

/** Turns before the first state-changing action. */
function explorationSteps(hashes: string[]): number {
  for (let index = 1; index < hashes.length; index += 1) {
    if (hashes[index] !== hashes[index - 1]) return index;
  }
  return hashes.length;
}

/**
 * After a failure, did the agent try something different within two turns?
 *
 * The rate is the fraction of failures that were followed by a different
 * command. A run that never failed scores 1, because there was nothing to
 * recover from.
 */
function recoveryRate(run: ClassifiableRun): number {
  const failures = run.turns.filter((turn) => turn.outcome === 'failed');
  if (failures.length === 0) return 1;

  let recovered = 0;
  for (const failure of failures) {
    const raw = failure.command?.raw.trim().toLowerCase() ?? '';
    const next = run.turns.filter(
      (turn) => turn.turn > failure.turn && turn.turn <= failure.turn + 2,
    );
    if (next.some((turn) => (turn.command?.raw.trim().toLowerCase() ?? '') !== raw)) {
      recovered += 1;
    }
  }

  return recovered / failures.length;
}

/**
 * Compute the metrics for a run.
 *
 * Everything comes from the transcript except the price table, so a run can
 * be measured again from its file and get the same numbers.
 */
export function computeMetrics(
  records: TranscriptRecord[],
  adventure: Adventure,
  options: MetricsOptions,
): RunMetrics {
  const run = runFromRecords(records);
  const hashes = stateHashes(records);

  const commands = run.turns.filter((turn) => turn.command !== null);
  const refused = run.turns.filter((turn) => turn.parseError !== null).length;
  const produced = commands.length + refused;
  const invalid = run.turns.filter((turn) => turn.outcome === 'failed').length;
  const unparsable = records.filter((record) => String(record['type'] ?? '') === 'unparsable_response')
    .length;
  const hints = records.filter((record) => String(record['type'] ?? '') === 'hint_given').length;
  const goals = records
    .filter((record) => String(record['type'] ?? '') === 'events')
    .flatMap((record) => ((record['data'] as Array<{ type: string }>) ?? []))
    .filter((event) => event.type === 'goal_completed').length;

  let unchanged = 0;
  for (let index = 1; index < hashes.length; index += 1) {
    if (hashes[index] === hashes[index - 1]) unchanged += 1;
  }

  const metricsRecord = records.find((record) => String(record['type'] ?? '') === 'metrics');
  const data = (metricsRecord?.['data'] ?? {}) as Record<string, unknown>;
  const inputTokens = Number(data['inputTokens'] ?? 0);
  const outputTokens = Number(data['outputTokens'] ?? 0);
  const tokensUsed = inputTokens + outputTokens;
  const wallClockMs = Number(data['wallClockMs'] ?? 0);

  const price = options.prices ?? PRICES[options.model ?? ''] ?? { input: 0, output: 0 };
  const estimatedCostUsd =
    (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;

  const turnsUsed = Number(data['turns'] ?? run.turns.length);
  const goldPathLength = options.goldPathLength;
  const classification = classifyFailure(run, adventure);

  const ordering = orderingViolations(run, adventure);

  return {
    outcome: run.outcome,
    goalsCompleted: goals,
    turnsUsed,
    goldPathLength,
    efficiency: turnsUsed === 0 ? 0 : goldPathLength / turnsUsed,
    wasteRatio: turnsUsed === 0 ? 0 : turnsUsed / goldPathLength,
    hintsUsed: hints,
    invalidActionRate: produced === 0 ? 0 : invalid / produced,
    unparsableRate: turnsUsed === 0 ? 0 : unparsable / turnsUsed,
    hallucinationRate: produced === 0 ? 0 : hallucinations(run) / produced,
    repeatStateRate: produced === 0 ? 0 : unchanged / produced,
    explorationSteps: explorationSteps(hashes),
    recoveryRate: recoveryRate(run),
    orderingViolations: ordering,
    tokensUsed,
    inputTokens,
    outputTokens,
    estimatedCostUsd,
    wallClockMs,
    msPerTurn: turnsUsed === 0 ? 0 : wallClockMs / turnsUsed,
    failure: classification?.code ?? null,
  };
}
