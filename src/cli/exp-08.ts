/*
 * Experiment 08: the engine comparison.
 *
 * The same agent, the same prompt, the same budgets and the same models,
 * pointed at a world whose rules live in somebody else's engine. The number
 * that comes out is the control the whole series has been missing: if the
 * agent scores the same here, our engine was not the reason it worked.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ContextStrategy } from '../agents/context.js';
import type { ObservationRenderer } from '../agents/context.js';
import type { LlmProvider } from '../agents/llm/provider.js';
import { createProvider } from '../cli/provider.js';
import { QuestKitSession } from '../session/questkit-mission-impossible/session.js';
import { runSession } from '../runner/session-run.js';
import { Transcript, readTranscript } from '../runner/transcript.js';
import { runFromRecords } from '../runner/metrics.js';
import { classifyFailure } from '../runner/classify.js';
import type { FailureCode } from '../runner/classify.js';

/** One cell of the comparison: a model, a condition and a seed. */
export interface ComparisonCell {
  model: string;
  condition: string;
  seed: number;
  outcome: string;
  turns: number;
  parseErrors: number;
  invalidActions: number;
  tokensUsed: number;
  failure: FailureCode | null;
}

/** Whether an events record is the one that ends a run. */
function endsTheRun(record: Record<string, unknown>): boolean {
  const data = record['data'];
  if (!Array.isArray(data)) return false;
  return data.some((event) => (event as { type?: string }).type === 'run_ended');
}

/** The conditions the comparison runs, the same five the matrix uses. */
export const CONDITIONS: Array<{ id: string; strategy: ContextStrategy; renderer: ObservationRenderer }> = [
  { id: 'A', strategy: 'full', renderer: 'text' },
  { id: 'B', strategy: 'full', renderer: 'json' },
  { id: 'C', strategy: 'structured', renderer: 'json' },
  { id: 'D', strategy: 'none', renderer: 'json' },
  { id: 'E', strategy: 'full', renderer: 'json' },
];

export interface ComparisonOptions {
  /**
   * The models to compare, each as a factory: a provider is built per seed,
   * because a provider carries the run's state and two seeds must not share
   * one.
   */
  models: Array<{ id: string; make: (seed: number) => LlmProvider }>;
  conditions?: string[];
  seeds?: number;
  maxTurns?: number;
  root?: string;
  /** Where the summary artefacts are written. No directory, no artefacts. */
  resultsDir?: string;
  onCell?: (cell: ComparisonCell) => void;
}

/** The comparison, run over the models and conditions it is given. */
export async function runComparison(options: ComparisonOptions): Promise<ComparisonCell[]> {
  const root = options.root ?? 'runs/exp-08';
  const seeds = options.seeds ?? 10;
  const maxTurns = options.maxTurns ?? 30;
  const wanted = options.conditions ?? CONDITIONS.map((condition) => condition.id);
  const cells: ComparisonCell[] = [];

  for (const model of options.models) {
    for (const condition of CONDITIONS.filter((entry) => wanted.includes(entry.id))) {
      for (let seed = 1; seed <= seeds; seed += 1) {
        const directory = join(root, model.id, condition.id);
        mkdirSync(directory, { recursive: true });
        const path = join(directory, `${seed}.jsonl`);

        // A run that already finished is not run again: the sweep resumes
        // where it stopped, the way every other sweep in this series does.
        if (existsSync(path)) {
          const finished = readTranscript(path).find(
            (record) => record['type'] === 'events' && endsTheRun(record),
          );
          if (finished !== undefined) {
            const data = (finished['data'] as Array<{ outcome: string; reason: string }>)[0];
            const cell: ComparisonCell = {
              model: model.id,
              condition: condition.id,
              seed,
              outcome: data?.outcome ?? 'unknown',
              turns: Number(finished['turn'] ?? 0),
              parseErrors: 0,
              invalidActions: 0,
              tokensUsed: 0,
              failure: null,
            };
            cells.push(cell);
            options.onCell?.(cell);
            continue;
          }
        }

        const provider = model.make(seed);
        const transcript = new Transcript(path, {
          type: 'header',
          runId: `${model.id}/${condition.id}/${seed}`,
          adventure: 'questkit-mission-impossible',
          adventureVersion: '1.0.0',
          adventureHash: 'sha256:questkit',
          policy: 'llm',
          provider: provider.id,
          model: provider.model,
          seed,
          maxTurns,
          startedAt: new Date().toISOString(),
          engineVersion: '0.1.0',
        });

        const session = new QuestKitSession(`${model.id}/${condition.id}/${seed}`);
        const result = await runSession({
          session,
          provider: model.make(seed),
          strategy: condition.strategy,
          renderer: condition.renderer,
          budgets: { maxTurns },
          transcript,
        });
        transcript.close();

        // The run is read back from its transcript, so the taxonomy sees the
        // same evidence it sees for every other run in this series.
        const records = readTranscript(path);
        const failure = classifyFailure(runFromRecords(records), session.adventure);

        const cell: ComparisonCell = {
          model: model.id,
          condition: condition.id,
          seed,
          outcome: result.outcome,
          turns: result.turns,
          parseErrors: result.parseErrors,
          invalidActions: result.invalidActions,
          tokensUsed: result.tokensUsed,
          failure: failure?.code ?? null,
        };
        cells.push(cell);
        options.onCell?.(cell);
      }
    }
  }

  if (options.resultsDir !== undefined) {
    mkdirSync(options.resultsDir, { recursive: true });
    const artefacts = buildArtefacts(cells);
    writeFileSync(join(options.resultsDir, 'summary.json'), artefacts.json);
    writeFileSync(join(options.resultsDir, 'summary.md'), artefacts.md);
  }

  return cells;
}

/** The table the comparison prints. */
export function renderComparison(cells: ComparisonCell[]): string {
  const lines = ['model                cond  n      solved  median turns  parse errors'];
  const models = [...new Set(cells.map((cell) => cell.model))];
  for (const model of models) {
    for (const condition of [...new Set(cells.map((cell) => cell.condition))]) {
      const cell = cells.filter((entry) => entry.model === model && entry.condition === condition);
      if (cell.length === 0) continue;
      const solved = cell.filter((entry) => entry.outcome === 'success').length;
      const turns = cell.map((entry) => entry.turns).sort((left, right) => left - right);
      const median = turns.length === 0 ? 0 : turns[Math.floor(turns.length / 2)]!;
      const parseErrors = cell.reduce((sum, entry) => sum + entry.parseErrors, 0);
      lines.push(
        `${model.padEnd(20)}${condition.padEnd(6)}${String(cell.length).padEnd(7)}${String(solved).padEnd(7)}${String(median).padEnd(14)}${parseErrors}`,
      );
    }
  }
  return lines.join('\n');
}

/** The solved counts of one model and condition, as the artefact stores them. */
export interface ComparisonCellCount {
  model: string;
  condition: string;
  runs: number;
  solved: number;
  medianTurns: number;
  parseErrors: number;
}

/** Per model and condition, what happened. */
export function cellCounts(cells: ComparisonCell[]): ComparisonCellCount[] {
  const keys = [...new Set(cells.map((cell) => `${cell.model}/${cell.condition}`))];
  const counts: ComparisonCellCount[] = [];

  for (const key of keys) {
    const [model, condition] = key.split('/');
    const cell = cells.filter((entry) => entry.model === model && entry.condition === condition);
    const turns = cell.map((entry) => entry.turns).sort((left, right) => left - right);
    counts.push({
      model: model!,
      condition: condition!,
      runs: cell.length,
      solved: cell.filter((entry) => entry.outcome === 'success').length,
      medianTurns: turns.length === 0 ? 0 : turns[Math.floor(turns.length / 2)]!,
      parseErrors: cell.reduce((sum, entry) => sum + entry.parseErrors, 0),
    });
  }

  return counts;
}

/** The artefacts the comparison writes: a machine summary and a table. */
export function buildArtefacts(cells: ComparisonCell[]): { json: string; md: string } {
  const counts = cellCounts(cells);
  const solved = counts.reduce((sum, count) => sum + count.solved, 0);
  const runs = counts.reduce((sum, count) => sum + count.runs, 0);
  const failures: Record<string, number> = {};
  for (const cell of cells) {
    if (cell.failure === null) continue;
    failures[cell.failure] = (failures[cell.failure] ?? 0) + 1;
  }

  const json = `${JSON.stringify(
    {
      engine: 'questkit',
      cells,
      counts,
      totals: { runs, solved, failures },
    },
    null,
    2,
  )}\n`;

  const md = [
    '# The engine comparison',
    '',
    'The same agent, prompt, budgets and seeds, on a world whose rules live in QuestKit.',
    '',
    '```',
    renderComparison(cells),
    '```',
    '',
    `Solved ${solved} of ${runs} runs on the QuestKit engine.`,
    '',
    'Failure histogram:',
    '',
    ...Object.entries(failures)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([code, count]) => `- ${code}: ${count}`),
    '',
  ].join('\n');

  return { json, md };
}

/** Build the providers the comparison names, from the environment. */
export function providersFor(
  models: Array<{ id: string; provider: string; model: string; baseUrl?: string; apiKeyEnv?: string }>,
): Array<{ id: string; make: (seed: number) => LlmProvider }> {
  return models.map((model) => ({
    id: model.id,
    // A live provider carries no per-seed state, so one instance serves the
    // whole cell; the surrogate is the one that needed a seed.
    make: () =>
      createProvider(model.provider as never, model.model, {
        ...(model.baseUrl === undefined ? {} : { baseUrl: model.baseUrl }),
        ...(model.apiKeyEnv === undefined ? {} : { apiKeyEnv: model.apiKeyEnv }),
      }),
  }));
}
