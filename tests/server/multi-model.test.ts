/*
 * Several configured agents.
 *
 * A server may offer more than one model to watch. These checks say what that
 * means: the list names each of them, a run can be started against any of
 * them, the run records which one it was, and a model the server does not
 * offer is refused by name rather than quietly replaced.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLiveAiDemo, liveAisFromEnvironment } from '../../src/server/live-ai.js';
import { startSessionServer } from '../../src/server/server.js';
import { PAGE_GAME_LIMITS } from '../../src/runner/limits.js';

const secret = 'demo-key-keep-on-server';
afterEach(() => vi.restoreAllMocks());

function twoModels(root: string) {
  const make = (model: string) => createLiveAiDemo({
    apiKey: secret, model, transcriptRoot: join(root, model.replace(/\W/g, '_')),
    budgets: { providerRetryDelayMs: 0 },
  });
  const demos = new Map([
    ['deepseek/deepseek-chat', make('deepseek/deepseek-chat')],
    ['z-ai/glm-5.3', make('z-ai/glm-5.3')],
  ]);
  return { demos, models: [...demos.values()].map(demo => demo.metadata) };
}

describe('several configured agents', () => {
  it('lists each of them in health, with its own caps', async () => {
    const root = mkdtempSync(join(tmpdir(), 'multi-'));
    const started = await startSessionServer({ liveAis: twoModels(root) });
    try {
      const health = (await (await fetch(`${started.url}/api/health`)).json()) as {
        aiModels: Array<{ model: string; budgets: { maxTotalTokens: number } }>;
      };
      expect(health.aiModels.map(entry => entry.model)).toEqual([
        'deepseek/deepseek-chat', 'z-ai/glm-5.3',
      ]);
      expect(health.aiModels.every(entry => entry.budgets.maxTotalTokens === PAGE_GAME_LIMITS.maxTotalTokens)).toBe(true);
    } finally { await started.close(); }
  });

  it('records which agent a run used', async () => {
    const root = mkdtempSync(join(tmpdir(), 'multi-'));
    const started = await startSessionServer({ liveAis: twoModels(root) });
    try {
      for (const model of ['deepseek/deepseek-chat', 'z-ai/glm-5.3']) {
        const opened = await fetch(`${started.url}/api/runs`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ adventureId: 'mission-impossible', policy: 'llm', model }),
        });
        expect(opened.status).toBe(201);
        const { id } = (await opened.json()) as { id: string };
        const text = await (await fetch(`${started.url}/api/runs/${id}/stream`)).text();
        const header = text.split('\n\n').map(b => b.replace(/^data: /, '')).filter(Boolean)
          .map(line => JSON.parse(line) as { type: string; data?: { model?: string } })
          .find(record => record.type === 'run_started');
        expect(header?.data?.model).toBe(model);
        await fetch(`${started.url}/api/runs/${id}`, { method: 'DELETE' });
      }
    } finally { await started.close(); }
  });

  it('refuses an agent it does not offer, by name', async () => {
    const root = mkdtempSync(join(tmpdir(), 'multi-'));
    const started = await startSessionServer({ liveAis: twoModels(root) });
    try {
      const opened = await fetch(`${started.url}/api/runs`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ adventureId: 'mission-impossible', policy: 'llm',
          model: 'openai/gpt-4.1' }),
      });
      expect(opened.status).toBe(400);
      expect(((await opened.json()) as { error: string }).error).toContain('openai/gpt-4.1');
    } finally { await started.close(); }
  });

  it('reads the agents it offers from the environment', () => {
    const environment = {
      OPENROUTER_API_KEY: secret,
      AI_DEMO_MODELS: 'deepseek/deepseek-chat, z-ai/glm-5.3, openai/gpt-4.1',
    };
    const offered = liveAisFromEnvironment(environment);
    expect(offered?.models.map(entry => entry.model)).toEqual([
      'deepseek/deepseek-chat', 'z-ai/glm-5.3', 'openai/gpt-4.1',
    ]);
  });

  it('keeps a single configured model working as before', () => {
    const environment = { OPENROUTER_API_KEY: secret, AI_DEMO_MODEL: 'z-ai/glm-5.3' };
    const offered = liveAisFromEnvironment(environment);
    expect(offered?.models.map(entry => entry.model)).toEqual(['z-ai/glm-5.3']);
  });
});
