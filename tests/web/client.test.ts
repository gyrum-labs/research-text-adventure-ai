/*
 * The session the page plays.
 *
 * The page and the server must agree on which world is open, because a page
 * that says one thing and plays another is worse than one that refuses. These
 * checks pin that agreement: the world asked for is the world opened, an
 * unknown world is refused rather than substituted, and the world asked for
 * is the world sent to the server.
 */

import { describe, expect, it, vi } from 'vitest';
import { openSession } from '../../src/web/client.js';
import { ADVENTURES } from '../../src/adventures/index.js';
import { adventure as mission } from '../../src/adventures/mission-impossible/adventure.js';
import { adventure as hotfix } from '../../src/adventures/hotfix-2-4-1/adventure.js';

describe('opening a session', () => {
  it('opens the world that was asked for, in memory', async () => {
    for (const world of [mission, hotfix]) {
      const session = await openSession({ mode: 'memory', adventureId: world.id });
      expect(session.adventure.id).toBe(world.id);
    }
  });

  it('opens the first world when nothing was asked for', async () => {
    const session = await openSession({ mode: 'memory' });
    expect(session.adventure.id).toBe(Object.keys(ADVENTURES)[0]);
  });

  it('refuses a world that does not exist instead of substituting one', async () => {
    await expect(openSession({ mode: 'memory', adventureId: 'not-a-world' }))
      .rejects.toThrow('not-a-world');
    await expect(openSession({ mode: 'memory', adventureId: '' }))
      .rejects.toThrow('unknown adventure');
  });

  it('sends the world it was asked for to the server and plays that one', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ id: 'held/one' }, { status: 201 }));
    const session = await openSession({ mode: 'http', baseUrl: 'http://server.test', adventureId: hotfix.id, fetch });

    const opened = fetch.mock.calls[0]!;
    expect(opened[0]).toBe('http://server.test/api/session');
    expect(JSON.parse(String(opened[1]!.body))).toEqual({ adventureId: hotfix.id });
    expect(session.adventure.id).toBe(hotfix.id);
  });

  it('refuses the session when the server does not hold the world', async () => {
    // The client knows the world, but this server holds fewer of them, so the
    // refusal has to come back over the wire rather than from the local check.
    const fetch = vi.fn().mockResolvedValue(Response.json({ error: 'unknown adventure: hotfix-2-4-1' }, { status: 404 }));
    await expect(openSession({ mode: 'http', baseUrl: 'http://server.test', adventureId: hotfix.id, fetch }))
      .rejects.toThrow('refused the session: 404');
    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.parse(String(fetch.mock.calls[0]![1]!.body))).toEqual({ adventureId: hotfix.id });
  });
});
