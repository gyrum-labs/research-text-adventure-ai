import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LIVE_AI_BUDGETS, createLiveAiDemo, guardedProvider, liveAiFromEnvironment } from '../../src/server/live-ai.js';
import { startSessionServer } from '../../src/server/server.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';
import { GOLD_PATH } from '../../src/adventures/mission-impossible/gold-path.js';
import { replayTranscript } from '../../src/runner/replay.js';
import { readTranscript } from '../../src/runner/transcript.js';
import { MOST_OUTPUT_TOKENS_IN_ONE_REQUEST, PAGE_GAME_LIMITS, mostOutputTokensInOneRequest } from '../../src/runner/limits.js';

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
    const requests: { max_tokens: number; messages: { content: string }[] }[] = [];
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
      // The allowance is the page game's, stated once. The server holds it,
      // and the ceiling of the retries on a cut-off reply.
      expect(requests.every(request => request['max_tokens'] <= PAGE_GAME_LIMITS.maxOutputTokensPerTurn)).toBe(true);
      // regression: warp#22688 — prose dropped public descriptions and readable flags.
      const firstContext = requests[0]!.messages.map(message => message.content).join('\n');
      expect(firstContext).toContain(adventure.objects['bulletin']!.description);
      expect(firstContext).toMatch(/"readable"\s*:\s*true/);
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

  it('holds its ceiling on a retry exactly as on a first request', async () => {
    // A reply cut off by its allowance is asked for again with the room
    // doubled. That request goes through the same guard as the first. The
    // guard is the policy's provider, so no request can skip it: not the
    // ceiling of a single request, and not what the run has left.
    const requests: { max_tokens: number }[] = [];
    let call = 0;
    modelFetch(async init => {
      requests.push(JSON.parse(String(init.body)));
      call += 1;
      const firstAttempt = call % 2 === 1;
      return firstAttempt
        ? Response.json({ choices: [{ message: { content: '' }, finish_reason: 'length' }],
            usage: { prompt_tokens: 80, completion_tokens: 3000, completion_tokens_details: { reasoning_tokens: 3000 } } })
        : Response.json({ choices: [{ message: { content: `COMMAND: ${GOLD_PATH[(call - 2) / 2] ?? 'look'}` }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 80, completion_tokens: 20 } });
    });
    const f = demo();
    const started = await startSessionServer({ liveAi: f.liveAi });
    try {
      const { id } = await (await open(started.url)).json();
      const stream = await records(started.url, id);
      expect(stream.filter(record => record['type'] === 'command').length).toBe(GOLD_PATH.length);
      expect(requests.length).toBe(2 * GOLD_PATH.length);
      const asked = requests.map(request => request['max_tokens']);
      // The first turn shows the whole shape: the page game's allowance, then
      // twice it. The later turns show the same guard watching the run's tokens
      // go. A request is never allowed more than its due, nor more than the run
      // has left, and by the last turns that is less than its due.
      expect(asked.slice(0, 2)).toEqual([PAGE_GAME_LIMITS.maxOutputTokensPerTurn, 2 * PAGE_GAME_LIMITS.maxOutputTokensPerTurn]);
      expect(asked.filter((_value, index) => index % 2 === 0).every(value => value <= PAGE_GAME_LIMITS.maxOutputTokensPerTurn)).toBe(true);
      expect(asked.filter((_value, index) => index % 2 === 1).every(value => value <= 2 * PAGE_GAME_LIMITS.maxOutputTokensPerTurn)).toBe(true);
      expect(asked.every(value => value <= MOST_OUTPUT_TOKENS_IN_ONE_REQUEST)).toBe(true);
    } finally { await started.close(); }
  });

  it('gives a first request the run\'s allowance and a retry twice the room, however much is asked', async () => {
    // The guard is tried as itself here, and not through the policy. The
    // policy always asks for the right amount, so a guard that let more
    // through would never be seen through it. A run given a smaller allowance
    // has a smaller ceiling. The server does not take the policy's word for
    // which retry a request is: a request that does not say is a first
    // request, and gets the allowance. A retry says which it is, and gets the
    // allowance doubled once for every retry before it.
    const requests: Record<string, unknown>[] = [];
    modelFetch(async init => {
      requests.push(JSON.parse(String(init.body)));
      return Response.json({ choices: [{ message: { content: 'COMMAND: look' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5 } });
    });
    const budgets = { ...LIVE_AI_BUDGETS, maxOutputTokensPerTurn: 500 };
    const guarded = guardedProvider({ apiKey: secret, model: 'deepseek/deepseek-chat' },
      new AbortController().signal, { maxPromptBytes: 16_000, budgets });
    const ask = async (said: { maxOutputTokens?: number; cutOffRetry?: number } = {}): Promise<number> => {
      await guarded.provider.complete({ system: 'system', messages: [{ role: 'user', content: 'go' }], ...said });
      return requests.at(-1)!['max_tokens'] as number;
    };

    // A first request: the allowance, and no more, though it asks for far more.
    expect(await ask({ maxOutputTokens: 50_000 })).toBe(500);
    expect(await ask({ maxOutputTokens: 600 })).toBe(500);
    expect(await ask({ maxOutputTokens: 300 })).toBe(300);
    expect(await ask()).toBe(500);
    // The first retry gets twice the allowance, and the second twice that.
    expect(await ask({ maxOutputTokens: 50_000, cutOffRetry: 1 })).toBe(1_000);
    expect(await ask({ maxOutputTokens: 600, cutOffRetry: 1 })).toBe(600);
    expect(await ask({ maxOutputTokens: 50_000, cutOffRetry: 2 })).toBe(2_000);
    // Past the bound is no more than the last retry. Nonsense is a first request.
    expect(await ask({ maxOutputTokens: 50_000, cutOffRetry: 9 })).toBe(2_000);
    expect(await ask({ maxOutputTokens: 50_000, cutOffRetry: -1 })).toBe(500);
    expect(await ask({ maxOutputTokens: 50_000, cutOffRetry: 1.5 })).toBe(500);
    // What a request said about itself is for the guard, and never leaves it.
    expect(requests.some(request => 'cutOffRetry' in request)).toBe(false);
  });

  it('keeps a lowered allowance through the whole path, on a first request and on a retry', async () => {
    // The same lowered allowance, watched through the page. The policy asks
    // for it, and for twice it on a retry, and says which request is the
    // retry. The guard passes exactly that. So this holds the two together:
    // if the policy stopped saying which request is a retry, the guard would
    // hold that request to the allowance, and the second number below would
    // be 500.
    const requests: { max_tokens: number }[] = [];
    let call = 0;
    modelFetch(async init => {
      requests.push(JSON.parse(String(init.body)));
      call += 1;
      const firstAttempt = call % 2 === 1;
      return firstAttempt
        ? Response.json({ choices: [{ message: { content: '' }, finish_reason: 'length' }],
            usage: { prompt_tokens: 80, completion_tokens: 500, completion_tokens_details: { reasoning_tokens: 500 } } })
        : Response.json({ choices: [{ message: { content: `COMMAND: ${GOLD_PATH[(call - 2) / 2] ?? 'look'}` }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 80, completion_tokens: 20 } });
    });
    const f = demo({ budgets: { providerRetryDelayMs: 0, maxOutputTokensPerTurn: 500 } });
    const started = await startSessionServer({ liveAi: f.liveAi });
    try {
      const { id } = await (await open(started.url)).json();
      const stream = await records(started.url, id);
      expect(stream.filter(record => record['type'] === 'command').length).toBe(GOLD_PATH.length);
      const asked = requests.map(request => request['max_tokens']);
      expect(asked.slice(0, 2)).toEqual([500, 1_000]);
      expect(asked.filter((_value, index) => index % 2 === 0).every(value => value <= 500)).toBe(true);
      expect(asked.every(value => value <= mostOutputTokensInOneRequest(500))).toBe(true);
    } finally { await started.close(); }
  });

  it('gives a retry no more than the run has left', async () => {
    // The same, with a run that cannot afford the doubled room. The retry is
    // cut down to what remains, by the same guard, on the same terms.
    const requests: { max_tokens: number }[] = [];
    let call = 0;
    modelFetch(async init => {
      requests.push(JSON.parse(String(init.body)));
      call += 1;
      const firstAttempt = call % 2 === 1;
      return firstAttempt
        ? Response.json({ choices: [{ message: { content: '' }, finish_reason: 'length' }],
            usage: { prompt_tokens: 80, completion_tokens: 3000, completion_tokens_details: { reasoning_tokens: 3000 } } })
        : Response.json({ choices: [{ message: { content: `COMMAND: ${GOLD_PATH[(call - 2) / 2] ?? 'look'}` }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 80, completion_tokens: 20 } });
    });
    const f = demo({ budgets: { providerRetryDelayMs: 0, maxTotalTokens: 12_500 } });
    const started = await startSessionServer({ liveAi: f.liveAi });
    try {
      const { id } = await (await open(started.url)).json();
      await records(started.url, id);
      expect(requests.length).toBeGreaterThan(1);
      expect(requests[0]?.['max_tokens']).toBe(PAGE_GAME_LIMITS.maxOutputTokensPerTurn);
      const retry = requests[1]?.['max_tokens'] as number;
      expect(retry).toBeGreaterThan(0);
      expect(retry).toBeLessThan(2 * PAGE_GAME_LIMITS.maxOutputTokensPerTurn);
    } finally { await started.close(); }
  });

  it('ends a run cleanly when it cannot afford the retry, and counts the reply it did get', async () => {
    // The reply is cut off, and says it used nearly all the run's tokens. The
    // retry is refused by the server's guard before it reaches the model. The
    // run ends as out of tokens, the one request that was made is in the final
    // figures, and the turn's record says why nothing followed it.
    const requests: { max_tokens: number }[] = [];
    modelFetch(async init => {
      requests.push(JSON.parse(String(init.body)));
      return Response.json({ choices: [{ message: { content: '' }, finish_reason: 'length' }],
        usage: { prompt_tokens: 80, completion_tokens: 11000, completion_tokens_details: { reasoning_tokens: 11000 } } });
    });
    const f = demo({ budgets: { providerRetryDelayMs: 0, maxTotalTokens: 12_000 } });
    const started = await startSessionServer({ liveAi: f.liveAi });
    try {
      const { id } = await (await open(started.url)).json();
      const stream = await records(started.url, id);
      expect(stream.find(record => record.type === 'run_ended')?.data?.['outcome']).toBe('budget_exhausted');
      expect(requests).toHaveLength(1);
      const written = readTranscript(join(f.transcriptRoot, `${id}.jsonl`));
      const reply = written.find(record => record.type === 'reply');
      expect(reply).toMatchObject({ turn: 0, ended: 'The next model request would exceed the token budget.' });
      expect((reply?.['data'] as { attempts: unknown[] }).attempts).toHaveLength(1);
      expect(written.find(record => record.type === 'metrics')?.['data']).toMatchObject({ cutOffReplies: 1, tokensUsed: 11_080 });
    } finally { await started.close(); }
  });

  it('keeps the old 20k guard and gives the new live default headroom for the final actions', async () => {
    // regression: warp#22695 — a full next-request reservation could strand a nearly won run.
    let calls = 0;
    modelFetch(async () => Response.json({ choices: [{ message: { content: `COMMAND: ${GOLD_PATH[calls++]}` } }],
      usage: { prompt_tokens: 1900, completion_tokens: 5 } }));
    for (const ceiling of [20_000, undefined]) {
      calls = 0;
      const configuration = ceiling === undefined ? {} : { budgets: { maxTotalTokens: ceiling, providerRetryDelayMs: 0 } };
      const started = await startSessionServer({ liveAi: demo(configuration).liveAi });
      try {
        const health = await (await fetch(`${started.url}/api/health`)).json();
        expect(health.ai.budgets.maxTotalTokens).toBe(ceiling ?? PAGE_GAME_LIMITS.maxTotalTokens);
        const { id } = await (await open(started.url)).json();
        const stream = await records(started.url, id);
        expect(stream.find(record => record.type === 'run_ended')?.data?.['outcome'])
          .toBe(ceiling === undefined ? 'success' : 'budget_exhausted');
        expect(calls).toBeLessThanOrEqual(10);
      } finally { await started.close(); }
    }
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
