import { describe, expect, it } from 'vitest';
import { buildKnownFacts, buildObservation } from '../../src/kernel/observation.js';
import { allGoalsAchieved, achievedGoalIds, isGoalAchieved } from '../../src/kernel/goals.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';

describe('the known-facts block', () => {
  it('summarises only what the agent has observed', () => {
    const first = buildObservation(adventure, structuredClone(adventure.initial));
    const facts = buildKnownFacts([first]);
    expect(facts).toContain('Briefing Room');
    expect(facts).toContain('keycard');
    expect(facts).toContain('Disarm the bomb');
    // Nothing the agent has not seen.
    expect(facts).not.toContain('4821');
    expect(facts).not.toContain('wire cutters');
  });

  it('accumulates as the agent explores', () => {
    const first = buildObservation(adventure, structuredClone(adventure.initial));
    const corridor = { ...structuredClone(adventure.initial), roomId: 'corridor' };
    const second = buildObservation(adventure, corridor);
    const facts = buildKnownFacts([first, second]);
    expect(facts).toContain('Service Corridor');
    expect(facts).toContain('locker');
  });

  it('says nothing before anything has been seen', () => {
    expect(buildKnownFacts([])).toContain('none yet');
  });
});

describe('goal evaluation', () => {
  it('reports a goal as unmet until its predicate holds', () => {
    const state = structuredClone(adventure.initial);
    const disarm = adventure.goals.find((goal) => goal.id === 'disarm')!;
    expect(isGoalAchieved(disarm, state)).toBe(false);
  });

  it('reports a goal as met once its predicate holds', () => {
    const state = { ...structuredClone(adventure.initial), flags: { bomb_defused: true } };
    const disarm = adventure.goals.find((goal) => goal.id === 'disarm')!;
    expect(isGoalAchieved(disarm, state)).toBe(true);
  });

  it('knows when every goal is met', () => {
    const state = {
      ...structuredClone(adventure.initial),
      flags: { bomb_defused: true },
      inventory: ['case'],
    };
    expect(allGoalsAchieved(adventure, state)).toBe(true);
    expect(achievedGoalIds(adventure, state).sort()).toEqual(['disarm', 'recover']);
  });
});
