/*
 * Experiment 02: the state beside the observation.
 *
 * The experiment is the gap. The left column is what is true in the world, the
 * right column is what the agent is allowed to see, and the difference between
 * them is the whole point of the measurement.
 */

import { describe, expect, it } from 'vitest';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';
import { GOLD_PATH } from '../../src/adventures/mission-impossible/gold-path.js';
import {
  buildGoldPathComparison,
  renderComparison,
} from '../../src/cli/exp-02.js';

describe('the exp-02 comparison', () => {
  const comparison = buildGoldPathComparison(adventure);

  it('walks the whole gold path', () => {
    expect(comparison).toHaveLength(GOLD_PATH.length);
    expect(comparison.map((turn) => turn.command)).toEqual(GOLD_PATH);
  });

  it('shows the location the way the state knows it and the way the agent knows it', () => {
    const first = comparison[0]!;

    expect(first.rows.some((row) => row.truth.startsWith('location:'))).toBe(true);
    expect(first.rows.some((row) => row.seen.startsWith('location:'))).toBe(true);
  });

  it('marks the facts the agent has not earned', () => {
    const first = comparison[0]!;
    const hidden = first.rows.filter((row) => row.seen.includes('not mentioned'));

    expect(hidden.length).toBeGreaterThan(0);
    for (const row of hidden) {
      expect(row.seen).toContain('—');
      expect(row.seen).toMatch(/\(not mentioned — .+\)/);
    }
  });

  it('hides the safe code until the manual has been read', () => {
    const beforeReading = comparison.slice(0, GOLD_PATH.indexOf('read manual'));
    const afterReading = comparison.slice(GOLD_PATH.indexOf('read manual') + 1);

    for (const turn of beforeReading) {
      const codeRows = turn.rows.filter((row) => row.truth.startsWith('safe code:'));
      expect(codeRows).toHaveLength(1);
      expect(codeRows[0]!.seen).toContain('not mentioned');
    }

    const disclosed = afterReading.filter((turn) =>
      turn.rows.some(
        (row) => row.truth.startsWith('safe code:') && !row.seen.includes('not mentioned'),
      ),
    );
    expect(disclosed.length).toBeGreaterThan(0);
  });

  it('hides the contents of a closed locker and shows them once it is open', () => {
    const beforeOpening = comparison.slice(0, GOLD_PATH.indexOf('open locker'));
    const afterOpening = comparison.slice(GOLD_PATH.indexOf('open locker') + 1);

    for (const turn of beforeOpening) {
      const lockerRows = turn.rows.filter((row) => row.truth.startsWith('locker holds:'));
      expect(lockerRows).toHaveLength(1);
      expect(lockerRows[0]!.seen).toContain('not mentioned');
    }

    for (const turn of afterOpening) {
      const lockerRows = turn.rows.filter((row) => row.truth.startsWith('locker holds:'));
      expect(lockerRows).toHaveLength(0);
    }
  });

  it('never prints the answer on the right-hand side before the manual is read', () => {
    for (const turn of comparison) {
      const readTheManual = comparison
        .slice(0, comparison.indexOf(turn))
        .some((earlier) => earlier.command === 'read manual');

      for (const row of turn.rows) {
        if (!row.truth.startsWith('safe code:')) continue;
        if (readTheManual) continue;
        expect(row.seen, 'the code was shown before the manual was read').toContain('not mentioned');
      }
    }
  });

  it('keeps the code once the agent has read the manual', () => {
    const disclosed = comparison.filter((turn) =>
      turn.rows.some(
        (row) => row.truth.startsWith('safe code:') && !row.seen.includes('not mentioned'),
      ),
    );

    expect(disclosed.length).toBeGreaterThan(0);
    for (const turn of disclosed) {
      expect(comparison.indexOf(turn)).toBeGreaterThan(GOLD_PATH.indexOf('read manual'));
    }
  });

  it('renders a two-column table', () => {
    const rendered = renderComparison(comparison);

    expect(rendered).toContain('STATE');
    expect(rendered).toContain('OBSERVATION');
    expect(rendered).toContain('location: briefing');
    expect(rendered).toContain('not mentioned');
  });
});
