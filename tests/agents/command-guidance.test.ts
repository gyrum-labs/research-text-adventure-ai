import { describe, expect, it } from 'vitest';
import { adventure as mission } from '../../src/adventures/mission-impossible/adventure.js';
import { adventure as hotfix } from '../../src/adventures/hotfix-2-4-1/adventure.js';
import { commandHelp, commandSyntax, parseCommand } from '../../src/kernel/parser.js';
import { InMemorySession } from '../../src/session/in-memory.js';
import { buildSystemPrompt, PROMPT_VERSION } from '../../src/agents/llm/prompt.js';

// regression: warp#22695 — advertised multi-argument commands omitted their connective.
describe.each([mission, hotfix])('shared public grammar in $id', adventure => {
  it('makes every advertised shape parse with ordinary visible operands', () => {
    const state = structuredClone(adventure.initial);
    const visible = Object.keys(state.objects).filter(id => state.objects[id]!.at === state.roomId);
    const held = visible[0]!; state.inventory = [held]; state.objects[held]!.at = null;
    const target = visible[1]!;
    const seen = new Set<string>();
    for (const spec of adventure.actions) {
      if (seen.has(spec.verb)) continue;
      seen.add(spec.verb);
      const raw = commandSyntax(spec).replace(/<([^>]+)>/g, (_match, name: string) => {
        const arg = spec.args.find(candidate => candidate.name === name)!;
        if (arg.role === 'room') return adventure.rooms[state.roomId]!.name;
        if (arg.role === 'text') return 'example-value';
        return adventure.objects[arg.role === 'object-in-inventory' ? held : target]!.name;
      });
      expect(parseCommand(adventure, state, raw).ok, raw).toBe(true);
    }
  });

  it('shows the same connector-bearing syntax in human help, errors and model guidance', async () => {
    const session = new InMemorySession('help', adventure);
    const help = (await session.send('help')).message!;
    const model = buildSystemPrompt(adventure, { strategy: 'structured', thinking: false });
    for (const line of commandHelp(adventure).split('\n')) {
      expect(help).toContain(line);
      expect(model).toContain(line);
    }
    const invalid = parseCommand(adventure, adventure.initial, 'unlock something 0000');
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.message).toContain('unlock <target> with <with>');
    for (const code of adventure.codes ?? []) {
      expect(help).not.toContain(code);
      expect(model).not.toContain(code);
      if (!invalid.ok) expect(invalid.message).not.toContain(code);
    }
    expect(PROMPT_VERSION).not.toBe('llm-prompt-v1');
  });
});
