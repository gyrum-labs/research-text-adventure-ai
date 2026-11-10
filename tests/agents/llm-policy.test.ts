/*
 * The model policy.
 *
 * It turns an observation into a prompt, asks a provider, and turns the
 * answer back into a command. The interesting part is what it records: the
 * rung of the extraction ladder that worked, the prompt hash, and the count
 * of responses that held no command at all.
 */

import { describe, expect, it } from 'vitest';
import { LlmPolicy } from '../../src/agents/llm/policy.js';
import { MockProvider } from '../../src/agents/llm/provider.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';
import { buildObservation } from '../../src/kernel/observation.js';
import { run } from '../../src/runner/run.js';
import type { PolicyContext } from '../../src/agents/policy.js';

/** A policy context with one turn of history. */
function context(): PolicyContext {
  const observation = buildObservation(adventure, structuredClone(adventure.initial));
  const stop = (): void => undefined;

  return {
    history: [observation],
    observation,
    state: structuredClone(adventure.initial),
    turn: 0,
    turnsLeft: 30,
    stop,
    get stopped() {
      return false;
    },
    get stopReason() {
      return undefined;
    },
  };
}

describe('the model policy', () => {
  it('issues the command the response contained', async () => {
    const provider = new MockProvider(['THINK: the keycard is here\nCOMMAND: take keycard']);
    const policy = new LlmPolicy({ adventure, provider });

    expect(await policy.next(context())).toBe('take keycard');
  });

  it('records which rung of the ladder worked', async () => {
    const provider = new MockProvider(['COMMAND: take keycard']);
    const policy = new LlmPolicy({ adventure, provider });

    await policy.next(context());

    expect(policy.metrics().extractionRoutes).toEqual({ command_line: 1 });
  });

  it('records a response that held no command rather than dropping it', async () => {
    const provider = new MockProvider(['I have no idea what to do.']);
    const policy = new LlmPolicy({ adventure, provider });

    const command = await policy.next(context());

    expect(command).toBeNull();
    expect(policy.metrics().unparsableResponses).toBe(1);
  });

  it('passes the current observation to the provider', async () => {
    const provider = new MockProvider(['COMMAND: look']);
    const policy = new LlmPolicy({ adventure, provider });

    await policy.next(context());

    const sent = provider.requests[0]!;
    const text = [sent.system, ...sent.messages.map((message) => message.content)].join('\n');
    expect(text).toContain('Briefing Room');
  });

  it('passes the output budget to the provider', async () => {
    const provider = new MockProvider(['COMMAND: look']);
    const policy = new LlmPolicy({ adventure, provider, maxOutputTokens: 123 });

    await policy.next(context());

    expect(provider.requests[0]!.maxOutputTokens).toBe(123);
  });

  it('records the prompt hash of the turn', async () => {
    const provider = new MockProvider(['COMMAND: look']);
    const policy = new LlmPolicy({ adventure, provider });

    await policy.next(context());

    expect(policy.lastPromptHash()).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('counts the tokens the provider reports', async () => {
    const provider = new MockProvider(['COMMAND: look']);
    const policy = new LlmPolicy({ adventure, provider });

    await policy.next(context());

    expect(policy.metrics().tokensUsed).toBeGreaterThan(0);
  });

  it('counts a provider failure instead of throwing', async () => {
    const provider = new MockProvider(['COMMAND: look']);
    const policy = new LlmPolicy({ adventure, provider });

    await policy.next(context());
    await policy.next(context());

    expect(policy.metrics().transientErrors).toBe(1);
  });

  it('drives a whole run offline with the mock provider', async () => {
    const responses = [
      'COMMAND: take keycard',
      'COMMAND: go corridor',
      'COMMAND: open locker',
      'COMMAND: take cutters',
      'COMMAND: read manual',
      'COMMAND: unlock vault door with keycard',
      'COMMAND: go vault',
      'COMMAND: cut yellow wire with cutters',
      'COMMAND: unlock safe with 4821',
      'COMMAND: take case',
    ];
    const provider = new MockProvider(responses);
    const policy = new LlmPolicy({ adventure, provider });

    const result = await run({ adventure, policy });

    expect(result.outcome).toBe('success');
    expect(result.turns).toBe(10);
    expect(provider.calls).toBe(10);
  });

  it('lets the agent survive a bad command and carry on', async () => {
    const responses = ['COMMAND: fly to the moon', 'COMMAND: take keycard'];
    const provider = new MockProvider(responses);
    const policy = new LlmPolicy({ adventure, provider });

    const result = await run({ adventure, policy });

    expect(result.parseErrors).toBe(1);
    expect(result.commands[1]).toBe('take keycard');
    expect(result.state.inventory).toContain('keycard');
  });
});
