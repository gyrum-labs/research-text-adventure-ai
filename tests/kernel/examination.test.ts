import { describe, expect, it } from 'vitest';
import { adventure as mission } from '../../src/adventures/mission-impossible/adventure.js';
import { adventure as hotfix } from '../../src/adventures/hotfix-2-4-1/adventure.js';
import { InMemorySession } from '../../src/session/in-memory.js';
import { interpolate } from '../../src/kernel/reduce.js';

// regression: warp#22688 — examination acknowledged the target without describing it.
describe.each([
  { adventure: mission, targets: ['bulletin', 'desk'], path: ['go south', 'open locker'], secretId: 'manual', code: '4821' },
  { adventure: hotfix, targets: ['incident_ticket', 'oncall_board'], path: ['go release engineering', 'open shared inbox'], secretId: 'runbook', code: '7311' },
])('public examination in $adventure.id', ({ adventure, targets, path, secretId, code }) => {
  it.each(targets)('describes %s using public authoring text', async id => {
    const session = new InMemorySession('inspect', adventure);
    const turn = await session.send(`examine ${adventure.objects[id]!.name}`);
    expect(turn.message).toContain(adventure.objects[id]!.description);
    const detail = adventure.objects[id]!.detail;
    if (detail) expect(turn.message).not.toContain(detail);
  });

  it('reveals manual details only through the existing accessible read action', async () => {
    const session = new InMemorySession('disclosure', adventure);
    const manual = adventure.objects[secretId]!;
    const inaccessible = await session.send(`examine ${manual.name}`);
    expect(inaccessible.message).not.toContain(manual.description);
    expect(inaccessible.message).not.toContain(code);
    for (const raw of path) await session.send(raw);
    const examined = await session.send(`examine ${manual.name}`);
    expect(examined.message).toContain(manual.description);
    expect(examined.message).not.toContain(manual.detail);
    expect(examined.message).not.toContain(code);
    expect((await session.send(`read ${manual.name}`)).message).toContain(code);
  });
});

it('interpolates public descriptions without exposing a private detail field', () => {
  expect(interpolate('{target.description}', mission, { target: 'bulletin' })).toBe(mission.objects['bulletin']!.description);
  expect(interpolate('{target.detail}', mission, { target: 'bulletin' })).toBe('{target.detail}');
  expect(interpolate('{target.description}', mission, {})).toBe('{target.description}');
});
