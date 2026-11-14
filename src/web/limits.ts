/*
 * The limits a watched run is living within.
 *
 * Everything this module says comes from what the server already streamed:
 * the caps from the run's own metadata, the usage and turn from the records
 * that accompany them, and the elapsed time from the watcher's own clock. It
 * never asks the server for more, because a progress display that generated
 * traffic would be a progress display working against the run it describes.
 */

/** The caps a run is held to, as the run reported them. */
export interface RunBudgetView {
  maxTurns: number;
  maxTotalTokens: number;
  maxWallClockMs: number;
}

/** What has been seen of the run so far. */
export interface RunProgress {
  turn?: number;
  tokensUsed?: number;
  /** The server said this count is its own estimate rather than a measurement. */
  tokensEstimated?: boolean;
  /** Milliseconds since the run started, on the watcher's clock. */
  elapsedMs?: number;
  outcome?: string;
  reason?: string;
}

/** Show a number against its cap, clamped so it never reads below zero. */
function usedOf(value: number | undefined, cap: number): number {
  return Math.max(0, Math.min(Math.floor(value ?? 0), cap));
}

/** Thousands separators, because 30000 tokens reads worse than 30,000. */
function grouped(value: number): string {
  return value.toLocaleString('en-US');
}

/** One line: what the run has used against each cap. */
export function describeLimits(budget: RunBudgetView, progress: RunProgress): string {
  const turns = usedOf(progress.turn, budget.maxTurns);
  const tokens = usedOf(progress.tokensUsed, budget.maxTotalTokens);
  const seconds = usedOf(Math.ceil((progress.elapsedMs ?? 0) / 1000), Math.ceil(budget.maxWallClockMs / 1000));
  const estimate = progress.tokensEstimated === true ? ' (estimated)' : '';
  return `turn ${turns} of ${budget.maxTurns} · ${grouped(tokens)} of ${grouped(budget.maxTotalTokens)} tokens${estimate} · ${seconds}s of ${Math.ceil(budget.maxWallClockMs / 1000)}s`;
}

/** Which bound applies to an outcome, in the words a reader can act on. */
function boundFor(progress: RunProgress): string | null {
  const reason = progress.reason ?? '';
  if (progress.outcome === 'loop_detected') return 'The loop guard stopped the run after a repeated state.';
  if (progress.outcome === 'provider_error') return 'The run stopped on a provider failure.';
  if (progress.outcome === 'provider_stopped') return 'The run was stopped at the request of the watcher.';
  if (progress.outcome === 'budget_exhausted') {
    if (/turn/i.test(reason)) return 'The run reached the turn limit.';
    if (/token/i.test(reason)) return 'The run reached the token limit.';
    if (/wall.clock|time/i.test(reason)) return 'The run reached the time limit.';
  }
  return null;
}

/**
 * Two lines: what stopped the run, and the reason the server sent.
 *
 * The server's own reason stays visible in every case. The added sentence
 * only names the bound, so a reader never has to infer which limit a reason
 * was talking about, and a completed mission is never dressed up as a
 * failure.
 */
export function describeStop(budget: RunBudgetView, progress: RunProgress): string {
  const reason = progress.reason ?? '';
  if (progress.outcome === 'success') return `The mission was completed. ${reason}`;
  const bound = boundFor(progress);
  const stated = reason.length > 0 ? ` ${reason}` : '';
  if (bound === null) {
    const label = progress.outcome === undefined ? 'The run ended.' : `The run ended (${progress.outcome}).`;
    return `${label}${stated}`;
  }
  return `${bound}${stated}`;
}
