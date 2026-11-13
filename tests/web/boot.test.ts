/*
 * The page's own wiring.
 *
 * The browser client is the seam between a reader and a world. These checks
 * are about the page as a whole: which world it opens, what the reader can
 * choose, what happens to the game when they choose another one, and what
 * the page says when the world they asked for does not exist.
 *
 * The DOM is a stand-in that implements the part of it the client uses, so
 * the code under test is the code the page runs.
 */

import { describe, expect, it } from 'vitest';
import { boot } from '../../src/web/index.js';
import { adventure as mission } from '../../src/adventures/mission-impossible/adventure.js';
import { adventure as hotfix } from '../../src/adventures/hotfix-2-4-1/adventure.js';
import { classed, StubDocument, StubElement, stub } from './dom.js';

/** A page with the parts the client looks for. */
function page(options: { withWatch?: boolean } = {}): {
  doc: StubDocument;
  terminal: StubElement;
  select: StubElement;
  note: StubElement;
  play: StubElement;
  watch: StubElement;
} {
  const doc = new StubDocument();
  const terminal = stub('terminal', 'section');
  const select = classed('scenario-select', 'select');
  const note = classed('scenario-note', 'span');
  const play = stub('play-mode', 'button');
  const watch = stub('watch-mode', 'button');
  // The markup opens in Play mode, and the buttons say so.
  play.setAttribute('aria-pressed', 'true');
  watch.setAttribute('aria-pressed', 'false');
  doc.body.appendChild(terminal);
  doc.body.appendChild(select);
  doc.body.appendChild(note);
  doc.body.appendChild(play);
  doc.body.appendChild(watch);
  if (options.withWatch !== false) {
    const panel = stub('watch', 'section');
    for (const className of ['watch-start', 'watch-stop', 'watch-note', 'watch-output', 'watch-log', 'watch-status', 'watch-usage']) {
      panel.appendChild(classed(className));
    }
    const policy = classed('watch-policy', 'select');
    policy.value = 'scripted';
    for (const value of ['scripted', 'random', 'llm']) {
      const option = new StubElement('option');
      option.setAttribute('value', value);
      option.value = value;
      policy.appendChild(option);
    }
    panel.appendChild(policy);
    doc.body.appendChild(panel);
  }
  return { doc, terminal, select, note, play, watch };
}

/** The terminal's output, as the reader sees it. */
function outputOf(terminal: StubElement): string {
  const output = terminal.children.find(child => child.className === 'output');
  if (output === undefined) throw new Error('the terminal built no output');
  return output.textContent;
}

/** The document, as the page hands it over. */
function asDocument(doc: StubDocument): Document {
  return doc as unknown as Document;
}

const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

describe('the page', () => {
  it('opens the first world and offers both by name', async () => {
    const { doc, terminal, select } = page();

    await boot(terminal as unknown as HTMLElement, { mode: 'memory' }, asDocument(doc));

    expect(select.value).toBe(mission.id);
    expect(select.children.map(option => option.textContent)).toEqual([mission.title, hotfix.title]);
    expect(select.children.map(option => option.value)).toEqual([mission.id, hotfix.id]);
  });

  it('starts a fresh mission in the world the reader chooses', async () => {
    const { doc, terminal, select } = page();
    await boot(terminal as unknown as HTMLElement, { mode: 'memory' }, asDocument(doc));
    expect(outputOf(terminal)).toContain(mission.brief);

    select.value = hotfix.id;
    select.fire('change');
    await settle();

    expect(outputOf(terminal)).toContain(hotfix.brief);
    expect(outputOf(terminal)).not.toContain(mission.brief);
  });

  it('refuses a world that does not exist and stays where it was', async () => {
    const { doc, terminal, select, note } = page();
    await boot(terminal as unknown as HTMLElement, { mode: 'memory' }, asDocument(doc));

    select.value = 'not-a-world';
    select.fire('change');
    await settle();

    expect(note.textContent).toContain('not-a-world');
    expect(select.value).toBe(mission.id);
    expect(outputOf(terminal)).toContain(mission.brief);
  });

  it('offers the choice of world on a page without the watched panel', async () => {
    const { doc, terminal, select } = page({ withWatch: false });

    await boot(terminal as unknown as HTMLElement, { mode: 'memory' }, asDocument(doc));

    select.value = hotfix.id;
    select.fire('change');
    await settle();

    expect(outputOf(terminal)).toContain(hotfix.brief);
  });

  it('leaves the game on show when there is no watched panel to switch to', async () => {
    const { doc, terminal, play, watch } = page({ withWatch: false });
    await boot(terminal as unknown as HTMLElement, { mode: 'memory' }, asDocument(doc));

    watch.fire('click');
    await settle();

    expect(terminal.hidden).toBe(false);
    expect(outputOf(terminal)).toContain(mission.brief);
    expect(watch.getAttribute('aria-pressed')).toBe('false');
    expect(play.getAttribute('aria-pressed')).toBe('true');
  });

  it('refuses a world that does not exist before it opens anything', async () => {
    const { doc, terminal } = page();

    await expect(boot(terminal as unknown as HTMLElement, { mode: 'memory', adventureId: 'not-a-world' }, asDocument(doc)))
      .rejects.toThrow('not-a-world');
  });
});
