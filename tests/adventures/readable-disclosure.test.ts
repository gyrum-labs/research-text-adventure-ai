/*
 * Every world tells the truth about what can be read.
 *
 * An object a world advertises as readable is a promise: the world has a read
 * rule that accepts it. The hotfix world broke that promise for its incident
 * ticket, and ten batch runs in a row died repeating a command the world could
 * never answer. These checks hold every shipped world to the promise, and
 * demonstrate that they catch the break they were written for.
 */

import { describe, expect, it } from 'vitest';
import { ADVENTURES } from '../../src/adventures/index.js';
import { adventure as hotfix } from '../../src/adventures/hotfix-2-4-1/adventure.js';
import type { Adventure, GameObject, Predicate } from '../../src/kernel/types.js';

/** The objects a world's observations would present as readable. */
function advertisedReadable(adventure: Adventure): string[] {
  return Object.values(adventure.objects)
    .filter((object: GameObject) => object.readable === true)
    .map((object) => object.id);
}

/** The targets a world's read rules are restricted to. */
function readableTargets(adventure: Adventure): string[] {
  const targets: string[] = [];
  for (const rule of adventure.actions) {
    if (rule.verb !== 'read') continue;
    for (const predicate of rule.requires as Predicate[]) {
      if (predicate.op === 'arg_equals' && predicate.arg === 'target') {
        targets.push(predicate.value);
      }
    }
  }
  return targets;
}

/** Whether every world keeps its promise about readability. */
function honestAboutReadability(adventure: Adventure): string[] {
  const targets = readableTargets(adventure);
  return advertisedReadable(adventure).filter((id) => !targets.includes(id));
}

describe('what a world advertises as readable', () => {
  it('is accepted by a read rule, in every shipped world', () => {
    for (const adventure of Object.values(ADVENTURES)) {
      expect(honestAboutReadability(adventure),
        `${adventure.id} advertises ${honestAboutReadability(adventure)} as readable with no read rule for it`)
        .toEqual([]);
    }
  });

  it('would catch the world that advertises a read it refuses', () => {
    // The hotfix world as it shipped: the ticket promised a read the world
    // refused, and ten batch runs died repeating it. Restoring that shape
    // here is how the check shows it still sees the defect.
    const asShipped: Adventure = {
      ...hotfix,
      objects: {
        ...hotfix.objects,
        incident_ticket: { ...hotfix.objects['incident_ticket']!, readable: true },
      },
    };
    expect(honestAboutReadability(asShipped)).toEqual(['incident_ticket']);
  });

  it('does not advertise the hotfix incident ticket as readable', () => {
    expect(hotfix.objects['incident_ticket']!.readable).toBeUndefined();
  });

  it('keeps the readable objects the world can actually be read', () => {
    // The board and the runbook carry the information the mission needs, so
    // the fix must not have swept them away with the ticket.
    expect(readableTargets(hotfix)).toEqual(expect.arrayContaining(['oncall_board', 'runbook']));
    expect(advertisedReadable(hotfix).sort()).toEqual(['oncall_board', 'runbook']);
  });
});
