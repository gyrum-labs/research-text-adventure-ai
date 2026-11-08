/*
 * The scripted policy: replay a fixed list of commands.
 *
 * It is the upper bound of the experiment. The gold path is the shortest
 * winning route, so if the scripted policy does not win, the adventure is
 * broken.
 */

import type { AgentPolicy, PolicyContext } from './policy.js';

export class ScriptedPolicy implements AgentPolicy {
  readonly id = 'scripted';

  private readonly commands: string[];
  private index = 0;

  constructor(commands: string[]) {
    this.commands = [...commands];
  }

  async next(_context: PolicyContext): Promise<string | null> {
    if (this.index >= this.commands.length) return null;
    const command = this.commands[this.index]!;
    this.index += 1;
    return command;
  }
}
