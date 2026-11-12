import { describe, expect, it } from 'vitest';
import { run } from '../../src/runner/run.js';
import { ScriptedPolicy } from '../../src/agents/scripted.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';
import { InMemorySession } from '../../src/session/in-memory.js';

// regression: warp#22688 — first-time examinations were absent from the loop key.
describe('exploration progress', () => {
  it('processes a fourth action after the exact reported three-command sequence', async () => {
    const commands = ['take keycard', 'examine wall notice', 'examine desk', 'go south'];
    const rooms: string[] = [];
    const result = await run({ adventure, policy: new ScriptedPolicy(commands),
      onObservation: observation => rooms.push(observation.room.name) });
    expect(result.commands).toEqual(commands);
    expect(result.state.roomId).toBe('corridor');
    expect(result.outcome).not.toBe('loop_detected');
    expect(result.state.objects['bulletin']?.state['examined']).toBe('true');
    expect(result.state.objects['desk']?.state['examined']).toBe('true');
    expect(rooms.at(-1)).toBe('Service Corridor');
  });

  it.each([
    ['look', 'look', 'look', 'look'],
    ['examine desk', 'examine desk', 'examine desk', 'examine desk'],
    ['examine desk', 'examine wall notice', 'examine desk', 'examine wall notice', 'examine desk'],
  ])('still stops no-op repetitions without counting turn increments: %s', async (...commands) => {
    const result = await run({ adventure, policy: new ScriptedPolicy(commands) });
    expect(result.outcome).toBe('loop_detected');
    expect(result.commands.length).toBeLessThanOrEqual(commands.length);
    expect(result.turns).toBeLessThan(6);
  });

  it('keeps human and runner feedback and hash chains equivalent through exploration', async () => {
    const commands = ['take keycard', 'examine wall notice', 'examine desk', 'go south'];
    const session = new InMemorySession('exploration', adventure);
    const humanMessages: string[] = [];
    for (const raw of commands) {
      const turn = await session.send(raw);
      if (turn.message) humanMessages.push(turn.message);
    }
    const agentMessages: string[] = [];
    const result = await run({ adventure, policy: new ScriptedPolicy(commands),
      onMessage: message => agentMessages.push(message) });
    expect(agentMessages).toEqual(humanMessages);
    expect(result.hash).toBe((await session.snapshot()).hash);
  });
});
