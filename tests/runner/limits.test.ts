/*
 * The page game's limits.
 *
 * They are stated once, in `src/runner/limits.ts`. These tests hold the code
 * to what the owner decided on 25 November 2026 (warp#23474): room to think
 * before the reply, a retry when the room was not enough, twenty-five turns,
 * and a guard that counts a freeze and never ends a run for one.
 *
 * Why the retry exists. The cap on a request's output pays for a model's
 * hidden reasoning before it pays for any reply. On a model that reasons
 * first, a cap of 300 tokens produced replies with nothing in them: 43 per
 * cent of one model's turns in the recorded runs. The same model, with the
 * cap alone raised, solved 10 of 10 where it had solved 1 of 10.
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LlmPolicy } from '../../src/agents/llm/policy.js';
import { MockProvider, estimateTokens, type MockReply } from '../../src/agents/llm/provider.js';
import type { ReplyRecord } from '../../src/agents/policy.js';
import { CUT_OFF_RETRIES } from '../../src/agents/policy.js';
import type { PolicyContext } from '../../src/agents/policy.js';
import { buildObservation } from '../../src/kernel/observation.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';
import { adventure as hotfix } from '../../src/adventures/hotfix-2-4-1/adventure.js';
import { BATCH_BUDGETS, buildPlan, openLedger, summarise } from '../../src/runner/batch.js';
import { computeMetrics } from '../../src/runner/metrics.js';
import { MOST_OUTPUT_TOKENS_IN_ONE_REQUEST, PAGE_GAME_LIMITS } from '../../src/runner/limits.js';
import { run } from '../../src/runner/run.js';
import { Transcript } from '../../src/runner/transcript.js';
import { LIVE_AI_BUDGETS } from '../../src/server/live-ai.js';
import { describeLedger } from '../../src/cli/batch.js';

const ALLOWANCE = PAGE_GAME_LIMITS.maxOutputTokensPerTurn;

/** A reply the allowance cut off before the model wrote anything. */
const CUT_OFF: MockReply = { text: '', finishReason: 'length', reasoningTokens: ALLOWANCE };

/** A policy context with one turn of history. */
function context(): PolicyContext {
  const observation = buildObservation(adventure, structuredClone(adventure.initial));
  return {
    history: [observation],
    observation,
    state: structuredClone(adventure.initial),
    turn: 0,
    turnsLeft: 25,
    stop: (): void => undefined,
    get stopped() {
      return false;
    },
    get stopReason() {
      return undefined;
    },
  };
}

/** A fresh transcript, as the runner writes one. */
function transcript(): Transcript {
  return new Transcript(join(mkdtempSync(join(tmpdir(), 'limits-')), 'run.jsonl'), {
    type: 'header',
    runId: 'limits',
    adventure: adventure.id,
    adventureVersion: adventure.version,
    adventureHash: 'sha256:test',
    policy: 'llm',
    provider: null,
    model: null,
    seed: 1,
    maxTurns: 25,
    startedAt: new Date().toISOString(),
    engineVersion: '0.1.0',
  });
}

const repliesOf = (records: ReturnType<Transcript['all']>): ReplyRecord[] =>
  records.filter((record) => record['type'] === 'reply').map((record) => record['data'] as ReplyRecord);

describe('the limits, stated once', () => {
  it('are what the owner decided on 25 November 2026', () => {
    expect(PAGE_GAME_LIMITS).toEqual({
      maxTurns: 25,
      maxTotalTokens: 40_000,
      maxOutputTokensPerTurn: 3_000,
      maxWallClockMs: 120_000,
    });
  });

  it('bound what one request can come to ask for, after every retry', () => {
    expect(MOST_OUTPUT_TOKENS_IN_ONE_REQUEST).toBe(ALLOWANCE * 2 ** CUT_OFF_RETRIES);
    expect(MOST_OUTPUT_TOKENS_IN_ONE_REQUEST).toBe(12_000);
  });

  it('are carried whole by the batch and by the live page', () => {
    expect(BATCH_BUDGETS).toMatchObject(PAGE_GAME_LIMITS);
    expect(LIVE_AI_BUDGETS).toMatchObject(PAGE_GAME_LIMITS);
  });

  it('let a run use twenty-five turns', async () => {
    const look = { id: 'look', async next(): Promise<string | null> { return 'look'; } };
    const result = await run({ adventure, policy: look, budgets: BATCH_BUDGETS });
    expect(result.outcome).toBe('budget_exhausted');
    expect(result.reason).toBe('The agent used all 25 turns.');
    expect(result.turns).toBe(25);
  });
});

describe('a reply cut off by its allowance', () => {
  it('is asked for again with the room doubled, and the turn counts once', async () => {
    const provider = new MockProvider([CUT_OFF, 'COMMAND: look']);
    const policy = new LlmPolicy({ adventure, provider, maxOutputTokens: ALLOWANCE });

    const command = await policy.next(context());

    expect(command).toBe('look');
    expect(provider.calls).toBe(2);
    expect(provider.requests.map((request) => request.maxOutputTokens)).toEqual([3_000, 6_000]);
    expect(policy.metrics().lastReply).toMatchObject({
      cutOff: true,
      command: true,
      attempts: [
        { allowance: 3_000, finishReason: 'length', reasoningTokens: 3_000, textLength: 0 },
        { allowance: 6_000, textLength: 'COMMAND: look'.length },
      ],
    });
    // Both attempts were paid for, and both are counted.
    expect(policy.metrics().outputTokens).toBe(3_000 + estimateTokens('COMMAND: look'));
  });

  it('stands as it came after the bounded number of tries', async () => {
    const provider = new MockProvider([CUT_OFF, CUT_OFF, CUT_OFF, 'COMMAND: look']);
    const policy = new LlmPolicy({ adventure, provider, maxOutputTokens: ALLOWANCE });

    const command = await policy.next(context());

    expect(command).toBeNull();
    expect(provider.calls).toBe(1 + CUT_OFF_RETRIES);
    expect(provider.requests.map((request) => request.maxOutputTokens)).toEqual([3_000, 6_000, 12_000]);
    expect(policy.metrics().lastReply).toMatchObject({ cutOff: true, command: false });
    expect(policy.metrics().lastReply?.attempts).toHaveLength(3);
    expect(policy.metrics().unparsableResponses).toBe(1);
  });

  it('is not asked for again when the provider failed', async () => {
    // No scripted reply at all: the mock fails every request.
    const provider = new MockProvider([]);
    const policy = new LlmPolicy({ adventure, provider, maxOutputTokens: ALLOWANCE });

    const command = await policy.next(context());

    expect(command).toBeNull();
    expect(provider.calls).toBe(1);
    expect(policy.metrics().lastReply).toMatchObject({ cutOff: false, command: false });
    expect(policy.metrics().lastReply?.attempts[0]?.failed).toBeDefined();
  });

  it('leaves a reply that finished alone', async () => {
    const provider = new MockProvider(['COMMAND: look']);
    const policy = new LlmPolicy({ adventure, provider, maxOutputTokens: ALLOWANCE });

    await policy.next(context());

    expect(provider.calls).toBe(1);
    expect(provider.requests[0]?.maxOutputTokens).toBe(3_000);
    expect(policy.metrics().lastReply).toMatchObject({ cutOff: false, command: true });
    expect(policy.metrics().lastReply?.attempts).toHaveLength(1);
  });
});

describe('what the transcript says about a turn', () => {
  it('every turn says whether the reply was cut off, and how many tokens were reasoning and how many were the reply', async () => {
    const provider = new MockProvider([CUT_OFF, 'COMMAND: look', 'COMMAND: look']);
    const policy = new LlmPolicy({ adventure, provider, maxOutputTokens: ALLOWANCE });
    const written = transcript();

    const result = await run({ adventure, policy, transcript: written, maxTurns: 2 });

    const replies = repliesOf(written.all());
    expect(replies).toHaveLength(2);
    expect(written.all().filter((record) => record['type'] === 'reply').map((record) => record['turn'])).toEqual([0, 1]);
    for (const reply of replies) {
      expect(typeof reply.cutOff).toBe('boolean');
      expect(typeof reply.command).toBe('boolean');
      for (const attempt of reply.attempts) {
        const output = attempt.outputTokens ?? 0;
        const reasoning = attempt.reasoningTokens ?? 0;
        expect(output).toBeGreaterThanOrEqual(0);
        expect(reasoning).toBeGreaterThanOrEqual(0);
        // The reply's own tokens are what is left of the output.
        expect(output - reasoning).toBeGreaterThanOrEqual(0);
      }
    }
    expect(replies[0]?.cutOff).toBe(true);
    expect(replies[1]?.cutOff).toBe(false);
    expect(result.commands).toEqual(['look', 'look']);
    expect(result.cutOffReplies).toBe(1);
    expect(result.retriedReplies).toBe(1);
    expect(result.reasoningTokens).toBe(3_000);
  });

  it('keeps a turn with no command apart from a turn that ran out', async () => {
    const provider = new MockProvider([CUT_OFF, CUT_OFF, CUT_OFF, 'COMMAND: look', 'COMMAND: look']);
    const policy = new LlmPolicy({ adventure, provider, maxOutputTokens: ALLOWANCE });
    const written = transcript();

    const result = await run({ adventure, policy, transcript: written, maxTurns: 3 });

    // The first turn produced no command, and says why: three attempts, each
    // cut off. The run then went on, and what ended it was the turns.
    expect(result.outcome).toBe('budget_exhausted');
    expect(result.reason).toBe('The agent used all 3 turns.');
    expect(result.commands).toEqual(['look', 'look']);
    const records = written.all();
    expect(records.filter((record) => record['type'] === 'unparsable_response').map((record) => record['turn'])).toEqual([0]);
    expect(repliesOf(records)[0]).toMatchObject({ cutOff: true, command: false });
    expect(repliesOf(records)[0]?.attempts).toHaveLength(3);

    // And a reader of the transcript, long after, sees the same things.
    const metrics = computeMetrics(records, adventure, { goldPathLength: 11, model: 'mock/mock-model' });
    expect(metrics.outcome).toBe('budget_exhausted');
    expect(metrics.cutOffReplies).toBe(1);
    expect(metrics.retriedReplies).toBe(1);
    expect(metrics.reasoningTokens).toBe(9_000);
    // The rate is over the turns that reached the world. The turn with no
    // command never did, so it is one of two here, and the run says so itself:
    // it spent three.
    expect(metrics.unparsableRate).toBeCloseTo(0.5);
  });

  it('shows a reader how long the agent went without changing the world', async () => {
    const waiting = { id: 'waiter', async next(): Promise<string | null> { return 'wait'; } };
    const written = transcript();

    const result = await run({ adventure, policy: waiting, transcript: written, maxTurns: 6 });

    expect(result.longestUnchangedTurns).toBe(6);
    expect(result.freezes).toBe(1);
    const final = written.all().find((record) => record['type'] === 'metrics')?.['data'] as Record<string, number>;
    expect(final).toMatchObject({ longestUnchangedTurns: 6, freezes: 1, cutOffReplies: 0, retriedReplies: 0, reasoningTokens: 0 });
    const metrics = computeMetrics(written.all(), adventure, { goldPathLength: 11, model: 'mock/mock-model' });
    expect(metrics.longestUnchangedTurns).toBe(6);
    expect(metrics.freezes).toBe(1);
  });

  it('reads a transcript recorded before any of this was counted as zero, not as unknown', () => {
    const old = [{ type: 'metrics', turn: 0, data: { outcome: 'budget_exhausted', reason: 'stopped', turns: 0 } }];
    const metrics = computeMetrics(old, adventure, { goldPathLength: 11 });
    expect(metrics).toMatchObject({
      longestUnchangedTurns: 0, freezes: 0, cutOffReplies: 0, retriedReplies: 0, reasoningTokens: 0,
    });
  });
});

describe('the guard that used to end a run', () => {
  it('counts a freeze, and the turns are what end the run', async () => {
    // A streak that reaches `maxRepeatedStates` unchanged turns is one
    // freeze, however long it then goes on. Six turns in the same state are
    // one freeze, and no ending.
    const look = { id: 'look', async next(): Promise<string | null> { return 'look'; } };
    const result = await run({ adventure, policy: look, budgets: { maxTurns: 6, maxRepeatedStates: 3 } });
    expect(result.outcome).toBe('budget_exhausted');
    expect(result.longestUnchangedTurns).toBe(6);
    expect(result.freezes).toBe(1);
    expect(result.events.at(-1)).toMatchObject({ type: 'run_ended', outcome: 'budget_exhausted' });
  });

  it('counts a freeze that lands on the last turn', async () => {
    // The last turn has no next turn to count it, so it is counted where the
    // run ends. A streak that reaches three only there is still a freeze.
    const waiting = { id: 'waiter', async next(): Promise<string | null> { return 'wait'; } };
    const result = await run({ adventure, policy: waiting, budgets: { maxTurns: 3, maxRepeatedStates: 3 } });
    expect(result.outcome).toBe('budget_exhausted');
    expect(result.longestUnchangedTurns).toBe(3);
    expect(result.freezes).toBe(1);
  });
});

describe('the batch says what happened, in order', () => {
  it('gives the solve rate, then the solved runs by fewest turns, then the unsolved runs with why each ended', () => {
    const plan = buildPlan({
      worlds: [hotfix],
      runsPerWorld: 4,
      model: { provider: 'openrouter', model: 'deepseek/deepseek-chat' },
      strategy: 'structured',
      temperature: 0 as const,
      promptVersion: 'llm-prompt-v4',
      promptHash: 'sha256:prompt',
      budgets: BATCH_BUDGETS,
      prices: {
        source: 'test', checkedAt: '2026-11-25T00:00:00Z', inputPerMillion: 0.3, outputPerMillion: 0.9,
      },
      sourceRevision: 'test',
      maxTotalUsd: 1,
      maxPerRunUsd: 0.1,
    });
    const ledger = openLedger(plan);
    const [first, second, third] = ledger.cells;
    const attempted = { status: 'attempted' as const, chargeState: 'settled' as const };
    Object.assign(first!, attempted, { outcome: 'success', turns: 17 });
    Object.assign(second!, attempted, { outcome: 'success', turns: 12 });
    Object.assign(third!, attempted, { outcome: 'budget_exhausted', turns: 25, reason: 'The agent used all 25 turns.' });
    ledger.spentUsd = 0.05;

    const report = summarise(ledger);
    expect(report.successes).toBe(2);
    expect(report.solvedByTurns).toEqual([{ seed: second!.seed, turns: 12 }, { seed: first!.seed, turns: 17 }]);
    expect(report.unsolved).toEqual([{ seed: third!.seed, reason: 'The agent used all 25 turns.', turns: 25 }]);

    const text = describeLedger(ledger);
    const lines = text.split('\n');
    const at = (start: string): number => lines.findIndex((line) => line.startsWith(start));
    expect(at('successes 2 of 3 attempted')).toBeGreaterThanOrEqual(0);
    expect(at('solved, fewest turns first:')).toBeGreaterThan(at('successes 2 of 3 attempted'));
    expect(lines[at('solved, fewest turns first:')]).toBe(`solved, fewest turns first: seed ${second!.seed} in 12 turns, seed ${first!.seed} in 17 turns`);
    expect(at('turns to solve, the middle solved run: 17')).toBeGreaterThan(at('solved, fewest turns first:'));
    expect(lines.some((line) => line.startsWith(`  seed ${third!.seed}: not solved, 25 turns, because The agent used all 25 turns.`))).toBe(true);
  });
});
