/*
 * The random policy: the lower bound.
 *
 * It samples uniformly from the commands that are legal in the current state.
 * If it ever wins, the adventure is too easy and every success rate measured
 * against it means nothing.
 */

import type { Adventure } from '../kernel/types.js';
import { legalCommands } from './legal-actions.js';
import type { AgentPolicy, PolicyContext } from './policy.js';

/** A small seeded generator, so a random run can be replayed exactly. */
export function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RandomPolicy implements AgentPolicy {
  readonly id = 'random';

  private readonly adventure: Adventure;
  private readonly random: () => number;

  constructor(adventure: Adventure, seed: number) {
    this.adventure = adventure;
    this.random = seededRandom(seed);
  }

  async next(context: PolicyContext): Promise<string | null> {
    const commands = legalCommands(this.adventure, context.state);
    if (commands.length === 0) return null;
    const index = Math.floor(this.random() * commands.length) % commands.length;
    return commands[index]!;
  }
}
