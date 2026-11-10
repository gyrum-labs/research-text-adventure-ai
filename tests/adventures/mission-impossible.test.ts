import { describe, expect, it } from 'vitest';
import type { GameState } from '../../src/kernel/types.js';
import { parseCommand } from '../../src/kernel/parser.js';
import { reduce } from '../../src/kernel/reduce.js';
import { buildObservation } from '../../src/kernel/observation.js';
import { reachable, shortestWinningPath } from '../../src/adventures/mission-impossible/oracle.js';
import { RandomPolicy } from '../../src/agents/random.js';
import { DEFAULT_MAX_TURNS, run } from '../../src/runner/run.js';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';
import { GOLD_PATH } from '../../src/adventures/mission-impossible/gold-path.js';

function playThrough(commands: string[]): GameState {
  let state = structuredClone(adventure.initial);
  for (const raw of commands) {
    const parsed = parseCommand(adventure, state, raw);
    if (!parsed.ok) throw new Error(`gold path did not parse: ${raw} (${parsed.message})`);
    state = reduce(adventure, state, parsed.command).state;
  }
  return state;
}

describe('the adventure', () => {
  it('loads and validates', () => {
    expect(adventure.id).toBe('mission-impossible');
    expect(adventure.goals).toHaveLength(2);
    expect(adventure.hints.length).toBeGreaterThan(0);
  });

  it('gives the agent a brief that names the objectives and not the method', () => {
    expect(adventure.brief.toLowerCase()).toContain('bomb');
    expect(adventure.brief.toLowerCase()).toContain('case');
    // The method must not be in the brief.
    expect(adventure.brief).not.toContain('4821');
    expect(adventure.brief.toLowerCase()).not.toContain('yellow');
    expect(adventure.brief.toLowerCase()).not.toContain('locker');
    expect(adventure.brief.toLowerCase()).not.toContain('keycard');
  });

  it('is won by the gold path, in ten commands', () => {
    const state = playThrough(GOLD_PATH);
    expect(state.status).toBe('success');
    expect(state.turn).toBe(10);
    expect(state.inventory).toContain('case');
  });

  it(
    'has a gold path that is the shortest winning route',
    () => {
      const shortest = shortestWinningPath(adventure, { maxDepth: 12 });
      expect(shortest.exhausted).toBe(false);
      expect(shortest.path.length).toBe(GOLD_PATH.length);
    },
    60_000,
  );

  it('cannot be won by cutting the wrong wire', () => {
    const state = playThrough([
      'take keycard',
      'go corridor',
      'open locker',
      'take cutters',
      'read manual',
      'unlock vault door with keycard',
      'go vault',
      'cut red wire with cutters',
    ]);
    expect(state.status).toBe('failure');
  });

  it('refuses to cut a wire before the manual is read, without ending the run', () => {
    const state = playThrough([
      'take keycard',
      'go corridor',
      'open locker',
      'take cutters',
      'unlock vault door with keycard',
      'go vault',
      'cut yellow wire with cutters',
    ]);
    expect(state.status).toBe('running');
    expect(state.flags['bomb_defused']).toBeUndefined();
  });

  it('cannot be won by brute-forcing the safe code inside the turn budget', () => {
    // The argument is arithmetic: there are ten thousand combinations and
    // the agent has thirty turns. Trying them all is not a strategy.
    expect(10 ** 4).toBeGreaterThan(DEFAULT_MAX_TURNS);

    // And a handful of wrong codes do not work either.
    const attempts = [
      'take keycard',
      'go corridor',
      'open locker',
      'take cutters',
      'read manual',
      'unlock vault door with keycard',
      'go vault',
    ];
    for (const code of ['0000', '1111', '4822', '9999']) {
      attempts.push(`unlock safe with ${code}`);
    }
    const state = playThrough(attempts);
    expect(state.status).not.toBe('success');
    expect(state.inventory).not.toContain('case');
  });

  it(
    'has no unreachable rooms',
    () => {
      const found = reachable(adventure);
      expect(found.exhausted).toBe(false);
      expect([...found.rooms].sort()).toEqual([...Object.keys(adventure.rooms)].sort());
    },
    60_000,
  );

  it(
    'puts every object somewhere reachable',
    () => {
      const found = reachable(adventure);
      expect(found.exhausted).toBe(false);
      // Everything is either out in the world or in the player's hands.
      for (const id of Object.keys(adventure.objects)) {
        expect(found.objects.has(id), `${id} is never reachable`).toBe(true);
      }
    },
    60_000,
  );
});

describe('the random policy', () => {
  it('fails every time, over twenty seeds', async () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const result = await run({
        adventure,
        policy: new RandomPolicy(adventure, seed),
        maxTurns: 30,
      });
      expect(result.outcome, `seed ${seed} should not win`).not.toBe('success');
    }
  });

  it('never even reaches the vault', async () => {
    const result = await run({
      adventure,
      policy: new RandomPolicy(adventure, 7),
      maxTurns: 30,
    });
    expect(result.state.roomId).not.toBe('vault');
  });
});

describe('the observation', () => {
  it('never shows what is inside a closed container', () => {
    const state = structuredClone(adventure.initial);
    const observation = buildObservation(adventure, state);
    const names = observation.visible.map((object) => object.name);
    expect(names).not.toContain('wire cutters');
    expect(names).not.toContain('defusal manual');
  });

  it('never shows the safe code before the manual is read', () => {
    const state = structuredClone(adventure.initial);
    const observation = buildObservation(adventure, state);
    expect(JSON.stringify(observation)).not.toContain('4821');
    expect(JSON.stringify(observation)).not.toContain('YELLOW');
  });

  it('reveals the manual only after the locker is opened', () => {
    let state = structuredClone(adventure.initial);
    state = reduce(adventure, state, { verb: 'go', args: { target: 'corridor' }, raw: 'go corridor' }).state;
    let observation = buildObservation(adventure, state);
    expect(observation.visible.map((object) => object.name)).not.toContain('wire cutters');

    state = reduce(adventure, state, { verb: 'open', args: { target: 'locker' }, raw: 'open locker' }).state;
    observation = buildObservation(adventure, state);
    expect(observation.visible.map((object) => object.name)).toContain('wire cutters');
    expect(observation.visible.map((object) => object.name)).toContain('defusal manual');
  });

  it('discloses the objectives but never the method', () => {
    const observation = buildObservation(adventure, structuredClone(adventure.initial));
    expect(observation.goals.map((goal) => goal.text)).toEqual([
      'Disarm the bomb',
      'Recover the case',
    ]);
    const serialised = JSON.stringify(observation);
    expect(serialised).not.toContain('4821');
    expect(serialised).not.toContain('YELLOW');
    // The keycard is in the room, so seeing it is correct. Knowing what it
    // opens is not.
    expect(serialised).not.toContain('unlock vault door');
  });
});
