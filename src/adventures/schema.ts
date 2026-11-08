/*
 * The adventure schema.
 *
 * An adventure is data, so it is only as good as the contract that describes
 * it. The TypeScript types stop a mistake at compile time; the schema stops
 * one at load time, which is the moment it actually costs an experiment
 * something.
 *
 * The schema is strict. An adventure with a key the kernel does not know is a
 * mistake, not a harmless extra, because nothing would read it and a reader
 * would believe it meant something.
 */

import { z } from 'zod';
import type { Adventure } from '../kernel/types.js';

const id = z.string().min(1);
const text = z.string();

const predicate = z.discriminatedUnion('op', [
  z.object({ op: z.literal('in_room'), room: id }).strict(),
  z.object({ op: z.literal('object_in_room'), object: id, room: id }).strict(),
  z.object({ op: z.literal('arg_in_room'), arg: id }).strict(),
  z.object({ op: z.literal('carrying'), object: id }).strict(),
  z.object({ op: z.literal('flag'), key: id, value: z.boolean() }).strict(),
  z.object({ op: z.literal('object_flag'), object: id, key: id, value: z.boolean() }).strict(),
  z.object({ op: z.literal('arg_flag'), arg: id, key: id, value: z.boolean() }).strict(),
  z.object({ op: z.literal('arg_equals'), arg: id, value: z.string() }).strict(),
  z.object({ op: z.literal('goal_complete'), goal: id }).strict(),
  z.object({ op: z.literal('hints_remaining'), count: z.number().int().min(0) }).strict(),
]);

const effect = z.discriminatedUnion('op', [
  z.object({ op: z.literal('move_to'), room: id }).strict(),
  z.object({ op: z.literal('set_flag'), key: id, value: z.boolean() }).strict(),
  z.object({ op: z.literal('set_arg_flag'), arg: id, key: id, value: z.boolean() }).strict(),
  z.object({ op: z.literal('set_arg_room'), arg: id, room: id.nullable() }).strict(),
  z.object({ op: z.literal('add_to_inventory'), arg: id }).strict(),
  z.object({ op: z.literal('remove_from_inventory'), arg: id }).strict(),
  z.object({ op: z.literal('reveal_container'), arg: id }).strict(),
  z.object({ op: z.literal('set_arg_state'), arg: id, key: id, value: z.string() }).strict(),
  z.object({ op: z.literal('give_hint') }).strict(),
  z.object({ op: z.literal('finish'), outcome: z.enum(['success', 'failure']), reason: text }).strict(),
]);

const room = z
  .object({
    id,
    name: text,
    description: text,
    contents: z.array(id),
    exits: z.array(id),
  })
  .strict();

const gameObject = z
  .object({
    id,
    name: text,
    aliases: z.array(text).optional(),
    description: text,
    detail: text.optional(),
    container: z.object({ closed: z.boolean(), contains: z.array(id) }).strict().optional(),
    readable: z.boolean().optional(),
    takeable: z.boolean().optional(),
  })
  .strict();

const door = z
  .object({
    id,
    from: id,
    to: id,
    direction: text,
    label: text,
    requiresAction: z.object({ verb: text, object: id }).strict().optional(),
    locked: z.boolean().optional(),
    lockedMessage: text.optional(),
  })
  .strict();

const action = z
  .object({
    verb: text,
    synonyms: z.array(text).optional(),
    args: z.array(z.object({ name: id, role: z.enum(['room', 'object', 'object-in-room', 'object-in-inventory', 'text']) }).strict()),
    requires: z.array(predicate),
    effects: z.array(effect),
    text: z.object({ success: text, failure: text }).strict(),
  })
  .strict();

const goal = z
  .object({
    id,
    text,
    requires: z.array(predicate),
    achievedWhen: z.array(predicate),
  })
  .strict();

const hint = z.object({ id, text }).strict();

const objectState = z
  .object({
    at: id.nullable(),
    flags: z.record(z.boolean()),
    state: z.record(z.string()),
  })
  .strict();

const gameState = z
  .object({
    roomId: id,
    inventory: z.array(id),
    objects: z.record(objectState),
    flags: z.record(z.boolean()),
    turn: z.number().int().min(0),
    hintsLeft: z.number().int().min(0),
    status: z.enum(['running', 'success', 'failure']),
  })
  .strict();

export const adventureSchema = z
  .object({
    id,
    title: text,
    version: text,
    brief: text,
    outcomeText: z.object({ success: text, failure: text }).strict(),
    rooms: z.record(room),
    objects: z.record(gameObject),
    doors: z.record(door),
    actions: z.array(action),
    goals: z.array(goal),
    hints: z.array(hint),
    codes: z.array(text).optional(),
    initial: gameState,
  })
  .strict();

/**
 * Validate an adventure and return it.
 *
 * The result is the parsed adventure, which is the same object when it is
 * valid: the schema is strict, so nothing is silently dropped.
 */
export function parseAdventure(candidate: unknown): Adventure {
  return adventureSchema.parse(candidate) as Adventure;
}

/**
 * Check that the adventure refers only to things it has.
 *
 * A schema cannot say that a room's contents name objects that exist, so
 * this check is separate. It is the difference between "the shape is right"
 * and "the fixture makes sense".
 */
function checkReferences(adventure: Adventure): string[] {
  const problems: string[] = [];
  const rooms = new Set(Object.keys(adventure.rooms));
  const objects = new Set(Object.keys(adventure.objects));
  const doors = new Set(Object.keys(adventure.doors));

  for (const room of Object.values(adventure.rooms)) {
    for (const objectId of room.contents) {
      if (!objects.has(objectId)) problems.push(`room "${room.id}" lists unknown object "${objectId}"`);
    }
    for (const doorId of room.exits) {
      if (!doors.has(doorId)) problems.push(`room "${room.id}" lists unknown door "${doorId}"`);
    }
  }

  for (const door of Object.values(adventure.doors)) {
    if (!rooms.has(door.from)) problems.push(`door "${door.id}" starts in unknown room "${door.from}"`);
    if (!rooms.has(door.to)) problems.push(`door "${door.id}" leads to unknown room "${door.to}"`);
    const required = door.requiresAction?.object;
    if (required !== undefined && !objects.has(required)) {
      problems.push(`door "${door.id}" needs unknown object "${required}"`);
    }
  }

  for (const object of Object.values(adventure.objects)) {
    for (const childId of object.container?.contains ?? []) {
      if (!objects.has(childId)) {
        problems.push(`container "${object.id}" holds unknown object "${childId}"`);
      }
    }
  }

  if (!rooms.has(adventure.initial.roomId)) {
    problems.push(`the adventure starts in unknown room "${adventure.initial.roomId}"`);
  }
  for (const objectId of Object.keys(adventure.initial.objects)) {
    if (!objects.has(objectId)) {
      problems.push(`the initial state places unknown object "${objectId}"`);
    }
  }
  for (const objectId of adventure.initial.inventory) {
    if (!objects.has(objectId)) {
      problems.push(`the initial state carries unknown object "${objectId}"`);
    }
  }

  for (const goal of adventure.goals) {
    for (const predicate of [...goal.requires, ...goal.achievedWhen]) {
      if (predicate.op === 'carrying' && !objects.has(predicate.object)) {
        problems.push(`goal "${goal.id}" needs unknown object "${predicate.object}"`);
      }
      if (predicate.op === 'object_flag' && !objects.has(predicate.object)) {
        problems.push(`goal "${goal.id}" needs unknown object "${predicate.object}"`);
      }
      if (predicate.op === 'object_in_room' && !objects.has(predicate.object)) {
        problems.push(`goal "${goal.id}" needs unknown object "${predicate.object}"`);
      }
    }
  }

  return problems;
}

/** Validate an adventure, saying which one failed if it does. */
export function validateAdventure(candidate: unknown): Adventure {
  const id = (candidate as { id?: unknown } | null)?.id;
  const result = adventureSchema.safeParse(candidate);

  if (!result.success) {
    const reason = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`adventure "${String(id)}" is not valid: ${reason}`);
  }

  const adventure = result.data as Adventure;
  const problems = checkReferences(adventure);
  if (problems.length > 0) {
    throw new Error(`adventure "${adventure.id}" refers to things it does not have: ${problems.join('; ')}`);
  }

  return adventure;
}
