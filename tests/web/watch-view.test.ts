/*
 * The watched-run panel.
 *
 * The panel shows what an agent is doing, and it is also where a change of
 * world has to be enforced: a run belongs to the world it started in. These
 * checks are about that boundary — a run that is still in flight when the
 * world changes must be cancelled, and whatever it says afterwards must not
 * appear in the new world.
 */

import { describe, expect, it, vi } from 'vitest';
import { mountWatchView } from '../../src/web/watch-view.js';
import type { UiEvent } from '../../src/web/ui.js';

/** An element that records what was done to it, and nothing else. */
class StubElement {
  readonly tagName: string;
  textContent = '';
  value = '';
  placeholder = '';
  disabled = false;
  hidden = false;
  className = '';
  children: StubElement[] = [];
  scrollTop = 0;
  scrollHeight = 0;
  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Array<(event: UiEvent) => void>>();

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  appendChild(child: StubElement): StubElement {
    this.children.push(child);
    return child;
  }

  addEventListener(type: string, listener: (event: UiEvent) => void): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  focus(): void {
    /* the stand-in has nowhere to put the caret */
  }

  /** Deliver an event the way a browser would. */
  fire(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ preventDefault: () => undefined });
    }
  }

  querySelector<T extends StubElement>(selector: string): T | null {
    for (const child of this.children) {
      if (matches(child, selector)) return child as T;
      const found = child.querySelector<T>(selector);
      if (found !== null) return found;
    }
    return null;
  }
}

function matches(node: StubElement, selector: string): boolean {
  if (selector.startsWith('#')) return node.getAttribute('id') === selector.slice(1);
  if (selector.startsWith('.')) return node.className.split(/\s+/).includes(selector.slice(1));
  const attribute = /^([a-zA-Z]+)\[([a-zA-Z-]+)="([^"]*)"\]$/.exec(selector);
  if (attribute !== null) {
    const [, tag, name, value] = attribute;
    return node.tagName.toLowerCase() === tag!.toLowerCase() && node.getAttribute(name!) === value;
  }
  return node.tagName.toLowerCase() === selector.toLowerCase();
}

/** The panel, with the parts the view reaches for. */
function watchPanel(): StubElement {
  const root = new StubElement('div');
  const add = (tagName: string, className: string): StubElement => {
    const element = new StubElement(tagName);
    element.className = className;
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

/** A stream of one record, delivered when the test says so. */
function lateStream(record: unknown): { response: Response; deliver: () => void } {
  let deliver!: () => void;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(record)}\n\n`));
      deliver = () => { controller.close(); };
    },
  });
  return { response: new Response(body, { headers: { 'content-type': 'text/event-stream' } }), deliver: () => deliver() };
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

  it('cancels a running model watch and keeps its late results out of the new world', async () => {
    const root = watchPanel();
    part(root, 'watch-policy').value = 'llm';
    const late = lateStream({ type: 'command', turn: 0, raw: 'take keycard' });
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

    view.setScenario('hotfix-2-4-1');
    late.deliver();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const deleted = fetch.mock.calls.filter(call => call[1]?.method === 'DELETE');
    expect(deleted).toHaveLength(1);
    expect(String(deleted[0]![0])).toBe('http://demo.test/api/runs/run%2Fone');
    expect(part(root, 'watch-output').textContent).toBe('');
    expect(part(root, 'watch-status').textContent).toContain('hotfix');
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
});
