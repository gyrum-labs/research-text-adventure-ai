import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from '../../src/runner/run.js';
import { Transcript } from '../../src/runner/transcript.js';
import type { AgentPolicy, PolicyContext, PolicyMetrics } from '../../src/agents/policy.js';
import { EMPTY_METRICS } from '../../src/agents/policy.js';
import type { Observation } from '../../src/kernel/types.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';

/** A policy that says one thing and then stops. */
class SayingPolicy implements AgentPolicy {
  readonly id = 'saying';

  async next(context: PolicyContext): Promise<string | null> {
    if (context.turn === 0) return 'take keycard';
    if (context.turn === 1) return 'nonsense command';
    return null;
  }
}

/** A policy that stops on purpose. */
class StoppingPolicy implements AgentPolicy {
  readonly id = 'stopping';

  async next(context: PolicyContext): Promise<string | null> {
    context.stop('The agent says it is stuck.');
    return null;
  }
}

/**
 * A policy whose provider fails a fixed number of times before it answers.
 *
 * The failure is reported the way the LLM policy reports one: a null command
 * plus `lastTurn: 'provider_error'`.
 */
class FlakyPolicy implements AgentPolicy {
  readonly id = 'flaky';
  private calls = 0;

  constructor(private readonly failures: number) {}

  async next(): Promise<string | null> {
    this.calls += 1;
    if (this.calls <= this.failures) return null;
    return 'take keycard';
  }

  metrics(): PolicyMetrics {
    return {
      ...EMPTY_METRICS,
      lastTurn: this.calls <= this.failures ? 'provider_error' : 'command',
      transientErrors: Math.min(this.calls, this.failures),
    };
  }
}

describe('the runner', () => {
  it('counts a parse error without ending the run', async () => {
    const result = await run({ adventure, policy: new SayingPolicy(), maxTurns: 5 });
    expect(result.parseErrors).toBe(1);
    expect(result.outcome).toBe('provider_stopped');
    expect(result.events.some((event) => event.type === 'parse_error')).toBe(true);
  });

  it('stops when the policy asks to stop', async () => {
    const result = await run({ adventure, policy: new StoppingPolicy(), maxTurns: 5 });
    expect(result.outcome).toBe('provider_stopped');
    expect(result.reason).toContain('stuck');
  });

  it('waits longer after each provider failure before retrying', async () => {
    const delays: number[] = [];
    const result = await run({
      adventure,
      policy: new FlakyPolicy(2),
      maxTurns: 5,
      budgets: { providerRetryDelayMs: 100 },
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
    });

    expect(delays).toEqual([100, 200]);
    expect(result.outcome).not.toBe('provider_error');
  });

  it('gives up after the configured number of provider failures', async () => {
    const delays: number[] = [];
    const result = await run({
      adventure,
      policy: new FlakyPolicy(3),
      maxTurns: 5,
      budgets: { maxTransientProviderErrors: 3, providerRetryDelayMs: 100 },
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
    });

    expect(result.outcome).toBe('provider_error');
    expect(delays).toEqual([100, 200]);
  });

  it('runs out of turns and says so', async () => {
    const result = await run({
      adventure,
      policy: {
        id: 'waiter',
        async next() {
          return 'wait';
        },
      },
      maxTurns: 4,
      // Waiting changes nothing, so the loop guard would fire first. This
      // test is about the turn budget, so the loop guard is held back.
      budgets: { maxRepeatedStates: 100 },
    });
    expect(result.outcome).toBe('budget_exhausted');
    expect(result.turns).toBe(4);
  });

  it('stops when the agent keeps doing the same thing', async () => {
    const result = await run({
      adventure,
      policy: {
        id: 'waiter',
        async next() {
          return 'wait';
        },
      },
      maxTurns: 20,
    });
    expect(result.outcome).toBe('loop_detected');
    expect(result.reason).toContain('same state');
  });

  it('gives a hint and spends a credit', async () => {
    const result = await run({
      adventure,
      policy: {
        id: 'asker',
        async next(context: PolicyContext) {
          return context.turn === 0 ? 'hint' : null;
        },
      },
      maxTurns: 3,
    });
    const hint = result.events.find((event) => event.type === 'hint_given');
    expect(hint).toBeDefined();
    expect(result.state.hintsLeft).toBe(adventure.hints.length - 1);
  });

  it('delivers the hint to the agent, because the observation is its only channel', async () => {
    const seen: Observation[] = [];

    await run({
      adventure,
      policy: {
        id: 'asker',
        async next(context: PolicyContext) {
          return context.turn === 0 ? 'hint' : null;
        },
      },
      maxTurns: 3,
      onObservation: (observation) => seen.push(observation),
    });

    expect(seen.length).toBeGreaterThan(1);
    expect(seen[0]!.messages.join(' ')).not.toContain(adventure.hints[0]!.text);
    expect(seen[1]!.messages.join(' ')).toContain(adventure.hints[0]!.text);
  });

  it('writes a transcript that can be read back', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'run-'));
    const path = join(directory, 'run.jsonl');
    const transcript = new Transcript(path, {
      type: 'header',
      runId: 'test',
      adventure: adventure.id,
      adventureVersion: adventure.version,
      adventureHash: 'sha256:test',
      policy: 'saying',
      provider: null,
      model: null,
      seed: 1,
      maxTurns: 5,
      startedAt: new Date().toISOString(),
      engineVersion: '0.1.0',
    });
    await run({ adventure, policy: new SayingPolicy(), transcript, maxTurns: 5 });
    transcript.close();

    const lines = readFileSync(path, 'utf8').trim().split('\n');
    expect(lines[0]).toContain('"type":"header"');
    expect(lines.some((line) => line.includes('"type":"observation"'))).toBe(true);
    expect(lines.some((line) => line.includes('"type":"command"'))).toBe(true);
  });
});
