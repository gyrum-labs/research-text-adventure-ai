import { describe, expect, it, vi } from 'vitest';
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



});
