/*
 * The shim that stands in for node:crypto inside the browser bundle.
 *
 * It must agree with the real one exactly, or the page and the server
 * would compute different hash chains for the same game and the
 * equivalence the whole phase rests on would be a lie.
 */

import { describe, expect, it } from 'vitest';
import { createHash as nodeCreateHash } from 'node:crypto';
import { createHash } from '../../src/web/shims/node-crypto.js';

function real(input: string): string {
  return nodeCreateHash('sha256').update(input, 'utf8').digest('hex');
}

function shimmed(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

describe('the browser crypto shim', () => {
  it('agrees with node:crypto on the empty string', () => {
    expect(shimmed('')).toBe(real(''));
  });

  it('agrees on the input shape the hash chain uses', () => {
    const state = JSON.stringify({ roomId: 'briefing', inventory: ['keycard'], flags: {} });
    expect(shimmed(`sha256:abc:${state}`)).toBe(real(`sha256:abc:${state}`));
  });

  it('agrees on multi-byte characters', () => {
    const text = 'the em-dash is banned — but the hash must still be right: 演劇 🎭';
    expect(shimmed(text)).toBe(real(text));
  });

  it('agrees across block boundaries', () => {
    const text = 'x'.repeat(200);
    expect(shimmed(text)).toBe(real(text));
  });
});
