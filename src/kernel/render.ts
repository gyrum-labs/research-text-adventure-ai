/*
 * Rendering. The kernel's facts, turned into prose a person can read.
 *
 * Two renderers exist and they must agree: `renderObservation` produces the
 * block the human sees, and the agent receives the same facts as data. A
 * disagreement between them would make the human and agent transcripts
 * incomparable.
 */

import type { Adventure, GameState, Observation } from './types.js';

export function renderRoom(adventure: Adventure, state: GameState): string {
  const room = adventure.rooms[state.roomId];
  if (room === undefined) return 'Somewhere you cannot name.';
  const exits = room.exits
    .map((doorId) => {
      const door = adventure.doors[doorId];
      if (door === undefined) return null;
      const target = adventure.rooms[door.to];
      return { direction: door.direction, label: target?.name ?? door.label };
    })
    .filter((exit): exit is { direction: string; label: string } => exit !== null);

  const lines: string[] = [room.name, room.description];
  const visible = visibleObjects(adventure, state);
  if (visible.length > 0) {
    lines.push(`You can see: ${visible.map((object) => object.name).join(', ')}.`);
  }
  if (exits.length > 0) {
    lines.push(`Exits: ${exits.map((exit) => `${exit.direction} → ${exit.label}`).join(', ')}.`);
  }
  return lines.join('\n');
}

export function renderInventory(adventure: Adventure, state: GameState): string {
  if (state.inventory.length === 0) return 'You are carrying nothing.';
  const names = state.inventory.map((id) => adventure.objects[id]?.name ?? id);
  return `You are carrying: ${names.join(', ')}.`;
}

export function renderObservation(observation: Observation): string {
  const lines: string[] = [];
  lines.push(`${observation.room.name}`);
  lines.push(observation.room.description);

  if (observation.visible.length > 0) {
    lines.push(`You can see: ${observation.visible.map((object) => object.name).join(', ')}.`);
  }
  lines.push(renderExits(observation));
  lines.push(
    observation.inventory.length > 0
      ? `You are carrying: ${observation.inventory.map((object) => object.name).join(', ')}.`
      : 'You are carrying nothing.',
  );
  lines.push('Objectives:');
  for (const goal of observation.goals) {
    lines.push(`  - ${goal.text}  [${goal.status === 'complete' ? 'done' : 'not done'}]`);
  }
  return lines.join('\n');
}

function renderExits(observation: Observation): string {
  if (observation.exits.length === 0) return 'There is no way out.';
  const parts = observation.exits.map((exit) => {
    const status = exit.status === 'locked' ? ' (locked)' : '';
    return `${exit.direction} → ${exit.toName}${status}`;
  });
  return `Exits: ${parts.join(', ')}.`;
}

function visibleObjects(adventure: Adventure, state: GameState) {
  return Object.values(adventure.objects).filter((object) => state.objects[object.id]?.at === state.roomId);
}
