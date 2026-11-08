/*
 * Canonical JSON and the state hash chain.
 *
 * The chain is what makes a run checkable: every state is fingerprinted
 * against the one before it, so a transcript can be replayed and compared
 * byte for byte. See `SPEC.md` 6.2 and 13.
 */

import { createHash } from 'node:crypto';
import type { GameState } from './types.js';

/**
 * JSON with recursively sorted keys and no incidental whitespace, so two
 * equal states always produce identical bytes.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/** The chain's first link: the initial state on its own. */
export function hashInitial(state: GameState): string {
  return `sha256:${createHash('sha256').update(canonicalJson(state)).digest('hex')}`;
}

/** The next link in the chain: the previous hash plus the new state. */
export function hashNext(previous: string, state: GameState): string {
  return `sha256:${createHash('sha256')
    .update(`${previous}:${canonicalJson(state)}`)
    .digest('hex')}`;
}
