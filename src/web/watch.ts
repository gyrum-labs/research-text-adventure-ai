import type { Observation } from '../kernel/types.js';
import type { FetchLike } from '../session/http.js';

/** The public records emitted by the optional demo server. */
export type RunRecord =
  | { type: 'run_started'; data: { provider: string; model: string; budgets: { maxTurns: number; maxTotalTokens: number; maxWallClockMs: number } } }
  | { type: 'usage'; data: { inputTokens: number; outputTokens: number; tokensUsed: number; estimatedCostUsd: number | null; estimated?: boolean } }
  | { type: 'observation'; turn: number; data: Observation }
  | { type: 'command'; turn: number; raw: string }
  | { type: 'message'; text: string }
  | { type: 'run_ended'; data: { outcome: string; reason?: string; turns?: number; hash?: string } }
  | { type: 'end' };

/** One bounded, local demo run and the view that receives its records. */
export interface WatchOptions {
  baseUrl: string;
  adventureId: string;
  policy: 'scripted' | 'random' | 'llm';
  seed?: number;
  signal?: AbortSignal;
  fetch?: FetchLike;
  onRecord(record: RunRecord): void;
}

/** Open a demo run and consume its SSE stream without automatic replay retries. */
export async function watchAgent(options: WatchOptions): Promise<void> {
  const base = options.baseUrl.replace(/\/+$/, '');
  const fetchLike = options.fetch ?? globalThis.fetch;
  const opened = await checkedResponse(await fetchLike(`${base}/api/runs`, {
    method: 'POST', signal: options.signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ adventureId: options.adventureId, policy: options.policy, seed: options.seed ?? 1 }),
  }));
  const body = await opened.json() as { id?: unknown };
  if (typeof body.id !== 'string' || body.id.length === 0) throw new Error('The demo server returned no run id.');
  const runUrl = `${base}/api/runs/${encodeURIComponent(body.id)}`;
  let cancellation: Promise<void> | undefined;
  const stop = (): void => {
    if (options.policy !== 'llm' || cancellation !== undefined) return;
    cancellation = fetchLike(runUrl, { method: 'DELETE', signal: AbortSignal.timeout(2_000) })
      .then(async response => { await response.body?.cancel(); }).catch(() => {});
  };
  options.signal?.addEventListener('abort', stop, { once: true });
  try {
    if (options.signal?.aborted) { stop(); options.signal.throwIfAborted(); }
    const stream = await checkedResponse(await fetchLike(`${runUrl}/stream`, { signal: options.signal }));
    if (stream.body === null) throw new Error('The demo server returned no event stream.');
    await readRun(stream.body.getReader(), options.onRecord);
  } finally {
    options.signal?.removeEventListener('abort', stop);
    await cancellation;
  }
}

async function checkedResponse(response: Response): Promise<Response> {
  if (response.ok) return response;
  const fallback = `The demo server refused the request (${response.status}).`;
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error(fallback);
  const body = await response.json() as { error?: string };
  throw new Error(body.error ?? fallback);
}

function recordFrom(block: string): RunRecord | undefined {
  const data = block.split('\n').filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).replace(/^ /, '')).join('\n');
  if (data.length === 0) return undefined;
  const record: unknown = JSON.parse(data);
  if (record === null || typeof record !== 'object' || !('type' in record) ||
      !['run_started', 'usage', 'observation', 'command', 'message', 'run_ended', 'end'].includes(String(record.type))) {
    throw new Error('The demo server sent an invalid event.');
  }
  return record as RunRecord;
}

async function readRun(reader: ReadableStreamDefaultReader<Uint8Array>, receive: WatchOptions['onRecord']): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error('The agent stream ended before completion.');
      buffer = (buffer + decoder.decode(chunk.value, { stream: true })).replace(/\r\n/g, '\n');
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const record = recordFrom(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        if (record === undefined) continue;
        receive(record);
        if (record.type === 'end') return;
      }
    }
  } finally {
    await reader.cancel();
  }
}
