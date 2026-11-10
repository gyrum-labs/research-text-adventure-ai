/*
 * The metrics.
 *
 * A success rate on its own says nothing about what to fix, so each run also
 * carries the process numbers. The metrics are computed from the transcript,
 * so the numbers and the evidence agree by construction.
 */

import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeMetrics, runFromRecords, PRICES } from '../../src/runner/metrics.js';
import { Transcript } from '../../src/runner/transcript.js';
import { run } from '../../src/runner/run.js';
import { MockProvider } from '../../src/agents/llm/provider.js';
import { LlmPolicy } from '../../src/agents/llm/policy.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';
import { GOLD_PATH } from '../../src/adventures/mission-impossible/gold-path.js';

const OPTIONS = { goldPathLength: GOLD_PATH.length };

describe('the metrics', () => {
  it('measure a perfect run as perfectly efficient', async () => {
    const provider = new MockProvider(GOLD_PATH.map((command) => `COMMAND: ${command}`));
    const policy = new LlmPolicy({ adventure, provider });
    const directory = mkdtempSync(join(tmpdir(), 'metrics-'));
    const path = join(directory, 'run.jsonl');
    const transcript = new Transcript(path, {
      type: 'header',
      runId: 'test',
      adventure: adventure.id,
      adventureVersion: adventure.version,
      adventureHash: 'sha256:test',
      policy: 'llm',
      provider: 'mock',
      model: 'mock-model',
      seed: 1,
      maxTurns: 30,
      startedAt: new Date().toISOString(),
      engineVersion: '0.1.0',
    });

    await run({ adventure, policy, transcript });
    transcript.close();

    const { readTranscript } = await import('../../src/runner/transcript.js');
    const metrics = computeMetrics(readTranscript(path), adventure, OPTIONS);

    expect(metrics.outcome).toBe('success');
    expect(metrics.turnsUsed).toBe(10);
    expect(metrics.efficiency).toBe(1);
    expect(metrics.wasteRatio).toBe(1);
    expect(metrics.goalsCompleted).toBe(2);
    expect(metrics.failure).toBeNull();
  });

  it('count the tokens the provider reported', async () => {
    const provider = new MockProvider(['COMMAND: look']);
    const policy = new LlmPolicy({ adventure, provider });
    const directory = mkdtempSync(join(tmpdir(), 'metrics-'));
    const path = join(directory, 'run.jsonl');
    const transcript = new Transcript(path, {
      type: 'header',
      runId: 'test',
      adventure: adventure.id,
      adventureVersion: adventure.version,
      adventureHash: 'sha256:test',
      policy: 'llm',
      provider: 'mock',
      model: 'mock-model',
      seed: 1,
      maxTurns: 30,
      startedAt: new Date().toISOString(),
      engineVersion: '0.1.0',
    });

    await run({ adventure, policy, transcript });
    transcript.close();

    const { readTranscript } = await import('../../src/runner/transcript.js');
    const metrics = computeMetrics(readTranscript(path), adventure, OPTIONS);

    expect(metrics.inputTokens).toBeGreaterThan(0);
    expect(metrics.outputTokens).toBeGreaterThan(0);
    expect(metrics.tokensUsed ?? metrics.inputTokens + metrics.outputTokens).toBeGreaterThan(0);
  });

  it('estimate the cost from the price table', () => {
    const metrics = computeMetrics(
      [
        {
          type: 'metrics',
          turn: 1,
          data: { turns: 1, inputTokens: 1_000_000, outputTokens: 1_000_000 },
        },
      ],
      adventure,
      { goldPathLength: 10, model: 'anthropic/claude-sonnet-4.5' },
    );

    const price = PRICES['anthropic/claude-sonnet-4.5']!;
    expect(metrics.estimatedCostUsd).toBeCloseTo(price.input + price.output, 5);
  });

  it('cost nothing when the model is free', () => {
    const metrics = computeMetrics(
      [{ type: 'metrics', turn: 1, data: { turns: 1, inputTokens: 1000, outputTokens: 1000 } }],
      adventure,
      { goldPathLength: 10, model: 'mock/mock-model' },
    );

    expect(metrics.estimatedCostUsd).toBe(0);
  });

  it('read the outcome and the turns out of a transcript', () => {
    const runView = runFromRecords([
      { type: 'command', turn: 0, raw: 'take keycard', verb: 'take', args: {} },
      { type: 'events', turn: 0, data: [{ type: 'action_succeeded', verb: 'take', message: 'ok', turn: 0 }] },
      { type: 'events', turn: 1, data: [{ type: 'run_ended', outcome: 'budget_exhausted', reason: 'out of turns', turn: 1 }] },
    ]);

    expect(runView.outcome).toBe('budget_exhausted');
    expect(runView.turns).toHaveLength(2);
    expect(runView.turns[0]!.command?.raw).toBe('take keycard');
    expect(runView.turns[0]!.outcome).toBe('succeeded');
  });

  it('count a command that named something out of scope as a hallucination', () => {
    const metrics = computeMetrics(
      [
        {
          type: 'observation',
          turn: 0,
          data: {
            visible: [{ id: 'keycard', name: 'keycard', description: '' }],
            inventory: [],
          },
        },
        {
          type: 'command',
          turn: 0,
          raw: 'take keycard',
          verb: 'take',
          args: { target: 'keycard' },
        },
        {
          type: 'events',
          turn: 0,
          data: [{ type: 'action_succeeded', verb: 'take', message: 'ok', turn: 0 }],
        },
        {
          type: 'observation',
          turn: 1,
          data: {
            visible: [{ id: 'keycard', name: 'keycard', description: '' }],
            inventory: [],
          },
        },
        {
          type: 'parse_error',
          turn: 1,
          raw: 'take the brass key',
          message: 'You can\'t see anything called "the brass key" here.\nYou can see: keycard.',
        },
        {
          type: 'events',
          turn: 1,
          data: [{ type: 'run_ended', outcome: 'budget_exhausted', reason: 'out of turns', turn: 2 }],
        },
      ],
      adventure,
      OPTIONS,
    );

    expect(metrics.hallucinationRate).toBeCloseTo(0.5);
  });

  it('measure how many turns the agent wasted before it found the fact', () => {
    const metrics = computeMetrics(
      [
        { type: 'state', turn: 0, hash: 'a' },
        { type: 'state', turn: 1, hash: 'a' },
        { type: 'state', turn: 2, hash: 'b' },
        { type: 'state', turn: 3, hash: 'b' },
      ],
      adventure,
      OPTIONS,
    );

    expect(metrics.explorationSteps).toBe(2);
  });

  it('measure whether the agent recovered after a failure', () => {
    const metrics = computeMetrics(
      [
        {
          type: 'command',
          turn: 0,
          raw: 'take desk',
          verb: 'take',
          args: { target: 'desk' },
        },
        {
          type: 'events',
          turn: 0,
          data: [{ type: 'action_failed', verb: 'take', message: 'no', turn: 0 }],
        },
        {
          type: 'command',
          turn: 1,
          raw: 'take keycard',
          verb: 'take',
          args: { target: 'keycard' },
        },
        {
          type: 'events',
          turn: 1,
          data: [{ type: 'action_succeeded', verb: 'take', message: 'ok', turn: 1 }],
        },
      ],
      adventure,
      OPTIONS,
    );

    expect(metrics.recoveryRate).toBe(1);
    expect(metrics.invalidActionRate).toBeCloseTo(0.5);
  });

  it('give a run with no failures a recovery rate of one', () => {
    const metrics = computeMetrics(
      [
        {
          type: 'command',
          turn: 0,
          raw: 'take keycard',
          verb: 'take',
          args: { target: 'keycard' },
        },
        {
          type: 'events',
          turn: 0,
          data: [{ type: 'action_succeeded', verb: 'take', message: 'ok', turn: 0 }],
        },
      ],
      adventure,
      OPTIONS,
    );

    expect(metrics.recoveryRate).toBe(1);
  });
});
