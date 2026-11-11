/*
 * The hypotheses.
 *
 * Five claims, each falsified or supported by the matrix. Not one of them is
 * an impression: each is a comparison between two cells that differ in one
 * thing, or a count over the failures.
 *
 * The comparisons are only meaningful because of the conditions. Holding the
 * model, the renderer, the masking and the strategy still except for one
 * variable is what makes a difference attributable to that variable.
 */

import type { CellRun, CellSummary } from './matrix.js';
import type { FailureCode } from './classify.js';

export type Verdict = 'supported' | 'falsified' | 'untested';

export interface HypothesisVerdict {
  id: 'H1' | 'H2' | 'H3' | 'H4' | 'H5';
  hypothesis: string;
  verdict: Verdict;
  reason: string;
}

/** The failure codes where the agent's output was not a usable command. */
const MALFORMED: FailureCode[] = ['F1', 'F2'];

/** The failure codes where the command was fine and the reasoning was not. */
const REASONING: FailureCode[] = ['F3', 'F4', 'F5', 'F6', 'F7'];

/** The pooled success rate of a set of conditions. */
function pooledSuccess(summaries: CellSummary[], conditions: string[]): number | null {
  const cells = summaries.filter((summary) => conditions.includes(summary.condition));
  const runs = cells.reduce((total, cell) => total + cell.runs, 0);
  if (runs === 0) return null;
  const successes = cells.reduce((total, cell) => total + cell.successes, 0);
  return successes / runs;
}

/** The pooled median turns of a set of conditions. */
function pooledTurns(summaries: CellSummary[], conditions: string[]): number | null {
  const cells = summaries.filter((summary) => conditions.includes(summary.condition));
  if (cells.length === 0) return null;
  const total = cells.reduce((sum, cell) => sum + cell.medianTurns * cell.runs, 0);
  const runs = cells.reduce((sum, cell) => sum + cell.runs, 0);
  return runs === 0 ? null : total / runs;
}

/** The success rates of two conditions, when both have runs. */
function compare(
  summaries: CellSummary[],
  better: string,
  worse: string,
): { rate: number | null; other: number | null } {
  return {
    rate: pooledSuccess(summaries, [better]),
    other: pooledSuccess(summaries, [worse]),
  };
}

/**
 * Evaluate the five hypotheses against a matrix.
 *
 * Every verdict says what it compared, so a reader can check the reasoning
 * rather than take it on trust.
 */
export function evaluateHypotheses(
  summaries: CellSummary[],
  runs: CellRun[],
): HypothesisVerdict[] {
  const verdicts: HypothesisVerdict[] = [];

  // H1: a capable agent solves the mission most of the time.
  const pooled = pooledSuccess(summaries, summaries.map((summary) => summary.condition));
  verdicts.push({
    id: 'H1',
    hypothesis: 'A capable LLM agent solves the mission ≥ 80% of runs within a 30-turn budget',
    verdict: pooled === null ? 'untested' : pooled >= 0.8 ? 'supported' : 'falsified',
    reason:
      pooled === null
        ? 'No cell produced any runs.'
        : `The pooled success rate across every cell is ${(pooled * 100).toFixed(1)}%, including the no-history control, against a threshold of 80%.`,
  });

  // H2: masking the action space helps. E and B differ only in the masking.
  const masking = compare(summaries, 'E', 'B');
  verdicts.push({
    id: 'H2',
    hypothesis: 'Masking the action space to legal commands raises the success rate',
    verdict:
      masking.rate === null || masking.other === null
        ? 'untested'
        : masking.rate > masking.other
          ? 'supported'
          : 'falsified',
    reason:
      masking.rate === null || masking.other === null
        ? 'One of the two cells produced no runs.'
        : `The masked condition E succeeded on ${(masking.rate * 100).toFixed(1)}% of runs and the unmasked condition B on ${(masking.other * 100).toFixed(1)}%. The two differ only in the masking.`,
  });

  // H3: a structured observation beats prose. B and A differ only in the renderer.
  const format = compare(summaries, 'B', 'A');
  verdicts.push({
    id: 'H3',
    hypothesis: 'A structured observation beats prose for multi-step reasoning',
    verdict:
      format.rate === null || format.other === null
        ? 'untested'
        : format.rate > format.other
          ? 'supported'
          : 'falsified',
    reason:
      format.rate === null || format.other === null
        ? 'One of the two cells produced no runs.'
        : `The JSON condition B succeeded on ${(format.rate * 100).toFixed(1)}% of runs and the prose condition A on ${(format.other * 100).toFixed(1)}%. The two differ only in the rendering.`,
  });

  // H4: the failures are reasoning failures, not malformed output.
  const counts = new Map<FailureCode, number>();
  for (const run of runs) {
    const code = run.metrics?.failure;
    if (code === null || code === undefined) continue;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  const malformed = MALFORMED.reduce((total, code) => total + (counts.get(code) ?? 0), 0);
  const reasoning = REASONING.reduce((total, code) => total + (counts.get(code) ?? 0), 0);
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  verdicts.push({
    id: 'H4',
    hypothesis: 'Most failures are not parsing failures but reasoning/ordering failures',
    verdict: total === 0 ? 'untested' : malformed <= total / 2 ? 'supported' : 'falsified',
    reason:
      total === 0
        ? 'No run failed.'
        : `${malformed} of the ${total} failures were malformed output and ${reasoning} were reasoning, ordering or planning failures.`,
  });

  // H5: the full history dilutes the context. C and E differ only in the strategy.
  const structured = pooledSuccess(summaries, ['C']);
  const full = pooledSuccess(summaries, ['E']);
  const structuredTurns = pooledTurns(summaries, ['C']);
  const fullTurns = pooledTurns(summaries, ['E']);
  verdicts.push({
    id: 'H5',
    hypothesis: 'Full transcript history causes context dilution versus a structured memory summary',
    verdict:
      structured === null || full === null || structuredTurns === null || fullTurns === null
        ? 'untested'
        : full < structured && fullTurns > structuredTurns
          ? 'supported'
          : 'falsified',
    reason:
      structured === null || full === null
        ? 'One of the two cells produced no runs.'
        : `The structured condition C succeeded on ${(structured * 100).toFixed(1)}% of runs in ${structuredTurns!.toFixed(1)} turns, the full-history condition E on ${(full * 100).toFixed(1)}% in ${fullTurns!.toFixed(1)} turns. The two differ only in the context strategy.`,
  });

  return verdicts;
}
