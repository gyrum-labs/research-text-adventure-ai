/*
 * Published prices, checked at plan time.
 *
 * A reservation is only as honest as the prices it is computed from, and a
 * model the price table does not know must not silently price at zero: the
 * second batch returned a bill of zero for exactly that reason. These checks
 * pin the lookup that turns a model id into dated published prices.
 */

import { describe, expect, it, vi } from 'vitest';
import { pricesFor } from '../../src/cli/batch.js';

const CATALOG = {
  data: [
    { id: 'test/cheap', pricing: { prompt: '0.00000015', completion: '0.00000060' } },
    { id: 'test/unpriced', pricing: {} },
  ],
};

function catalogResponse(): Response {
  return Response.json(CATALOG);
}

describe('published prices for a model', () => {
  it('returns the dated prices the provider publishes', async () => {
    const fetch = vi.fn().mockResolvedValue(catalogResponse());
    const prices = await pricesFor('test/cheap', fetch);

    expect(prices.inputPerMillion).toBeCloseTo(0.15, 10);
    expect(prices.outputPerMillion).toBeCloseTo(0.6, 10);
    expect(prices.source).toContain('openrouter.ai');
    expect(prices.checkedAt).toBeTruthy();
  });

  it('refuses a model with no published prices instead of pricing it at zero', async () => {
    const fetch = vi.fn().mockResolvedValue(catalogResponse());
    await expect(pricesFor('test/unknown-model', fetch)).rejects.toThrow('test/unknown-model');
  });

  it('refuses when the catalogue cannot be read', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('the socket connection was closed'));
    await expect(pricesFor('test/cheap', fetch)).rejects.toThrow('socket');
  });
});
