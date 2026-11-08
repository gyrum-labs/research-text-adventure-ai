/*
 * Experiment 03, as it is printed.
 *
 * The output is the deliverable a reader sees, so it gets checked like one.
 */

import { describe, expect, it } from 'vitest';
import { runExp03 } from '../../src/cli/exp-03.js';
import { createProvider, MOCK_RESPONSES } from '../../src/cli/provider.js';
import type { MockProvider } from '../../src/agents/llm/provider.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';
import { GOLD_PATH } from '../../src/adventures/mission-impossible/gold-path.js';

describe('the exp-03 output', () => {
  it('runs the whole game offline against the mock provider', async () => {
    const output = await runExp03(adventure, { provider: createProvider('mock') });

    expect(output).toContain('outcome:    success');
    expect(output).toContain('turns:      10');
    expect(output).toContain('parse errors: 0');
  });

  it('shows every command the agent issued', async () => {
    const output = await runExp03(adventure, { provider: createProvider('mock') });

    GOLD_PATH.forEach((command, index) => {
      expect(output).toContain(`turn ${index + 1}  COMMAND: ${command}`);
    });
  });

  it('shows what the world said back', async () => {
    const output = await runExp03(adventure, { provider: createProvider('mock') });

    expect(output).toContain('You open the locker.');
    expect(output).toContain('The yellow wire parts with a snap.');
  });

  it('records the prompt hash, so a result can be tied to the exact prompt', async () => {
    const output = await runExp03(adventure, { provider: createProvider('mock') });

    expect(output).toMatch(/prompt:\s+sha256:[0-9a-f]{64}/);
  });

  it('records which rung of the extraction ladder worked', async () => {
    const output = await runExp03(adventure, { provider: createProvider('mock') });

    expect(output).toContain('extraction: command_line 10');
  });

  it('makes no network call to do any of it', async () => {
    const provider = createProvider('mock') as MockProvider;
    await runExp03(adventure, { provider });

    expect(provider.calls).toBe(10);
  });
});

describe('the mock provider answers', () => {
  it('are the gold path in the output envelope', () => {
    expect(MOCK_RESPONSES).toHaveLength(GOLD_PATH.length);

    MOCK_RESPONSES.forEach((response, index) => {
      expect(response).toContain(`COMMAND: ${GOLD_PATH[index]}`);
    });
  });
});
