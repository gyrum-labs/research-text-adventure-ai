/*
 * The session server's routes.
 *
 * Each route is asked for what SPEC 14.3 names it for: health, the world's
 * brief, opening a session, driving it, resetting it, and the run stream
 * SPEC 14.4 names. The payloads are checked against the session types
 * rather than against examples, because the types are the contract the
 * three implementations share.
 */

import { describe, expect, it } from 'vitest';
import { startSessionServer } from '../../src/server/server.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';
import { GOLD_PATH } from '../../src/adventures/mission-impossible/gold-path.js';
import { adventure as hotfix } from '../../src/adventures/hotfix-2-4-1/adventure.js';
import type { SessionSnapshot, SessionTurn } from '../../src/session/types.js';

async function openSession(url: string): Promise<string> {
  const response = await fetch(`${url}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ adventureId: adventure.id }),
  });
  expect(response.status).toBe(201);
  const body = (await response.json()) as { id: string };
  return body.id;
}

describe('the session server', () => {
  it('answers health with the worlds it holds', async () => {
    const started = await startSessionServer();
    try {
      const response = await fetch(`${started.url}/api/health`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as { ok: boolean; adventures: string[] };
      expect(body.ok).toBe(true);
      expect(body.adventures).toContain('mission-impossible');
    } finally {
      await started.close();
    }
  });

  it('serves a world brief without its solution', async () => {
    const started = await startSessionServer();
    try {
      const response = await fetch(`${started.url}/api/adventure/${adventure.id}`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as { id: string; brief: string };
      expect(body.id).toBe(adventure.id);
      expect(body.brief.length).toBeGreaterThan(0);
      expect(JSON.stringify(body)).not.toContain('gold');
    } finally {
      await started.close();
    }
  });

  it('refuses an unknown world, session and route by name', async () => {
    const started = await startSessionServer();
    try {
      const world = await fetch(`${started.url}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ adventureId: 'no-such-world' }),
      });
      expect(world.status).toBe(404);

      const session = await fetch(`${started.url}/api/session/no-such-id`);
      expect(session.status).toBe(404);

      const route = await fetch(`${started.url}/api/nonsense`);
      expect(route.status).toBe(404);
      const body = (await route.json()) as { error: string };
      expect(body.error).toContain('no route');
    } finally {
      await started.close();
    }
  });

  it('holds the session server-side and answers commands with turns', async () => {
    const started = await startSessionServer();
    try {
      const id = await openSession(started.url);

      const response = await fetch(`${started.url}/api/session/${id}/command`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ raw: GOLD_PATH[0]! }),
      });
      expect(response.status).toBe(200);
      const turn = (await response.json()) as SessionTurn;
      expect(turn.parsed).toBe(true);
      expect(turn.turn).toBe(1);

      // The state is the server's: a second client sees the same turn.
      const snapshotResponse = await fetch(`${started.url}/api/session/${id}`);
      const snapshot = (await snapshotResponse.json()) as SessionSnapshot;
      expect(snapshot.turn).toBe(1);
      expect(snapshot.hash).toBe(turn.hash);

      const resetResponse = await fetch(`${started.url}/api/session/${id}/reset`, {
        method: 'POST',
      });
      const reset = (await resetResponse.json()) as SessionSnapshot;
      expect(reset.turn).toBe(0);
    } finally {
      await started.close();
    }
  });

  it('streams a scripted run to completion as server-sent events', async () => {
    const started = await startSessionServer();
    try {
      const opened = await fetch(`${started.url}/api/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ adventureId: adventure.id, policy: 'scripted' }),
      });
      expect(opened.status).toBe(201);
      const { id } = (await opened.json()) as { id: string };

      const stream = await fetch(`${started.url}/api/runs/${id}/stream`);
      expect(stream.headers.get('content-type')).toBe('text/event-stream');

      const text = await stream.text();
      const records = text
        .split('\n\n')
        .filter((block) => block.startsWith('data: '))
        .map((block) => JSON.parse(block.slice('data: '.length)) as Record<string, unknown>);

      const ended = records.find((record) => record['type'] === 'end');
      const outcome = records.find((record) => record['type'] === 'run_ended');
      const commands = records.filter(record => record['type'] === 'command');
      expect(commands.map(record => record['raw'])).toEqual(GOLD_PATH);
      expect(commands.map(record => record['turn'])).toEqual(GOLD_PATH.map((_, turn) => turn));
      expect(records[0]?.['type']).toBe('observation');
      expect(records[1]).toEqual({ type: 'command', turn: 0, raw: GOLD_PATH[0] });
      expect(records[2]?.['type']).toBe('message');
      expect(ended).toBeDefined();
      expect((outcome?.['data'] as { outcome: string }).outcome).toBe('success');
      expect(records.some((record) => record['type'] === 'observation')).toBe(true);
      const final = records.filter(record => record['type'] === 'observation').at(-1)!;
      expect(final['turn']).toBe(GOLD_PATH.length);
      expect((final['data'] as { goals: Array<{ status: string }> }).goals
        .every(goal => goal.status === 'complete')).toBe(true);
    } finally {
      await started.close();
    }
  });

  it('streams a run that is already over, from its records', async () => {
    const started = await startSessionServer();
    try {
      const opened = await fetch(`${started.url}/api/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ adventureId: adventure.id, policy: 'scripted' }),
      });
      const { id } = (await opened.json()) as { id: string };

      // The run finishes on its own; give it a moment, then read the replay.
      await new Promise((resolve) => setTimeout(resolve, 200));

      const stream = await fetch(`${started.url}/api/runs/${id}/stream`);
      const text = await stream.text();
      expect(text).toContain('run_ended');
    } finally {
      await started.close();
    }
  });

  it('runs the reference path of every world it holds', async () => {
    const started = await startSessionServer();
    try {
      for (const world of [adventure, hotfix]) {
        const opened = await fetch(`${started.url}/api/runs`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ adventureId: world.id, policy: 'scripted' }),
        });
        expect(opened.status).toBe(201);

        const { id } = (await opened.json()) as { id: string };
        const text = await (await fetch(`${started.url}/api/runs/${id}/stream`)).text();
        const records = text
          .split('\n\n')
          .filter((block) => block.startsWith('data: '))
          .map((block) => JSON.parse(block.slice('data: '.length)) as Record<string, unknown>);
        const outcome = records.find((record) => record['type'] === 'run_ended');
        const final = records.filter((record) => record['type'] === 'observation').at(-1)!;

        expect((outcome?.['data'] as { outcome: string }).outcome).toBe('success');
        expect((final['data'] as { goals: Array<{ status: string }> }).goals
          .every((goal) => goal.status === 'complete')).toBe(true);
      }
    } finally {
      await started.close();
    }
  });
});
