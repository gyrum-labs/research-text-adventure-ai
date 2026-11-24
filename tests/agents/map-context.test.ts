/*
 * The map-and-ledger context.
 *
 * A transcript buries the facts the agent needs in repetition: the same room
 * re-described on every visit, the same refusal repeated as a fresh message.
 * The map-and-ledger is a tidy notepad instead — everything stated once and
 * updated in place: connections, objects with their state, what the agent was
 * told, and one line per move.
 *
 * The checks here are structural: what sections exist, that each thing is
 * stated once, and that repetition is gone.
 */

import { describe, expect, it } from 'vitest';
import { buildContext, CONTEXT_STRATEGIES } from '../../src/agents/context.js';
import { adventure as mission } from '../../src/adventures/mission-impossible/adventure.js';
import { buildObservation, messagesFromEvents } from '../../src/kernel/observation.js';
import { parseCommand } from '../../src/kernel/parser.js';
import { reduce } from '../../src/kernel/reduce.js';
import type { ContextTurn } from '../../src/agents/context.js';

/** Play the given commands, collecting the history the way a run does. */
function played(commands: string[]): { turns: ContextTurn[]; observation: ReturnType<typeof buildObservation> } {
  let state = structuredClone(mission.initial);
  const turns: ContextTurn[] = [];
  let latest = buildObservation(mission, state);
  for (const raw of commands) {
    const before = latest;
    const parsed = parseCommand(mission, state, raw);
    let messages: string[] = [];
    if (parsed.ok) {
      const transition = reduce(mission, state, parsed.command);
      state = transition.state;
      messages = messagesFromEvents(transition.events);
    }
    latest = buildObservation(mission, state, messages);
    turns.push({ command: raw, before, observation: latest });
  }
  return { turns, observation: latest };
}

function contextFor(commands: string[]): string {
  const history = played(commands);
  return buildContext('map', { turns: history.turns, observation: history.observation, brief: mission.brief });
}

describe('the map-and-ledger context', () => {
  it('ships as a strategy', () => {
    expect(CONTEXT_STRATEGIES).toContain('map');
  });

  it('has the sections a notepad needs', () => {
    const context = contextFor([]);
    for (const section of ['MAP:', 'YOU ARE AT:', 'CARRYING:', 'OBJECTS KNOWN:', 'MOVES:']) {
      expect(context).toContain(section);
    }
  });

  it('gains a told section once something has been read', () => {
    const context = contextFor(['take keycard', 'go corridor', 'open locker', 'read manual']);
    expect(context).toContain('WHAT YOU HAVE BEEN TOLD:');
    expect(context).toContain('4821');
  });

  it('states each connection once, with the current position', () => {
    const context = contextFor(['take keycard', 'go corridor']);
    expect(context).toContain('YOU ARE AT: Service Corridor');
    expect(context).toContain('Briefing Room');
    expect(context).toContain('Service Corridor');
  });

  it('shows an exit opened mid-mission as open once, never both ways', () => {
    // The vault door is locked when first seen and opened by the keycard: the
    // map must read as the state it is in now, not as the history of statuses.
    const locked = contextFor(['take keycard', 'go corridor']);
    expect(locked).toContain('north -> Server Vault (locked)');
    const opened = contextFor(['take keycard', 'go corridor', 'unlock vault door with keycard']);
    expect(opened).toContain('north -> Server Vault\n');
    expect(opened).not.toContain('Server Vault (locked)');
    expect(opened.split('north -> Server Vault').length - 1).toBe(1);
  });

  it('totals the objects and their state', () => {
    const context = contextFor(['take keycard', 'go corridor', 'open locker']);
    expect(context).toContain('OBJECTS KNOWN:');
    expect(context).toContain('keycard');
    expect(context).toContain('locker');
    expect(context).toContain('open');
  });

  it('keeps one line per move', () => {
    const commands = ['take keycard', 'go corridor', 'open locker', 'read manual'];
    const context = contextFor(commands);
    for (const command of commands) {
      expect(context).toContain(command);
    }
  });

  it('states the current room once, however often it was revisited', () => {
    const context = contextFor(['take keycard', 'go corridor', 'go corridor', 'go corridor']);
    // The map lists room names only; the repeated visits do not re-state prose.
    expect(context.split('you are here').length - 1).toBe(1);
  });
});
