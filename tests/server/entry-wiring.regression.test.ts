/*
 * Regression: the server entry once called the single-model env reader while
 * the multi-model reader existed, so AI_DEMO_MODELS configured nothing and
 * the watcher advertised zero agents no matter what the operator named
 * (follow-up to warp#22984 / PR #41). The wiring is an entry-script fact, so
 * the guard pins the source: the entry reads the multi-model reader, and the
 * reader turns AI_DEMO_MODELS into one demo per named model.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { liveAisFromEnvironment } from '../../src/server/live-ai.js';

describe('regression: warp#22984 follow-up — the entry wires the multi-model reader', () => {
  it('the server entry reads AI_DEMO_MODELS through liveAisFromEnvironment', () => {
    const entry = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../src/server/main.ts'), 'utf8');
    expect(entry).toContain('liveAis: liveAisFromEnvironment()');
    // The single-model reader may stay imported for its own sake, but the
    // entry must not feed the server a lone demo when the operator listed
    // several.
    expect(entry).not.toMatch(/liveAi:\s*liveAiFromEnvironment\(\)/);
  });

  it('AI_DEMO_MODELS yields one demo per named model, in order', () => {
    const offered = liveAisFromEnvironment({
      OPENROUTER_API_KEY: 'demo-key-keep-on-server',
      AI_DEMO_MODELS: 'z-ai/glm-5.3-flash, deepseek/deepseek-chat',
    });
    expect(offered?.models.map(model => model.model))
      .toEqual(['z-ai/glm-5.3-flash', 'deepseek/deepseek-chat']);
    expect(offered?.demos?.has('z-ai/glm-5.3-flash')).toBe(true);
    expect(offered?.demos?.has('deepseek/deepseek-chat')).toBe(true);
  });

  it('a single AI_DEMO_MODEL still configures one agent', () => {
    const offered = liveAisFromEnvironment({
      OPENROUTER_API_KEY: 'demo-key-keep-on-server',
      AI_DEMO_MODEL: 'anthropic/claude-opus-5.5',
    });
    expect(offered?.models.map(model => model.model)).toEqual(['anthropic/claude-opus-5.5']);
  });
});
