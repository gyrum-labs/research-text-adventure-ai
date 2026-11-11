/*
 * The session ports.
 *
 * The promise of the interface is that the same game logic works against
 * every implementation: the in-memory one, the file one, and the HTTP one
 * over a real socket. Each test here plays the same ten commands through a
 * different port and expects the same world to come back.
 */

import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemorySession } from '../../src/session/in-memory.js';
import { FileSession } from '../../src/session/file.js';
import { HttpSession } from '../../src/session/http.js';
import { startSessionServer } from '../../src/server/server.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';
import { GOLD_PATH } from '../../src/adventures/mission-impossible/gold-path.js';
import type { Session } from '../../src/session/types.js';

describe('the in-memory session', () => {
  it('plays the gold path to a success', async () => {
    const session = new InMemorySession('one', adventure);

    let last;
    for (const command of GOLD_PATH) last = await session.send(command);

    expect(last?.status).toBe('success');
    expect(last?.turn).toBe(GOLD_PATH.length);
  });

  it('does not advance the hash on a line that does not parse', async () => {
    const session = new InMemorySession('one', adventure);
    const before = (await session.snapshot()).hash;

    const turn = await session.send('frobnicate the widget');

    expect(turn.parsed).toBe(false);
    expect(turn.hash).toBe(before);
    expect(turn.turn).toBe(0);
  });

  it('returns to the first state on reset', async () => {
    const session = new InMemorySession('one', adventure);
    await session.send(GOLD_PATH[0]!);
    const snapshot = await session.reset();

    expect(snapshot.turn).toBe(0);
    expect(snapshot.hash).toBe((await new InMemorySession('two', adventure).snapshot()).hash);
  });
});

describe('the file session', () => {
  it('persists after every command and resumes where it left off', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'session-'));
    const path = join(directory, 'game.json');

    const first = new FileSession('one', adventure, path);
    await first.send(GOLD_PATH[0]!);
    await first.send(GOLD_PATH[1]!);

    const stored = JSON.parse(readFileSync(path, 'utf8')) as { turn: number; hash: string };
    expect(stored.turn).toBe(2);

    const resumed = new FileSession('one', adventure, path);
    const snapshot = await resumed.snapshot();
    expect(snapshot.turn).toBe(2);
    expect(snapshot.hash).toBe(stored.hash);

    // The resumed game finishes the mission from the persisted state.
    let last;
    for (const command of GOLD_PATH.slice(2)) last = await resumed.send(command);
    expect(last?.status).toBe('success');
  });

  it('starts a fresh game when no file exists', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'session-'));
    const path = join(directory, 'absent.json');
    const session = new FileSession('one', adventure, path);

    expect((await session.snapshot()).turn).toBe(0);
    expect(existsSync(path)).toBe(false);
  });
});

describe('the http session', () => {
  it('plays the same game against the server', async () => {
    const started = await startSessionServer();
    try {
      const opened = await fetch(`${started.url}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ adventureId: adventure.id }),
      });
      const { id } = (await opened.json()) as { id: string };
      const session: Session = new HttpSession(id, adventure, { baseUrl: started.url });

      let last;
      for (const command of GOLD_PATH) last = await session.send(command);

      expect(last?.status).toBe('success');
      expect((await session.snapshot()).turn).toBe(GOLD_PATH.length);
    } finally {
      await started.close();
    }
  });
});
