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
    ['four looks', 4, ['look', 'look', 'look', 'look']],
    ['one thing, examined four times', 3, ['examine desk', 'examine desk', 'examine desk', 'examine desk']],
    ['two things, examined again', 3, ['examine desk', 'examine wall notice', 'examine desk', 'examine wall notice', 'examine desk']],
  ])('counts no-op repetitions as the same state, turn increments and all: %s', async (_name, streak, commands) => {
    // Until 25 November 2026 the third of these ended the run (warp#23474).
    // It is counted now, which still shows what the test was written for: a
    // look, or the same examine again, leaves the world as it was, and the
    // turn counter on its own is not a change. The first examine of a thing
    // does change the world. It marks the thing examined.
    const result = await run({ adventure, policy: new ScriptedPolicy(commands) });
    expect(result.commands).toEqual(commands);
    expect(result.longestUnchangedTurns).toBe(streak);
    // The scripted policy stops when its commands run out, and a turn the
    // agent declined to take is not a turn spent.
    expect(result.outcome).toBe('provider_stopped');
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
