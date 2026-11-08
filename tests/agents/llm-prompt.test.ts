/*
 * The prompt.
 *
 * A pure function of the adventure, the observation and the context, so it
 * can be tested without a network call and hashed so a transcript can be
 * tied to the exact words the model saw.
 */

import { describe, expect, it } from 'vitest';
import { buildPrompt, PROMPT_VERSION } from '../../src/agents/llm/prompt.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';
import { buildObservation } from '../../src/kernel/observation.js';
import type { ContextTurn } from '../../src/agents/context.js';

function context(): { turns: ContextTurn[]; observation: ReturnType<typeof buildObservation> } {
  const observation = buildObservation(adventure, structuredClone(adventure.initial));
  return { turns: [], observation };
}

describe('the prompt', () => {
  it('is a pure function of its inputs', () => {
    const { turns, observation } = context();
    const first = buildPrompt(adventure, observation, turns, { strategy: 'structured' });
    const second = buildPrompt(adventure, observation, turns, { strategy: 'structured' });

    expect(first).toEqual(second);
    expect(first.systemHash).toBe(second.systemHash);
  });

  it('carries the mission brief', () => {
    const { turns, observation } = context();
    const prompt = buildPrompt(adventure, observation, turns, { strategy: 'structured' });

    expect(prompt.system).toContain(adventure.brief);
  });

  it('carries the available verbs', () => {
    const { turns, observation } = context();
    const prompt = buildPrompt(adventure, observation, turns, { strategy: 'structured' });

    for (const verb of ['take', 'open', 'read', 'unlock', 'cut', 'go']) {
      expect(prompt.system, `the prompt never mentions "${verb}"`).toContain(verb);
    }
  });

  it('carries the rules', () => {
    const { turns, observation } = context();
    const prompt = buildPrompt(adventure, observation, turns, { strategy: 'structured' });

    expect(prompt.system).toContain('one command');
    expect(prompt.system).toContain('currently see');
  });

  it('carries the output envelope', () => {
    const { turns, observation } = context();
    const prompt = buildPrompt(adventure, observation, turns, { strategy: 'structured' });

    expect(prompt.system).toContain('COMMAND:');
    expect(prompt.system).toContain('THINK:');
  });

  it('omits the thinking line when thinking is off', () => {
    const { turns, observation } = context();
    const prompt = buildPrompt(adventure, observation, turns, {
      strategy: 'structured',
      thinking: false,
    });

    expect(prompt.system).not.toContain('THINK:');
    expect(prompt.system).toContain('COMMAND:');
  });

  it('carries a version, so a result can be tied to the exact prompt', () => {
    const { turns, observation } = context();
    const prompt = buildPrompt(adventure, observation, turns, { strategy: 'structured' });

    expect(PROMPT_VERSION).toBeTruthy();
    expect(prompt.system).toContain(PROMPT_VERSION);
    expect(prompt.systemHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('changes its hash when the prompt changes', () => {
    const { turns, observation } = context();
    const structured = buildPrompt(adventure, observation, turns, { strategy: 'structured' });
    const none = buildPrompt(adventure, observation, turns, { strategy: 'none' });

    expect(structured.systemHash).not.toBe(none.systemHash);
  });

  it('changes its hash when the adventure changes', () => {
    const { turns, observation } = context();
    const other = { ...adventure, brief: 'A different mission entirely.' };
    const first = buildPrompt(adventure, observation, turns, { strategy: 'structured' });
    const second = buildPrompt(other, observation, turns, { strategy: 'structured' });

    expect(first.systemHash).not.toBe(second.systemHash);
  });

  it('never leaks the adventure authoring data', () => {
    const { turns, observation } = context();
    const prompt = buildPrompt(adventure, observation, turns, { strategy: 'structured' });

    expect(prompt.system).not.toContain('4821');
    expect(prompt.system).not.toContain('YELLOW one');
    for (const hint of adventure.hints) {
      expect(prompt.system).not.toContain(hint.text);
    }
  });
});
