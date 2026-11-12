/*
 * Choosing a world in the browser.
 *
 * The browser ships two adventures and the person using it decides which
 * one to play. These checks are about the decision itself: which worlds are
 * on offer, what happens to a world that does not exist, and what a switch
 * does to the run being watched. A switch has one job that matters more
 * than the rest — it must not leave the old world talking into the new one.
 */

import { describe, expect, it } from 'vitest';
import {
  createScenarioSwitcher,
  defaultScenarioId,
  isScenario,
  scenarioChoices,
} from '../../src/web/scenario.js';
import { InMemorySession } from '../../src/session/in-memory.js';
import { adventure as missionImpossible } from '../../src/adventures/mission-impossible/adventure.js';
import { adventure as hotfix } from '../../src/adventures/hotfix-2-4-1/adventure.js';
import type { Session } from '../../src/session/types.js';

/** What the page did while a switch was under way. */
interface SwitchLog {
  opened: string[];
  shown: Session[];
  watched: string[];
  errors: string[];
}

/** A page that records what the switcher asked of it. */
function recordingPage(open: (id: string) => Promise<Session> = async (id) =>
  new InMemorySession(`web-${id}`, id === hotfix.id ? hotfix : missionImpossible)) {
  const log: SwitchLog = { opened: [], shown: [], watched: [], errors: [] };
  const switcher = createScenarioSwitcher(defaultScenarioId(), {
    openSession: async (id) => { log.opened.push(id); return open(id); },
    showSession: async (session) => { log.shown.push(session); },
    watchScenario: (id) => { log.watched.push(id); },
    reportError: (message) => { log.errors.push(message); },
  });
  return { log, switcher };
}

describe('the worlds on offer', () => {
  it('names every shipped world with its own title', () => {
    expect(scenarioChoices()).toEqual([
      { id: missionImpossible.id, title: missionImpossible.title },
      { id: hotfix.id, title: hotfix.title },
    ]);
  });

  it('opens the first shipped world when nobody chooses', () => {
    expect(defaultScenarioId()).toBe(missionImpossible.id);
  });

  it('recognises the worlds it ships and nothing else', () => {
    expect(isScenario(missionImpossible.id)).toBe(true);
    expect(isScenario(hotfix.id)).toBe(true);
    expect(isScenario('hotfix')).toBe(false);
    expect(isScenario('')).toBe(false);
    expect(isScenario('toString')).toBe(false);
  });
});

describe('switching worlds', () => {
  it('opens, shows and watches the chosen world', async () => {
    const { log, switcher } = recordingPage();

    await switcher.select(hotfix.id);

    expect(log.opened).toEqual([hotfix.id]);
    expect(log.shown.map(session => session.adventure.id)).toEqual([hotfix.id]);
    expect(log.watched).toEqual([hotfix.id]);
    expect(log.errors).toEqual([]);
    expect(switcher.scenarioId).toBe(hotfix.id);
  });

  it('refuses a world that does not exist without touching anything', async () => {
    const { log, switcher } = recordingPage();

    await switcher.select('hotfix');

    expect(log.errors).toHaveLength(1);
    expect(log.errors[0]).toContain('hotfix');
    expect(log.opened).toEqual([]);
    expect(log.shown).toEqual([]);
    expect(log.watched).toEqual([]);
    expect(switcher.scenarioId).toBe(defaultScenarioId());
  });

  it('keeps the current world when the new one cannot be opened', async () => {
    const { log, switcher } = recordingPage(async () => {
      throw new Error('the server refused the session: 404');
    });

    await switcher.select(hotfix.id);

    expect(log.errors).toHaveLength(1);
    expect(log.errors[0]).toContain('404');
    expect(log.shown).toEqual([]);
    expect(log.watched).toEqual([]);
    expect(switcher.scenarioId).toBe(defaultScenarioId());
  });

  it('stops the watched run before it shows the new world', async () => {
    const order: string[] = [];
    const switcher = createScenarioSwitcher(defaultScenarioId(), {
      openSession: async (id) => {
        order.push(`open:${id}`);
        return new InMemorySession(`web-${id}`, hotfix);
      },
      showSession: async () => { order.push('show'); },
      watchScenario: (id) => { order.push(`watch:${id}`); },
      reportError: () => { order.push('error'); },
    });

    await switcher.select(hotfix.id);

    expect(order).toEqual([`open:${hotfix.id}`, `watch:${hotfix.id}`, 'show']);
  });

  it('shows only the world of the most recent request', async () => {
    let release!: () => void;
    const slow = new Promise<void>((resolve) => { release = resolve; });
    const order: string[] = [];
    const switcher = createScenarioSwitcher(defaultScenarioId(), {
      openSession: async (id) => {
        if (id === hotfix.id) await slow;
        return new InMemorySession(`web-${id}`, id === hotfix.id ? hotfix : missionImpossible);
      },
      showSession: async (session) => { order.push(session.adventure.id); },
      watchScenario: (id) => { order.push(`watch:${id}`); },
      reportError: () => { order.push('error'); },
    });

    const first = switcher.select(hotfix.id);
    await switcher.select(missionImpossible.id);
    release();
    await first;

    expect(order).toEqual([`watch:${missionImpossible.id}`, missionImpossible.id]);
    expect(switcher.scenarioId).toBe(missionImpossible.id);
  });
});
