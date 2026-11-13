/*
 * The QuestKit port.
 *
 * The port is only a fair comparison if it is the same game: the same rooms,
 * the same objects, the same ten commands, and the same ending. So the first
 * test is the one that matters, the scripted route through the port, and the
 * rest check that the engine's own view is what the agent is shown.
 */

import { describe, expect, it } from 'vitest';
import { QuestKitSession, GOLD_PATH } from '../../src/session/questkit-mission-impossible/session.js';

describe('the QuestKit port of Operation Nightingale', () => {
  it('wins on the gold path', async () => {
    const session = new QuestKitSession('port');

    let last;
    for (const command of GOLD_PATH) last = await session.send(command);

    expect(last?.status).toBe('success');
    expect(last?.turn).toBe(GOLD_PATH.length);
  });

  it('starts in the briefing room with the keycard in sight', async () => {
    const session = new QuestKitSession('port');
    const observation = await session.observe();

    expect(observation.room.name).toBe('Briefing Room');
    expect(observation.visible.map((thing) => thing.name)).toContain('keycard');
    expect(observation.goals).toHaveLength(2);
  });

  it('records a command the world does not understand as a refusal', async () => {
    const session = new QuestKitSession('port');
    const turn = await session.send('frobnicate the widget');

    expect(turn.parsed).toBe(false);
    expect(turn.turn).toBe(0);
  });

  it('hears a verb it knows even when the thing is not there', async () => {
    const session = new QuestKitSession('port');
    const turn = await session.send('take the moon');

    // The verb was understood, so this is a hallucination rather than a
    // refusal, and the taxonomy must be able to tell the two apart.
    expect(turn.parsed).toBe(true);
    expect(turn.message).toContain("can't see that");
  });

  it('keeps the keycard in the inventory once it is taken', async () => {
    const session = new QuestKitSession('port');
    await session.send('take keycard');

    const observation = await session.observe();
    expect(observation.inventory.map((thing) => thing.name)).toContain('keycard');
  });

  it('refuses the vault until the keycard has been used', async () => {
    const session = new QuestKitSession('port');
    await session.send('take keycard');
    await session.send('go corridor');

    const refused = await session.send('go vault');
    expect(refused.parsed).toBe(true);
    expect((await session.observe()).room.id).toBe('corridor');
  });
});
