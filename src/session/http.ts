/*
 * The HTTP session.
 *
 * The server-held game. The browser client, or any other client, sends
 * commands over the wire and the state never leaves the server: which is
 * the entire difference from the other two implementations, and the reason
 * the agent can be pointed at the same session a human is watching.
 *
 * The routes are the ones SPEC 14.3 names, and the payloads are the
 * session's own types, so an in-process session and this one are
 * interchangeable to the last hash.
 */

import type { Adventure } from '../kernel/types.js';
import type { Session, SessionSnapshot, SessionTurn } from './types.js';

/** A fetch that exists as a type, so tests can stand in for the network. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface HttpOptions {
  /** Where the server is, for example http://127.0.0.1:8787. */
  baseUrl: string;
  /** The fetch to use. The global one, unless a test says otherwise. */
  fetch?: FetchLike;
}

/** A game held by the server, reached over HTTP. */
export class HttpSession implements Session {
  readonly id: string;
  readonly adventure: Adventure;

  private readonly options: HttpOptions;
  private readonly fetchLike: FetchLike;

  constructor(id: string, adventure: Adventure, options: HttpOptions) {
    this.id = id;
    this.adventure = adventure;
    this.options = options;
    this.fetchLike = options.fetch ?? ((url, init) => fetch(url, init));
  }

  async send(raw: string): Promise<SessionTurn> {
    const response = await this.request('POST', `/api/session/${this.id}/command`, { raw });
    return (await response.json()) as SessionTurn;
  }

  async snapshot(): Promise<SessionSnapshot> {
    const response = await this.request('GET', `/api/session/${this.id}`);
    return (await response.json()) as SessionSnapshot;
  }

  async reset(): Promise<SessionSnapshot> {
    const response = await this.request('POST', `/api/session/${this.id}/reset`);
    return (await response.json()) as SessionSnapshot;
  }

  private async request(method: string, path: string, body?: unknown): Promise<Response> {
    const response = await this.fetchLike(`${this.options.baseUrl}${path}`, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      throw new Error(`session request failed: ${method} ${path} answered ${response.status}`);
    }
    return response;
  }
}
