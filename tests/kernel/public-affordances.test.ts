import { describe, expect, it } from 'vitest';
import { adventure as mission } from '../../src/adventures/mission-impossible/adventure.js';
import { adventure as hotfix } from '../../src/adventures/hotfix-2-4-1/adventure.js';
import { InMemorySession } from '../../src/session/in-memory.js';
import { buildObservation } from '../../src/kernel/observation.js';
import { hashInitial } from '../../src/kernel/hash.js';
import { renderObservation, renderObservationJson } from '../../src/kernel/render.js';

// regression: warp#22695 — opened containers looked closed and portable items lacked public affordances.
describe.each([
  { adventure: mission, room: 'vault', container: 'safe', item: 'case', code: '4821' },
  { adventure: hotfix, room: 'customer_success', container: 'customer_handover', item: 'customer_notification', code: '7311' },
])('observable object state in $adventure.id', ({ adventure, room, container, item, code }) => {
  it('shows public lock/open/portable state without exposing hidden contents or secrets', async () => {
    const state = structuredClone(adventure.initial); state.roomId = room;
    const session = new InMemorySession('affordance', adventure);
    session.restore(state, hashInitial(state), 0);
    const initial = buildObservation(adventure, state);
    expect(JSON.stringify(initial)).not.toContain(code);
    expect(initial.visible.some(object => object.id === item)).toBe(false);
    expect(JSON.parse(renderObservationJson(initial)).visible.find((object: { id: string }) => object.id === container).container)
      .toEqual({ open: false, locked: true });
    expect((await session.send(`open ${adventure.objects[container]!.name}`)).message).toMatch(/locked/);
    const opened = await session.send(`unlock ${adventure.objects[container]!.name} with ${code}`);
    const view = JSON.parse(renderObservationJson(opened.observation));
    expect(view.visible.find((object: { id: string }) => object.id === container).container).toEqual({ open: true, locked: false });
    expect(view.visible.find((object: { id: string }) => object.id === item).takeable).toBe(true);
    const human = renderObservation(opened.observation);
    expect(human).toContain(`${adventure.objects[container]!.name} (open)`);
    expect(human).toContain(`${adventure.objects[item]!.name} (takeable)`);
    const repeated = await session.send(`open ${adventure.objects[container]!.name}`);
    expect(repeated.message).toMatch(/already open/);
    expect(repeated.events.some(event => event.type === 'action_succeeded')).toBe(false);
  });
});
