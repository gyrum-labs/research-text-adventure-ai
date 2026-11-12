import { describe, expect, it, vi } from 'vitest';
import { run } from '../../src/runner/run.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';
import { hashInitial } from '../../src/kernel/hash.js';
import type { AgentPolicy, PolicyContext } from '../../src/agents/policy.js';

describe('runner cancellation', () => {
  it('does not ask a policy when the run was already stopped', async () => {
    const controller = new AbortController();
    controller.abort();
    const next = vi.fn(async () => 'take keycard');
    const result = await run({ adventure, policy: { id: 'fixture', next }, signal: controller.signal });
    expect(next).not.toHaveBeenCalled();
    expect(result.outcome).toBe('provider_stopped');
    expect(result.commands).toEqual([]);
    expect(result.hash).toBe(hashInitial(adventure.initial));
  });

  it('passes the signal to the policy and refuses an answer arriving after stop', async () => {
    const controller = new AbortController();
    let release!: (command: string) => void;
    let entered!: () => void;
    const requested = new Promise<void>(resolve => { entered = resolve; });
    let observed: AbortSignal | undefined;
    const policy: AgentPolicy = { id: 'pending', next(context: PolicyContext) {
      observed = context.signal;
      entered();
      return new Promise(resolve => { release = resolve; });
    } };
    const pending = run({ adventure, policy, signal: controller.signal, maxTurns: 1 });
    await requested;
    controller.abort();
    release('take keycard');
    const result = await pending;
    expect(observed).toBe(controller.signal);
    expect(result.outcome).toBe('provider_stopped');
    expect(result.commands).toEqual([]);
    expect(result.hash).toBe(hashInitial(adventure.initial));
  });

  it('does not execute a reply that arrived after its wall-clock budget', async () => {
    let now = 0;
    const result = await run({ adventure, maxTurns: 1, now: () => now,
      budgets: { maxWallClockMs: 50 },
      policy: { id: 'late', async next() { now = 50; return 'take keycard'; } },
    });
    expect(result.outcome).toBe('budget_exhausted');
    expect(result.commands).toEqual([]);
    expect(result.hash).toBe(hashInitial(adventure.initial));
  });
});
