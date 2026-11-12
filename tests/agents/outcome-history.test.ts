import { describe, expect, it } from 'vitest';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';
import { LlmPolicy } from '../../src/agents/llm/policy.js';
import type { LlmRequest, LlmResponse } from '../../src/agents/llm/provider.js';
import { buildContext } from '../../src/agents/context.js';
import { buildObservation } from '../../src/kernel/observation.js';
import { renderObservationJson } from '../../src/kernel/render.js';
import { run } from '../../src/runner/run.js';

async function contexts(responses: LlmResponse[]) {
  const requests: LlmRequest[] = [];
  const policy = new LlmPolicy({ adventure, strategy: 'structured', renderer: 'json', thinking: false,
    provider: { id: 'mock', model: 'history', complete: async request => {
      requests.push(request); return responses[requests.length - 1]!;
    } },
  });
  await run({ adventure, policy, maxTurns: responses.length, budgets: { providerRetryDelayMs: 0 } });
  return requests.map(request => request.messages.map(message => message.content).join('\n'));
}

// regression: warp#22695 — results were paired with the commands that followed them.
describe('accurate and compact model history', () => {
  it('pairs actual action results correctly even across a provider retry', async () => {
    const requests = await contexts([
      { text: 'COMMAND: take keycard' }, { text: '', transientError: 'offline fixture' },
      { text: 'COMMAND: read wall notice' }, { text: 'COMMAND: go south' },
    ]);
    expect(requests[3]).toContain('- take keycard: You take the keycard.');
    expect(requests[3]).toContain('- read wall notice: You read the wall notice.');
    expect(requests[3]).not.toContain('- read wall notice: You take the keycard.');
  });

  it('remembers the initial public view when the first action leaves the room', async () => {
    const requests = await contexts([{ text: 'COMMAND: go south' }, { text: 'COMMAND: open locker' }, { text: 'COMMAND: look' }]);
    expect(requests[2]).toContain('Rooms seen: Briefing Room, Service Corridor.');
    expect(requests[2]).toContain('Objects seen: keycard');
    expect(requests[2]).not.toContain('4821');
  });

  it('keeps all public JSON fields with stable compact serialization', () => {
    const observation = buildObservation(adventure, adventure.initial);
    const prompt = buildContext('structured', { brief: adventure.brief, turns: [], observation, renderer: 'json' });
    const current = prompt.split('Now:\n\n')[1]!;
    expect(JSON.parse(current)).toEqual(JSON.parse(renderObservationJson(observation)));
    expect(current).toBe(JSON.stringify(JSON.parse(current)));
  });
});
