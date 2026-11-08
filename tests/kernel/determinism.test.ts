/*
 * Engine determinism, across processes.
 *
 * A hash chain that is stable inside one process but differs between two
 * would let a transcript recorded on one machine fail to replay on another.
 * The usual cause is something outside the engine's reach: a clock, a random
 * seed, a process identifier, the working directory.
 *
 * So the check runs the engine twice, in two separate processes, and compares
 * what they print.
 */

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TSX = fileURLToPath(new URL('../../node_modules/.bin/tsx', import.meta.url));
const SCRIPT = fileURLToPath(new URL('../../scripts/hash-chain.ts', import.meta.url));

function chain(): string {
  return execFileSync(TSX, [SCRIPT], { encoding: 'utf8' }).trim();
}

describe('engine determinism', () => {
  it('produces the same hash chain in two separate processes', () => {
    const first = chain();
    const second = chain();

    expect(first).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(second).toBe(first);
  });
});
