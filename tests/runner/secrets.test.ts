/*
 * Secrets never reach disk.
 *
 * A transcript is the audit trail, and an audit trail that carries an API key
 * is a liability rather than a record. The key lives in the provider and goes
 * no further.
 */

import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../../src/runner/run.js';
import { Transcript } from '../../src/runner/transcript.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';
import { AnthropicProvider, MockProvider } from '../../src/agents/llm/provider.js';
import { LlmPolicy } from '../../src/agents/llm/policy.js';

const SECRET = 'sk-ant-do-not-write-me-down';

describe('secrets', () => {
  it('never appear in the transcript', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'secrets-'));
    const path = join(directory, 'run.jsonl');
    const transcript = new Transcript(path, {
      type: 'header',
      runId: 'test',
      adventure: adventure.id,
      adventureVersion: adventure.version,
      adventureHash: 'sha256:test',
      policy: 'llm',
      provider: 'anthropic',
      model: 'claude-sonnet-4.5',
      seed: 1,
      maxTurns: 30,
      startedAt: new Date().toISOString(),
      engineVersion: '0.1.0',
    });

    // The provider holds the key. Nothing else is allowed to see it.
    const provider = new AnthropicProvider({
      apiKey: SECRET,
      model: 'claude-sonnet-4.5',
      baseUrl: 'http://127.0.0.1:1/v1/messages',
    });
    const policy = new LlmPolicy({ adventure, provider });

    await run({ adventure, policy, transcript });
    transcript.close();

    expect(readFileSync(path, 'utf8')).not.toContain(SECRET);
  });

  it('never appear in the run result', async () => {
    const provider = new AnthropicProvider({
      apiKey: SECRET,
      model: 'claude-sonnet-4.5',
      baseUrl: 'http://127.0.0.1:1/v1/messages',
    });
    const policy = new LlmPolicy({ adventure, provider });

    const result = await run({ adventure, policy });

    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it('never appear in the transcript header', () => {
    const directory = mkdtempSync(join(tmpdir(), 'secrets-'));
    const path = join(directory, 'run.jsonl');
    const transcript = new Transcript(path, {
      type: 'header',
      runId: 'test',
      adventure: adventure.id,
      adventureVersion: adventure.version,
      adventureHash: 'sha256:test',
      policy: 'llm',
      provider: 'anthropic',
      model: 'claude-sonnet-4.5',
      seed: 1,
      maxTurns: 30,
      startedAt: new Date().toISOString(),
      engineVersion: '0.1.0',
    });
    transcript.close();

    expect(readFileSync(path, 'utf8')).not.toContain(SECRET);
  });

  it('do not leak when the provider refuses the request', async () => {
    const provider = new AnthropicProvider({
      apiKey: SECRET,
      model: 'claude-sonnet-4.5',
      baseUrl: 'http://127.0.0.1:1/v1/messages',
    });

    const response = await provider.complete({
      system: 'a system prompt',
      messages: [{ role: 'user', content: 'a message' }],
    });

    expect(JSON.stringify(response)).not.toContain(SECRET);
    expect(response.transientError).toBeTruthy();
  });
});

describe('the transcript', () => {
  it('records the prompt hash, so a result can be tied to the exact prompt', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'secrets-'));
    const path = join(directory, 'run.jsonl');
    const transcript = new Transcript(path, {
      type: 'header',
      runId: 'test',
      adventure: adventure.id,
      adventureVersion: adventure.version,
      adventureHash: 'sha256:test',
      policy: 'llm',
      provider: 'mock',
      model: 'mock-model',
      seed: 1,
      maxTurns: 30,
      startedAt: new Date().toISOString(),
      engineVersion: '0.1.0',
    });

    const provider = new MockProvider(['COMMAND: look', 'COMMAND: look']);
    const policy = new LlmPolicy({ adventure, provider });

    await run({ adventure, policy, transcript });
    transcript.close();

    const lines = readFileSync(path, 'utf8').trim().split('\n');
    const prompt = lines.find((line) => line.includes('"type":"prompt"'));

    expect(prompt).toBeDefined();
    expect(prompt).toMatch(/sha256:[0-9a-f]{64}/);
  });
});
