/*
 * Rendering. The kernel's facts, turned into prose a person can read.
 *
 * Three renderers exist and they must agree: `renderObservation` produces the
 * block the human sees, `renderObservationJson` produces the machine
 * representation, and `renderObservationStructured` produces the version a
 * model reads. A disagreement between them would make the human and agent
 * transcripts incomparable.
 */

import type { Adventure, GameState, Observation } from './types.js';

/** The rendering variants an interface may ask for. */
export type RendererVariant = 'text' | 'json' | 'text-structured';

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

  // What the world said last turn comes first, because it is the most recent
  // thing the reader was told.
  for (const message of observation.messages) {
    lines.push(message);
  }

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

/**
 * The machine rendering.
 *
 * The keys are written out in a fixed order rather than dumped from the
 * observation, so a transcript diffs cleanly and a token count stays
 * comparable between runs. The content is exactly the observation.
 */
export function renderObservationJson(observation: Observation): string {
  return JSON.stringify(
    {
      turn: observation.turn,
      room: {
        id: observation.room.id,
        name: observation.room.name,
        description: observation.room.description,
      },
      visible: observation.visible.map((object) => ({
        id: object.id,
        name: object.name,
        description: object.description,
        ...(object.readable === true ? { readable: true } : {}),
      })),
      inventory: observation.inventory.map((object) => ({
        id: object.id,
        name: object.name,
        description: object.description,
      })),
      exits: observation.exits.map((exit) => ({
        direction: exit.direction,
        label: exit.label,
        toName: exit.toName,
        status: exit.status,
      })),
      messages: [...observation.messages],
      goals: observation.goals.map((goal) => ({
        id: goal.id,
        text: goal.text,
        status: goal.status,
      })),
    },
    null,
    2,
  );
}

/**
 * The model rendering: the prose, then the facts spelled out.
 *
 * A model reads the prose and the checklist differently from a person, and
 * the checklist is what it tends to act on.
 */
export function renderObservationStructured(observation: Observation): string {
  const lines: string[] = [renderObservation(observation), '', 'Facts you know:'];
  lines.push(`  Location: ${observation.room.name}`);
  lines.push(`  Visible: ${observation.visible.map((object) => object.name).join(', ') || 'nothing'}`);
  lines.push(
    `  Carrying: ${observation.inventory.map((object) => object.name).join(', ') || 'nothing'}`,
  );
  lines.push(`  Exits: ${renderExitList(observation)}`);
  lines.push('  Objectives:');
  for (const goal of observation.goals) {
    lines.push(`    - ${goal.text} [${goal.status === 'complete' ? 'done' : 'not done'}]`);
  }
  return lines.join('\n');
}

/** Render an observation in the requested variant. */
export function renderObservationWith(observation: Observation, variant: RendererVariant): string {
  switch (variant) {
    case 'json':
      return renderObservationJson(observation);
    case 'text-structured':
      return renderObservationStructured(observation);
    case 'text':
      return renderObservation(observation);
  }
}

function renderExitList(observation: Observation): string {
  if (observation.exits.length === 0) return 'none';
  return observation.exits
    .map((exit) => `${exit.direction} → ${exit.toName}${exit.status === 'locked' ? ' (locked)' : ''}`)
    .join(', ');
}

function visibleObjects(adventure: Adventure, state: GameState) {
  return Object.values(adventure.objects).filter((object) => state.objects[object.id]?.at === state.roomId);
}
