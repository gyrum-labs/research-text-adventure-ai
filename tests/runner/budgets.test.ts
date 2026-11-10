/*
 * The budgets and the guards.
 *
 * Every one of these has to terminate the run, with the right outcome code,
 * because an agent that loops or babbles must not run up a bill. The clock is
 * injected, so the wall-clock budget is proved without waiting for it.
 */

import { describe, expect, it } from 'vitest';
import { run } from '../../src/runner/run.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';
import { GOLD_PATH } from '../../src/adventures/mission-impossible/gold-path.js';
import type { AgentPolicy, MeasurablePolicy, PolicyContext, PolicyMetrics } from '../../src/agents/policy.js';

/** A policy that always says the same thing. */
class FixedPolicy implements AgentPolicy {
  readonly id = 'fixed';

  constructor(private readonly command: string | null) {}

  async next(): Promise<string | null> {
    return this.command;
  }
}

/** A policy that reports its own metrics, so the runner can watch them. */
class CountingPolicy implements AgentPolicy {
  readonly id = 'counting';

  constructor(
    private readonly command: string | null,
    private readonly metricsToReport: Partial<PolicyMetrics> = {},
  ) {}

  async next(): Promise<string | null> {
    return this.command;
  }

  metrics(): PolicyMetrics {
    const reported = this.metricsToReport;
    return {
      lastTurn: reported.lastTurn ?? 'stopped',
      unparsableResponses: reported.unparsableResponses ?? 0,
      transientErrors: reported.transientErrors ?? 0,
      tokensUsed: reported.tokensUsed ?? 0,
      inputTokens: reported.inputTokens ?? 0,
      outputTokens: reported.outputTokens ?? 0,
      extractionRoutes: reported.extractionRoutes ?? {},
      lastPromptHash: reported.lastPromptHash ?? '',
      lastResponse: reported.lastResponse ?? '',
    };
  }
}

describe('the budgets', () => {
  it('stop the run on the turn budget', async () => {
    const result = await run({
      adventure,
      policy: new FixedPolicy('look'),
      budgets: { maxTurns: 5, maxRepeatedStates: 100 },
    });

    expect(result.outcome).toBe('budget_exhausted');
    expect(result.turns).toBe(5);
    expect(result.reason).toContain('5 turns');
  });

  it('stop the run on the token budget', async () => {
    const result = await run({
      adventure,
      policy: new CountingPolicy('look', { tokensUsed: 25_000 }),
      budgets: { maxTotalTokens: 20_000 },
    });

    expect(result.outcome).toBe('budget_exhausted');
    expect(result.reason).toContain('token');
  });

  it('stop the run on the wall-clock budget', async () => {
    let clock = 0;
    const result = await run({
      adventure,
      policy: new FixedPolicy('look'),
      budgets: { maxWallClockMs: 1_000, maxRepeatedStates: 100 },
      now: () => {
        clock += 400;
        return clock;
      },
    });

    expect(result.outcome).toBe('budget_exhausted');
    expect(result.reason).toContain('time');
  });

  it('stop the run when the agent keeps returning to the same state', async () => {
    const result = await run({
      adventure,
      policy: new FixedPolicy('look'),
      budgets: { maxRepeatedStates: 3 },
    });

    expect(result.outcome).toBe('loop_detected');
    expect(result.reason).toContain('same state');
  });

  it('stop the run when the provider keeps failing', async () => {
    const result = await run({
      adventure,
      policy: new CountingPolicy(null, {
        transientErrors: 3,
        lastTurn: 'provider_error',
      }),
      budgets: { maxTransientProviderErrors: 3 },
    });

    expect(result.outcome).toBe('provider_error');
    expect(result.reason).toContain('provider');
  });

  it('stop the run when the agent cannot produce a command', async () => {
    const result = await run({
      adventure,
      policy: new FixedPolicy('this is not a command'),
      budgets: { maxParseErrors: 3 },
    });

    expect(result.outcome).toBe('budget_exhausted');
    expect(result.reason).toContain('parse');
  });

  it('refuse more hints than the budget allows, and let the run continue', async () => {
    const commands = ['hint', 'hint', 'look'];
    let index = 0;
    const result = await run({
      adventure,
      policy: {
        id: 'asker',
        async next(): Promise<string | null> {
          const command = commands[index];
          index += 1;
          return command ?? null;
        },
      },
      budgets: { maxHints: 1 },
    });

    expect(result.outcome).not.toBe('budget_exhausted');
    expect(result.state.hintsLeft).toBe(2);
  });
});

describe('the guards', () => {
  it('do not end the run when the agent sends an invalid command', async () => {
    const commands = ['take the brass key', 'take keycard'];
    let index = 0;
    const result = await run({
      adventure,
      policy: {
        id: 'confused',
        async next(): Promise<string | null> {
          const command = commands[index];
          index += 1;
          return command ?? null;
        },
      },
    });

    expect(result.parseErrors).toBe(1);
    expect(result.turns).toBe(2);
    expect(result.state.inventory).toContain('keycard');
  });

  it('hand the agent the error so it can correct itself', async () => {
    const seen: string[] = [];
    await run({
      adventure,
      policy: {
        id: 'confused',
        async next(): Promise<string | null> {
          return 'take the brass key';
        },
      },
      onObservation: (observation) => seen.push(...observation.messages),
    });

    expect(seen.join('\n')).toContain('brass key');
  });

  it('let the agent win when it plays the gold path', async () => {
    let index = 0;
    const result = await run({
      adventure,
      policy: {
        id: 'scripted',
        async next(): Promise<string | null> {
          const command = GOLD_PATH[index];
          index += 1;
          return command ?? null;
        },
      },
    });

    expect(result.outcome).toBe('success');
    expect(result.turns).toBe(GOLD_PATH.length);
  });

  it('count the tokens a measurable policy reports', async () => {
    const result = await run({
      adventure,
      policy: new CountingPolicy('look', { tokensUsed: 42 }),
    });

    expect(result.tokensUsed).toBe(42);
  });

  it('measure a policy that does not report metrics without complaining', async () => {
    let index = 0;
    const result = await run({
      adventure,
      policy: {
        id: 'scripted',
        async next(): Promise<string | null> {
          const command = GOLD_PATH[index];
          index += 1;
          return command ?? null;
        },
      },
    });

    expect(result.tokensUsed).toBe(0);
    expect(result.outcome).toBe('success');
  });
});

describe('a measurable policy', () => {
  it('is one that can report its own metrics', async () => {
    const policy = new CountingPolicy('look', { tokensUsed: 1 });
    const measurable = policy as MeasurablePolicy;

    expect(typeof measurable.metrics).toBe('function');
    expect(measurable.metrics().tokensUsed).toBe(1);
  });

  it('is not required of every policy', async () => {
    const policy: AgentPolicy = new FixedPolicy('look');

    expect((policy as Partial<MeasurablePolicy>).metrics).toBeUndefined();
  });
});

describe('the policy context', () => {
  it('carries the history and the current observation', async () => {
    let seen: PolicyContext | undefined;
    await run({
      adventure,
      policy: {
        id: 'watcher',
        async next(context: PolicyContext): Promise<string | null> {
          seen = context;
          return null;
        },
      },
    });

    expect(seen?.history).toHaveLength(1);
    expect(seen?.observation.room.name).toBe('Briefing Room');
    expect(seen?.turnsLeft).toBeGreaterThan(0);
  });
});
