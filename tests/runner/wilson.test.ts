/*
 * The Wilson interval.
 *
 * The test values are the published ones, to four decimal places. An
 * interval that is nearly right is not an interval, it is a decoration.
 */

import { describe, expect, it } from 'vitest';
import { median, wilsonInterval } from '../../src/runner/wilson.js';

describe('the Wilson interval', () => {
  it('matches the published values to four decimal places', () => {
    const cases: Array<[number, number, number, number]> = [
      [0, 10, 0.0, 0.2775],
      [1, 10, 0.0179, 0.4042],
      [5, 10, 0.2366, 0.7634],
      [7, 10, 0.3968, 0.8922],
      [10, 10, 0.7225, 1.0],
      [0, 20, 0.0, 0.1611],
      [15, 20, 0.5313, 0.8881],
      [3, 7, 0.1582, 0.7495],
    ];

    for (const [successes, total, lower, upper] of cases) {
      const interval = wilsonInterval(successes, total);
      expect(interval.lower, `${successes}/${total} lower`).toBeCloseTo(lower, 4);
      expect(interval.upper, `${successes}/${total} upper`).toBeCloseTo(upper, 4);
    }
  });

  it('reports the point estimate', () => {
    expect(wilsonInterval(7, 10).estimate).toBeCloseTo(0.7);
  });

  it('keeps the bounds inside zero and one', () => {
    for (let successes = 0; successes <= 10; successes += 1) {
      const interval = wilsonInterval(successes, 10);
      expect(interval.lower).toBeGreaterThanOrEqual(0);
      expect(interval.upper).toBeLessThanOrEqual(1);
      expect(interval.lower).toBeLessThanOrEqual(interval.estimate);
      expect(interval.estimate).toBeLessThanOrEqual(interval.upper);
    }
  });

  it('narrows as the sample grows', () => {
    const small = wilsonInterval(5, 10);
    const large = wilsonInterval(50, 100);

    expect(large.upper - large.lower).toBeLessThan(small.upper - small.lower);
  });

  it('gives a cell with no runs the widest possible interval', () => {
    expect(wilsonInterval(0, 0)).toEqual({ estimate: 0, lower: 0, upper: 1 });
  });
});

describe('the median', () => {
  it('is the middle value of an odd list', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it('is the mean of the middle two of an even list', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('is zero for an empty list', () => {
    expect(median([])).toBe(0);
  });
});
