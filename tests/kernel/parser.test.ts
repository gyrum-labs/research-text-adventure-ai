import { describe, expect, it } from 'vitest';
import type { GameState } from '../../src/kernel/types.js';
import { parseCommand } from '../../src/kernel/parser.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';

const start = (): GameState => structuredClone(adventure.initial);

function parse(raw: string, state: GameState = start()) {
  return parseCommand(adventure, state, raw);
}

describe('the parser', () => {
  it('reads a plain command', () => {
    const result = parse('take keycard');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.command.verb).toBe('take');
    expect(result.command.args['target']).toBe('keycard');
  });

  it('ignores the prompt marker and the case', () => {
    const result = parse('> TAKE KeyCard');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.command.args['target']).toBe('keycard');
  });

  it('accepts a synonym', () => {
    expect(parse('get keycard').ok).toBe(true);
    expect(parse('grab keycard').ok).toBe(true);
  });

  it('accepts a two-word synonym', () => {
    const result = parse('pick up keycard');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.command.verb).toBe('take');
  });

  it('splits two arguments on the connective', () => {
    const state = { ...start(), roomId: 'vault', inventory: ['cutters'] };
    const result = parse('cut yellow wire with cutters', state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.command.args['target']).toBe('wire_yellow');
    expect(result.command.args['with']).toBe('cutters');
  });

  it('rejects an unknown verb and says what is known', () => {
    const result = parse('frobnicate');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('frobnicate');
    expect(result.message).toContain('take');
  });

  it('rejects an empty command', () => {
    const result = parse('   ');
    expect(result.ok).toBe(false);
  });

  it('says what is visible when an object is not here', () => {
    const result = parse('take bomb');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('bomb');
    expect(result.message).toContain("here");
  });

  it('says what is carried when the tool is not in the inventory', () => {
    const result = parse('cut yellow wire with cutters', { ...start(), roomId: 'vault' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('carrying');
  });

  it('resolves an alias', () => {
    const result = parse('take card');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.command.args['target']).toBe('keycard');
  });

  it('refuses an ambiguous prefix', () => {
    const inVault = parse('take wire', { ...start(), roomId: 'vault' });
    expect(inVault.ok).toBe(false);
    if (inVault.ok) return;
    expect(inVault.message).toContain('Several things match');
    expect(inVault.message).toContain('red wire');
  });

  it('resolves a room by its direction', () => {
    const result = parse('go south');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.command.args['target']).toBe('corridor');
  });

  it('resolves a room by its name', () => {
    const result = parse('go server vault');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.command.args['target']).toBe('vault');
  });

  it('resolves a room the engine will then refuse', () => {
    // The parser resolves what the player named. Whether they may go there
    // is the engine's business, not the parser's.
    const result = parse('go vault');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.command.args['target']).toBe('vault');
  });

  it('asks for a second argument when the verb needs one', () => {
    const result = parse('unlock safe');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('unlock');
  });

  it('keeps the raw text on the command', () => {
    const result = parse('  Take Keycard  ');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.command.raw).toBe('Take Keycard');
  });
});

describe('the error contract', () => {
  it('says what was attempted, what was wrong and what is possible', () => {
    const result = parse('take the brass key');
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.message).toContain('the brass key');
    expect(result.message).toContain('You can see:');
    expect(result.message).toContain('keycard');
  });

  it('names what is possible when the object is not in the room', () => {
    const result = parse('take cutters');
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.message).toContain('You can see:');
    expect(result.message).toContain('wall notice');
  });

  it('says what is carried when the object is not being carried', () => {
    const state = start();
    const result = parse('cut keycard with cutters', state);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.message).toContain('carrying');
  });

  it('never says nothing happened', () => {
    const state = start();
    for (const raw of ['take the brass key', 'fly to the moon', 'unlock safe']) {
      const result = parse(raw, state);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.message.length).toBeGreaterThan(20);
      expect(result.message.toLowerCase()).not.toContain('nothing happened');
    }
  });
});
