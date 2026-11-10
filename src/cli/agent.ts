/*
 * The agent CLI: run a policy against the adventure, headless.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import type { Adventure } from '../kernel/types.js';
import { ScriptedPolicy } from '../agents/scripted.js';
import { RandomPolicy } from '../agents/random.js';
import type { AgentPolicy } from '../agents/policy.js';
import { run } from '../runner/run.js';
import { renderObservation } from '../kernel/render.js';
import { Transcript } from '../runner/transcript.js';
import { GOLD_PATH } from '../adventures/mission-impossible/gold-path.js';

export type PolicyName = 'scripted' | 'random';

export interface AgentOptions {
  adventure: Adventure;
  policy: PolicyName;
  seed?: number;
  maxTurns?: number;
  transcriptPath?: string;
  quiet?: boolean;
}

export async function runAgent(options: AgentOptions): Promise<void> {
  const seed = options.seed ?? 1;
  const policy: AgentPolicy =
    options.policy === 'scripted'
      ? new ScriptedPolicy(GOLD_PATH)
      : new RandomPolicy(options.adventure, seed);

  const transcriptPath =
    options.transcriptPath ?? `runs/${options.policy}-${seed}/${options.adventure.id}.jsonl`;
  mkdirSync('runs', { recursive: true });

  const transcript = new Transcript(transcriptPath, {
    type: 'header',
    runId: `${options.policy}-${seed}`,
    adventure: options.adventure.id,
    adventureVersion: options.adventure.version,
    adventureHash: 'sha256:unversioned',
    policy: policy.id,
    provider: null,
    model: null,
    seed,
    maxTurns: options.maxTurns ?? 30,
    startedAt: new Date().toISOString(),
    engineVersion: '0.1.0',
  });

  // The room is shown when it changes, so a headless run reads like a
  // transcript of somebody playing rather than a list of outcomes.
  let lastRoom: string | undefined;
  const result = await run({
    adventure: options.adventure,
    policy,
    maxTurns: options.maxTurns,
    transcript,
    onObservation: (observation) => {
      if (options.quiet) return;
      if (observation.room.id === lastRoom) return;
      lastRoom = observation.room.id;
      console.log('');
      console.log(renderObservation(observation));
    },
    onMessage: (message) => {
      if (!options.quiet && message.length > 0) console.log(message);
    },
  });

  transcript.write({
    type: 'metrics',
    turn: result.turns,
    data: {
      outcome: result.outcome,
      reason: result.reason,
      turns: result.turns,
      parseErrors: result.parseErrors,
      invalidActions: result.invalidActions,
      hash: result.hash,
    },
  });
  transcript.close();

  if (!options.quiet) {
    console.log('');
    console.log(`outcome: ${result.outcome}`);
    console.log(`turns:   ${result.turns}`);
    console.log(`hash:    ${result.hash}`);
  }
  console.log(`transcript: ${transcriptPath}`);
  writeFileSync(
    `${transcriptPath}.summary.json`,
    `${JSON.stringify(
      {
        outcome: result.outcome,
        reason: result.reason,
        turns: result.turns,
        parseErrors: result.parseErrors,
        invalidActions: result.invalidActions,
        hash: result.hash,
      },
      null,
      2,
    )}\n`,
  );
}
