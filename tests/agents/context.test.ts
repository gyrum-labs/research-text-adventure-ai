/*
 * The four context strategies.
 *
 * How much of the past the agent sees is an experimental variable, not an
 * implementation detail. The same state, the same agent, the same budget, and
 * four different prompts. If the strategies produced the same prompt, the
 * variable would not exist and every comparison built on it would be hollow.
 */

import { describe, expect, it } from 'vitest';
import {
  buildContext,
  CONTEXT_STRATEGIES,
  STRUCTURED_OUTCOMES,
  WINDOW_TURNS,
  type ContextInput,
} from '../../src/agents/context.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';
import { buildObservation } from '../../src/kernel/observation.js';
import type { GameState, Observation } from '../../src/kernel/types.js';

const BRIEF = 'Mission brief: recover the case and disarm the bomb.';

function observationAt(roomId: string, carried: string[] = []): Observation {
  const state: GameState = structuredClone(adventure.initial);
  state.roomId = roomId;
  state.inventory = [...carried];
  for (const id of carried) state.objects[id]!.at = null;
  return buildObservation(adventure, state, [`outcome for ${roomId}`]);
}

/** Seven past turns, each with a distinctive command and outcome. */
function buildInput(): ContextInput {
  const rooms = ['briefing', 'corridor', 'vault', 'briefing', 'corridor', 'vault', 'briefing'];
  const commands = [
    'take alpha',
    'go bravo',
    'take charlie',
    'go delta',
    'take echo',
    'go foxtrot',
    'take golf',
  ];

  const turns = rooms.map((room, index) => ({
    command: commands[index]!,
    observation: {
      ...observationAt(room),
      messages: [`outcome number ${index + 1}`],
    },
  }));

  return {
    brief: BRIEF,
    turns,
    observation: {
      ...observationAt('corridor', ['keycard']),
      messages: ['outcome number 8'],
    },
  };
}

describe('the four context strategies', () => {
  const input = buildInput();

  it('produce four different prompts from the same state', () => {
    const prompts = CONTEXT_STRATEGIES.map((strategy) => buildContext(strategy, input));

    expect(prompts).toHaveLength(4);
    expect(new Set(prompts).size).toBe(4);
  });

  it('none shows the current observation and nothing else', () => {
    const prompt = buildContext('none', input);

    expect(prompt).toContain(input.observation.room.name);
    expect(prompt).not.toContain(BRIEF);
    for (const turn of input.turns) {
      expect(prompt).not.toContain(turn.command);
    }
  });

  it('full shows the brief and every command and outcome', () => {
    const prompt = buildContext('full', input);

    expect(prompt).toContain(BRIEF);
    for (const turn of input.turns) {
      expect(prompt).toContain(turn.command);
      expect(prompt).toContain(turn.observation.messages[0]!);
    }
    expect(prompt).toContain(input.observation.room.name);
  });

  it('window shows the brief and only the last five turns', () => {
    const prompt = buildContext('window', input);

    expect(prompt).toContain(BRIEF);
    expect(input.turns.length).toBeGreaterThan(WINDOW_TURNS);
    expect(prompt).toContain(input.turns[input.turns.length - 1]!.command);
    expect(prompt).not.toContain(input.turns[0]!.command);
    expect(prompt).not.toContain(input.turns[1]!.command);
  });

  it('structured shows the known facts and the last two outcomes', () => {
    const prompt = buildContext('structured', input);

    expect(prompt).toContain(BRIEF);
    expect(prompt).toContain('Facts you know:');
    expect(prompt).toContain(input.turns[input.turns.length - 1]!.observation.messages[0]!);
    expect(prompt).toContain(input.turns[input.turns.length - 2]!.observation.messages[0]!);

    // The recency section carries two outcomes, not the whole history.
    const section = prompt.split('Recent outcomes:')[1]!.split('\n\n')[0]!;
    expect(section.split('\n').filter((line) => line.startsWith('- '))).toHaveLength(
      STRUCTURED_OUTCOMES,
    );
  });

  it('never leaks anything the agent has not observed', () => {
    for (const strategy of CONTEXT_STRATEGIES) {
      const prompt = buildContext(strategy, input);

      // Nothing in the prompt may come from the adventure's authoring data.
      expect(prompt, `${strategy} leaked the code`).not.toContain('4821');
      expect(prompt, `${strategy} leaked the safe wire`).not.toContain('safe wire');
      for (const hint of adventure.hints) {
        expect(prompt, `${strategy} leaked a hint`).not.toContain(hint.text);
      }
    }
  });
});
