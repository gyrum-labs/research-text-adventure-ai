import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLiveAiDemo, liveAiFromEnvironment } from '../../src/server/live-ai.js';
import { startSessionServer } from '../../src/server/server.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';
import { GOLD_PATH } from '../../src/adventures/mission-impossible/gold-path.js';
import { replayTranscript } from '../../src/runner/replay.js';
import { readTranscript } from '../../src/runner/transcript.js';

interface DemoRecord { type: string; raw?: string; data?: Record<string, unknown> }

const originalFetch = globalThis.fetch;
const secret = 'demo-key-keep-on-server';
afterEach(() => vi.restoreAllMocks());

function modelFetch(reply: (init: RequestInit) => Promise<Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) =>
    String(url).startsWith('https://openrouter.ai/') ? reply(init!) : originalFetch(url, init));
}

function demo(options = {}) {
  const transcriptRoot = mkdtempSync(join(tmpdir(), 'live-ai-'));
  return { transcriptRoot, liveAi: createLiveAiDemo({
    apiKey: secret, model: 'deepseek/deepseek-chat', transcriptRoot,
    budgets: { providerRetryDelayMs: 0 }, ...options,
  }) };
}

async function open(url: string, policy = 'llm', headers = {}) {
  return fetch(`${url}/api/runs`, { method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ adventureId: adventure.id, policy }),
  });
}

async function records(url: string, id: string) {
  const response = await fetch(`${url}/api/runs/${id}/stream`);
  const text = await response.text();
  return text.split('\n\n').filter(block => block.startsWith('data: '))
    .map(block => JSON.parse(block.slice(6)) as DemoRecord);
}

describe('the real-model demo', () => {
  it('stays unavailable without an explicit server key and model', async () => {
    expect(liveAiFromEnvironment({})).toBeUndefined();
    expect(liveAiFromEnvironment({ OPENROUTER_API_KEY: secret })).toBeUndefined();
    const started = await startSessionServer();
    try {
      expect((await open(started.url)).status).toBe(503);
      expect((await open(started.url, 'not-a-policy')).status).toBe(400);
    } finally { await started.close(); }
  });

  it('starts inference only when watched and records a replayable model run', async () => {
    const f = demo();
    const requests: { max_tokens: number }[] = [];
    modelFetch(async init => {
      requests.push(JSON.parse(String(init.body)));
      expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${secret}`);
      return Response.json({ choices: [{ message: { content: `COMMAND: ${GOLD_PATH[requests.length - 1]}` } }],
        usage: { prompt_tokens: 80, completion_tokens: 5 } });
    });
    const started = await startSessionServer({ liveAi: f.liveAi });
    try {
      const health = await (await fetch(`${started.url}/api/health`)).json();
      expect(health.ai.model).toBe('deepseek/deepseek-chat');
      expect(JSON.stringify(health)).not.toContain(secret);
      const response = await open(started.url);
      expect(response.status).toBe(201);
      const { id } = await response.json();
      expect(requests).toHaveLength(0);
      const stream = await records(started.url, id);
      expect(requests).toHaveLength(GOLD_PATH.length);
      expect(requests.every(request => request['max_tokens'] <= 300)).toBe(true);
      expect(JSON.stringify(requests[0])).not.toContain('4821');
      expect(JSON.stringify(requests[0])).not.toContain('cut yellow wire');
      expect(stream.find(record => record['type'] === 'run_started')?.['data']?.['provider']).toBe('OpenRouter');
      expect(stream.filter(record => record['type'] === 'command').map(record => record['raw'])).toEqual(GOLD_PATH);
      expect(stream.find(record => record['type'] === 'run_ended')?.['data']?.['outcome']).toBe('success');
      expect(stream.filter(record => record['type'] === 'usage').at(-1)?.['data']?.['tokensUsed']).toBe(850);
      expect(JSON.stringify(stream)).not.toContain(secret);
      const path = join(f.transcriptRoot, `${id}.jsonl`);
      const transcript = readTranscript(path);
      expect(transcript[0]).toMatchObject({ provider: 'openrouter', model: 'deepseek/deepseek-chat', seed: 1 });
      expect(transcript.some(record => record.type === 'prompt')).toBe(true);
      expect(readFileSync(path, 'utf8')).not.toContain(secret);
      expect(replayTranscript(path, adventure)).toMatchObject({ ok: true, steps: 10 });
    } finally { await started.close(); }
  });

  it('makes no model call for health, offline demos or a cancelled pending start', async () => {
    const remote = vi.fn(async () => Response.json({}));
    modelFetch(remote);
    const started = await startSessionServer({ liveAi: demo().liveAi });
    try {
      await fetch(`${started.url}/api/health`);
      for (const policy of ['scripted', 'random']) {
        const { id } = await (await open(started.url, policy)).json();
        await records(started.url, id);
      }
      const { id } = await (await open(started.url)).json();
      expect((await fetch(`${started.url}/api/runs/${id}`, { method: 'DELETE' })).ok).toBe(true);
      expect(remote).not.toHaveBeenCalled();
      expect((await open(started.url)).status).toBe(201);
    } finally { await started.close(); }
  });

  it('aborts an in-flight request, prevents parallel inference and permits retry', async () => {
    let calls = 0;
    let modelSignal: AbortSignal | null | undefined;
    let entered!: () => void;
    const requested = new Promise<void>(resolve => { entered = resolve; });
    modelFetch(async init => {
      calls += 1; modelSignal = init.signal; entered();
      return new Promise((_resolve, reject) => {
        modelSignal!.addEventListener('abort', () => reject(new Error('stopped')), { once: true });
      });
    });
    const started = await startSessionServer({ liveAi: demo().liveAi });
    try {
      const { id } = await (await open(started.url)).json();
      const stream = records(started.url, id);
      await requested;
      expect((await open(started.url)).status).toBe(409);
      await fetch(`${started.url}/api/runs/${id}`, { method: 'DELETE' });
      const result = await stream;
      expect(modelSignal?.aborted).toBe(true);
      expect(calls).toBe(1);
      expect(result.find(record => record['type'] === 'run_ended')?.['data']?.['outcome']).toBe('provider_stopped');
      expect((await open(started.url)).status).toBe(201);
    } finally { started.server.closeAllConnections(); await started.close(); }
  });

  it('cancels inference when the last watcher disconnects', async () => {
    let signal: AbortSignal | null | undefined;
    let cancelled!: () => void;
    const aborted = new Promise<void>(resolve => { cancelled = resolve; });
    modelFetch(async init => {
      signal = init.signal;
      return new Promise((_resolve, reject) => signal!.addEventListener('abort', () => {
        cancelled(); reject(new Error('disconnected'));
      }, { once: true }));
    });
    const started = await startSessionServer({ liveAi: demo().liveAi });
    try {
      const { id } = await (await open(started.url)).json();
      const response = await fetch(`${started.url}/api/runs/${id}/stream`);
      await response.body!.cancel();
      await aborted;
      expect(signal?.aborted).toBe(true);
    } finally { started.server.closeAllConnections(); await started.close(); }
  });

  it('bounds a hung request with the wall-clock deadline', async () => {
    modelFetch(async init => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(new Error('deadline')), { once: true });
    }));
    const started = await startSessionServer({ liveAi: demo({ budgets: { maxWallClockMs: 30, providerRetryDelayMs: 0 } }).liveAi });
    try {
      const { id } = await (await open(started.url)).json();
      const result = await records(started.url, id);
      expect(result.find(record => record['type'] === 'run_ended')?.['data']?.['outcome']).toBe('budget_exhausted');
    } finally { await started.close(); }
  });

  it('refuses oversized prompts and stops before another call at the token ceiling', async () => {
    const remote = vi.fn(async () => Response.json({ choices: [{ message: { content: 'COMMAND: take keycard' } }],
      usage: { prompt_tokens: 5900, completion_tokens: 100 } }));
    modelFetch(remote);
    for (const options of [{ maxPromptBytes: 1 }, { budgets: { maxTotalTokens: 6000, providerRetryDelayMs: 0 } }]) {
      const before = remote.mock.calls.length;
      const started = await startSessionServer({ liveAi: demo(options).liveAi });
      try {
        const { id } = await (await open(started.url)).json();
        await records(started.url, id);
        expect(remote.mock.calls.length - before).toBe('maxPromptBytes' in options ? 0 : 1);
      } finally { await started.close(); }
    }
  });

  it('keeps provider failures visible, redacts credentials and refuses cross-origin paid starts', async () => {
    modelFetch(async () => { throw new Error(secret); });
    const started = await startSessionServer({ liveAi: demo().liveAi });
    try {
      expect((await open(started.url, 'llm', { origin: 'https://unrelated.example' })).status).toBe(403);
      const { id } = await (await open(started.url)).json();
      expect((await fetch(`${started.url}/api/runs/${id}/stream`, {
        headers: { 'sec-fetch-site': 'cross-site' },
      })).status).toBe(403);
      const result = await records(started.url, id);
      expect(result.find(record => record['type'] === 'run_ended')?.['data']?.['outcome']).toBe('provider_error');
      expect(JSON.stringify(result)).not.toContain(secret);
    } finally { await started.close(); }
  });
});
