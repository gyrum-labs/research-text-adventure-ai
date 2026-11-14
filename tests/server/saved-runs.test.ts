/*
 * Saved runs.
 *
 * A run somebody watched is evidence, and evidence that evaporates when the
 * server stops is not evidence at all. These checks are about the promise that
 * a run can be revisited: every watched run is kept whatever its policy, the
 * list shows what is there, a saved run opens with its commands and results,
 * and replaying it re-derives the same chain without asking a model for
 * anything.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startSessionServer } from '../../src/server/server.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';
import { GOLD_PATH } from '../../src/adventures/mission-impossible/gold-path.js';
import type { SavedRunSummary } from '../../src/server/saved-runs.js';

const originalFetch = globalThis.fetch;

async function playScripted(url: string): Promise<{ id: string; outcome: string }> {
  const opened = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ adventureId: adventure.id, policy: 'scripted' }),
  });
  const { id } = (await opened.json()) as { id: string };
  const text = await (await fetch(`${url}/api/runs/${id}/stream`)).text();
  const ended = text.split('\n\n').map(b => b.replace(/^data: /, '')).filter(Boolean)
    .map(line => JSON.parse(line) as { type: string; data?: { outcome?: string } })
    .find(record => record.type === 'run_ended');
  return { id, outcome: ended?.data?.outcome ?? 'unknown' };
}

function root(): string {
  return mkdtempSync(join(tmpdir(), 'saved-runs-'));
}

describe('saving watched runs', () => {
  let url: string;
  let close: () => Promise<void>;
  let dir: string;

  const start = async (saveRoot?: string): Promise<void> => {
    const started = await startSessionServer({ staticRoot: undefined, ...(saveRoot ? { savedRunsRoot: saveRoot } : {}) });
    url = started.url;
    close = started.close;
  };

  afterEach(async () => {
    vi.restoreAllMocks();
    await close();
  });

  it('keeps a scripted run the same as a paid one', async () => {
    dir = root();
    await start(dir);
    const run = await playScripted(url);
    expect(run.outcome).toBe('success');
    const files = (await import('node:fs')).readdirSync(join(dir, 'runs'));
    expect(files.filter(name => name.endsWith('.jsonl'))).toHaveLength(1);
  });

  it('lists saved runs with what a reader needs to choose one', async () => {
    dir = root();
    await start(dir);
    await playScripted(url);
    const listed = (await fetch(`${url}/api/runs/saved`)).json() as unknown;
    const runs = (listed as { runs: SavedRunSummary[] }).runs;
    expect(runs).toHaveLength(1);
    expect(runs[0]!.adventure).toBe(adventure.id);
    expect(runs[0]!.outcome).toBe('success');
    expect(typeof runs[0]!.startedAt).toBe('string');
  });

  it('opens a saved run with its commands and results', async () => {
    dir = root();
    await start(dir);
    const played = await playScripted(url);
    const saved = (await fetch(`${url}/api/runs/saved/${played.id}`).then(r => r.json())) as {
      id: string;
      commands: Array<{ raw: string; turn: number }>;
      outcome: string;
      hash: string;
      records: unknown[];
    };
    expect(saved.commands.map(command => command.raw)).toEqual(GOLD_PATH);
    expect(saved.outcome).toBe('success');
    expect(saved.hash).toMatch(/^sha256:/);
    expect(saved.records.length).toBeGreaterThan(0);
  });

  it('replays a saved run without any inference', async () => {
    dir = root();
    await start(dir);
    const played = await playScripted(url);
    const spy = vi.spyOn(globalThis, 'fetch');

    const replay = (await fetch(`${url}/api/runs/saved/${played.id}/replay`, { method: 'POST' })
      .then(r => r.json())) as { ok: boolean; steps: number; inferenceRequests: number };

    expect(replay.ok).toBe(true);
    expect(replay.steps).toBe(GOLD_PATH.length);
    expect(replay.inferenceRequests).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it('refuses a run it does not hold, by name', async () => {
    dir = root();
    await start(dir);
    const response = await fetch(`${url}/api/runs/saved/not-a-run`);
    expect(response.status).toBe(404);
    expect(((await response.json()) as { error: string }).error).toContain('not-a-run');
  });

  it('keeps saved runs across a server restart', async () => {
    dir = root();
    await start(dir);
    const played = await playScripted(url);
    await close();

    await start(dir);
    const saved = await fetch(`${url}/api/runs/saved/${played.id}`);
    expect(saved.status).toBe(200);
    const replay = await fetch(`${url}/api/runs/saved/${played.id}/replay`, { method: 'POST' });
    expect(((await replay.json()) as { ok: boolean }).ok).toBe(true);
  });
});
