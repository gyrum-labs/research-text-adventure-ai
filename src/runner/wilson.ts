/*
 * The Wilson score interval.
 *
 * A success rate on its own is a number with no error bar. The Wilson
 * interval gives one, and unlike the normal approximation it behaves at the
 * edges: a cell with 0 successes out of 10 gets an interval that says so,
 * rather than a degenerate point at zero.
 *
 * The score interval is the one to use for a proportion near 0 or 1, and it
 * is what the report uses for every cell of the matrix.
 */

/** The two-sided 95% critical value. */
export const Z_95 = 1.959963984540054;

export interface Interval {
  /** The point estimate. */
  estimate: number;
  /** The lower bound, never below zero. */
  lower: number;
  /** The upper bound, never above one. */
  upper: number;
}

/**
 * The Wilson score interval for a binomial proportion.
 *
 * `successes` and `total` are counts, not rates, because the interval depends
 * on the sample size and a rate alone cannot say what that was.
 */
export function wilsonInterval(successes: number, total: number, z = Z_95): Interval {
  if (total <= 0) {
    return { estimate: 0, lower: 0, upper: 1 };
  }

  const estimate = successes / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const centre = (estimate + z2 / (2 * total)) / denominator;
  const halfWidth =
    (z / denominator) * Math.sqrt((estimate * (1 - estimate)) / total + z2 / (4 * total * total));

  return {
    estimate,
    // The estimate always sits inside its own interval, even where the
    // arithmetic puts the bound a hair below it at the edges.
    lower: Math.min(Math.max(0, centre - halfWidth), estimate),
    upper: Math.max(Math.min(1, centre + halfWidth), estimate),
  };
}

/** The median of a list of numbers. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}
