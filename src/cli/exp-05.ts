/*
 * Experiment 05: the matrix.
 *
 * One number is an anecdote. A cell of a matrix, with an interval, is a
 * result. The command runs the whole grid, writes the artefacts, and prints
 * the table.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Adventure } from '../kernel/types.js';
import type { ConditionId } from '../agents/conditions.js';
import {
  costPerSolvedMission,
  failureHistogram,
  providerFor,
  runMatrix,
  summariseMatrix,
  type CellSummary,
  type MatrixConfig,
} from '../runner/matrix.js';
import { evaluateHypotheses, type HypothesisVerdict } from '../runner/hypotheses.js';
import { createProvider, type ProviderName } from './provider.js';

export interface Exp05Options {
  config: MatrixConfig;
  /** Where the transcripts go. */
  root?: string;
  /** Where the summary artefacts go. */
  resultsDir?: string;
}

/** The table: one row per cell. */
export function renderTable(summaries: CellSummary[], labels: Map<string, string>): string {
  const header = [
    'model',
    'cond',
    'n',
    'success (95% CI)',
    'median turns',
    '$/solve',
  ];
  const rows = summaries.map((summary) => [
    labels.get(summary.model) ?? summary.model,
    summary.condition,
    `${summary.runs}/${summary.expected}`,
    summary.complete
      ? `${(summary.interval.estimate * 100).toFixed(0)}%  (${(summary.interval.lower * 100).toFixed(0)}–${(summary.interval.upper * 100).toFixed(0)}%)`
      : `incomplete`,
    summary.medianTurns === 0 ? '-' : summary.medianTurns.toFixed(0),
    summary.costPerSolve === 0 ? '-' : `$${summary.costPerSolve.toFixed(4)}`,
  ]);

  const widths = header.map((cell, index) =>
    Math.max(cell.length, ...rows.map((row) => row[index]!.length)),
  );

  return [
    header.map((cell, index) => cell.padEnd(widths[index]!)).join('  '),
    widths.map((width) => '-'.repeat(width)).join('  '),
    ...rows.map((row) => row.map((cell, index) => cell.padEnd(widths[index]!)).join('  ')),
  ]
    .map((line) => line.trimEnd())
    .join('\n');
}

/** The failure histogram, drawn. */
export function renderFailures(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return 'no failures';

  const widest = Math.max(...entries.map(([, count]) => count));
  return entries
    .map(([code, count]) => `  ${code}  ${'█'.repeat(Math.round((count / widest) * 20))} ${count}`)
    .join('\n');
}

/** The hypotheses, stated as verdicts. */
export function renderHypotheses(verdicts: HypothesisVerdict[]): string {
  return verdicts
    .map(
      (verdict) =>
        `  ${verdict.id}  ${verdict.verdict.toUpperCase().padEnd(9)} ${verdict.hypothesis}\n      ${verdict.reason}`,
    )
    .join('\n');
}

/** The whole experiment, ready to print, with the artefacts written. */
export async function runExp05(
  adventure: Adventure,
  options: Exp05Options,
): Promise<string> {
  const root = options.root ?? options.config.runsDir ?? 'runs';
  const resultsDir = options.resultsDir ?? options.config.resultsDir ?? 'results';
  mkdirSync(resultsDir, { recursive: true });

  const runs = await runMatrix(adventure, options.config, {
    root,
    // The surrogate is the matrix's own, and it needs no key. A live model is
    // built here, where the environment is read, and it is told which endpoint
    // and which variable the configuration named.
    providerFor: (model, seed) =>
      model.provider === 'surrogate'
        ? providerFor(model, seed)
        : createProvider(model.provider as ProviderName, model.model, {
            ...(model.baseUrl === undefined ? {} : { baseUrl: model.baseUrl }),
            ...(model.apiKeyEnv === undefined ? {} : { apiKeyEnv: model.apiKeyEnv }),
          }),
  });
  const summaries = summariseMatrix(runs, options.config);
  const verdicts = evaluateHypotheses(summaries, runs);
  const failures = failureHistogram(summaries);
  const cost = costPerSolvedMission(runs);

  const labels = new Map(options.config.models.map((model) => [model.id, model.label]));

  const summary = {
    generatedFrom: root,
    models: options.config.models,
    conditions: options.config.conditions,
    seeds: options.config.seeds,
    cells: summaries,
    failures,
    costPerSolvedMission: cost,
    hypotheses: verdicts,
  };

  writeFileSync(join(resultsDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(
    join(resultsDir, 'summary.md'),
    [
      '# The matrix',
      '',
      renderTable(summaries, labels),
      '',
      '## Failures',
      '',
      renderFailures(failures),
      '',
      `cost per solved mission: $${cost.toFixed(4)}`,
      '',
      '## Hypotheses',
      '',
      renderHypotheses(verdicts),
      '',
    ].join('\n'),
  );

  return [
    'Experiment 05: the matrix.',
    '',
    renderTable(summaries, labels),
    '',
    'Failures:',
    renderFailures(failures),
    '',
    `cost per solved mission: $${cost.toFixed(4)}`,
    '',
    'Hypotheses:',
    renderHypotheses(verdicts),
  ].join('\n');
}

export type { ConditionId, MatrixConfig };
