/*
 * The file session.
 *
 * The same held game as the in-memory session, persisted after every
 * command to sessions/<id>.json, so a run survives the process that
 * started it. What is written is the snapshot and nothing else: the state,
 * the hash, the turn, and the id of the world, which is the whole of what
 * a resume needs and the whole of what an audit should see.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Adventure, GameState } from '../kernel/types.js';
import { hashInitial } from '../kernel/hash.js';
import { InMemorySession } from './in-memory.js';
import type { Session, SessionSnapshot, SessionTurn } from './types.js';

/** A game held in a file, one JSON document per session. */
export class FileSession implements Session {
  readonly id: string;
  readonly adventure: Adventure;

  private readonly path: string;
  private readonly held: InMemorySession;

  constructor(id: string, adventure: Adventure, path: string) {
    this.id = id;
    this.adventure = adventure;
    this.path = path;
    this.held = new InMemorySession(id, adventure);

    // A session file that already exists is a game to resume, not an error.
    if (existsSync(path)) {
      const stored = JSON.parse(readFileSync(path, 'utf8')) as {
        turn?: number;
        hash?: string;
        state?: GameState;
      };
      if (stored.state !== undefined) {
        this.held.restore(stored.state, stored.hash ?? hashInitial(stored.state), stored.turn ?? 0);
      }
    }
  }

  async send(raw: string): Promise<SessionTurn> {
    const turn = await this.held.send(raw);
    await this.persist();
    return turn;
  }

  async snapshot(): Promise<SessionSnapshot> {
    return this.held.snapshot();
  }

  async reset(): Promise<SessionSnapshot> {
    const snapshot = await this.held.reset();
    await this.persist();
    return snapshot;
  }

  private async persist(): Promise<void> {
    const snapshot = await this.held.snapshot();
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, `${JSON.stringify(snapshot, null, 2)}\n`);
  }
}
