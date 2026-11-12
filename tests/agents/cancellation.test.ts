import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnthropicProvider, OpenAiProvider, OllamaProvider, MockProvider } from '../../src/agents/llm/provider.js';
import { LlmPolicy } from '../../src/agents/llm/policy.js';
import { run } from '../../src/runner/run.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';

afterEach(() => vi.restoreAllMocks());

describe('model request cancellation', () => {
  it.each([
    new AnthropicProvider({ apiKey: 'fixture-secret', model: 'fixture' }),
    new OpenAiProvider({ apiKey: 'fixture-secret', model: 'fixture' }),
    new OllamaProvider({ model: 'fixture' }),
  ])('passes cancellation to the $id fetch', async provider => {
    const controller = new AbortController();
    let observed: AbortSignal | null | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      observed = init?.signal;
      if (observed === undefined || observed === null) return Response.json({});
      return new Promise((_resolve, reject) => {
        observed!.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
      });
    });
    const pending = provider.complete({ system: 'fixture', messages: [], signal: controller.signal });
    controller.abort();
    const response = await pending;
    expect(observed).toBe(controller.signal);
    expect(response.transientError).toContain('cancelled');
    expect(JSON.stringify(response)).not.toContain('fixture-secret');
  });

  it('carries the runner signal through the model policy', async () => {
    const controller = new AbortController();
    const provider = new MockProvider('COMMAND: take keycard');
    await run({ adventure, maxTurns: 1, signal: controller.signal,
      policy: new LlmPolicy({ adventure, provider }),
    });
    expect(provider.requests[0]?.signal).toBe(controller.signal);
  });
});
