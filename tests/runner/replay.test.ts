import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashInitial, hashNext } from '../../src/kernel/hash.js';
import { parseCommand } from '../../src/kernel/parser.js';
import { reduce } from '../../src/kernel/reduce.js';
import { replayTranscript } from '../../src/runner/replay.js';
import { run } from '../../src/runner/run.js';
import { Transcript } from '../../src/runner/transcript.js';
import { ScriptedPolicy } from '../../src/agents/scripted.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';
import { GOLD_PATH } from '../../src/adventures/mission-impossible/gold-path.js';

describe('replay', () => {
  it('reproduces a recorded run exactly', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'replay-'));
    const path = join(directory, 'run.jsonl');

    const transcript = new Transcript(path, {
      type: 'header',
      runId: 'test',
      adventure: adventure.id,
      adventureVersion: adventure.version,
      adventureHash: 'sha256:test',
      policy: 'scripted',
      provider: null,
      model: null,
      seed: 1,
      maxTurns: 30,
      startedAt: new Date().toISOString(),
      engineVersion: '0.1.0',
    });
    const result = await run({ adventure, policy: new ScriptedPolicy(GOLD_PATH), transcript });
    transcript.close();

    const replayed = replayTranscript(path, adventure);
    expect(replayed.ok).toBe(true);
    expect(replayed.steps).toBe(GOLD_PATH.length);
    expect(replayed.finalState.status).toBe('success');
    expect(replayed.finalState.turn).toBe(result.turns);
  });

  it('refuses a transcript whose hash chain has been tampered with', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'replay-'));
    const path = join(directory, 'run.jsonl');

    const transcript = new Transcript(path, {
      type: 'header',
      runId: 'test',
      adventure: adventure.id,
      adventureVersion: adventure.version,
      adventureHash: 'sha256:test',
      policy: 'scripted',
      provider: null,
      model: null,
      seed: 1,
      maxTurns: 30,
      startedAt: new Date().toISOString(),
      engineVersion: '0.1.0',
    });
    await run({ adventure, policy: new ScriptedPolicy(GOLD_PATH), transcript });
    transcript.close();

    const lines = readFileSync(path, 'utf8').split('\n');
    const rewritten = lines.map((line) => {
      if (!line.includes('"type":"state"')) return line;
      return line.replace('"hash":"sha256:', '"hash":"sha256:deadbeef');
    });
    const tampered = join(directory, 'tampered.jsonl');
    writeFileSync(tampered, rewritten.join('\n'));

    const replayed = replayTranscript(tampered, adventure);
    expect(replayed.ok).toBe(false);
    expect(replayed.mismatch).not.toBeNull();
  });
});

describe('one engine, three interfaces', () => {
  it('produces the same hash chain whether the commands come from a policy or a person', async () => {
    // The "policy" path.
    const result = await run({ adventure, policy: new ScriptedPolicy(GOLD_PATH) });

    // The "person" path: the same commands, applied directly.
    let state = structuredClone(adventure.initial);
    let hash = hashInitial(state);
    for (const raw of GOLD_PATH) {
      const parsed = parseCommand(adventure, state, raw);
      if (!parsed.ok) throw new Error(`gold path did not parse: ${raw}`);
      state = reduce(adventure, state, parsed.command).state;
      hash = hashNext(hash, state);
    }

    expect(hash).toBe(result.hash);
    expect(state.turn).toBe(result.turns);
    expect(state.status).toBe('success');
  });
});
