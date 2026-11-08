import { describe, expect, it } from 'vitest';
import { buildObservation } from '../../src/kernel/observation.js';
import { renderInventory, renderObservation, renderRoom } from '../../src/kernel/render.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';

describe('the renderers', () => {
  it('describes the room, what is there and where it leads', () => {
    const text = renderRoom(adventure, structuredClone(adventure.initial));
    expect(text).toContain('Briefing Room');
    expect(text).toContain('keycard');
    expect(text).toContain('south → Service Corridor');
  });

  it('says when nothing is carried', () => {
    expect(renderInventory(adventure, structuredClone(adventure.initial))).toContain('carrying nothing');
  });

  it('lists what is carried', () => {
    const state = { ...structuredClone(adventure.initial), inventory: ['keycard'] };
    expect(renderInventory(adventure, state)).toContain('keycard');
  });

  it('renders the observation as prose a player can read', () => {
    const observation = buildObservation(adventure, structuredClone(adventure.initial));
    const text = renderObservation(observation);
    expect(text).toContain('Briefing Room');
    expect(text).toContain('You can see:');
    expect(text).toContain('Disarm the bomb');
    expect(text).toContain('[not done]');
  });

  it('marks a completed objective as done', () => {
    const state = { ...structuredClone(adventure.initial), flags: { bomb_defused: true } };
    const text = renderObservation(buildObservation(adventure, state));
    expect(text).toContain('Disarm the bomb  [done]');
  });

  it('shows a locked door as locked', () => {
    const state = { ...structuredClone(adventure.initial), roomId: 'corridor' };
    const observation = buildObservation(adventure, state);
    const vault = observation.exits.find((exit) => exit.direction === 'north');
    expect(vault?.status).toBe('locked');
  });

  it('shows a door as open once it is unlocked', () => {
    const state = structuredClone(adventure.initial);
    state.roomId = 'corridor';
    state.objects['vault_door'] = { at: 'corridor', flags: { unlocked: true }, state: {} };
    const observation = buildObservation(adventure, state);
    expect(observation.exits.find((exit) => exit.direction === 'north')?.status).toBe('open');
  });
});
