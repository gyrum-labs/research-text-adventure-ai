/*
 * The session the web client plays.
 *
 * One call, two destinations: the page can hold the game itself, with the
 * kernel bundled in, or ask the server to hold it. The choice is a runtime
 * configuration, not a build, because which side holds the state is a
 * deployment decision and the client should not have to care.
 */

import { ADVENTURES, adventureById } from '../adventures/index.js';
import { InMemorySession } from '../session/in-memory.js';
import { HttpSession } from '../session/http.js';
import type { Session } from '../session/types.js';

/** Where the game is held. */
export type SessionMode = 'memory' | 'http';

export interface OpenOptions {
  mode: SessionMode;
  /** The server, in http mode. Defaults to the page's own origin. */
  baseUrl?: string;
  /** Which world to open. Defaults to the first shipped one. */
  adventureId?: string;
  /** The fetch to use, overridable for the tests. */
  fetch?: typeof fetch;
  /** The id generator to use, overridable for the tests. */
  randomId?: () => string;
}

/** Open a session on the chosen side, against the chosen world. */
export async function openSession(options: OpenOptions): Promise<Session> {
  const adventureId = options.adventureId ?? Object.keys(ADVENTURES)[0]!;
  const adventure = adventureById(adventureId);
  const randomId = options.randomId ?? (() => Math.random().toString(36).slice(2));

  if (options.mode === 'memory') {
    return new InMemorySession(`web-${randomId()}`, adventure);
  }

  const baseUrl = options.baseUrl ?? globalThis.location?.origin ?? 'http://127.0.0.1:8787';
  const fetchLike = options.fetch ?? ((url: string, init?: RequestInit) => fetch(url, init));
  const response = await fetchLike(`${baseUrl}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ adventureId }),
  });
  if (!response.ok) {
    throw new Error(`the server refused the session: ${response.status}`);
  }
  const { id } = (await response.json()) as { id: string };
  return new HttpSession(id, adventure, { baseUrl, fetch: fetchLike as never });
}
