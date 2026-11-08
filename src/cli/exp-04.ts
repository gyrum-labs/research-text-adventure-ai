/*
 * Experiment 04: why it failed.
 *
 * "It failed" is not a finding. The category is.
 *
 * The sweep runs a set of policies that each fail in one known way, plus the
 * random policy over a spread of seeds, so that every category has at least
 * one run behind it and the histogram says something rather than being a
 * picture of one policy's habits.
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Adventure } from '../kernel/types.js';
import type { AgentPolicy, PolicyContext } from '../agents/policy.js';
import { RandomPolicy } from '../agents/random.js';
import { ScriptedPolicy } from '../agents/scripted.js';
import { GOLD_PATH } from '../adventures/mission-impossible/gold-path.js';
import { run, type RunBudgets } from '../runner/run.js';
import { Transcript, readTranscript } from '../runner/transcript.js';
import { CATEGORIES, type FailureCode } from '../runner/classify.js';
import { computeMetrics, type RunMetrics } from '../runner/metrics.js';

export interface Exp04Options {
  /** How many random-policy seeds to include. */
  seeds?: number;
  /** Where to write the transcripts. */
  transcriptDir?: string;
  /** The turn budget for every run. */
  maxTurns?: number;
}

/** One run of the sweep, with its metrics and its classification. */
export interface SweepRun {
  name: string;
  metrics: RunMetrics;
}

/** A policy that walks a fixed list of commands and then stops. */
class WalkingPolicy implements AgentPolicy {
  readonly id: string;

  private index = 0;

  constructor(id: string, private readonly commands: string[]) {
    this.id = id;
  }

  async next(): Promise<string | null> {
    const command = this.commands[this.index];
    this.index += 1;
    return command ?? null;
  }
}

/** A policy that plays a preamble and then wanders between two places. */
class WanderingPolicy implements AgentPolicy {
  readonly id: string;

  private index = 0;

  constructor(
    id: string,
    private readonly preamble: string[],
    private readonly wander: string[],
  ) {
    this.id = id;
  }

  async next(): Promise<string | null> {
    if (this.index < this.preamble.length) {
      const command = this.preamble[this.index];
      this.index += 1;
      return command ?? null;
    }
    const command = this.wander[this.index % this.wander.length];
    this.index += 1;
    return command ?? null;
  }
}

/** A policy that never produces a command the parser accepts. */
class MalformedPolicy implements AgentPolicy {
  readonly id = 'malformed';

  async next(): Promise<string | null> {
    return 'unlock';
  }
}

/** A policy that names something that is not there. */
class HallucinatingPolicy implements AgentPolicy {
  readonly id = 'hallucinating';

  async next(): Promise<string | null> {
    return 'take the brass key';
  }
}

/** A policy that gives up. */
class AbstainingPolicy implements AgentPolicy {
  readonly id = 'abstaining';

  async next(_context: PolicyContext): Promise<string | null> {
    return null;
  }
}

/**
 * The policies that fail in one known way each.
 *
 * These are not experiments. They are the fixtures that give every category
 * a run, so that the classifier is proved against something rather than
 * against a policy that happens to wander.
 */
function failingPolicies(): Array<{ name: string; policy: AgentPolicy }> {
  return [
    {
      name: 'f1-malformed',
      policy: new MalformedPolicy(),
    },
    {
      name: 'f2-hallucination',
      policy: new HallucinatingPolicy(),
    },
    {
      name: 'f3-repeated-failure',
      policy: new WalkingPolicy('f3-repeated-failure', ['take desk', 'take desk', 'look']),
    },
    {
      name: 'f4-too-early',
      policy: new WalkingPolicy('f4-too-early', [
        'take keycard',
        'go corridor',
        'open locker',
        'take cutters',
        'unlock vault door with keycard',
        'go vault',
        'cut yellow wire with cutters',
        'look',
        'look',
      ]),
    },
    {
      name: 'f5-no-exploration',
      policy: new WalkingPolicy('f5-no-exploration', ['look', 'look', 'look']),
    },
    {
      name: 'f6-lethal-trap',
      policy: new WalkingPolicy('f6-lethal-trap', [
        'take keycard',
        'go corridor',
        'open locker',
        'take cutters',
        'read manual',
        'unlock vault door with keycard',
        'go vault',
        'cut red wire with cutters',
      ]),
    },
    {
      name: 'f7-wandering',
      policy: new WanderingPolicy(
        'f7-wandering',
        [
          'take keycard',
          'go corridor',
          'open locker',
          'read manual',
          'unlock vault door with keycard',
          'go vault',
        ],
        ['go corridor', 'go vault'],
      ),
    },
    {
      name: 'f8-provider-error',
      policy: {
        id: 'f8-provider-error',
        async next(): Promise<string | null> {
          throw new Error('the provider is on fire');
        },
      },
    },
    {
      name: 'f9-abstention',
      policy: new AbstainingPolicy(),
    },
  ];
}

/** Run the sweep and return one record per run. */
export async function runSweep(
  adventure: Adventure,
  options: Exp04Options = {},
): Promise<SweepRun[]> {
  const seeds = options.seeds ?? 20;
  const directory = options.transcriptDir ?? 'runs/exp-04';
  mkdirSync(directory, { recursive: true });

  const budgets: Partial<RunBudgets> = { maxTurns: options.maxTurns ?? 30 };
  const runs: SweepRun[] = [];

  const policies: Array<{ name: string; policy: AgentPolicy }> = [
    { name: 'gold-path', policy: new ScriptedPolicy(GOLD_PATH) },
    ...failingPolicies(),
  ];

  for (let seed = 1; seed <= seeds; seed += 1) {
    policies.push({ name: `random-${seed}`, policy: new RandomPolicy(adventure, seed) });
  }

  for (const entry of policies) {
    const path = join(directory, `${entry.name}.jsonl`);
    const transcript = new Transcript(path, {
      type: 'header',
      runId: entry.name,
      adventure: adventure.id,
      adventureVersion: adventure.version,
      adventureHash: 'sha256:unversioned',
      policy: entry.policy.id,
      provider: 'mock',
      model: 'mock-model',
      seed: 1,
      maxTurns: budgets.maxTurns ?? 30,
      startedAt: new Date().toISOString(),
      engineVersion: '0.1.0',
    });

    try {
      await run({ adventure, policy: entry.policy, budgets, transcript });
    } catch (error) {
      // A policy that throws is a provider failure, and the sweep records it
      // as one rather than losing the run.
      transcript.write({
        type: 'metrics',
        turn: 0,
        data: {
          outcome: 'provider_error',
          reason: error instanceof Error ? error.message : 'the policy threw',
          turns: 0,
          parseErrors: 0,
          invalidActions: 0,
          tokensUsed: 0,
          inputTokens: 0,
          outputTokens: 0,
          wallClockMs: 0,
        },
      });
    }
    transcript.close();

    const metrics = computeMetrics(readTranscript(path), adventure, {
      goldPathLength: GOLD_PATH.length,
      model: 'mock/mock-model',
    });
    runs.push({ name: entry.name, metrics });
  }

  return runs;
}

/** The histogram: how many runs fell into each category. */
export function histogram(runs: SweepRun[]): Map<FailureCode, number> {
  const counts = new Map<FailureCode, number>();

  for (const category of CATEGORIES) counts.set(category.code, 0);
  for (const run of runs) {
    if (run.metrics.failure === null) continue;
    counts.set(run.metrics.failure, (counts.get(run.metrics.failure) ?? 0) + 1);
  }

  return counts;
}

/** The histogram, drawn. */
export function renderHistogram(runs: SweepRun[]): string {
  const counts = histogram(runs);
  const failed = runs.filter((run) => run.metrics.failure !== null).length;
  const succeeded = runs.length - failed;
  const widest = Math.max(1, ...counts.values());

  const lines: string[] = [
    `${runs.length} runs · ${succeeded} succeeded · ${failed} failed`,
    '',
  ];

  for (const category of CATEGORIES) {
    const count = counts.get(category.code) ?? 0;
    const bar = '█'.repeat(Math.round((count / widest) * 20));
    lines.push(
      `  ${category.code}  ${category.name.padEnd(26)} ${String(count).padStart(3)}   ${bar}`,
    );
  }

  return lines.join('\n');
}

/** The whole experiment, ready to print. */
export async function runExp04(
  adventure: Adventure,
  options: Exp04Options = {},
): Promise<string> {
  const runs = await runSweep(adventure, options);
  const succeeded = runs.filter((run) => run.metrics.outcome === 'success');
  const cost = runs.reduce((total, run) => total + run.metrics.estimatedCostUsd, 0);
  const perSolved = succeeded.length === 0 ? 0 : cost / succeeded.length;

  const lines: string[] = [
    'Experiment 04: why it failed.',
    '',
    renderHistogram(runs),
    '',
    `cost per solved mission: $${perSolved.toFixed(4)}`,
  ];

  const annotated = runs.filter((run) => run.metrics.failure !== null);
  if (annotated.length > 0) {
    lines.push('');
    lines.push('every failure, annotated:');
    for (const run of annotated) {
      const category = CATEGORIES.find((candidate) => candidate.code === run.metrics.failure);
      lines.push(
        `  ${run.name.padEnd(24)} ${run.metrics.failure}  ${category?.name ?? ''}  (${run.metrics.turnsUsed} turns)`,
      );
    }
  }

  return lines.join('\n');
}
