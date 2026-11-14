/*
 * The limits a watched run is living within.
 *
 * A run is bounded before it starts, and the person watching it deserves to
 * see how much of those bounds it has used while it is still going, and to be
 * told plainly which bound stopped it. Both answers come from what the server
 * already streams: the caps from the run's own metadata, the usage from the
 * records the server sent. Nothing here asks the server for more.
 */

import { describe, expect, it } from 'vitest';
import { describeLimits, describeStop, type RunBudgetView } from '../../src/web/limits.js';

const BUDGET: RunBudgetView = { maxTurns: 20, maxTotalTokens: 30_000, maxWallClockMs: 120_000 };

describe('the limits line', () => {
  it('shows what is used against each cap', () => {
    const line = describeLimits(BUDGET, { turn: 5, tokensUsed: 12_400, elapsedMs: 38_000 });
    expect(line).toContain('turn 5 of 20');
    expect(line).toContain('12,400 of 30,000 tokens');
    expect(line).toContain('38s of 120s');
  });

  it('says when the token count is an estimate', () => {
    const line = describeLimits(BUDGET, { turn: 3, tokensUsed: 4_000, tokensEstimated: true, elapsedMs: 9_000 });
    expect(line).toContain('estimated');
  });

  it('does not count a measured count as estimated', () => {
    const line = describeLimits(BUDGET, { turn: 3, tokensUsed: 4_000, elapsedMs: 9_000 });
    expect(line).not.toContain('estimated');
  });

  it('shows nothing it has not been told', () => {
    const line = describeLimits(BUDGET, {});
    expect(line).toContain('turn 0 of 20');
    expect(line).toContain('0 of 30,000 tokens');
    expect(line).toContain('0s of 120s');
  });

  it('never shows a negative remainder', () => {
    const line = describeLimits(BUDGET, { turn: 500, tokensUsed: 99_999, elapsedMs: 999_000 });
    expect(line).toContain('turn 20 of 20');
    expect(line).toContain('30,000 of 30,000 tokens');
    expect(line).toContain('120s of 120s');
    expect(line).not.toMatch(/-\d/);
  });
});

describe('the stop explanation', () => {
  it('reports a completed mission as a completion, not a failure', () => {
    const line = describeStop(BUDGET, { outcome: 'success', reason: 'Every objective was met.', turn: 18 });
    expect(line).toContain('completed');
    expect(line.toLowerCase()).not.toContain('failure');
  });

  it('names the turn cap when the reason is the turn cap', () => {
    const line = describeStop(BUDGET, { outcome: 'budget_exhausted', reason: 'The agent used all 20 turns.', turn: 20 });
    expect(line).toContain('turn limit');
    expect(line).toContain('The agent used all 20 turns.');
  });

  it('names the token cap when the reason is the token budget', () => {
    const line = describeStop(BUDGET, {
      outcome: 'budget_exhausted',
      reason: 'The run used 30,150 tokens, over its ceiling of 30,000.',
      tokensUsed: 30_150,
    });
    expect(line).toContain('token limit');
  });

  it('names the clock when the reason is the wall clock', () => {
    const line = describeStop(BUDGET, {
      outcome: 'budget_exhausted',
      reason: 'The run used all of its 120000ms of wall-clock time.',
      elapsedMs: 120_000,
    });
    expect(line).toContain('time limit');
  });

  it('names the loop guard and does not call it a budget', () => {
    const line = describeStop(BUDGET, {
      outcome: 'loop_detected',
      reason: 'The agent returned to the same state 3 times in a row and stopped making progress.',
    });
    expect(line).toContain('repeated state');
    expect(line).not.toContain('limit');
  });

  it('names a provider failure without inventing a budget', () => {
    const line = describeStop(BUDGET, { outcome: 'provider_error', reason: 'The provider failed 3 times in a row.' });
    expect(line).toContain('provider');
  });

  it('reports a stop the watcher asked for as a stop', () => {
    const line = describeStop(BUDGET, { outcome: 'provider_stopped', reason: 'The run was stopped.' });
    expect(line).toContain('stopped');
  });

  it('keeps the reason the server sent visible in every case', () => {
    for (const progress of [
      { outcome: 'success', reason: 'Every objective was met.' },
      { outcome: 'budget_exhausted', reason: 'The agent used all 20 turns.' },
      { outcome: 'loop_detected', reason: 'The agent returned to the same state 3 times in a row and stopped making progress.' },
      { outcome: 'provider_error', reason: 'The provider failed 3 times in a row.' },
    ]) {
      expect(describeStop(BUDGET, progress)).toContain(progress.reason);
    }
  });
});
