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
import { MockProvider, estimateTokens, type LlmProvider, type MockReply } from '../../src/agents/llm/provider.js';
import type { ReplyRecord } from '../../src/agents/policy.js';
import { CUT_OFF_RETRIES } from '../../src/agents/policy.js';
import type { PolicyContext } from '../../src/agents/policy.js';
import { buildObservation } from '../../src/kernel/observation.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';
import { adventure as hotfix } from '../../src/adventures/hotfix-2-4-1/adventure.js';
import { BATCH_BUDGETS, buildPlan, openLedger, summarise } from '../../src/runner/batch.js';
import { computeMetrics } from '../../src/runner/metrics.js';
import { MOST_OUTPUT_TOKENS_IN_ONE_REQUEST, PAGE_GAME_LIMITS } from '../../src/runner/limits.js';
import { run, RunBudgetExceeded } from '../../src/runner/run.js';
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

  it('counts the tokens of every attempt that came back, and asks no further after a failure', async () => {
    // The first attempt is cut off, and comes back: it is paid for, and counted.
    // The second fails. A failed request reports no tokens, so there are none
    // to count for it, and it is not asked for again. The turn says all of this.
    const provider = new MockProvider([
      CUT_OFF,
      { text: '', transientError: 'the provider is rate limited' },
      'COMMAND: look',
    ]);
    const policy = new LlmPolicy({ adventure, provider, maxOutputTokens: ALLOWANCE });

    const command = await policy.next(context());

    expect(command).toBeNull();
    expect(provider.calls).toBe(2);
    expect(policy.metrics().outputTokens).toBe(ALLOWANCE);
    expect(policy.metrics().transientErrors).toBe(1);
    expect(policy.metrics().lastReply).toMatchObject({
      cutOff: true,
      command: false,
      attempts: [
        { allowance: 3_000, finishReason: 'length', outputTokens: 3_000 },
        { allowance: 6_000, failed: 'the provider is rate limited', textLength: 0 },
      ],
    });
  });

  it('doubles what the adapters asked for when the policy named no allowance', async () => {
    const provider = new MockProvider([CUT_OFF, 'COMMAND: look']);
    const policy = new LlmPolicy({ adventure, provider });

    await policy.next(context());

    // The first attempt named no allowance, so the adapters' own 500 applied.
    // The retry asks for twice what the first attempt had.
    expect(provider.requests.map((request) => request.maxOutputTokens)).toEqual([undefined, 1_000]);
  });

  it('leaves alone a reply that ended for another reason, and its record says how it ended', async () => {
    // Only the service's own word for "cut off by the allowance" is a reason
    // to ask again with more room. A refusal, or a reply that stopped for a
    // reason of its own, would only cost more to ask again. The record keeps
    // the service's word, so that such a turn can be found.
    const provider = new MockProvider([{ text: '', finishReason: 'other' }, 'COMMAND: look']);
    const policy = new LlmPolicy({ adventure, provider, maxOutputTokens: ALLOWANCE });

    const command = await policy.next(context());

    expect(command).toBeNull();
    expect(provider.calls).toBe(1);
    expect(policy.metrics().lastReply).toMatchObject({
      cutOff: false,
      command: false,
      attempts: [{ allowance: 3_000, finishReason: 'other', textLength: 0 }],
    });
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

  it.each([1, 2, 3, 4, 5, 6, 20])('%i quiet turns are counted as %i, and are one freeze from three', async (turns) => {
    // The arithmetic, turn by turn. A turn is counted as the next turn begins,
    // so the last turn, which has no next, is counted once where the run ends.
    // Nothing is counted twice: a run of twenty quiet turns reads twenty.
    const waiting = { id: 'waiter', async next(): Promise<string | null> { return 'wait'; } };
    const result = await run({ adventure, policy: waiting, budgets: { maxTurns: turns, maxRepeatedStates: 3 } });
    expect(result.commands).toHaveLength(turns);
    expect(result.outcome).toBe('budget_exhausted');
    expect(result.longestUnchangedTurns).toBe(turns);
    expect(result.freezes).toBe(turns >= 3 ? 1 : 0);
  });

  it('writes each freeze to the transcript, on the turn where the streak reached three', async () => {
    const waiting = { id: 'waiter', async next(): Promise<string | null> { return 'wait'; } };
    const written = transcript();

    await run({ adventure, policy: waiting, transcript: written, maxTurns: 6 });

    // Six quiet turns, and one streak. It reached three on the third of them.
    expect(written.all().filter(record => record['type'] === 'freeze')).toEqual([{ type: 'freeze', turn: 2, streak: 3 }]);
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
    expect(report.solvedByTurns).toEqual([
      { world: 'hotfix-2-4-1', seed: second!.seed, turns: 12 },
      { world: 'hotfix-2-4-1', seed: first!.seed, turns: 17 },
    ]);
    expect(report.unsolved).toEqual([
      { world: 'hotfix-2-4-1', seed: third!.seed, reason: 'The agent used all 25 turns.', turns: 25 },
    ]);

    const text = describeLedger(ledger);
    const lines = text.split('\n');
    const at = (start: string): number => lines.findIndex((line) => line.startsWith(start));
    expect(at('successes 2 of 3 attempted')).toBeGreaterThanOrEqual(0);
    expect(at('solved, fewest turns first:')).toBeGreaterThan(at('successes 2 of 3 attempted'));
    expect(lines[at('solved, fewest turns first:')]).toBe(
      `solved, fewest turns first: seed ${second!.seed} of hotfix-2-4-1 in 12 turns, seed ${first!.seed} of hotfix-2-4-1 in 17 turns`);
    // Two solved runs, 12 and 17 turns: the median lies halfway between them.
    expect(at('turns to solve, the median of the solved runs: 14.5')).toBeGreaterThan(at('solved, fewest turns first:'));
    expect(lines.some((line) => line.startsWith(
      `  seed ${third!.seed} of hotfix-2-4-1: not solved, 25 turns, because The agent used all 25 turns.`))).toBe(true);
  });

  it('names the world of every run, because a seed is the seed of one world', () => {
    // A plan of two worlds has a seed 1 in each. Listed by seed alone, "seed 1"
    // would be two runs.
    const plan = buildPlan({
      worlds: [hotfix, adventure],
      runsPerWorld: 2,
      model: { provider: 'openrouter', model: 'deepseek/deepseek-chat' },
      strategy: 'structured',
      temperature: 0 as const,
      promptVersion: 'llm-prompt-v4',
      promptHash: 'sha256:prompt',
      budgets: BATCH_BUDGETS,
      prices: { source: 'test', checkedAt: '2026-11-25T00:00:00Z', inputPerMillion: 0.3, outputPerMillion: 0.9 },
      sourceRevision: 'test',
      maxTotalUsd: 1,
      maxPerRunUsd: 0.1,
    });
    const ledger = openLedger(plan);
    for (const cell of ledger.cells) {
      Object.assign(cell, { status: 'attempted' as const, chargeState: 'settled' as const, outcome: 'budget_exhausted',
        turns: 25, reason: 'The agent used all 25 turns.' });
    }
    expect(summarise(ledger).unsolved.map(run => `${run.world}:${run.seed}`).sort()).toEqual([
      'hotfix-2-4-1:1', 'hotfix-2-4-1:2', 'mission-impossible:1', 'mission-impossible:2',
    ]);
    const listed = describeLedger(ledger).split('\n').filter(line => line.includes(': not solved,'));
    expect(listed).toHaveLength(4);
    for (const line of listed) expect(line).toMatch(/^ {2}seed [12] of (hotfix-2-4-1|mission-impossible): not solved, /);
  });
});

describe('a retry the run cannot afford', () => {
  it('ends the run as out of tokens, and the attempt that was made is counted and written down', async () => {
    // The first reply is cut off, and is real: it is paid for. The second
    // request is refused before it is sent, because the run has no room for
    // it. That is neither a crash nor a lost turn. The run ends as out of
    // tokens, the first attempt's tokens are in its final figures, and its
    // record says why nothing followed it.
    let calls = 0;
    const provider: LlmProvider = {
      id: 'mock',
      model: 'mock-model',
      async complete() {
        calls += 1;
        if (calls === 1) {
          return { text: '', finishReason: 'length', reasoningTokens: 3_000, usage: { inputTokens: 10, outputTokens: 3_010 } };
        }
        throw new RunBudgetExceeded('The next model request would exceed the token budget.');
      },
    };
    const policy = new LlmPolicy({ adventure, provider, maxOutputTokens: ALLOWANCE });
    const written = transcript();

    const result = await run({ adventure, policy, transcript: written, maxTurns: 3 });

    expect(calls).toBe(2);
    expect(result.outcome).toBe('budget_exhausted');
    expect(result.reason).toBe('The next model request would exceed the token budget.');
    expect(result.tokensUsed).toBe(3_020);
    expect(result.cutOffReplies).toBe(1);
    const records = written.all();
    const reply = records.find(record => record['type'] === 'reply');
    expect(reply).toMatchObject({
      turn: 0,
      ended: 'The next model request would exceed the token budget.',
      data: { cutOff: true, command: false },
    });
    expect((reply!['data'] as ReplyRecord).attempts).toHaveLength(1);
    expect(records.find(record => record['type'] === 'metrics')?.['data']).toMatchObject({ cutOffReplies: 1, retriedReplies: 0, tokensUsed: 3_020 });
  });

  it('does not write a turn\u2019s reply twice when the very first request is the one refused', async () => {
    // Turn 0 is answered. Turn 1 is refused before it is sent. The policy
    // still holds turn 0's reply, and that reply must not be written again
    // under turn 1, nor counted twice.
    let calls = 0;
    const provider: LlmProvider = {
      id: 'mock',
      model: 'mock-model',
      async complete() {
        calls += 1;
        if (calls === 1) return { text: 'COMMAND: look', usage: { inputTokens: 10, outputTokens: 5 } };
        throw new RunBudgetExceeded('The next model request would exceed the token budget.');
      },
    };
    const policy = new LlmPolicy({ adventure, provider, maxOutputTokens: ALLOWANCE });
    const written = transcript();

    const result = await run({ adventure, policy, transcript: written, maxTurns: 3 });

    expect(result.outcome).toBe('budget_exhausted');
    const replies = written.all().filter(record => record['type'] === 'reply');
    expect(replies.map(record => record['turn'])).toEqual([0]);
    expect(result.tokensUsed).toBe(15);
  });
});
