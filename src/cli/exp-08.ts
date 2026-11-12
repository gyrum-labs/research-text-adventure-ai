/*
 * Experiment 08: the engine comparison.
 *
 * The same agent, the same prompt, the same budgets and the same models,
 * pointed at a world whose rules live in somebody else's engine. The number
 * that comes out is the control the whole series has been missing: if the
 * agent scores the same here, our engine was not the reason it worked.
 */

import { existsSync, mkdirSync } from 'node:fs';
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
  models: Array<{ id: string; provider: LlmProvider }>;
  conditions?: string[];
  seeds?: number;
  maxTurns?: number;
  root?: string;
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

        const transcript = new Transcript(path, {
          type: 'header',
          runId: `${model.id}/${condition.id}/${seed}`,
          adventure: 'questkit-mission-impossible',
          adventureVersion: '1.0.0',
          adventureHash: 'sha256:questkit',
          policy: 'llm',
          provider: model.provider.id,
          model: model.provider.model,
          seed,
          maxTurns,
          startedAt: new Date().toISOString(),
          engineVersion: '0.1.0',
        });

        const session = new QuestKitSession(`${model.id}/${condition.id}/${seed}`);
        const result = await runSession({
          session,
          provider: model.provider,
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

/** Build the providers the comparison names, from the environment. */
export function providersFor(
  models: Array<{ id: string; provider: string; model: string; baseUrl?: string; apiKeyEnv?: string }>,
): Array<{ id: string; provider: LlmProvider }> {
  return models.map((model) => ({
    id: model.id,
    provider: createProvider(model.provider as never, model.model, {
      ...(model.baseUrl === undefined ? {} : { baseUrl: model.baseUrl }),
      ...(model.apiKeyEnv === undefined ? {} : { apiKeyEnv: model.apiKeyEnv }),
    }),
  }));
}
