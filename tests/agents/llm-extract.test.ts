/*
 * The extraction chain.
 *
 * A model response is text, and the command in it has to be found without
 * guessing. The ladder is deterministic and the rung that worked is recorded,
 * so formatting drift is measured rather than hidden.
 */

import { describe, expect, it } from 'vitest';
import { extractCommand } from '../../src/agents/llm/extract.js';

const parses = (candidate: string): boolean =>
  ['take keycard', 'go corridor', 'open locker', 'read manual', 'look'].includes(
    candidate.trim().toLowerCase(),
  );

describe('the extraction chain', () => {
  it('takes the last COMMAND: line', () => {
    const result = extractCommand('COMMAND: take keycard', parses);

    expect(result.command).toBe('take keycard');
    expect(result.route).toBe('command_line');
  });

  it('takes the last COMMAND: line when there are several', () => {
    const result = extractCommand(
      'COMMAND: go corridor\nI changed my mind.\nCOMMAND: open locker',
      parses,
    );

    expect(result.command).toBe('open locker');
    expect(result.route).toBe('command_line');
  });

  it('takes the COMMAND: line even when it does not parse, so the agent gets the error', () => {
    const result = extractCommand('COMMAND: fly to the moon', parses);

    expect(result.command).toBe('fly to the moon');
    expect(result.route).toBe('command_line');
  });

  it('falls back to the last non-empty line when it parses', () => {
    const result = extractCommand('I should open the locker.\nopen locker', parses);

    expect(result.command).toBe('open locker');
    expect(result.route).toBe('last_line');
  });

  it('falls back to the first non-empty line when the last does not parse', () => {
    const result = extractCommand('take keycard\n\nand then something else', parses);

    expect(result.command).toBe('take keycard');
    expect(result.route).toBe('first_line');
  });

  it('strips code fences and prompt characters', () => {
    const result = extractCommand('```\n> COMMAND: take keycard\n```', parses);

    expect(result.command).toBe('take keycard');
    expect(result.route).toBe('command_line');
  });

  it('ignores the THINK: line', () => {
    const result = extractCommand('THINK: The keycard is on the desk.\nCOMMAND: take keycard', parses);

    expect(result.command).toBe('take keycard');
    expect(result.route).toBe('command_line');
  });

  it('gives nothing when nothing in the response is a command', () => {
    const result = extractCommand('THINK: I have no idea what to do here.', parses);

    expect(result.command).toBeNull();
    expect(result.route).toBe('none');
  });

  it('gives nothing for an empty response', () => {
    const result = extractCommand('', parses);

    expect(result.command).toBeNull();
    expect(result.route).toBe('none');
  });
});
