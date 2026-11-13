import { describe, expect, it } from 'vitest';
import { adventure as mission } from '../../src/adventures/mission-impossible/adventure.js';
import { adventure as hotfix } from '../../src/adventures/hotfix-2-4-1/adventure.js';
import { InMemorySession } from '../../src/session/in-memory.js';
import { canonicalJson, hashInitial } from '../../src/kernel/hash.js';
import type { Adventure, GameState } from '../../src/kernel/types.js';

const worlds = [
  { adventure: mission, key: 'keycard', keyText: 'keycard', lock: 'vault_door', room: 'corridor', container: 'safe', code: '4821' },
  { adventure: hotfix, key: 'incident_ticket', keyText: 'incident-ticket', lock: 'release_gate', room: 'release_engineering', container: 'customer_handover', code: '7311' },
];

function sessionAt(adventure: Adventure, room: string, inventory: string[] = [], flags = {}) {
  const state = structuredClone(adventure.initial);
  state.roomId = room; state.inventory = inventory; state.flags = { ...state.flags, ...flags };
  for (const id of inventory) state.objects[id]!.at = null;
  const session = new InMemorySession('contract', adventure);
  session.restore(state, hashInitial(state), 0);
  return session;
}
const position = (state: GameState) => canonicalJson({ ...state, turn: 0 });

// regression: warp#22695 — arbitrary objects accepted valid key/code effects.
describe.each(worlds)('action identity in $adventure.id', world => {
  it.each(['key', 'code'])('refuses %s unlock effects on every unrelated visible target', async kind => {
    const { adventure } = world;
    const permitted = kind === 'key' ? world.lock : world.container;
    const credential = kind === 'key' ? world.keyText : world.code;
    for (const room of Object.keys(adventure.rooms)) {
      const session = sessionAt(adventure, room, [world.key]);
      const initial = (await session.snapshot()).state;
      for (const [id, object] of Object.entries(initial.objects)) {
        if (object.at !== room || id === permitted) continue;
        const before = await session.snapshot();
        const turn = await session.send(`unlock ${adventure.objects[id]!.name} with ${credential}`);
        expect(turn.events.some(event => event.type === 'action_succeeded'), id).toBe(false);
        expect(position((await session.snapshot()).state), id).toBe(position(before.state));
      }
    }
  });

  it('requires the carried key, admits the intended lock, and refuses repeated success', async () => {
    const { adventure } = world;
    const command = `unlock ${adventure.objects[world.lock]!.name} with ${world.keyText}`;
    const absent = sessionAt(adventure, world.room);
    expect((await absent.send(command)).events.some(event => event.type === 'action_failed')).toBe(true);
    const session = sessionAt(adventure, world.room, [world.key]);
    expect((await session.send(command)).events.some(event => event.type === 'action_succeeded')).toBe(true);
    const before = await session.snapshot();
    expect(before.state.objects[world.lock]!.flags['unlocked']).toBe(true);
    const repeated = await session.send(command);
    expect(repeated.message?.toLowerCase()).toContain('already unlocked');
    expect(repeated.events.some(event => event.type === 'action_succeeded')).toBe(false);
    expect(position((await session.snapshot()).state)).toBe(position(before.state));
  });

  it('enforces code identity and reports an already opened code lock truthfully', async () => {
    const { adventure } = world;
    const room = adventure.initial.objects[world.container]!.at!;
    const session = sessionAt(adventure, room);
    const name = adventure.objects[world.container]!.name;
    expect((await session.send(`unlock ${name} with 0000`)).events.some(event => event.type === 'action_failed')).toBe(true);
    expect((await session.send(`unlock ${name} with ${world.code}`)).events.some(event => event.type === 'action_succeeded')).toBe(true);
    const before = await session.snapshot();
    const repeated = await session.send(`unlock ${name} with ${world.code}`);
    expect(repeated.message?.toLowerCase()).toContain('already unlocked');
    expect(repeated.events.some(event => event.type === 'action_succeeded')).toBe(false);
    expect(position((await session.snapshot()).state)).toBe(position(before.state));
  });
});

describe('relevant failed-action feedback', () => {
  it('rejects the exact extinguisher/keycard attempt without bomb or manual advice', async () => {
    const session = sessionAt(mission, 'corridor', ['keycard']);
    const before = await session.snapshot();
    const turn = await session.send('cut fire extinguisher with keycard');
    expect(turn.message).toContain('cut');
    expect(turn.message).toContain('fire extinguisher');
    expect(turn.message).toContain('keycard');
    expect(turn.message).not.toMatch(/manual|bomb|wiring|4821/i);
    expect(position((await session.snapshot()).state)).toBe(position(before.state));
  });

  it('rejects deploying unrelated objects or using an unsuitable tool without runbook advice', async () => {
    for (const raw of ['deploy shared inbox with deploy credential', 'deploy release-2.4.1 with incident ticket']) {
      const session = sessionAt(hotfix, 'release_engineering', ['incident_ticket', 'deploy_credential']);
      const turn = await session.send(raw);
      expect(turn.message).toContain('deploy');
      expect(turn.message).not.toMatch(/runbook|7311/);
      expect(turn.status).toBe('running');
    }
  });

  it('does not identify the safe wire through differing pre-manual refusals', async () => {
    const messages = [];
    for (const color of ['red', 'blue', 'yellow']) {
      const session = sessionAt(mission, 'vault', ['cutters']);
      const turn = await session.send(`cut ${color} wire with cutters`);
      expect(turn.status).toBe('running');
      expect(turn.message).toMatch(/manual/);
      messages.push(turn.message);
    }
    expect(new Set(messages).size).toBe(1);
  });

  it.each([
    { adventure: mission, room: 'vault', tool: 'cutters', flags: { manual_read: true }, raw: 'cut red wire with cutters' },
    { adventure: hotfix, room: 'release_engineering', tool: 'deploy_credential', flags: { runbook_read: true }, raw: 'deploy release-2.3.9 with deploy credential' },
  ])('retains the intended wrong-choice consequence in $adventure.id', async fixture => {
    const session = sessionAt(fixture.adventure, fixture.room, [fixture.tool], fixture.flags);
    expect((await session.send(fixture.raw)).status).toBe('failure');
  });
});
