/*
 * The observation builder: the perception boundary.
 *
 * This is the only function in the project that turns world state into
 * something an agent can see. It receives the state and the public fields of
 * the adventure, and nothing else. The gold path, the hint table and the
 * action predicates are not among its inputs, so it cannot leak them: the
 * signature is the enforcement.
 *
 * What the agent can see is deliberately less than what is true. An object
 * inside a closed container has no room, so it does not appear. A door that
 * has not been unlocked reads as locked. The objectives are disclosed,
 * because the agent has to know what it is for. The method is not.
 */

import type { Adventure, Event, GameState, Id, Observation } from './types.js';
import { isGoalAchieved } from './goals.js';

/**
 * What one transition said to the agent.
 *
 * The action outcome is what the world said. The hint text is what the game
 * chose to tell the agent. Both reach the agent through the observation,
 * because the observation is the only channel an agent has, and the rule
 * lives here so that the runner and the tests cannot drift apart.
 *
 * A transition that says nothing (a movement, for instance) returns an empty
 * list, and the caller decides what the agent sees instead.
 */
export function messagesFromEvents(events: Event[]): string[] {
  const messages: string[] = [];

  for (const event of events) {
    if (event.type === 'action_succeeded' || event.type === 'action_failed') {
      if (event.message.length > 0) messages.push(event.message);
    } else if (event.type === 'hint_given') {
      if (event.text.length > 0) messages.push(event.text);
    }
  }

  return messages;
}

export function buildObservation(
  adventure: Adventure,
  state: GameState,
  messages: string[] = [],
): Observation {
  const room = adventure.rooms[state.roomId];

  const visible = Object.values(adventure.objects)
    .filter((object) => state.objects[object.id]?.at === state.roomId)
    .map((object) => ({
      id: object.id,
      name: object.name,
      description: object.description,
      ...(object.readable === true ? { readable: true } : {}),
    }));

  const inventory = state.inventory
    .map((id) => adventure.objects[id])
    .filter((object): object is NonNullable<typeof object> => object !== undefined)
    .map((object) => ({ id: object.id, name: object.name, description: object.description }));

  const exits = (room?.exits ?? [])
    .map((doorId) => adventure.doors[doorId])
    .filter((door): door is NonNullable<typeof door> => door !== undefined)
    .map((door) => {
      const target = adventure.rooms[door.to];
      return {
        direction: door.direction,
        label: door.label,
        toName: target?.name ?? door.label,
        status: doorStatus(adventure, state, door.id),
      };
    });

  const goals = adventure.goals.map((goal) => ({
    id: goal.id,
    text: goal.text,
    status: isGoalAchieved(goal, state) ? ('complete' as const) : ('incomplete' as const),
  }));

  return {
    turn: state.turn,
    room: {
      id: state.roomId,
      name: room?.name ?? state.roomId,
      description: room?.description ?? '',
    },
    visible,
    inventory,
    exits,
    messages,
    goals,
  };
}

/**
 * A door is locked while the object it needs has not been unlocked. The
 * rule lives here rather than in the action DSL because it is a property of
 * doors, not of any one action.
 */
function doorStatus(
  adventure: Adventure,
  state: GameState,
  doorId: Id,
): 'open' | 'locked' {
  const door = adventure.doors[doorId];
  if (door?.requiresAction === undefined) return 'open';
  const object = state.objects[door.requiresAction.object];
  if (object === undefined) return 'locked';
  return object.flags['unlocked'] === true ? 'open' : 'locked';
}

/**
 * The known-facts block: a compact summary of everything the agent has
 * observed so far.
 *
 * Derived only from the agent's own observation history, never from the
 * adventure's authoring data. That is why the adventure is not a parameter:
 * the function could not reach the authoring data if it wanted to.
 */
export function buildKnownFacts(observations: Observation[]): string {
  const seen = new Map<string, string>();
  const rooms = new Set<string>();
  const goals = new Map<string, 'complete' | 'incomplete'>();
  const latest = observations[observations.length - 1];
  const told = new Set<string>();

  for (const observation of observations) {
    rooms.add(observation.room.name);
    for (const object of [...observation.visible, ...observation.inventory]) {
      seen.set(object.id, object.name);
    }
    for (const goal of observation.goals) {
      goals.set(goal.text, goal.status);
    }
    // What the agent was told is a fact the agent keeps. The observation
    // itself is memoryless: a message lasts one turn, so the agent has to
    // remember it or lose it.
    for (const message of observation.messages) {
      for (const line of message.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.length > 0) told.add(trimmed);
      }
    }
  }

  const lines: string[] = [];
  lines.push(`Location: ${latest?.room.name ?? 'unknown'}.`);
  lines.push(`Carrying: ${latest?.inventory.map((object) => object.name).join(', ') || 'nothing'}.`);
  lines.push(`Visible: ${latest?.visible.map((object) => object.name).join(', ') || 'nothing'}.`);
  lines.push(`Rooms seen: ${[...rooms].join(', ') || 'none yet'}.`);
  lines.push(`Objects seen: ${[...seen.values()].join(', ') || 'none yet'}.`);
  if (goals.size > 0) {
    lines.push('Objectives:');
    for (const [text, status] of goals) {
      lines.push(`  - ${text} [${status === 'complete' ? 'done' : 'not done'}]`);
    }
  }
  if (told.size > 0) {
    lines.push('Facts you have been told:');
    for (const fact of told) {
      lines.push(`  - ${fact}`);
    }
  }
  return lines.join('\n');
}
