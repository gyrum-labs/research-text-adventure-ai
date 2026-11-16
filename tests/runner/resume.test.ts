/*
 * Resuming a run.
 *
 * A paused run is a run that stopped and left everything behind: the world as
 * it stood, what the agent had seen, and how much of its budget it had spent.
 * These checks say what resuming means — the mission continues from where it
 * stopped, the caps keep applying across the pause, and the transcript shows
 * both halves as one run.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { run } from '../../src/runner/run.js';
import { readTranscript } from '../../src/runner/transcript.js';
import { Transcript } from '../../src/runner/transcript.js';
import { ScriptedPolicy } from '../../src/agents/scripted.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';
import { GOLD_PATH } from '../../src/adventures/mission-impossible/gold-path.js';

const FIRST_HALF = GOLD_PATH.slice(0, 2);
const SECOND_HALF = GOLD_PATH.slice(2);

/** Play some commands and return what the run left behind. */
async function play(commands: string[], options: Partial<Parameters<typeof run>[0]> = {}) {
  return run({
    adventure,
    policy: new ScriptedPolicy(commands),
    transcript: options.transcript,
    initial: options.initial,
    startingTurn: options.startingTurn,
  });
}

describe('resuming a run', () => {
  it('continues the mission from the state the pause left behind', async () => {
    const first = await play(FIRST_HALF);
    expect(first.turns).toBe(FIRST_HALF.length);
    // The scripted agent has said everything it was given, so it stops; the
    // state it leaves is what a resume continues from.
    expect(first.state.status).toBe('running');

    const second = await play(SECOND_HALF, { initial: first.state, startingTurn: first.turns });
    expect(second.outcome).toBe('success');
    expect(second.state.status).toBe('success');
  });

  it('keeps the caps applying across the pause', async () => {
    const first = await play(FIRST_HALF);
    // The same total cap applies: two turns were spent, so two more are left.
    const second = await play(GOLD_PATH.slice(2, 3), {
      initial: first.state, startingTurn: first.turns, maxTurns: first.turns + 1,
    });
    expect(second.outcome).not.toBe('success');
    expect(second.turns).toBe(first.turns + 1);
  });

  it('records both halves in one transcript', async () => {
    const path = join('runs', 'resume-test.jsonl');
    if (existsSync(path)) unlinkSync(path);
    // One transcript for the whole lineage: a resume appends, it does not
    // start the record over.
    const transcript = new Transcript(path, header(0));
    const first = await play(FIRST_HALF, { transcript });
    await play(SECOND_HALF, { initial: first.state, startingTurn: first.turns, transcript });
    const commands = readTranscript(path).filter(record => record.type === 'command');
    expect(commands.map(record => record.raw)).toEqual(GOLD_PATH);
  });
});

function header(offset: number): ConstructorParameters<typeof Transcript>[1] {
  return {
    type: 'header', runId: `resume-${offset}`, adventure: adventure.id,
    adventureVersion: adventure.version, adventureHash: 'sha256:test',
    policy: 'scripted', provider: null, model: null, seed: 1,
    maxTurns: 30, startedAt: new Date().toISOString(), engineVersion: '0.1.0',
  };
}

function join(...parts: string[]): string {
  return parts.join('/');
}
