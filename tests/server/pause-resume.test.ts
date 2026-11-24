/*
 * Pausing and resuming a watched live run.
 *
 * A pause must hold the mission still: nothing runs, nothing spends, and the
 * run keeps everything it had — the world, the agent's memory, and the caps
 * it already spent against. These checks drive a real server with a fake
 * provider, the way the browser drives it: open, watch, pause, resume.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLiveAiDemo } from '../../src/server/live-ai.js';
import { startSessionServer } from '../../src/server/server.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';
import { GOLD_PATH } from '../../src/adventures/mission-impossible/gold-path.js';
import { readTranscript } from '../../src/runner/transcript.js';

interface DemoRecord { type: string; data?: Record<string, unknown>; turn?: number; raw?: string }

const originalFetch = globalThis.fetch;
const secret = 'demo-key-keep-on-server';
afterEach(() => vi.restoreAllMocks());

function modelFetch(reply: (init: RequestInit) => Promise<Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) =>
    String(url).startsWith('https://openrouter.ai/') ? reply(init!) : originalFetch(url, init));
}

/** A provider that answers with the gold path, hanging exactly at the listed call indexes.
 *
 * The reply walks the gold path by answered call, not by dispatched one: a
 * hung call that a pause aborted never answered, so the resumed run's first
 * call is asked the same turn again.
 */
function scriptedModel(requests: string[], hangAt: number[]) {
  let replyIndex = 0;
  return modelFetch(async init => {
    const index = requests.length;
    requests.push(String(init.body));
    if (hangAt.includes(index)) {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('paused', 'AbortError')), { once: true });
      });
    }
    const command = GOLD_PATH[replyIndex++];
    return Response.json({ choices: [{ message: { content: `COMMAND: ${command}` } }],
      usage: { prompt_tokens: 80, completion_tokens: 5 } });
  });
}

function demo(budgets: Record<string, number> = {}) {
  const transcriptRoot = mkdtempSync(join(tmpdir(), 'pause-resume-'));
  return { transcriptRoot, liveAi: createLiveAiDemo({
    apiKey: secret, model: 'deepseek/deepseek-chat', transcriptRoot,
    budgets: { providerRetryDelayMs: 0, ...budgets },
  }) };
}

async function open(url: string): Promise<Response> {
  return fetch(`${url}/api/runs`, { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ adventureId: adventure.id, policy: 'llm' }) });
}

/** Read a run stream until a record of `stopType` arrives, then hang up. */
async function collectUntil(response: Response, stopType: string): Promise<DemoRecord[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const records: DemoRecord[] = [];
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary: number;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      if (!block.startsWith('data: ')) continue;
      const record = JSON.parse(block.slice(6)) as DemoRecord;
      records.push(record);
      if (record.type === stopType) { reader.cancel().catch(() => {}); return records; }
    }
  }
  return records;
}

function transcriptOf(root: string, id: string) {
  return readTranscript(join(root, `${id}.jsonl`));
}

async function untilRequests(requests: string[], count: number): Promise<void> {
  while (requests.length < count) await new Promise(resolve => setTimeout(resolve, 5));
}

describe('pausing and resuming a live run', () => {
  it('pauses mid-mission and resumes the same mission with the same memory', async () => {
    const requests: string[] = [];
    scriptedModel(requests, [2]);
    const f = demo();
    const started = await startSessionServer({ liveAi: f.liveAi });
    try {
      const { id } = await (await open(started.url)).json() as { id: string };
      const response = await fetch(`${started.url}/api/runs/${id}/stream`);
      const reading = collectUntil(response, 'paused');
      // The pause lands while the third model call is in flight.
      await untilRequests(requests, 3);
      const pauseResponse = await fetch(`${started.url}/api/runs/${id}/pause`, { method: 'POST' });
      expect(pauseResponse.status).toBe(200);

      const records = await reading;
      expect(records.filter(record => record.type === 'command')).toHaveLength(2);
      const paused = records.find(record => record.type === 'paused')!;
      expect((paused.data?.usage as { tokensUsed: number }).tokensUsed).toBeGreaterThan(0);

      // Nothing runs while paused: the aborted third call stays the last one.
      await new Promise(resolve => setTimeout(resolve, 30));
      expect(requests).toHaveLength(3);

      // The transcript holds one unfinished lineage: both commands, the pause,
      // and no ending to mistake one for.
      const lines = transcriptOf(f.transcriptRoot, id);
      expect(lines.filter(record => record.type === 'command')).toHaveLength(2);
      expect(lines.filter(record => record.type === 'paused')).toHaveLength(1);
      expect(JSON.stringify(lines)).not.toContain('run_ended');

      // A paused run keeps its slot free: a new run can start.
      expect((await open(started.url)).status).toBe(201);

      // Resume: the same run id, the same mission, the memory it had.
      const resumeResponse = await fetch(`${started.url}/api/runs/${id}/resume`, { method: 'POST' });
      expect(resumeResponse.status).toBe(201);
      const second = await fetch(`${started.url}/api/runs/${id}/stream`);
      const resumedRecords = await collectUntil(second, 'run_ended');
      expect(resumedRecords.some(record => record.type === 'resumed')).toBe(true);
      const ended = resumedRecords.find(record => record.type === 'run_ended')!;
      expect(ended.data?.outcome).toBe('success');

      // The model was told where the mission stood: its first resumed prompt
      // carries an observation from before the pause.
      const resumedPrompt = JSON.parse(requests[3]!);
      expect(JSON.stringify(resumedPrompt.messages)).toContain('keycard');

      // One transcript across the pause: the whole gold path, both halves.
      expect(transcriptOf(f.transcriptRoot, id).filter(record => record.type === 'command')
        .map(record => record.raw)).toEqual(GOLD_PATH);
    } finally { await started.close(); }
  });

  it('keeps the caps applying across the pause', async () => {
    const requests: string[] = [];
    scriptedModel(requests, [2]);
    const f = demo({ maxTurns: 4 });
    const started = await startSessionServer({ liveAi: f.liveAi });
    try {
      const { id } = await (await open(started.url)).json() as { id: string };
      const response = await fetch(`${started.url}/api/runs/${id}/stream`);
      const reading = collectUntil(response, 'paused');
      await untilRequests(requests, 3);
      expect((await fetch(`${started.url}/api/runs/${id}/pause`, { method: 'POST' })).status).toBe(200);
      await reading;

      expect((await fetch(`${started.url}/api/runs/${id}/resume`, { method: 'POST' })).status).toBe(201);
      const second = await fetch(`${started.url}/api/runs/${id}/stream`);
      const resumedRecords = await collectUntil(second, 'run_ended');
      const ended = resumedRecords.find(record => record.type === 'run_ended')!;
      // Four turns of lineage were the whole cap; the pause spent none of it
      // twice. Two turns before the pause, two after, then the cap lands.
      expect(ended.data?.outcome).toBe('budget_exhausted');
      expect(ended.data?.turns).toBe(4);
    } finally { await started.close(); }
  });

  it('keeps one active run even with a paused one waiting', async () => {
    const requests: string[] = [];
    scriptedModel(requests, [0, 1]); // run A hangs on its first call; run B hangs on its first (index 1)
    const f = demo();
    const started = await startSessionServer({ liveAi: f.liveAi });
    try {
      const { id } = await (await open(started.url)).json() as { id: string };
      const response = await fetch(`${started.url}/api/runs/${id}/stream`);
      await untilRequests(requests, 1);
      expect((await fetch(`${started.url}/api/runs/${id}/pause`, { method: 'POST' })).status).toBe(200);
      await collectUntil(response, 'paused');

      // A second run starts (a paused run keeps the slot free) and hangs
      // there, active.
      const second = await (await open(started.url)).json() as { id: string };
      const secondStream = await fetch(`${started.url}/api/runs/${second.id}/stream`);
      await untilRequests(requests, 2);

      // Resuming into an active run is refused, with the reason named.
      const blocked = await fetch(`${started.url}/api/runs/${id}/resume`, { method: 'POST' });
      expect(blocked.status).toBe(409);
      expect((await blocked.json()).error).toContain('already active');

      // B must end before A resumes: stopping B frees the slot.
      await secondStream.body?.cancel();
      expect((await fetch(`${started.url}/api/runs/${second.id}`, { method: 'DELETE' })).status).toBe(200);
      expect((await fetch(`${started.url}/api/runs/${id}/resume`, { method: 'POST' })).status).toBe(201);
    } finally { await started.close(); }
  });

  it('tells the operator why a pause or a resume cannot happen', async () => {
    const f = demo();
    const started = await startSessionServer({ liveAi: f.liveAi });
    try {
      const noPause = await fetch(`${started.url}/api/runs/not-a-run/pause`, { method: 'POST' });
      expect(noPause.status).toBe(409);
      expect((await noPause.json()).error).toContain('Only a running AI run');

      const noResume = await fetch(`${started.url}/api/runs/not-a-run/resume`, { method: 'POST' });
      expect(noResume.status).toBe(404);
      expect((await noResume.json()).error).toContain('No paused run');
    } finally { await started.close(); }
  });

  it('a paused run that is stopped is gone, and says so', async () => {
    const requests: string[] = [];
    scriptedModel(requests, [1]);
    const f = demo();
    const started = await startSessionServer({ liveAi: f.liveAi });
    try {
      const { id } = await (await open(started.url)).json() as { id: string };
      const response = await fetch(`${started.url}/api/runs/${id}/stream`);
      await untilRequests(requests, 2);
      expect((await fetch(`${started.url}/api/runs/${id}/pause`, { method: 'POST' })).status).toBe(200);
      await collectUntil(response, 'paused');

      expect((await fetch(`${started.url}/api/runs/${id}`, { method: 'DELETE' })).status).toBe(200);
      const gone = await fetch(`${started.url}/api/runs/${id}/resume`, { method: 'POST' });
      expect(gone.status).toBe(404);
    } finally { await started.close(); }
  });
});
