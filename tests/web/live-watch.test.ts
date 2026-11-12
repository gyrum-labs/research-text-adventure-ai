import { describe, expect, it, vi } from 'vitest';
import { watchAgent } from '../../src/web/watch.js';
import type { RunRecord } from '../../src/web/watch.js';

describe('watching a model', () => {
  it('selects the model policy and reads its identity and usage records', async () => {
    const records: RunRecord[] = [];
    const data = [
      { type: 'run_started', data: { provider: 'OpenRouter', model: 'fixture/model', budgets: { maxTurns: 20, maxTotalTokens: 20000, maxWallClockMs: 120000 } } },
      { type: 'usage', data: { inputTokens: 80, outputTokens: 5, tokensUsed: 85, estimatedCostUsd: null } },
      { type: 'command', turn: 0, raw: 'take keycard' }, { type: 'end' },
    ];
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ id: 'model/one' }))
      .mockResolvedValueOnce(new Response(data.map(record => `data: ${JSON.stringify(record)}\n\n`).join('')));
    await watchAgent({ baseUrl: 'http://demo.test', adventureId: 'mission-impossible', policy: 'llm', fetch,
      onRecord: record => records.push(record),
    });
    expect(JSON.parse(fetch.mock.calls[0]![1].body).policy).toBe('llm');
    expect(records.map(record => record.type)).toEqual(['run_started', 'usage', 'command', 'end']);
  });

  it('cancels the server run independently of the aborted stream request', async () => {
    const controller = new AbortController();
    let entered!: () => void;
    const requested = new Promise<void>(resolve => { entered = resolve; });
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ id: 'model/one' }))
      .mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
        entered(); init.signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true });
      }))
      .mockResolvedValueOnce(Response.json({ stopped: true }));
    const pending = watchAgent({ baseUrl: 'http://demo.test', adventureId: 'mission-impossible', policy: 'llm',
      signal: controller.signal, fetch, onRecord: () => {},
    });
    const settled = expect(pending).rejects.toThrow('Stopped');
    await requested;
    controller.abort();
    await settled;
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[2]![0]).toBe('http://demo.test/api/runs/model%2Fone');
    expect(fetch.mock.calls[2]![1].method).toBe('DELETE');
    expect(fetch.mock.calls[2]![1].signal?.aborted).not.toBe(true);
  });

  it('never opens a stream if its pending start was cancelled', async () => {
    const controller = new AbortController();
    const fetch = vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true });
    }));
    const pending = watchAgent({ baseUrl: 'http://demo.test', adventureId: 'mission-impossible', policy: 'llm',
      signal: controller.signal, fetch, onRecord: () => {},
    });
    const settled = expect(pending).rejects.toThrow('Stopped');
    controller.abort();
    await settled;
    expect(fetch).toHaveBeenCalledOnce();
  });
});
