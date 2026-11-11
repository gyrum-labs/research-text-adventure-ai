/*
 * The web client's terminal.
 *
 * The acceptance the card names is a human completing the mission in the
 * browser. A test cannot be a human, so it does the part a human does
 * through the same code the browser runs: it types the ten commands into
 * the terminal and watches the mission end in a success, with the hash
 * chain advancing in the status bar along the way. The DOM is a small
 * stand-in that implements exactly the surface the terminal uses, so the
 * code under test is the code the page runs.
 */

import { describe, expect, it } from 'vitest';
import { createTerminal, type UiDocument, type UiElement, type UiEvent } from '../../src/web/ui.js';
import { InMemorySession } from '../../src/session/in-memory.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';
import { GOLD_PATH } from '../../src/adventures/mission-impossible/gold-path.js';
import type { Session } from '../../src/session/types.js';

/** An element that records what was done to it, and nothing else. */
class StubElement implements UiElement {
  readonly tagName: string;
  textContent = '';
  value = '';
  placeholder = '';
  className = '';
  children: UiElement[] = [];
  scrollTop = 0;
  scrollHeight = 0;
  private readonly listeners = new Map<string, Array<(event: UiEvent) => void>>();

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  appendChild(child: UiElement): UiElement {
    this.children.push(child);
    return child;
  }

  addEventListener(type: string, listener: (event: UiEvent) => void): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  /** Fire a key press, the way a browser would deliver it. */
  press(key: string): void {
    for (const listener of this.listeners.get('keydown') ?? []) {
      listener({ key, preventDefault: () => undefined });
    }
  }

  focus(): void {
    /* the stand-in has nowhere to put the caret */
  }
}

/** A document that makes stand-in elements. */
class StubDocument implements UiDocument {
  createElement(tagName: string): StubElement {
    return new StubElement(tagName);
  }
}

/** The root, with the input the terminal created, as the page would have it. */
function rootWithInput(): { root: StubElement; input: StubElement } {
  const root = new StubElement('div');
  return { root, input: root };
}

/** The input is the third child the terminal appends. */
function inputOf(root: StubElement): StubElement {
  const input = root.children.find((child) => child.tagName === 'input');
  if (!(input instanceof StubElement)) throw new Error('the terminal built no input');
  return input;
}

async function mountTerminal(session: Session): Promise<{ root: StubElement; terminal: Awaited<ReturnType<typeof createTerminal>> }> {
  const { root } = rootWithInput();
  const built = await createTerminal({ document: new StubDocument(), root, session });
  return { root, terminal: built };
}

describe('the terminal', () => {
  it('completes the mission from typed commands', async () => {
    const { root, terminal } = await mountTerminal(new InMemorySession('web', adventure));

    for (const command of GOLD_PATH) {
      await terminal.handleLine(command);
    }

    const output = root.children.find((child) => child.className === 'output')!;
    expect(output.textContent).toContain(adventure.outcomeText.success);
    expect(terminal.history()).toEqual(GOLD_PATH);
    expect(terminal.status().turn).toBe(GOLD_PATH.length);
  });

  it('shows the world and the hash before the first command', async () => {
    const { root, terminal } = await mountTerminal(new InMemorySession('web', adventure));

    const output = root.children.find((child) => child.className === 'output')!;
    const snapshot = await new InMemorySession('reference', adventure).snapshot();
    expect(output.textContent).toContain(adventure.brief);
    expect(terminal.status().hash).toBe(snapshot.hash);
    expect(terminal.status().goals).toBe('0/2');
  });

  it('navigates the history with the arrow keys', async () => {
    const { root, terminal } = await mountTerminal(new InMemorySession('web', adventure));
    const input = inputOf(root);

    input.value = GOLD_PATH[0]!;
    input.press('Enter');
    await new Promise((resolve) => setTimeout(resolve, 0));

    input.value = GOLD_PATH[1]!;
    input.press('Enter');
    await new Promise((resolve) => setTimeout(resolve, 0));

    input.press('ArrowUp');
    expect(input.value).toBe(GOLD_PATH[1]);
    input.press('ArrowUp');
    expect(input.value).toBe(GOLD_PATH[0]);
    input.press('ArrowDown');
    expect(input.value).toBe(GOLD_PATH[1]);
    input.press('ArrowDown');
    expect(input.value).toBe('');
    expect(terminal.history()).toHaveLength(2);
  });

  it('answers a parse failure without advancing the hash', async () => {
    const { terminal } = await mountTerminal(new InMemorySession('web', adventure));
    const before = terminal.status().hash;

    await terminal.handleLine('an impossible command');

    expect(terminal.status().hash).toBe(before);
    expect(terminal.status().turn).toBe(0);
  });

  it('resets to a fresh game on the reset line', async () => {
    const { terminal } = await mountTerminal(new InMemorySession('web', adventure));
    await terminal.handleLine(GOLD_PATH[0]!);

    await terminal.handleLine('reset');

    expect(terminal.status().turn).toBe(0);
    expect(terminal.history()).toContain('reset');
  });

  it('updates the visible status after a command', async () => {
    const session = new InMemorySession('web', adventure);
    const { root, terminal } = await mountTerminal(session);

    await terminal.handleLine(GOLD_PATH[0]!);

    const snapshot = await session.snapshot();
    const status = root.children.find((child) => child.className === 'status')!;
    expect(terminal.status()).toEqual({ turn: 1, goals: '0/2', hash: snapshot.hash });
    expect(status.textContent).toBe(`turn 1 · goals 0/2 · ${snapshot.hash}`);
  });

  it('resets through the same keyboard input used by the browser', async () => {
    const session = new InMemorySession('web', adventure);
    const { root, terminal } = await mountTerminal(session);
    const input = inputOf(root);
    await terminal.handleLine(GOLD_PATH[0]!);

    input.value = 'reset';
    input.press('Enter');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect((await session.snapshot()).turn).toBe(0);
    expect(terminal.status().turn).toBe(0);
    expect(terminal.history()).toEqual([GOLD_PATH[0], 'reset']);
    expect(input.value).toBe('');
  });
});
