import { describe, expect, it } from 'vitest';
import { run } from '../../src/runner/run.js';
import { ScriptedPolicy } from '../../src/agents/scripted.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';
import { GOLD_PATH } from '../../src/adventures/mission-impossible/gold-path.js';

describe('public command observation', () => {
  it('reports attempted commands before their feedback, including parser failures', async () => {
    const records: { kind: string; raw?: string; turn?: number }[] = [];
    const commands = ['take keycard', 'frobnicate the widget'];
    const result = await run({
      adventure, policy: new ScriptedPolicy(commands),
      onObservation: () => records.push({ kind: 'observation' }),
      onCommand: command => records.push({ kind: 'command', ...command }),
      onMessage: () => records.push({ kind: 'message' }),
    });

    expect(records).toEqual([
      { kind: 'observation' }, { kind: 'command', turn: 0, raw: commands[0] },
      { kind: 'message' }, { kind: 'observation' },
      { kind: 'command', turn: 1, raw: commands[1] }, { kind: 'message' },
      { kind: 'observation' },
    ]);
    expect(result.parseErrors).toBe(1);
    expect(result.commands).toEqual(commands);
  });

  it('leaves the gold-path result and hash unchanged', async () => {
    const baseline = await run({ adventure, policy: new ScriptedPolicy(GOLD_PATH) });
    const commands: string[] = [];
    const observed = await run({
      adventure, policy: new ScriptedPolicy(GOLD_PATH),
      onCommand: command => commands.push(command.raw),
    });

    expect(commands).toEqual(GOLD_PATH);
    expect(observed).toEqual(baseline);
  });
});
