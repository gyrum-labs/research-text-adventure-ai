/*
 * The page game's limits, stated once.
 *
 * The page game is the project's measuring instrument, and these four numbers
 * say how much work one run may do. Every way into the page game takes them
 * from here: the batch that records runs, and the live page a person watches.
 * The specification's section on limits says the same.
 *
 * They changed on 25 November 2026, at the owner's decision (warp#23474),
 * after the records showed the old numbers spending a run's budget before the
 * model could use it. An output cap of 300 tokens paid for a model's hidden
 * reasoning before it paid for any reply, so the reply came back with nothing
 * in it and the turn was spent. Twenty turns ended runs that were two to four
 * moves from finishing. A result recorded under the old limits is never pooled
 * with a result recorded under these.
 */
import { CUT_OFF_RETRIES } from '../agents/policy.js';

export const PAGE_GAME_LIMITS = Object.freeze({
  /** Turns a run may take. */
  maxTurns: 25,
  /** Tokens a run may spend, input and output, reasoning included. */
  maxTotalTokens: 40_000,
  /** Output tokens a request asks for. A reply cut off by it is asked for again with the room doubled. */
  maxOutputTokensPerTurn: 3_000,
  /** Wall-clock milliseconds a run may take. */
  maxWallClockMs: 120_000,
});

/** The most output tokens one request can come to ask for, after every retry on a cut-off reply. */
export const MOST_OUTPUT_TOKENS_IN_ONE_REQUEST: number = PAGE_GAME_LIMITS.maxOutputTokensPerTurn * 2 ** CUT_OFF_RETRIES;
