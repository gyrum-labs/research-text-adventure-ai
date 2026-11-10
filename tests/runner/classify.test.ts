/*
 * The failure classifier.
 *
 * The rules are unit-tested against synthetic runs, not only against real
 * ones, because a real run only ever exercises the categories it happens to
 * hit. Every category gets a transcript built for it.
 */

import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  categoryOf,
  classifyFailure,
  gatesOf,
  type ClassifiableRun,
  type ClassifiableTurn,
} from '../../src/runner/classify.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';

interface TurnSpec {
  raw?: string;
  verb?: string;
  args?: Record<string, string>;
  succeeded?: boolean;
  failed?: boolean;
  parseError?: string;
  visible?: string[];
  inventory?: string[];
  response?: string;
}

/** Build a synthetic run from a list of turns. */
function run(outcome: ClassifiableRun['outcome'], turns: TurnSpec[]): ClassifiableRun {
  const built: ClassifiableTurn[] = turns.map((spec, index) => ({
    turn: index,
    command:
      spec.raw === undefined
        ? null
        : { raw: spec.raw, verb: spec.verb ?? 'take', args: spec.args ?? {} },
    parseError: spec.parseError ?? null,
    outcome: spec.succeeded === true ? 'succeeded' : spec.failed === true ? 'failed' : 'none',
    visible: spec.visible ?? [],
    inventory: spec.inventory ?? [],
    response: spec.response ?? '',
  }));

  return { outcome, turns: built };
}

const BRIEFING = { visible: ['keycard', 'wall notice', 'desk'], inventory: [] };
const CORRIDOR = { visible: ['locker', 'fire extinguisher', 'vault door'], inventory: ['keycard'] };
const VAULT = {
  visible: ['bomb', 'red wire', 'blue wire', 'yellow wire', 'safe'],
  inventory: ['keycard', 'wire cutters', 'defusal manual'],
};

describe('the failure classifier', () => {
  it('gives a successful run no code at all', () => {
    const result = classifyFailure(run('success', [{ raw: 'take keycard', succeeded: true }]), adventure);

    expect(result).toBeNull();
  });

  it('gives every failed run exactly one code', () => {
    const runs: ClassifiableRun[] = [
      run('budget_exhausted', [{ parseError: 'I don\'t know the command "flibbertigibbet".' }]),
      run('budget_exhausted', [{ parseError: 'You can\'t see anything called "brass key" here.' }]),
      run('budget_exhausted', [
        { raw: 'take desk', failed: true, visible: BRIEFING.visible },
        { raw: 'take desk', failed: true, visible: BRIEFING.visible },
      ]),
      run('budget_exhausted', [
        { raw: 'cut yellow wire', verb: 'cut', failed: true, visible: VAULT.visible },
        { raw: 'read manual', verb: 'read', succeeded: true, args: { target: 'manual' }, visible: VAULT.visible },
      ]),
      run('budget_exhausted', [{ raw: 'look', succeeded: true, visible: BRIEFING.visible }]),
      run('failure', [{ raw: 'cut red wire', verb: 'cut', succeeded: true, visible: VAULT.visible }]),
      run('provider_error', [{ raw: 'look', succeeded: true, visible: BRIEFING.visible }]),
      run('provider_stopped', [{ raw: 'look', succeeded: true, visible: BRIEFING.visible }]),
    ];

    for (const candidate of runs) {
      const classification = classifyFailure(candidate, adventure);
      expect(classification, 'a failed run must have a code').not.toBeNull();
      expect(classification?.code).toMatch(/^F[1-9]$/);
    }
  });

  it('calls a run that never produced a command a parsing failure', () => {
    const result = classifyFailure(
      run('budget_exhausted', [{ parseError: 'I don\'t know the command "flibbertigibbet".' }]),
      adventure,
    );

    expect(result?.code).toBe('F1');
  });

  it('calls a run that named something out of scope a hallucination', () => {
    const result = classifyFailure(
      run('budget_exhausted', [
        {
          parseError: 'You can\'t see anything called "brass key" here.\nYou can see: keycard.',
          visible: BRIEFING.visible,
        },
      ]),
      adventure,
    );

    expect(result?.code).toBe('F2');
  });

  it('does not call an article a hallucination', () => {
    const result = classifyFailure(
      run('budget_exhausted', [
        {
          parseError: 'You can\'t see anything called "the keycard" here.\nYou can see: keycard.',
          visible: BRIEFING.visible,
        },
      ]),
      adventure,
    );

    expect(result?.code).not.toBe('F2');
  });

  it('calls a repeated failed action a planning failure', () => {
    const result = classifyFailure(
      run('budget_exhausted', [
        { raw: 'take desk', failed: true, visible: BRIEFING.visible },
        { raw: 'take desk', failed: true, visible: BRIEFING.visible },
      ]),
      adventure,
    );

    expect(result?.code).toBe('F3');
  });

  it('calls a gated action used too early an ordering failure', () => {
    const result = classifyFailure(
      run('budget_exhausted', [
        { raw: 'cut yellow wire', verb: 'cut', failed: true, visible: VAULT.visible },
        { raw: 'read manual', verb: 'read', succeeded: true, args: { target: 'manual' }, visible: VAULT.visible },
      ]),
      adventure,
    );

    expect(result?.code).toBe('F4');
  });

  it('calls a run that never found the fact an exploration failure', () => {
    const result = classifyFailure(
      run('budget_exhausted', [{ raw: 'look', succeeded: true, visible: CORRIDOR.visible }]),
      adventure,
    );

    expect(result?.code).toBe('F5');
  });

  it('calls a detonation a lethal trap', () => {
    const result = classifyFailure(
      run('failure', [{ raw: 'cut red wire', verb: 'cut', succeeded: true, visible: VAULT.visible }]),
      adventure,
    );

    expect(result?.code).toBe('F6');
  });

  it('calls a run that ran out of turns with nothing more specific a budget exhaustion', () => {
    const result = classifyFailure(
      run('budget_exhausted', [
        { raw: 'take keycard', succeeded: true, visible: BRIEFING.visible },
        { raw: 'read manual', verb: 'read', succeeded: true, args: { target: 'manual' }, visible: VAULT.visible },
        { raw: 'go vault', succeeded: true, visible: VAULT.visible },
      ]),
      adventure,
    );

    expect(result?.code).toBe('F7');
  });

  it('calls a provider failure a provider error', () => {
    const result = classifyFailure(
      run('provider_error', [{ raw: 'look', succeeded: true, visible: BRIEFING.visible }]),
      adventure,
    );

    expect(result?.code).toBe('F8');
  });

  it('calls an early stop an abstention', () => {
    const result = classifyFailure(
      run('provider_stopped', [{ raw: 'look', succeeded: true, visible: BRIEFING.visible }]),
      adventure,
    );

    expect(result?.code).toBe('F9');
  });

  it('prefers the terminal category over the behavioural one', () => {
    const result = classifyFailure(
      run('failure', [
        {
          parseError: 'You can\'t see anything called "brass key" here.',
          visible: BRIEFING.visible,
        },
        { raw: 'cut red wire', verb: 'cut', succeeded: true, visible: VAULT.visible },
      ]),
      adventure,
    );

    expect(result?.code).toBe('F6');
  });

  it('never calls the model, and never reads anything but the run and the adventure', () => {
    const source = classifyFailure.toString();
    expect(source).not.toContain('fetch');
    expect(source).not.toContain('await');
  });
});

describe('the categories', () => {
  it('are nine, and every one has a name and a description', () => {
    expect(CATEGORIES).toHaveLength(9);

    for (const category of CATEGORIES) {
      expect(category.name.length).toBeGreaterThan(0);
      expect(category.description.length).toBeGreaterThan(0);
    }
  });

  it('cover every code from F1 to F9 exactly once', () => {
    const codes = CATEGORIES.map((category) => category.code).sort();
    expect(codes).toEqual(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9']);
  });

  it('are found by their code', () => {
    expect(categoryOf('F4').name).toBe('ordering / precondition');
  });
});

describe('the gates in the adventure', () => {
  it('are the actions that need a fact the agent has to read first', () => {
    const gates = gatesOf(adventure);

    expect(gates).toHaveLength(1);
    expect(gates[0]!.flag).toBe('manual_read');
    expect(gates[0]!.object).toBe('manual');
    expect(gates[0]!.verbs).toContain('cut');
  });
});
