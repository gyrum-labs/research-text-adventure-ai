/*
 * The legal command set for a state.
 *
 * Used by the random policy, and by the masked-action condition later. It
 * lists commands that are *possible* from here, never commands that would be
 * *wise*: a masked list must not teach the agent the answer.
 */

import type { Adventure, GameState } from '../kernel/types.js';

export function legalCommands(adventure: Adventure, state: GameState): string[] {
  const commands: string[] = ['look', 'inventory', 'help'];
  const room = adventure.rooms[state.roomId];
  if (room === undefined) return commands;

  for (const doorId of room.exits) {
    const door = adventure.doors[doorId];
    if (door === undefined) continue;
    const target = adventure.rooms[door.to];
    commands.push(`go ${target?.name.toLowerCase() ?? door.to}`);
  }

  const visible = Object.values(adventure.objects).filter(
    (object) => state.objects[object.id]?.at === state.roomId,
  );

  for (const object of visible) {
    commands.push(`examine ${object.name}`);
    commands.push(`take ${object.name}`);
    if (object.readable === true) commands.push(`read ${object.name}`);
    if (object.container !== undefined) commands.push(`open ${object.name}`);
    for (const held of state.inventory) {
      const tool = adventure.objects[held];
      if (tool === undefined) continue;
      commands.push(`cut ${object.name} with ${tool.name}`);
      commands.push(`unlock ${object.name} with ${tool.name}`);
    }
  }

  return commands;
}
