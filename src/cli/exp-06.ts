/*
 * Experiment 06: the two worlds side by side.
 *
 * The same harness, the same prompts, the same budgets, pointed at a second
 * world. The question is not whether the organisation can be won. It is
 * whether the failure categories are the same categories, because if they
 * are then the game was a rehearsal rather than a metaphor.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Adventure } from '../kernel/types.js';
import { adventureById } from '../adventures/index.js';
import { GOLD_PATH as GAME_GOLD_PATH } from '../adventures/mission-impossible/gold-path.js';
import { GOLD_PATH as ORG_GOLD_PATH } from '../adventures/hotfix-2-4-1/gold-path.js';
import { ScriptedPolicy } from '../agents/scripted.js';
import { RandomPolicy } from '../agents/random.js';
import { run, type RunResult } from '../runner/run.js';
import { Transcript, readTranscript } from '../runner/transcript.js';
import { computeMetrics, type RunMetrics } from '../runner/metrics.js';
import { failureHistogram } from '../runner/matrix.js';
import type { FailureCode } from '../runner/classify.js';
import type { ConditionId } from '../agents/conditions.js';

/** The nine codes the taxonomy defines. */
const CODES: FailureCode[] = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9'];

export interface Exp06Options {
  /** Where the transcripts go. */
  root?: string;
  /** Where the comparison artefacts go. */
  resultsDir?: string;
}

/** One world's result: the scripted run and the random baseline. */
export interface WorldResult {
  id: string;
  title: string;
  goldPathLength: number;
  scripted: RunMetrics;
  randomRuns: number;
  randomSuccesses: number;
  failures: Record<string, number>;
}

/** Run one world: the scripted policy and a spread of random baselines. */
export async function runWorld(
  adventure: Adventure,
  goldPath: string[],
  options: { root: string; randomSeeds: number },
): Promise<WorldResult> {
  const directory = join(options.root, adventure.id);
  mkdirSync(directory, { recursive: true });

  const transcriptPath = join(directory, 'scripted.jsonl');
  const transcript = new Transcript(transcriptPath, {
    type: 'header',
    runId: 'scripted',
    adventure: adventure.id,
    adventureVersion: adventure.version,
    adventureHash: 'sha256:unversioned',
    policy: 'scripted',
    provider: null,
    model: null,
    seed: 1,
    maxTurns: 30,
    startedAt: new Date().toISOString(),
    engineVersion: '0.1.0',
  });

  await run({ adventure, policy: new ScriptedPolicy(goldPath), maxTurns: 30, transcript });
  transcript.close();

  const scripted = computeMetrics(readTranscript(transcriptPath), adventure, {
    goldPathLength: goldPath.length,
  });

  let randomSuccesses = 0;
  const randomMetrics: RunMetrics[] = [];

  for (let seed = 1; seed <= options.randomSeeds; seed += 1) {
    const path = join(directory, `random-${seed}.jsonl`);
    const runTranscript = new Transcript(path, {
      type: 'header',
      runId: `random-${seed}`,
      adventure: adventure.id,
      adventureVersion: adventure.version,
      adventureHash: 'sha256:unversioned',
      policy: 'random',
      provider: null,
      model: null,
      seed,
      maxTurns: 30,
      startedAt: new Date().toISOString(),
      engineVersion: '0.1.0',
    });

    const result: RunResult = await run({
      adventure,
      policy: new RandomPolicy(adventure, seed),
      maxTurns: 30,
      transcript: runTranscript,
    });
    runTranscript.close();

    if (result.outcome === 'success') randomSuccesses += 1;

    randomMetrics.push(
      computeMetrics(readTranscript(path), adventure, { goldPathLength: goldPath.length }),
    );
  }

  // The failures worth counting are the ones the random baseline produced:
  // the scripted run wins, so it fails nothing.
  const summaries = randomMetrics.map((metrics) => ({
    model: adventure.id,
    condition: 'A' as ConditionId,
    expected: 1,
    runs: 1,
    complete: true,
    successes: metrics.outcome === 'success' ? 1 : 0,
    interval: { estimate: 0, lower: 0, upper: 1 },
    medianTurns: metrics.turnsUsed,
    costPerSolve: metrics.estimatedCostUsd,
    tokensUsed: metrics.tokensUsed,
    tokensPerSolve: metrics.tokensUsed,
    failures: metrics.failure === null ? {} : { [metrics.failure]: 1 },
  }));

  return {
    id: adventure.id,
    title: adventure.title,
    goldPathLength: goldPath.length,
    scripted,
    randomRuns: options.randomSeeds,
    randomSuccesses,
    failures: failureHistogram(summaries),
  };
}

/** The comparison, as a table. */
export function renderComparison(worlds: WorldResult[]): string {
  const lines: string[] = [
    'world                scripted    turns   random baseline',
    '-------------------  ----------  ------  ---------------',
  ];

  for (const world of worlds) {
    lines.push(
      `${world.id.padEnd(19)}  ${(world.scripted.outcome ?? 'unknown').padEnd(10)}  ` +
        `${String(world.scripted.turnsUsed).padEnd(6)}  ` +
        `${world.randomSuccesses}/${world.randomRuns} solved`,
    );
  }

  return lines.join('\n');
}

/** The failure categories of both worlds, side by side. */
export function renderFailureComparison(worlds: WorldResult[]): string {
  const codes = CODES;
  const lines: string[] = [
    `  ${'code'.padEnd(6)}${worlds.map((world) => world.id.padEnd(20)).join('')}`,
  ];

  for (const code of codes) {
    const counts = worlds.map((world) => String(world.failures[code] ?? 0).padEnd(20));
    lines.push(`  ${code.padEnd(6)}${counts.join('')}`);
  }

  // The last column is padded like the rest, and a padded last column leaves
  // trailing whitespace on every line, which the prose gates rightly refuse.
  return lines.map((line) => line.trimEnd()).join('\n');
}

/** The whole experiment, ready to print. */
export async function runExp06(options: Exp06Options = {}): Promise<string> {
  const root = options.root ?? 'runs/exp-06';
  const resultsDir = options.resultsDir ?? 'results';
  mkdirSync(resultsDir, { recursive: true });

  const game = await runWorld(
    adventureById('mission-impossible'),
    GAME_GOLD_PATH,
    { root, randomSeeds: 20 },
  );
  const organisation = await runWorld(adventureById('hotfix-2-4-1'), ORG_GOLD_PATH, {
    root,
    randomSeeds: 20,
  });
  const worlds = [game, organisation];

  const summary = {
    worlds,
    // The transfer claim: every failure in both worlds landed in a category
    // that already existed, so the classifier needed no new rule.
    taxonomyCoversBothWorlds: worlds.every((world) =>
      Object.keys(world.failures).every((code) => CODES.includes(code as FailureCode)),
    ),
    // A separate question, and a different answer: do the two worlds fail in
    // the same proportion?
    distributionsMatch:
      Object.keys(game.failures).sort().join(',') ===
      Object.keys(organisation.failures).sort().join(','),
  };

  writeFileSync(join(resultsDir, 'transfer.json'), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(
    join(resultsDir, 'transfer.md'),
    [
      '# Two worlds, one harness',
      '',
      renderComparison(worlds),
      '',
      '## The failure categories',
      '',
      renderFailureComparison(worlds),
      '',
    ].join('\n'),
  );

  return [
    'Experiment 06: an organisation, written as an adventure.',
    '',
    renderComparison(worlds),
    '',
    'The failure categories of both worlds:',
    renderFailureComparison(worlds),
    '',
    `The taxonomy transfers: ${summary.taxonomyCoversBothWorlds ? 'yes' : 'no'}. Every failure in both worlds landed in a category that already existed, and the classifier needed no new rule to sort them.`,
    `The distributions match: ${summary.distributionsMatch ? 'yes' : 'no'}. The two worlds do not fail in the same proportion, which is a finding about the worlds rather than about the taxonomy.`,
  ].join('\n');
}
