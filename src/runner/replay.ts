/*
 * Replay: the proof that the environment is deterministic.
 *
 * Replaying a transcript re-applies its commands to a fresh state and
 * compares the hash chain with the one that was recorded. If every hash
 * matches, the world behaved exactly as it did the first time.
 */

import { readFileSync } from 'node:fs';
import type { Adventure, GameState } from '../kernel/types.js';
import { hashInitial, hashNext } from '../kernel/hash.js';
import { parseCommand } from '../kernel/parser.js';
import { reduce } from '../kernel/reduce.js';

export interface ReplayResult {
  ok: boolean;
  steps: number;
  mismatch: { step: number; expected: string; actual: string } | null;
  finalState: GameState;
}

export function replayTranscript(path: string, adventure: Adventure): ReplayResult {
  const lines = readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0);

  let state: GameState = structuredClone(adventure.initial);
  let hash = hashInitial(state);
  let step = 0;

  // The recorded hashes live in the state records, one per turn, in order.
  const expectedHashes: string[] = [];
  for (const line of lines) {
    const record = JSON.parse(line) as Record<string, unknown>;
    if (record['type'] === 'state') {
      const recorded = record['hash'];
      if (typeof recorded === 'string') expectedHashes.push(recorded);
    }
  }

  let turn = 0;
  for (const line of lines) {
    const record = JSON.parse(line) as Record<string, unknown>;
    if (record['type'] !== 'command') continue;

    const raw = String(record['raw'] ?? '');
    const parsed = parseCommand(adventure, state, raw);
    if (parsed.ok) {
      const transition = reduce(adventure, state, parsed.command);
      state = transition.state;
      hash = hashNext(hash, state);
    }

    step += 1;
    const expected = expectedHashes[turn];
    turn += 1;
    if (expected !== undefined && expected !== hash) {
      return { ok: false, steps: step, mismatch: { step, expected, actual: hash }, finalState: state };
    }
  }

  return { ok: true, steps: step, mismatch: null, finalState: state };
}
