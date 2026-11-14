import { beforeAll, describe, expect, it, vi } from 'vitest';
import { mountWatchView } from '../../src/web/watch-view.js';
import { classed, StubElement } from './dom.js';

/** The panel, with the parts the view reaches for. */
function watchPanel(): StubElement {
  const root = new StubElement('div');
  const add = (tagName: string, className: string): StubElement => {
    const element = classed(className, tagName);
    root.appendChild(element);
    return element;
  };
  const policy = add('select', 'watch-policy');
  policy.value = 'scripted';
  for (const value of ['scripted', 'random', 'llm']) {
    const option = new StubElement('option');
    option.setAttribute('value', value);
    option.value = value;
    policy.appendChild(option);
  }
  add('button', 'watch-start');
  add('button', 'watch-stop');
  add('span', 'watch-note');
  add('pre', 'watch-output');
  add('pre', 'watch-log');
  add('div', 'watch-status');
  add('div', 'watch-usage');
  add('div', 'watch-limits');
  const savedControls = classed('watch-saved-controls', 'div');
  savedControls.appendChild(classed('saved-runs', 'select'));
  savedControls.appendChild(classed('saved-open', 'button'));
  savedControls.appendChild(classed('saved-replay', 'button'));
  root.appendChild(savedControls);
  add('pre', 'watch-saved');
  return root;
}

function part(root: StubElement, className: string): StubElement {
  const found = root.querySelector(`.${className}`);
  if (found === null) throw new Error(`the panel has no ${className}`);
  return found;
}

/**
 * The panel, as the page hands it over.
 *
 * The stand-in implements the DOM surface the panel uses, so the code under
 * test is the code the page runs. The cast is where that stand-in meets the
 * browser's own types.
 */
function panel(root: StubElement): HTMLElement {
  return root as unknown as HTMLElement;
}

/**
 * A stream the reader can feed after the fact.
 *
 * The fetch that returns it ignores the abort signal, as it does when the
 * response has already begun arriving. That is the shape of the real race: the
 * reader is still alive after the view has moved on, so whatever is pushed
 * next arrives too late, and must be dropped.
 */
function lateStream(): { response: Response; push: (record: unknown) => void; end: () => void } {
  let pushChunk!: (chunk: string) => void;
  let endStream!: () => void;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      pushChunk = chunk => controller.enqueue(new TextEncoder().encode(chunk));
      endStream = () => controller.close();
    },
  });
  return {
    response: new Response(body, { headers: { 'content-type': 'text/event-stream' } }),
    push: record => pushChunk(`data: ${JSON.stringify(record)}\n\n`),
    end: () => endStream(),
  };
}

/** A real observation, so the panel renders what the server actually sends. */
let realObservation: unknown;
beforeAll(async () => {
  const { InMemorySession } = await import('../../src/session/in-memory.js');
  const { buildObservation } = await import('../../src/kernel/observation.js');
  const { adventure } = await import('../../src/adventures/mission-impossible/adventure.js');
  const snapshot = await new InMemorySession('fixture', adventure).snapshot();
  realObservation = buildObservation(adventure, snapshot.state);
});

describe('the watched-run panel', () => {
  it('runs the world the page has selected', async () => {
    const root = watchPanel();
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true, ai: null }));
    const view = mountWatchView(panel(root), { baseUrl: 'http://demo.test', adventureId: 'mission-impossible', fetch });

    view.setScenario('hotfix-2-4-1');
    part(root, 'watch-start').fire('click');
    await new Promise((resolve) => setTimeout(resolve, 0));

    const opened = fetch.mock.calls.find(call => String(call[0]).endsWith('/api/runs'));
    expect(JSON.parse(String(opened![1]!.body))).toMatchObject({ adventureId: 'hotfix-2-4-1' });
  });

  it('cancels a running model watch and keeps its late results out of the new world', async () => {
    const root = watchPanel();
    part(root, 'watch-policy').value = 'llm';
    const late = lateStream();
    const fetch = vi.fn((url: string, init?: RequestInit) => {
      const target = String(url);
      if (target.endsWith('/api/health')) return Promise.resolve(Response.json({ ok: true, ai: null }));
      if (target.endsWith('/api/runs') && init?.method === 'POST') {
        return Promise.resolve(Response.json({ id: 'run/one' }, { status: 201 }));
      }
      if (target.includes('/stream')) return Promise.resolve(late.response);
      if (init?.method === 'DELETE') return Promise.resolve(Response.json({ stopped: true }));
      return Promise.resolve(new Response('', { status: 404 }));
    });
    const view = mountWatchView(panel(root), { baseUrl: 'http://demo.test', adventureId: 'mission-impossible', fetch });

    part(root, 'watch-start').fire('click');
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The reader is still holding the stream when the world changes, so the
    // record pushed next arrives after the view has moved on.
    view.setScenario('hotfix-2-4-1');
    late.push({ type: 'command', turn: 0, raw: 'take keycard' });
    late.end();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const deleted = fetch.mock.calls.filter(call => call[1]?.method === 'DELETE');
    expect(deleted).toHaveLength(1);
    expect(String(deleted[0]![0])).toBe('http://demo.test/api/runs/run%2Fone');
    expect(part(root, 'watch-output').textContent).toBe('');
    expect(part(root, 'watch-output').textContent).not.toContain('take keycard');
    expect(part(root, 'watch-status').textContent).toContain('hotfix');

    // The panel is usable again in the new world: another run can be started.
    expect(part(root, 'watch-start').disabled).toBe(false);
    expect(part(root, 'watch-policy').disabled).toBe(false);
    expect(part(root, 'watch-stop').disabled).toBe(true);
  });

  it('clears the previous world\'s transcript when the world changes', async () => {
    const root = watchPanel();
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true, ai: null }));
    const view = mountWatchView(panel(root), { baseUrl: 'http://demo.test', adventureId: 'mission-impossible', fetch });

    part(root, 'watch-output').textContent = 'take keycard\n';
    view.setScenario('hotfix-2-4-1');

    expect(part(root, 'watch-output').textContent).toBe('');
    expect(part(root, 'watch-log').textContent).toBe('');
  });

  it('stops the run and says so when the reader presses Stop', async () => {
    const root = watchPanel();
    part(root, 'watch-policy').value = 'llm';
    const fetch = vi.fn((url: string, init?: RequestInit) => {
      const target = String(url);
      if (target.endsWith('/api/health')) return Promise.resolve(Response.json({ ok: true, ai: null }));
      if (target.endsWith('/api/runs') && init?.method === 'POST') {
        return Promise.resolve(Response.json({ id: 'run/one' }, { status: 201 }));
      }
      if (target.includes('/stream')) return new Promise<Response>(() => undefined);
      if (init?.method === 'DELETE') return Promise.resolve(Response.json({ stopped: true }));
      return Promise.resolve(new Response('', { status: 404 }));
    });
    mountWatchView(panel(root), { baseUrl: 'http://demo.test', adventureId: 'mission-impossible', fetch });

    part(root, 'watch-start').fire('click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    part(root, 'watch-stop').fire('click');

    expect(part(root, 'watch-status').textContent).toContain('Stopped');
    expect(fetch.mock.calls.filter(call => call[1]?.method === 'DELETE')).toHaveLength(1);
  });

  it('shows the caps and what is left of them while a model run is going', async () => {
    const root = watchPanel();
    part(root, 'watch-policy').value = 'llm';
    const records = [
      { type: 'run_started', data: { provider: 'OpenRouter', model: 'fixture/model', budgets: { maxTurns: 20, maxTotalTokens: 30_000, maxWallClockMs: 120_000 } } },
      { type: 'usage', data: { inputTokens: 400, outputTokens: 30, tokensUsed: 430, estimatedCostUsd: null } },
      { type: 'observation', turn: 2, data: realObservation },
    ];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const record of records) {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(record)}\n\n`));
        }
      },
    });
    const fetch = vi.fn((url: string) => {
      const target = String(url);
      if (target.endsWith('/api/health')) return Promise.resolve(Response.json({ ok: true, ai: null }));
      if (target.endsWith('/api/runs') && String(fetch.mock.calls[0]).length > 0) {
        return Promise.resolve(Response.json({ id: 'run/one' }, { status: 201 }));
      }
      if (target.includes('/stream')) return Promise.resolve(new Response(stream, { headers: { 'content-type': 'text/event-stream' } }));
      return Promise.resolve(new Response('', { status: 404 }));
    });
    mountWatchView(panel(root), { baseUrl: 'http://demo.test', adventureId: 'mission-impossible', fetch });

    part(root, 'watch-start').fire('click');
    await new Promise((resolve) => setTimeout(resolve, 20));

    const limits = part(root, 'watch-limits').textContent;
    expect(limits).toContain('turn 2 of 20');
    expect(limits).toContain('430 of 30,000 tokens');
    // The display is built from what was streamed: nothing reached the provider,
    // and the only provider-shaped traffic is the one run the reader started.
    expect(fetch.mock.calls.filter(call => String(call[0]).includes('openrouter.ai'))).toHaveLength(0);
  });

  it('names the bound that stopped the run', async () => {
    const root = watchPanel();
    part(root, 'watch-policy').value = 'llm';
    const record = { type: 'run_ended', data: { outcome: 'loop_detected', reason: 'The agent returned to the same state 3 times in a row and stopped making progress.' } };
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(
          `data: {"type":"run_started","data":{"provider":"OpenRouter","model":"fixture/model","budgets":{"maxTurns":20,"maxTotalTokens":30000,"maxWallClockMs":120000}}}\n\n` +
          `data: ${JSON.stringify(record)}\n\n` +
          `data: {"type":"end"}\n\n`));
        controller.close();
      },
    });
    const fetch = vi.fn((url: string) => {
      const target = String(url);
      if (target.endsWith('/api/health')) return Promise.resolve(Response.json({ ok: true, ai: null }));
      if (target.endsWith('/api/runs')) return Promise.resolve(Response.json({ id: 'run/two' }, { status: 201 }));
      if (target.includes('/stream')) return Promise.resolve(new Response(stream, { headers: { 'content-type': 'text/event-stream' } }));
      return Promise.resolve(new Response('', { status: 404 }));
    });
    mountWatchView(panel(root), { baseUrl: 'http://demo.test', adventureId: 'mission-impossible', fetch });

    part(root, 'watch-start').fire('click');
    await new Promise((resolve) => setTimeout(resolve, 20));

    const limits = part(root, 'watch-limits').textContent;
    expect(limits).toContain('repeated state');
    expect(part(root, 'watch-status').textContent).toContain('loop_detected');
  });
});
