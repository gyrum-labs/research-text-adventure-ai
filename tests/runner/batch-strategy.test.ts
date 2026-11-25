/*
 * The context strategy as an experiment variable.
 *
 * A plan is the record of a decision made before the run. When the strategy
 * is the variable, the plan must name it truthfully: the CLI refuses a name
 * it does not know, the runner hands the plan's strategy to the policy that
 * builds the prompt, and a plan read back from disk is checked rather than
 * trusted.
 */

import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planFor } from '../../src/cli/batch.js';
import { buildPlan, openLedger, persistPlan, readPlan, runBatch, type BatchPlan } from '../../src/runner/batch.js';
import { CONTEXT_STRATEGIES } from '../../src/agents/context.js';
import { adventure as mission } from '../../src/adventures/mission-impossible/adventure.js';
import type { LlmProvider, LlmRequest } from '../../src/agents/llm/provider.js';

const PRICES = { source: 'test', checkedAt: '2026-11-24', inputPerMillion: 0.09, outputPerMillion: 0.18 };
const BUDGETS = {
  maxTurns: 20, maxHints: 3, maxOutputTokensPerTurn: 300, maxTotalTokens: 30_000, maxWallClockMs: 120_000,
  maxTransientProviderErrors: 2, providerRetryDelayMs: 1_000, maxParseErrors: 3, maxRepeatedStates: 3,
  maxInvalidActions: 10,
};

function planWith(strategy: string): BatchPlan {
  return buildPlan({
    worlds: [mission], runsPerWorld: 1, model: { provider: 'openrouter', model: 'deepseek/deepseek-chat' },
    strategy, temperature: 0, promptVersion: 'llm-prompt-v4', promptHash: 'sha256:prompt',
    budgets: BUDGETS, prices: PRICES, sourceRevision: 'test', maxTotalUsd: 1, maxPerRunUsd: 0.2,
  });
}

/** A provider that records every prompt it is asked and answers safely. */
function recordingProvider(prompts: string[]): LlmProvider {
  return {
    id: 'openrouter', model: 'deepseek/deepseek-chat',
    async complete(request: LlmRequest) {
      prompts.push(`${request.system}\n${request.messages.map(message => message.content).join('\n')}`);
      return { text: 'COMMAND: take keycard', usage: { inputTokens: 10, outputTokens: 2 } };
    },
  };
}

describe('the context strategy as the experiment variable', () => {
  it('plans every shipped strategy and refuses a name it does not know', () => {
    const options = { root: join(tmpdir(), 'strategy-plan'), runs: 1, model: 'deepseek/deepseek-v4-flash', maxTotalUsd: 1, maxPerRunUsd: 0.2 };
    for (const strategy of CONTEXT_STRATEGIES) {
      expect(planFor({ ...options, strategy }, PRICES).strategy).toBe(strategy);
    }
    expect(() => planFor({ ...options, strategy: 'napkin' }, PRICES))
      .toThrow(/unknown context strategy "napkin"/);
    // The default is the context every recorded batch ran before the field existed.
    expect(planFor(options, PRICES).strategy).toBe('structured');
    // And the plan itself refuses what it cannot name, where it is made.
    expect(() => planWith('napkin')).toThrow(/unknown context strategy "napkin"/);
  });

  it('hands the plan\'s strategy to the policy that builds the prompt', async () => {
    for (const [strategy, marker] of [['map', 'MAP:'], ['structured', 'Facts you know:']] as const) {
      const root = mkdtempSync(join(tmpdir(), 'strategy-run-'));
      const plan = planWith(strategy);
      persistPlan(plan, root);
      const ledger = openLedger(plan);
      const prompts: string[] = [];
      await runBatch(plan, ledger, {
        root, providerFor: () => recordingProvider(prompts), adventureFor: () => mission,
      });
      expect(prompts.length).toBeGreaterThan(0);
      // The very first prompt already reads in the plan's strategy: a notepad
      // opens with its map, the structured context with the facts it has collected.
      expect(prompts[0]).toContain(marker);
    }
  });

  it('reads a plan back fail-closed: unknown refused, missing read as structured', () => {
    const root = mkdtempSync(join(tmpdir(), 'strategy-read-'));
    persistPlan(planWith('map'), root);
    expect(readPlan(root).strategy).toBe('map');

    const plan = JSON.parse(JSON.stringify(planWith('structured'))) as Record<string, unknown>;
    delete plan.strategy;
    writeFileSync(join(root, 'plan.json'), JSON.stringify(plan));
    expect(readPlan(root).strategy).toBe('structured');

    writeFileSync(join(root, 'plan.json'), JSON.stringify({ ...plan, strategy: 'napkin' }));
    expect(() => readPlan(root)).toThrow(/unknown context strategy "napkin"/);
  });
});
