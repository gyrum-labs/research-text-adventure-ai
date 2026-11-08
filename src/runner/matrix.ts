/*
 * The matrix.
 *
 * The same experiment across models and conditions, many times each. The
 * driver runs the cells, writes the artefacts, and knows how to resume: a
 * cell whose runs are already on disk is not run again.
 *
 * A cell with fewer runs than the configuration asked for is reported as
 * incomplete rather than averaged, because a success rate over four runs
 * looks like a fact and is not one.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Adventure } from '../kernel/types.js';
import { CONDITIONS, type ConditionId } from '../agents/conditions.js';
import { LlmPolicy } from '../agents/llm/policy.js';
import { MISSION_IMPOSSIBLE_PLAN, SurrogateProvider } from '../agents/surrogate.js';
import type { LlmProvider } from '../agents/llm/provider.js';
import { run } from './run.js';
import { Transcript, readTranscript } from './transcript.js';
import { computeMetrics, type RunMetrics } from './metrics.js';
import { wilsonInterval, median, type Interval } from './wilson.js';
import type { FailureCode } from './classify.js';

/** One model in the matrix. */
export interface MatrixModel {
  id: string;
  /** The name shown in the report. */
  label: string;
  /** Which provider stands in for the model. */
  provider: 'surrogate' | 'mock' | 'anthropic' | 'openai' | 'ollama';
  /** The model name passed to the provider. */
  model: string;
  /** The endpoint of an OpenAI-compatible provider, when it is not the default. */
  baseUrl?: string;
  /** The environment variable the provider's key is read from. */
  apiKeyEnv?: string;
  /** How much of the prompt the surrogate can attend to, in tokens. */
  attentionTokens?: number;
  /** How reliably the surrogate recalls a fact it read. */
  reliability?: number;
}

/** The configuration of a matrix run. */
export interface MatrixConfig {
  models: MatrixModel[];
  conditions: ConditionId[];
  /** How many seeds per cell. */
  seeds: number;
  /** The turn budget per run. */
  maxTurns: number;
  /** The length of the shortest winning route, for the efficiency metric. */
  goldPathLength: number;
}

/** How a matrix run is carried out. */
export interface MatrixOptions {
  /** Where the runs are written. */
  readonly root?: string;
  /**
   * How to build the provider for a model.
   *
   * The default builds the offline ones and refuses a live provider, because
   * the runner never reads the environment. A caller that does read it passes
   * the factory in, and the matrix then runs whatever the configuration names,
   * live models included.
   */
  readonly providerFor?: (model: MatrixModel, seed: number) => LlmProvider;
}

/** One run of the matrix. */
export interface CellRun {  model: string;
  condition: ConditionId;
  seed: number;
  metrics: RunMetrics | null;
  /** Whether the run produced everything it should have. */
  complete: boolean;
}

/** One cell of the matrix, summarised. */
export interface CellSummary {
  model: string;
  condition: ConditionId;
  /** How many runs the configuration asked for. */
  expected: number;
  /** How many runs there are. */
  runs: number;
  /** Whether the cell has all of its runs. */
  complete: boolean;
  successes: number;
  interval: Interval;
  medianTurns: number;
  /** The cost of the cell divided by the missions it solved. */
  costPerSolve: number;
  /** The tokens the cell spent. */
  tokensUsed: number;
  /** The tokens the cell spent per mission it solved. */
  tokensPerSolve: number;
  /** The failure histogram for the cell. */
  failures: Record<string, number>;
}

/** Where a model's runs live. */
export function runDirectory(root: string, model: string, condition: ConditionId): string {
  return join(root, model, condition);
}

/**
 * Build the provider for a model.
 *
 * The surrogate is the default because the whole matrix has to be runnable
 * offline and free. A live provider needs its key in the environment, and
 * fails loudly without one rather than quietly pretending to be a model.
 */
export function providerFor(model: MatrixModel, seed: number): LlmProvider {
  switch (model.provider) {
    case 'surrogate':
      return new SurrogateProvider({
        plan: MISSION_IMPOSSIBLE_PLAN,
        attentionTokens: model.attentionTokens ?? 3000,
        reliability: model.reliability ?? 0.9,
        seed,
        model: model.model,
      });
    case 'mock':
      return {
        id: 'mock',
        model: model.model,
        async complete() {
          return { text: 'COMMAND: look' };
        },
      };
    default:
      throw new Error(
        `the "${model.provider}" provider needs a key in the environment, and this matrix run does not have one`,
      );
  }
}

/**
 * Run the matrix.
 *
 * A cell whose artefacts are already on disk is loaded rather than run, so
 * the sweep can be interrupted and resumed.
 */
export async function runMatrix(
  adventure: Adventure,
  config: MatrixConfig,
  options: MatrixOptions = {},
): Promise<CellRun[]> {
  const root = options.root ?? 'runs';
  const build = options.providerFor ?? providerFor;
  const runs: CellRun[] = [];

  for (const model of config.models) {
    for (const condition of config.conditions) {
      const directory = runDirectory(root, model.id, condition);
      mkdirSync(directory, { recursive: true });

      for (let seed = 1; seed <= config.seeds; seed += 1) {
        const transcriptPath = join(directory, `${seed}.jsonl`);
        const metricsPath = join(directory, `${seed}.metrics.json`);

        const existing = loadRun(transcriptPath, metricsPath, adventure, config);
        if (existing !== null) {
          runs.push(existing);
          continue;
        }

        const spec = CONDITIONS[condition];
        const provider = build(model, seed);
        const policy = new LlmPolicy({
          adventure,
          provider,
          strategy: spec.strategy,
          renderer: spec.renderer,
        });

        const transcript = new Transcript(transcriptPath, {
          type: 'header',
          runId: `${model.id}/${condition}/${seed}`,
          adventure: adventure.id,
          adventureVersion: adventure.version,
          adventureHash: 'sha256:unversioned',
          policy: policy.id,
          provider: provider.id,
          model: provider.model,
          seed,
          maxTurns: config.maxTurns,
          startedAt: new Date().toISOString(),
          engineVersion: '0.1.0',
        });

        await run({
          adventure,
          policy,
          budgets: { maxTurns: config.maxTurns },
          maskLegalActions: spec.masked,
          transcript,
        });
        transcript.close();

        const metrics = computeMetrics(readTranscript(transcriptPath), adventure, {
          goldPathLength: config.goldPathLength,
          model: `${provider.id}/${provider.model}`,
        });
        writeFileSync(
          metricsPath,
          `${JSON.stringify({ model: model.id, condition, seed, ...metrics }, null, 2)}\n`,
        );

        runs.push({ model: model.id, condition, seed, metrics, complete: true });
      }
    }
  }

  return runs;
}

/** Load a run's artefacts from disk, or null when they are not there. */
function loadRun(
  transcriptPath: string,
  metricsPath: string,
  adventure: Adventure,
  config: MatrixConfig,
): CellRun | null {
  try {
    const records = readTranscript(transcriptPath);
    const stored = JSON.parse(readFileSync(metricsPath, 'utf8')) as Partial<RunMetrics> & {
      model?: string;
      condition?: ConditionId;
      seed?: number;
    };

    const metrics = computeMetrics(records, adventure, {
      goldPathLength: config.goldPathLength,
    });

    return {
      model: stored.model ?? '',
      condition: stored.condition ?? 'A',
      seed: stored.seed ?? 0,
      metrics: { ...metrics, ...stored },
      complete: true,
    };
  } catch {
    return null;
  }
}

/**
 * Summarise the matrix.
 *
 * A cell that does not have all of its runs is marked incomplete and its
 * numbers are reported with that mark, because a rate over a partial sample
 * reads like a fact and is not one.
 */
export function summariseMatrix(
  runs: CellRun[],
  config: MatrixConfig,
): CellSummary[] {
  const summaries: CellSummary[] = [];

  for (const model of config.models) {
    for (const condition of config.conditions) {
      const cell = runs.filter((run) => run.model === model.id && run.condition === condition);
      const successes = cell.filter((run) => run.metrics?.outcome === 'success').length;
      const turns = cell
        .map((run) => run.metrics?.turnsUsed ?? 0)
        .filter((count) => count > 0);
      const cost = cell.reduce((total, run) => total + (run.metrics?.estimatedCostUsd ?? 0), 0);
      const tokens = cell.reduce((total, run) => total + (run.metrics?.tokensUsed ?? 0), 0);
      const failures: Record<string, number> = {};

      for (const run of cell) {
        const code = run.metrics?.failure;
        if (code === null || code === undefined) continue;
        failures[code] = (failures[code] ?? 0) + 1;
      }

      summaries.push({
        model: model.id,
        condition,
        expected: config.seeds,
        runs: cell.length,
        complete: cell.length >= config.seeds,
        successes,
        interval: wilsonInterval(successes, cell.length),
        medianTurns: median(turns),
        costPerSolve: successes === 0 ? 0 : cost / successes,
        tokensUsed: tokens,
        tokensPerSolve: successes === 0 ? 0 : tokens / successes,
        failures,
      });
    }
  }

  return summaries;
}

/** The failure codes across a whole matrix, for the report. */
export function failureHistogram(summaries: CellSummary[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const summary of summaries) {
    for (const [code, count] of Object.entries(summary.failures)) {
      counts[code] = (counts[code] ?? 0) + count;
    }
  }

  return counts;
}

/** The cost of a whole matrix divided by the missions it solved. */
export function costPerSolvedMission(runs: CellRun[]): number {
  const cost = runs.reduce((total, run) => total + (run.metrics?.estimatedCostUsd ?? 0), 0);
  const solved = runs.filter((run) => run.metrics?.outcome === 'success').length;
  return solved === 0 ? 0 : cost / solved;
}

export type { FailureCode };
