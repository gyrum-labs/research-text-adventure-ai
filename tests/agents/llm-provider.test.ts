/*
 * The provider port.
 *
 * One interface, four adapters, plain fetch. The mock one has to drive a
 * whole run with no network at all, because the whole harness has to be
 * runnable offline and free.
 *
 * The three live adapters are checked against a local server that speaks their
 * wire format. That proves the request body and the response parsing without
 * a key or a bill, and it is the most that can be proved here: this
 * environment has no provider credentials, so the live check itself is
 * somebody else's job.
 */

import { describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  AnthropicProvider,
  MockProvider,
  OllamaProvider,
  OpenAiProvider,
  type LlmRequest,
} from '../../src/agents/llm/provider.js';

const REQUEST: LlmRequest = {
  system: 'You are a careful operator.',
  messages: [{ role: 'user', content: 'Take the keycard.' }],
  maxOutputTokens: 500,
  temperature: 0.2,
};

/** A server that records what it was sent and answers with a canned body. */
async function fakeProvider(
  body: unknown,
  status = 200,
): Promise<{ url: string; requests: Array<{ body: string; headers: Record<string, unknown> }>; close: () => void }> {
  const requests: Array<{ body: string; headers: Record<string, unknown> }> = [];
  const server: Server = createServer((request, response) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += String(chunk);
    });
    request.on('end', () => {
      requests.push({ body: raw, headers: request.headers });
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => server.close(),
  };
}

describe('the mock provider', () => {
  it('replays its scripted responses in order', async () => {
    const provider = new MockProvider(['COMMAND: take keycard', 'COMMAND: go corridor']);

    expect((await provider.complete(REQUEST)).text).toBe('COMMAND: take keycard');
    expect((await provider.complete(REQUEST)).text).toBe('COMMAND: go corridor');
  });

  it('records every request it was given', async () => {
    const provider = new MockProvider(['COMMAND: look']);

    await provider.complete(REQUEST);

    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]!.system).toBe(REQUEST.system);
  });

  it('makes no network calls', async () => {
    const provider = new MockProvider(['COMMAND: look']);

    await provider.complete(REQUEST);

    expect(provider.calls).toBe(1);
    expect(provider.requests).toHaveLength(1);
  });

  it('reports when it has run out of scripted responses', async () => {
    const provider = new MockProvider(['COMMAND: look']);

    await provider.complete(REQUEST);
    const second = await provider.complete(REQUEST);

    expect(second.text).toBe('');
    expect(second.transientError).toBeTruthy();
  });

  it('reports token usage, so the budget can be measured without a bill', async () => {
    const provider = new MockProvider(['COMMAND: look']);

    const response = await provider.complete(REQUEST);

    expect(response.usage?.inputTokens).toBeGreaterThan(0);
    expect(response.usage?.outputTokens).toBeGreaterThan(0);
  });

  it('can script a reply that the allowance cut off, and what it spent on reasoning', async () => {
    const provider = new MockProvider([{ text: '', finishReason: 'length', reasoningTokens: 300 }]);

    const response = await provider.complete(REQUEST);

    expect(response.text).toBe('');
    expect(response.finishReason).toBe('length');
    expect(response.reasoningTokens).toBe(300);
    // Reasoning is output, and is paid for as output.
    expect(response.usage?.outputTokens).toBe(300);
  });
});

describe('how a reply ended, as the live adapters read it', () => {
  // Only two things matter to the runner: the reply was finished, or the
  // allowance cut it off. Every provider has its own words for those, and the
  // reasoning a model did not show is counted by some and not others.

  it('an OpenAI-shaped reply says when the allowance cut it off, and what was spent on reasoning', async () => {
    const server = await fakeProvider({
      choices: [{ message: { content: '' }, finish_reason: 'length' }],
      usage: { prompt_tokens: 20, completion_tokens: 300, completion_tokens_details: { reasoning_tokens: 300 } },
    });

    try {
      const provider = new OpenAiProvider({ apiKey: 'test-key', baseUrl: server.url, model: 'test-model' });
      const response = await provider.complete(REQUEST);
      expect(response.text).toBe('');
      expect(response.finishReason).toBe('length');
      expect(response.reasoningTokens).toBe(300);
      expect(response.usage).toEqual({ inputTokens: 20, outputTokens: 300 });
    } finally {
      server.close();
    }
  });

  it('and a finished reply says so', async () => {
    const server = await fakeProvider({
      choices: [{ message: { content: 'COMMAND: look' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 20, completion_tokens: 155, completion_tokens_details: { reasoning_tokens: 126 } },
    });

    try {
      const provider = new OpenAiProvider({ apiKey: 'test-key', baseUrl: server.url, model: 'test-model' });
      const response = await provider.complete(REQUEST);
      expect(response.text).toBe('COMMAND: look');
      expect(response.finishReason).toBe('stop');
      expect(response.reasoningTokens).toBe(126);
    } finally {
      server.close();
    }
  });

  it('a reply with no choices at all is safe, and says nothing about how it ended', async () => {
    const server = await fakeProvider({ choices: [], usage: { prompt_tokens: 3, completion_tokens: 0 } });

    try {
      const provider = new OpenAiProvider({ apiKey: 'test-key', baseUrl: server.url, model: 'test-model' });
      const response = await provider.complete(REQUEST);
      expect(response.text).toBe('');
      expect(response.finishReason).toBeUndefined();
      expect(response.reasoningTokens).toBeUndefined();
    } finally {
      server.close();
    }
  });

  it("and Anthropic's and Ollama's own words are read the same way", async () => {
    const anthropic = await fakeProvider({
      content: [{ type: 'text', text: 'half a thought' }],
      stop_reason: 'max_tokens',
      usage: { input_tokens: 5, output_tokens: 9 },
    });
    const ollama = await fakeProvider({ message: { content: 'half a thought' }, done_reason: 'length', prompt_eval_count: 5, eval_count: 9 });

    try {
      const first = await new AnthropicProvider({ apiKey: 'test-key', baseUrl: anthropic.url, model: 'test-model' }).complete(REQUEST);
      expect(first.text).toBe('half a thought');
      expect(first.finishReason).toBe('length');
      const second = await new OllamaProvider({ model: 'test-model', baseUrl: ollama.url }).complete(REQUEST);
      expect(second.text).toBe('half a thought');
      expect(second.finishReason).toBe('length');
    } finally {
      anthropic.close();
      ollama.close();
    }
  });
});

describe('the anthropic adapter', () => {
  it('sends the body the api expects', async () => {
    const server = await fakeProvider({
      content: [{ type: 'text', text: 'COMMAND: take keycard' }],
      usage: { input_tokens: 12, output_tokens: 7 },
    });

    try {
      const provider = new AnthropicProvider({
        apiKey: 'sk-test-not-a-real-key',
        model: 'claude-sonnet-4.5',
        baseUrl: server.url,
      });

      const response = await provider.complete(REQUEST);
      const sent = JSON.parse(server.requests[0]!.body);

      expect(sent.model).toBe('claude-sonnet-4.5');
      expect(sent.system).toBe(REQUEST.system);
      expect(sent.max_tokens).toBe(500);
      expect(sent.messages).toEqual([{ role: 'user', content: 'Take the keycard.' }]);
      expect(server.requests[0]!.headers['x-api-key']).toBe('sk-test-not-a-real-key');

      expect(response.text).toBe('COMMAND: take keycard');
      expect(response.usage).toEqual({ inputTokens: 12, outputTokens: 7 });
    } finally {
      server.close();
    }
  });

  it('returns an error rather than throwing when the api refuses', async () => {
    const server = await fakeProvider({ error: 'nope' }, 401);

    try {
      const provider = new AnthropicProvider({
        apiKey: 'sk-test-not-a-real-key',
        model: 'claude-sonnet-4.5',
        baseUrl: server.url,
      });

      const response = await provider.complete(REQUEST);

      expect(response.transientError).toBeTruthy();
      expect(response.text).toBe('');
    } finally {
      server.close();
    }
  });

  it('never puts the key in the error message', async () => {
    const server = await fakeProvider({ error: 'nope' }, 401);

    try {
      const provider = new AnthropicProvider({
        apiKey: 'sk-secret-do-not-leak',
        model: 'claude-sonnet-4.5',
        baseUrl: server.url,
      });

      const response = await provider.complete(REQUEST);

      expect(JSON.stringify(response)).not.toContain('sk-secret-do-not-leak');
    } finally {
      server.close();
    }
  });
});

describe('the openai-compatible adapter', () => {
  it('sends the body the api expects', async () => {
    const server = await fakeProvider({
      choices: [{ message: { content: 'COMMAND: take keycard' } }],
      usage: { prompt_tokens: 12, completion_tokens: 7 },
    });

    try {
      const provider = new OpenAiProvider({
        apiKey: 'sk-test-not-a-real-key',
        model: 'gpt-4o',
        baseUrl: server.url,
      });

      const response = await provider.complete(REQUEST);
      const sent = JSON.parse(server.requests[0]!.body);

      expect(sent.model).toBe('gpt-4o');
      expect(sent.messages[0]).toEqual({ role: 'system', content: REQUEST.system });
      expect(sent.messages[1]).toEqual({ role: 'user', content: 'Take the keycard.' });
      expect(server.requests[0]!.headers.authorization).toBe('Bearer sk-test-not-a-real-key');

      expect(response.text).toBe('COMMAND: take keycard');
      expect(response.usage).toEqual({ inputTokens: 12, outputTokens: 7 });
    } finally {
      server.close();
    }
  });
});

describe('the ollama adapter', () => {
  it('sends the body the api expects', async () => {
    const server = await fakeProvider({
      message: { content: 'COMMAND: take keycard' },
      prompt_eval_count: 12,
      eval_count: 7,
    });

    try {
      const provider = new OllamaProvider({
        model: 'llama3.1',
        baseUrl: server.url,
      });

      const response = await provider.complete(REQUEST);
      const sent = JSON.parse(server.requests[0]!.body);

      expect(sent.model).toBe('llama3.1');
      expect(sent.stream).toBe(false);
      expect(sent.messages[0]).toEqual({ role: 'system', content: REQUEST.system });

      expect(response.text).toBe('COMMAND: take keycard');
      expect(response.usage).toEqual({ inputTokens: 12, outputTokens: 7 });
    } finally {
      server.close();
    }
  });
});
