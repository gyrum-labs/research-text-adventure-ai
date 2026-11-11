/*
 * Interface equivalence.
 *
 * TASKS.md names this gate, and Phase 5 exists to open it: the same
 * commands, through every session port, must produce the same hash chain
 * link for link. The hash chain is the identity of a run, so this is the
 * strongest statement one implementation can make about another: not that
 * they feel the same, that they are the same game.
 */

import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemorySession } from '../src/session/in-memory.js';
import { FileSession } from '../src/session/file.js';
import { HttpSession } from '../src/session/http.js';
import { startSessionServer } from '../src/server/server.js';
import { adventure } from '../src/adventures/mission-impossible/adventure.js';
import { GOLD_PATH } from '../src/adventures/mission-impossible/gold-path.js';
import type { Session } from '../src/session/types.js';

/** A game that cannot be won by luck: two wrong commands before the win. */
const DETOUR = ['wait', 'inventory', ...GOLD_PATH];

describe('interface equivalence', () => {
  it('produces an identical hash chain through every session port', async () => {
    const started = await startSessionServer();
    try {
      const opened = await fetch(`${started.url}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ adventureId: adventure.id }),
      });
      const { id } = (await opened.json()) as { id: string };

      const ports: Session[] = [
        new InMemorySession('memory', adventure),
        new FileSession('file', adventure, join(mkdtempSync(join(tmpdir(), 'eq-')), 'game.json')),
        new HttpSession(id, adventure, { baseUrl: started.url }),
      ];

      const chains: string[][] = [];

      for (const port of ports) {
        const chain: string[] = [(await port.snapshot()).hash];
        let status = 'running';
        for (const command of DETOUR) {
          const turn = await port.send(command);
          chain.push(turn.hash);
          status = turn.status;
        }
        chains.push(chain);
        expect(status).toBe('success');
        expect((await port.snapshot()).turn).toBe(DETOUR.length);
      }

      expect(chains[1]).toEqual(chains[0]);
      expect(chains[2]).toEqual(chains[0]);
    } finally {
      await started.close();
    }
  });

  it('agrees on a parse failure without advancing any chain', async () => {
    const started = await startSessionServer();
    try {
      const opened = await fetch(`${started.url}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ adventureId: adventure.id }),
      });
      const { id } = (await opened.json()) as { id: string };

      const memory = new InMemorySession('memory', adventure);
      const http = new HttpSession(id, adventure, { baseUrl: started.url });

      const memoryTurn = await memory.send('not a command the world knows');
      const httpTurn = await http.send('not a command the world knows');

      expect(httpTurn.parsed).toBe(memoryTurn.parsed);
      expect(httpTurn.hash).toBe(memoryTurn.hash);
      expect(httpTurn.message).toBe(memoryTurn.message);
    } finally {
      await started.close();
    }
  });
});
