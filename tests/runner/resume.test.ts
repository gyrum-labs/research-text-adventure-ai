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

  it('marks the pause in the transcript and leaves the run unfinished', async () => {
    const path = join('runs', 'resume-pause-test.jsonl');
    if (existsSync(path)) unlinkSync(path);
    const transcript = new Transcript(path, header(1));
    const { policy } = pausingAfter(2);
    const first = await run({ adventure, policy: policy as never, transcript, signal: policy.signal, maxTurns: 10 });
    expect(first.outcome).toBe('paused');
    const markers = readTranscript(path).filter(record => record.type === 'paused');
    expect(markers).toHaveLength(1);
    // A pause writes no ending: the transcript holds no run_ended to mistake
    // for a finished run.
    expect(readTranscript(path).filter(record => record.type === 'events' &&
      JSON.stringify(record).includes('run_ended'))).toHaveLength(0);
  });

  it('a pause leaves behind everything the continuation needs', async () => {
    const { policy } = pausingAfter(2);
    const first = await run({ adventure, policy: policy as never, signal: policy.signal, maxTurns: 10 });
    expect(first.outcome).toBe('paused');
    expect(first.pause).toBeDefined();
    // The pause arrived during the third model call, so two turns had been
    // spoken and three observations existed, the second one built on the
    // world the first command changed.
    expect(first.pause?.history).toHaveLength(3);
    expect(first.pause?.commands).toEqual(FIRST_HALF);
    // Nothing has repeated: both commands changed the world, and a streak is
    // counted from nought.
    expect(first.pause?.loop.repeats).toBe(0);
    expect(first.pause?.counters).toMatchObject({
      cutOffReplies: 0, retriedReplies: 0, reasoningTokens: 0, longestUnchangedTurns: 0, freezes: 0,
    });
  });

  it('a resumed run keeps counting the unchanged turns the pause interrupted', async () => {
    // One quiet turn before the pause. The pause arrives inside the next turn,
    // before its command is applied, so the resumed run takes that turn again
    // and then one more. The count carries across the pause, and the turn the
    // pause interrupted is not counted twice. It is a count now, and no longer
    // ends the run (warp#23474).
    const waiting = waitingPolicy(1);
    const first = await run({
      adventure, policy: waiting.policy as never, maxTurns: 2, signal: waiting.policy.signal,
    });
    expect(first.outcome).toBe('paused');
    expect(first.pause?.loop.repeats).toBe(0);
    const second = await run({
      adventure, policy: { id: 'stub', async next() { return 'wait'; } } as never,
      initial: first.state, startingTurn: first.turns,
      resume: first.pause, maxTurns: 2,
    });
    // Three turns in all in the same state: the one before the pause, and two
    // after. That is one freeze. The turns ended the run, at their limit: the
    // turn count is the whole lineage's, across the pause.
    expect(second.outcome).toBe('budget_exhausted');
    expect(second.reason).toBe('The agent used all 2 turns.');
    expect(second.turns).toBe(3);
    expect(second.longestUnchangedTurns).toBe(3);
    expect(second.freezes).toBe(1);
  });

  it('a resumed run carries its error counters across the pause', async () => {
    // A policy that issues one unparsable command before the pause, then
    // behaves: the resumed run must still remember the parse error.
    let calls = 0;
    const controller = new AbortController();
    const policy = {
      id: 'stub',
      signal: controller.signal,
      async next() {
        calls += 1;
        if (calls === 1) return 'dance a jig';
        if (calls === 2) {
          controller.abort(new DOMException('The run was paused.', 'PauseError'));
          throw new DOMException('The run was paused.', 'AbortError');
        }
        return GOLD_PATH[calls - 2] ?? null;
      },
    };
    const first = await run({ adventure, policy: policy as never, maxTurns: 3, signal: controller.signal });
    expect(first.outcome).toBe('paused');
    expect(first.pause?.counters.parseErrors).toBe(1);
    let gold = 0;
    const second = await run({
      adventure,
      policy: { id: 'stub', async next() { return GOLD_PATH[gold++] ?? null; } } as never,
      initial: first.state, startingTurn: first.turns,
      resume: first.pause, maxTurns: 10,
    });
    expect(second.parseErrors).toBe(1);
    expect(second.outcome).toBe('success');
  });
});

/** A policy that pauses the run during its `at`-th call, the way an operator's button lands mid-model-call. */
function pausingAfter(at: number): {
  policy: { id: string; signal: AbortSignal; next: () => Promise<string | null> };
} {
  const controller = new AbortController();
  let calls = 0;
  return {
    policy: {
      id: 'stub',
      signal: controller.signal,
      async next() {
        calls += 1;
        if (calls > at) {
          controller.abort(new DOMException('The run was paused.', 'PauseError'));
          throw new DOMException('The run was paused.', 'AbortError');
        }
        return GOLD_PATH[calls - 1] ?? null;
      },
    },
  };
}

/** A policy that only ever waits, pausing during its `at`-th call. */
function waitingPolicy(at: number): {
  policy: { id: string; signal: AbortSignal; next: () => Promise<string | null> };
} {
  const controller = new AbortController();
  let calls = 0;
  return {
    policy: {
      id: 'stub',
      signal: controller.signal,
      async next() {
        calls += 1;
        if (calls > at) {
          controller.abort(new DOMException('The run was paused.', 'PauseError'));
          throw new DOMException('The run was paused.', 'AbortError');
        }
        return 'wait';
      },
    },
  };
}

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
