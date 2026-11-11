import { describe, expect, it, vi } from 'vitest';
import { watchAgent } from '../../src/web/watch.js';
import type { RunRecord } from '../../src/web/watch.js';

function streamOf(text: string): Response {
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  }), { headers: { 'content-type': 'text/event-stream' } });
}

function fixture(response: Response) {
  const records: RunRecord[] = [];
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json({ id: 'run/one' }, { status: 201 }))
    .mockResolvedValueOnce(response);
  return {
    records, fetch,
    options: {
      baseUrl: 'http://demo.test/', adventureId: 'mission-impossible',
      policy: 'scripted' as const, fetch,
      onRecord: (record: RunRecord) => { records.push(record); },
    },
  };
}

describe('watching an agent', () => {
  it('opens a bounded demo and reads split UTF-8 and SSE frames in order', async () => {
    const f = fixture(streamOf(
      ': heartbeat\r\n\r\n' +
      'data: {"type":"message","text":"Hello 演劇 🎭"}\r\n\r\n' +
      'data: {"type":"run_ended","data":{"outcome":"success","turns":10,"hash":"sha256:done"}}\n\n' +
      'data: {"type":"end"}\n\n',
    ));

    await watchAgent(f.options);

    expect(f.records.map(record => record.type)).toEqual(['message', 'run_ended', 'end']);
    expect(f.records[0]).toEqual({ type: 'message', text: 'Hello 演劇 🎭' });
    expect(f.fetch.mock.calls[0]![0]).toBe('http://demo.test/api/runs');
    expect(JSON.parse(f.fetch.mock.calls[0]![1].body)).toEqual({
      adventureId: 'mission-impossible', policy: 'scripted', seed: 1,
    });
    expect(f.fetch.mock.calls[1]![0]).toBe('http://demo.test/api/runs/run%2Fone/stream');
  });

  it('keeps a server refusal visible and never opens its stream', async () => {
    const f = fixture(streamOf(''));
    f.fetch.mockReset().mockResolvedValue(Response.json({ error: 'no scripted path' }, { status: 422 }));

    await expect(watchAgent(f.options)).rejects.toThrow('no scripted path');
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects a failed stream request', async () => {
    const f = fixture(Response.json({ error: 'unknown run' }, { status: 404 }));
    await expect(watchAgent(f.options)).rejects.toThrow('unknown run');
  });

  it('reports a stream that closes before its end marker', async () => {
    const f = fixture(streamOf('data: {"type":"message","text":"still running"}\n\n'));
    await expect(watchAgent(f.options)).rejects.toThrow('before completion');
  });

  it('rejects malformed events', async () => {
    const f = fixture(streamOf('data: broken JSON\n\n'));
    await expect(watchAgent(f.options)).rejects.toThrow();
  });

  it('cancels the reader after the end marker', async () => {
    const cancelled = vi.fn();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"type":"end"}\n\n'));
      },
      cancel: cancelled,
    });
    const f = fixture(new Response(stream));

    await watchAgent(f.options);

    expect(cancelled).toHaveBeenCalledOnce();
  });

  it('passes cancellation to both requests and supports the random policy', async () => {
    const f = fixture(streamOf('data: {"type":"end"}\n\n'));
    const controller = new AbortController();

    await watchAgent({ ...f.options, policy: 'random', seed: 7, signal: controller.signal });

    expect(f.fetch.mock.calls[0]![1].signal).toBe(controller.signal);
    expect(f.fetch.mock.calls[1]![1].signal).toBe(controller.signal);
    expect(JSON.parse(f.fetch.mock.calls[0]![1].body).seed).toBe(7);
  });
});
