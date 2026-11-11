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
import type { RunMetrics } from '../runner/metrics.js';
import { replayTranscript } from '../runner/replay.js';
import { readTranscript } from '../runner/transcript.js';
import { createProvider, type ProviderName } from './provider.js';

export interface Exp05Options {
  config: MatrixConfig;
  /** Where the transcripts go. */
  root?: string;
  /** Where the summary artefacts go. */
  resultsDir?: string;
  /** Report the transcripts on disk without calling a provider. */
  summariseOnly?: boolean;
}

/** The table: one row per cell. */
export function renderTable(summaries: CellSummary[], labels: Map<string, string>): string {
  const header = [
    'model',
    'cond',
    'n',
    'success (95% CI)',
    'median turns',
    'tok/solve',
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
    summary.tokensPerSolve === 0 ? '-' : summary.tokensPerSolve.toFixed(0),
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

/**
 * The failure histogram, with the transcripts behind it.
 *
 * A histogram without the runs that produced it is an assertion. Each
 * non-empty category gets its transcripts quoted, so a reader can see what
 * the category means rather than take the label on trust.
 */
export function renderAnnotatedFailures(
  runs: { model: string; condition: string; seed: number; metrics: RunMetrics | null }[],
  root: string,
): string {
  const byCode = new Map<string, typeof runs>();

  for (const run of runs) {
    const code = run.metrics?.failure;
    if (code === null || code === undefined) continue;
    const list = byCode.get(code) ?? [];
    list.push(run);
    byCode.set(code, list);
  }

  const lines: string[] = [];

  for (const [code, group] of [...byCode.entries()].sort()) {
    lines.push(`## ${code} — ${group.length} run(s)`);
    lines.push('');

    for (const run of group.slice(0, 3)) {
      const path = join(root, run.model, run.condition, `${run.seed}.jsonl`);
      const commands: string[] = [];
      for (const record of readTranscript(path)) {
        if (record['type'] === 'command') commands.push(String(record['raw'] ?? ''));
      }
      lines.push(`### ${run.model} / ${run.condition} / seed ${run.seed}`);
      lines.push('');
      lines.push(`Commands: ${commands.join(' · ') || 'none'}`);
      lines.push('');
      lines.push(`Outcome: ${run.metrics?.outcome ?? 'unknown'} — ${run.metrics?.failure ?? 'none'}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Replay every transcript and report how many reproduce their hash chain.
 *
 * The engine's determinism is the one claim that must hold for every run
 * ever recorded, so it is checked over all of them rather than a sample.
 */
export function checkReplay(
  runs: { model: string; condition: string; seed: number }[],
  root: string,
  adventure: Adventure,
): { total: number; reproduced: number } {
  let reproduced = 0;
  let total = 0;

  for (const run of runs) {
    const path = join(root, run.model, run.condition, `${run.seed}.jsonl`);
    total += 1;
    const result = replayTranscript(path, adventure);
    if (result.ok) reproduced += 1;
  }

  return { total, reproduced };
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
    ...(options.summariseOnly === true ? { summariseOnly: true } : {}),
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
  const replay = checkReplay(runs, root, adventure);

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
    join(resultsDir, 'failures.md'),
    [
      '# The failures',
      '',
      renderFailures(failures),
      '',
      '## Annotated transcripts',
      '',
      renderAnnotatedFailures(runs, root),
    ].join('\n'),
  );

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
    '',
    `Replay: ${replay.reproduced}/${replay.total} transcripts reproduce their hash chain.`,
  ].join('\n');
}

export type { ConditionId, MatrixConfig };
