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
  // The free choices are the panel's defaults; agent options come from the
  // server's own description of what it offers.
  for (const value of ['scripted', 'random']) {
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


  it('clears the previous world\'s transcript when the world changes', async () => {
    const root = watchPanel();
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true, ai: null }));
    const view = mountWatchView(panel(root), { baseUrl: 'http://demo.test', adventureId: 'mission-impossible', fetch });

    part(root, 'watch-output').textContent = 'take keycard\n';
    view.setScenario('hotfix-2-4-1');

    expect(part(root, 'watch-output').textContent).toBe('');
    expect(part(root, 'watch-log').textContent).toBe('');
  });

  it('stops a running agent run, drops its late results, and stays usable', async () => {
    const root = watchPanel();
    const requests: Array<{ url: string; method?: string }> = [];
    const stream = lateStream();
    const fetch = vi.fn((url: string, init?: RequestInit) => {
      const target = String(url);
      requests.push({ url: target, method: init?.method });
      if (target.endsWith('/api/health')) return Promise.resolve(asResponse({ ok: true,
        aiModels: [{ provider: 'OpenRouter', model: 'deepseek/deepseek-chat',
          budgets: { maxTurns: 20, maxTotalTokens: 30000, maxWallClockMs: 120000 } }] }));
      if (target.endsWith('/api/runs/saved')) return Promise.resolve(asResponse({ runs: [] }));
      if (target.endsWith('/api/runs') && init?.method === 'POST') {
        return Promise.resolve(Response.json({ id: 'run/one' }, { status: 201 }));
      }
      if (target.includes('/stream')) return Promise.resolve(stream.response);
      if (init?.method === 'DELETE') return Promise.resolve(Response.json({ stopped: true }));
      return Promise.resolve(new Response('', { status: 404 }));
    });
    mountWatchView(panel(root), { baseUrl: 'http://demo.test', adventureId: 'mission-impossible', fetch,
      createElement: (tagName: string) => new StubElement(tagName) as unknown as HTMLElement });

    // The agent choice exists once discovery has built the panel's options.
    await settle();
    part(root, 'watch-policy').value = 'deepseek/deepseek-chat';
    part(root, 'watch-start').fire('click');
    await settle();
    stream.push({ type: 'observation', turn: 1, data: realObservation });
    await settle();
    expect(part(root, 'watch-output').textContent).toContain('Briefing Room');

    // The reader stops the run: the server is told, the panel says so, and
    // whatever the provider pushes afterwards belongs to a run that is over.
    part(root, 'watch-stop').fire('click');
    await settle();
    expect(requests.some(request => request.method === 'DELETE')).toBe(true);
    expect(part(root, 'watch-status').textContent).toContain('Stopped');
    stream.push({ type: 'observation', turn: 2, data: realObservation });
    stream.end();
    await settle();
    expect(part(root, 'watch-output').textContent.split('Briefing Room').length - 1).toBe(1);
    // The panel is usable again: another run can start.
    expect(part(root, 'watch-start').disabled).toBe(false);
  });

  it('shows the caps and what is left of them while a model run is going', async () => {
    const root = watchPanel();
    const stream = lateStream();
    const fetch = vi.fn((url: string, init?: RequestInit) => {
      const target = String(url);
      if (target.endsWith('/api/health')) return Promise.resolve(asResponse({ ok: true,
        aiModels: [{ provider: 'OpenRouter', model: 'deepseek/deepseek-chat',
          budgets: { maxTurns: 20, maxTotalTokens: 30000, maxWallClockMs: 120000 } }] }));
      if (target.endsWith('/api/runs/saved')) return Promise.resolve(asResponse({ runs: [] }));
      if (target.endsWith('/api/runs') && init?.method === 'POST') {
        return Promise.resolve(Response.json({ id: 'run/one' }, { status: 201 }));
      }
      if (target.includes('/stream')) return Promise.resolve(stream.response);
      return Promise.resolve(new Response('', { status: 404 }));
    });
    mountWatchView(panel(root), { baseUrl: 'http://demo.test', adventureId: 'mission-impossible', fetch,
      createElement: (tagName: string) => new StubElement(tagName) as unknown as HTMLElement });

    await settle();
    part(root, 'watch-policy').value = 'deepseek/deepseek-chat';
    part(root, 'watch-start').fire('click');
    await settle();
    stream.push({ type: 'run_started', data: { provider: 'OpenRouter', model: 'deepseek/deepseek-chat',
      budgets: { maxTurns: 20, maxTotalTokens: 30000, maxWallClockMs: 120000 } } });
    await settle();
    expect(part(root, 'watch-limits').textContent).toContain('turn 0 of 20');
    stream.push({ type: 'usage', data: { inputTokens: 840, outputTokens: 30, tokensUsed: 870, estimatedCostUsd: null } });
    await settle();
    expect(part(root, 'watch-limits').textContent).toContain('870 of 30,000 tokens');
    expect(part(root, 'watch-usage').textContent).toContain('cost estimate unavailable');
  });
});

/** A Response stand-in for fixtures the offline fetch serves. */
function asResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

/** A tick of the event loop, so a fired handler and its awaits settle. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * A stream the reader can feed after the fact.
 *
 * The fetch that returns it ignores the abort signal, as it does when the
 * response has already begun arriving. That is the shape of the real race:
 * the reader is still alive after the view has moved on, so whatever is
 * pushed next arrives too late, and must be dropped.
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
