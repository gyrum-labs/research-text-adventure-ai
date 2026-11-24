import { describe, expect, it } from 'vitest';
import { buildContext } from '../../src/agents/context.js';
import { adventure as mission } from '../../src/adventures/mission-impossible/adventure.js';
import { buildObservation, messagesFromEvents } from '../../src/kernel/observation.js';
import { parseCommand } from '../../src/kernel/parser.js';
import { reduce } from '../../src/kernel/reduce.js';
import type { ContextTurn } from '../../src/agents/context.js';

describe('debug', () => {
  it('prints the map context', () => {
    let state = structuredClone(mission.initial);
    const turns: ContextTurn[] = [];
    let latest = buildObservation(mission, state);
    for (const raw of ['take keycard', 'go corridor', 'open locker', 'read manual']) {
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
    const context = buildContext('map', { turns, observation: latest, brief: mission.brief });
    console.log('=== CONTEXT START ===');
    console.log(context);
    console.log('=== CONTEXT END ===');
    expect(context.length).toBeGreaterThan(0);
  });
});
