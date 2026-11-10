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
