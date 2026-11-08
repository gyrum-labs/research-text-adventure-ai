/*
 * The provider the command line asks for.
 *
 * The adapters are checked against a local server in the provider port's own
 * tests. What this file checks is the factory: that the endpoint and the key
 * a caller names reach the adapter, because an OpenAI-compatible endpoint
 * that lives somewhere else is the ordinary case and not an exotic one.
 */

import { describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { LlmRequest } from '../../src/agents/llm/provider.js';
import { createProvider } from '../../src/cli/provider.js';

const REQUEST: LlmRequest = {
  system: 'You are a careful operator.',
  messages: [{ role: 'user', content: 'Take the keycard.' }],
  maxOutputTokens: 500,
  temperature: 0.2,
};

/** A server that records what it was sent and answers with a canned body. */
async function fakeEndpoint(): Promise<{
  url: string;
  requests: Array<{ body: string; headers: Record<string, unknown> }>;
  close: () => void;
}> {
  const requests: Array<{ body: string; headers: Record<string, unknown> }> = [];
  const server: Server = createServer((request, response) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += String(chunk);
    });
    request.on('end', () => {
      requests.push({ body: raw, headers: request.headers });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ choices: [{ message: { content: 'COMMAND: go' } }] }));
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

describe('the provider factory', () => {
  it('calls the endpoint it is given, with the key it is told to read', async () => {
    const server = await fakeEndpoint();
    process.env['ANOTHER_KEY'] = 'sk-test-key';
    try {
      const provider = createProvider('openai', 'a-model', {
        baseUrl: server.url,
        apiKeyEnv: 'ANOTHER_KEY',
      });

      const result = await provider.complete(REQUEST);

      expect(result.text).toBe('COMMAND: go');
      expect(server.requests).toHaveLength(1);
      expect(server.requests[0]?.headers['authorization']).toBe('Bearer sk-test-key');
    } finally {
      delete process.env['ANOTHER_KEY'];
      await server.close();
    }
  });

  it('refuses to start when the key it is told to read is not there', () => {
    delete process.env['A_KEY_THAT_IS_NOT_SET'];
    expect(() =>
      createProvider('openai', 'a-model', { apiKeyEnv: 'A_KEY_THAT_IS_NOT_SET' }),
    ).toThrow('A_KEY_THAT_IS_NOT_SET is not set');
  });

  it('still reads the key the provider owns when no key is named', () => {
    delete process.env['OPENAI_API_KEY'];
    expect(() => createProvider('openai', 'a-model')).toThrow('OPENAI_API_KEY is not set');
  });
});
