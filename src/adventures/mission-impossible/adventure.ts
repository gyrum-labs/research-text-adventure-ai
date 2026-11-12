/*
 * Operation Nightingale: the Mission Impossible adventure.
 *
 * Pure data. The kernel does not know what a bomb is; this file is the only
 * place that does.
 *
 * The dependency chain, which is the point of the fixture:
 *
 *   read manual  ->  know the safe wire and the safe code
 *   open locker  ->  acquire the wire cutters and the manual
 *   take keycard ->  unlock the vault door
 *   take case    ->  recover the objective
 *
 * Nothing is solvable by brute force. The safe code is four digits and the
 * turn budget is thirty, so guessing is not an option, and the manual is the
 * only source of both the code and the wire.
 */

import type { Adventure, GameObjectState } from '../../kernel/types.js';

const HINTS = [
  {
    id: 'h1',
    text: 'The building keeps its maintenance kit in the service corridor.',
  },
  {
    id: 'h2',
    text: 'Instructions are worth more than tools. Read what you find before you use it.',
  },
  {
    id: 'h3',
    text: 'The vault door has a card reader beside the frame.',
  },
];

/** Seed the runtime state for one object from its definition. */
function objectState(at: string | null, flags: Record<string, boolean> = {}): GameObjectState {
  return { at, flags: { ...flags }, state: {} };
}

export const adventure: Adventure = {
  id: 'mission-impossible',
  title: 'Operation Nightingale',
  version: '1.0.2',

  brief:
    'Mission brief. A booby-trapped case is locked in the server vault. Two objectives: ' +
    'disarm the bomb, and recover the case. Nothing else is known. You are in the briefing ' +
    'room. Discover the rest by exploring.',

  outcomeText: {
    success: 'The bomb is dead and the case is in your hands. Exfiltration complete.',
    failure: 'The blast takes the vault with it. There is nothing left to recover.',
  },

  // -----------------------------------------------------------------------
  // Rooms
  // -----------------------------------------------------------------------
  rooms: {
    briefing: {
      id: 'briefing',
      name: 'Briefing Room',
      description:
        'A windowless office. A desk, a wall notice, and a door south to the service corridor.',
      contents: ['keycard', 'bulletin', 'desk'],
      exits: ['briefing_to_corridor'],
    },
    corridor: {
      id: 'corridor',
      name: 'Service Corridor',
      description:
        'A narrow corridor lined with dented lockers. A fluorescent tube flickers overhead.',
      contents: ['locker', 'extinguisher', 'vault_door'],
      exits: ['corridor_to_briefing', 'corridor_to_vault'],
    },
    vault: {
      id: 'vault',
      name: 'Server Vault',
      description:
        'A cold room of humming racks. A steel safe squats in the corner beside a dark case.',
      contents: ['bomb', 'wire_red', 'wire_blue', 'wire_yellow', 'safe'],
      exits: ['vault_to_corridor'],
    },
  },

  // -----------------------------------------------------------------------
  // Doors
  // -----------------------------------------------------------------------
  doors: {
    briefing_to_corridor: {
      id: 'briefing_to_corridor',
      from: 'briefing',
      to: 'corridor',
      direction: 'south',
      label: 'service corridor',
    },
    corridor_to_briefing: {
      id: 'corridor_to_briefing',
      from: 'corridor',
      to: 'briefing',
      direction: 'south',
      label: 'briefing room',
    },
    corridor_to_vault: {
      id: 'corridor_to_vault',
      from: 'corridor',
      to: 'vault',
      direction: 'north',
      label: 'vault door',
      locked: true,
      requiresAction: { verb: 'unlock', object: 'vault_door' },
      lockedMessage: 'The vault door is locked. A card reader glows beside the frame.',
    },
    vault_to_corridor: {
      id: 'vault_to_corridor',
      from: 'vault',
      to: 'corridor',
      direction: 'south',
      label: 'service corridor',
    },
  },

  // -----------------------------------------------------------------------
  // Objects
  // -----------------------------------------------------------------------
  objects: {
    keycard: {
      id: 'keycard',
      name: 'keycard',
      aliases: ['card', 'badge', 'key card'],
      description: 'A plastic keycard on a lanyard, the logo worn away.',
      takeable: true,
    },
    bulletin: {
      id: 'bulletin',
      name: 'wall notice',
      aliases: ['bulletin', 'notice', 'memo', 'sign'],
      description: 'A pinned notice about the building, curling at the corners.',
      readable: true,
      detail:
        'QUIET HOURS 22:00 TO 06:00. MAINTENANCE LOCKERS ARE KEPT IN THE SERVICE CORRIDOR.',
    },
    desk: {
      id: 'desk',
      name: 'desk',
      description: 'A steel desk with a drawer that sticks.',
    },
    locker: {
      id: 'locker',
      name: 'locker',
      aliases: ['lockers', 'cabinet'],
      description: 'A tall steel locker with a dented door.',
      container: { closed: true, contains: ['cutters', 'manual'] },
    },
    cutters: {
      id: 'cutters',
      name: 'wire cutters',
      aliases: ['cutter', 'cutters', 'pliers', 'shears'],
      description: 'Heavy-duty wire cutters, the handles wrapped in tape.',
      takeable: true,
    },
    manual: {
      id: 'manual',
      name: 'defusal manual',
      aliases: ['manual', 'booklet', 'instructions', 'handbook'],
      description: 'A stapled booklet, swollen with damp.',
      readable: true,
      detail:
        'DEFUSAL PROCEDURE. Safe combination: 4821. The safe wire is the YELLOW one. ' +
        'Cut nothing else.',
      takeable: true,
    },
    extinguisher: {
      id: 'extinguisher',
      name: 'fire extinguisher',
      aliases: ['extinguisher', 'extinguisher red'],
      description: 'A red fire extinguisher, its inspection tag long expired.',
    },
    vault_door: {
      id: 'vault_door',
      name: 'vault door',
      aliases: ['steel door', 'vault'],
      description: 'A steel door with a card reader beside the frame.',
    },
    bomb: {
      id: 'bomb',
      name: 'bomb',
      aliases: ['device', 'package', 'charge'],
      description: 'A black case with a bundle of wires trailing from it.',
    },
    wire_red: {
      id: 'wire_red',
      name: 'red wire',
      aliases: ['red'],
      description: 'A wire trailing from the case.',
    },
    wire_blue: {
      id: 'wire_blue',
      name: 'blue wire',
      aliases: ['blue'],
      description: 'A wire trailing from the case.',
    },
    wire_yellow: {
      id: 'wire_yellow',
      name: 'yellow wire',
      aliases: ['yellow'],
      description: 'A wire trailing from the case.',
    },
    safe: {
      id: 'safe',
      name: 'safe',
      aliases: ['lockbox', 'strongbox'],
      description: 'A squat steel safe with a keypad.',
      container: { closed: true, contains: ['case'] },
    },
    case: {
      id: 'case',
      name: 'case',
      aliases: ['briefcase', 'black case'],
      description: 'A hard black case, padlocked shut.',
      takeable: true,
    },
  },

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------
  actions: [
    {
      verb: 'look',
      synonyms: ['l', 'look around'],
      args: [],
      requires: [],
      effects: [],
      text: { success: 'You look around.', failure: 'You look around.' },
    },
    {
      verb: 'inventory',
      synonyms: ['i', 'inv', 'carrying'],
      args: [],
      requires: [],
      effects: [],
      text: { success: 'You check what you are carrying.', failure: 'You check what you are carrying.' },
    },
    {
      verb: 'help',
      synonyms: ['?'],
      args: [],
      requires: [],
      effects: [],
      text: { success: 'Commands:\n{commands}', failure: 'Commands:\n{commands}' },
    },
    {
      verb: 'wait',
      synonyms: ['z'],
      args: [],
      requires: [],
      effects: [],
      text: { success: 'Time passes. Nothing changes.', failure: 'Time passes. Nothing changes.' },
    },
    {
      verb: 'hint',
      synonyms: ['h'],
      args: [],
      requires: [{ op: 'hints_remaining', count: 1 }],
      effects: [{ op: 'give_hint' }],
      text: { success: 'You think hard.', failure: 'You have no hints left.' },
    },
    {
      verb: 'examine',
      synonyms: ['x', 'inspect', 'look at'],
      args: [{ name: 'target', role: 'object-in-room' }],
      requires: [{ op: 'arg_in_room', arg: 'target' }],
      effects: [{ op: 'set_arg_state', arg: 'target', key: 'examined', value: 'true' }],
      text: {
        success: 'You take a good look at the {target}.\n{target.description}',
        failure: 'You take a good look at the {target}.',
      },
    },
    {
      verb: 'read',
      synonyms: ['study'],
      args: [{ name: 'target', role: 'object-in-room' }],
      requires: [
        { op: 'arg_in_room', arg: 'target' },
        { op: 'arg_flag', arg: 'target', key: 'readable', value: true },
        { op: 'arg_equals', arg: 'target', value: 'manual' },
      ],
      effects: [{ op: 'set_flag', key: 'manual_read', value: true }],
      text: {
        success:
          'You read the defusal manual.\n\n' +
          'DEFUSAL PROCEDURE. Safe combination: 4821. The safe wire is the YELLOW one. ' +
          'Cut nothing else.',
        failure: 'There is nothing written on the {target}.',
      },
    },
    {
      verb: 'read',
      synonyms: ['study'],
      args: [{ name: 'target', role: 'object-in-room' }],
      requires: [
        { op: 'arg_in_room', arg: 'target' },
        { op: 'arg_flag', arg: 'target', key: 'readable', value: true },
        { op: 'arg_equals', arg: 'target', value: 'bulletin' },
      ],
      effects: [{ op: 'set_flag', key: 'bulletin_read', value: true }],
      text: {
        success:
          'You read the wall notice.\n\n' +
          'QUIET HOURS 22:00 TO 06:00. MAINTENANCE LOCKERS ARE KEPT IN THE SERVICE CORRIDOR.',
        failure: 'There is nothing written on the {target}.',
      },
    },
    {
      verb: 'take',
      synonyms: ['get', 'grab', 'pick up'],
      args: [{ name: 'target', role: 'object-in-room' }],
      requires: [
        { op: 'arg_in_room', arg: 'target' },
        { op: 'arg_flag', arg: 'target', key: 'takeable', value: true },
      ],
      effects: [
        { op: 'add_to_inventory', arg: 'target' },
        { op: 'set_arg_room', arg: 'target', room: null },
      ],
      text: {
        success: 'You take the {target}.',
        failure: "You can't take the {target}. It is not going anywhere.",
      },
    },
    {
      verb: 'open',
      synonyms: [],
      args: [{ name: 'target', role: 'object-in-room' }],
      requires: [
        { op: 'arg_in_room', arg: 'target' },
        { op: 'arg_flag', arg: 'target', key: 'closed', value: true },
        { op: 'arg_flag', arg: 'target', key: 'locked', value: false },
      ],
      effects: [{ op: 'reveal_container', arg: 'target' }],
      text: {
        success: 'You open the {target}.',
        failure: "The {target} does not open.",
      },
    },
    {
      verb: 'unlock',
      synonyms: [],
      args: [
        { name: 'target', role: 'object-in-room' },
        { name: 'with', role: 'text' },
      ],
      requires: [
        { op: 'arg_in_room', arg: 'target' },
        { op: 'arg_equals', arg: 'target', value: 'vault_door' },
        { op: 'arg_flag', arg: 'target', key: 'unlocked', value: false },
        { op: 'arg_equals', arg: 'with', value: 'keycard' },
        { op: 'carrying', object: 'keycard' },
      ],
      effects: [{ op: 'set_arg_flag', arg: 'target', key: 'unlocked', value: true }],
      text: {
        success: 'You unlock the {target}.',
        failure: 'The {target} needs a keycard.',
      },
    },
    {
      verb: 'unlock',
      synonyms: [],
      args: [
        { name: 'target', role: 'object-in-room' },
        { name: 'with', role: 'text' },
      ],
      requires: [
        { op: 'arg_in_room', arg: 'target' },
        { op: 'arg_equals', arg: 'target', value: 'safe' },
        { op: 'arg_flag', arg: 'target', key: 'locked', value: true },
        { op: 'arg_equals', arg: 'with', value: '4821' },
      ],
      effects: [
        { op: 'set_arg_flag', arg: 'target', key: 'locked', value: false },
        { op: 'reveal_container', arg: 'target' },
      ],
      text: {
        success: 'The combination is right. The {target} clicks open.',
        failure: 'The {target} does not open. The combination must be four digits.',
      },
    },
    {
      verb: 'cut',
      synonyms: ['snip'],
      args: [
        { name: 'target', role: 'object-in-room' },
        { name: 'with', role: 'object-in-inventory' },
      ],
      requires: [
        { op: 'arg_in_room', arg: 'target' },
        { op: 'arg_equals', arg: 'with', value: 'cutters' },
        { op: 'carrying', object: 'cutters' },
        { op: 'flag', key: 'manual_read', value: true },
        { op: 'arg_equals', arg: 'target', value: 'wire_yellow' },
      ],
      effects: [{ op: 'set_flag', key: 'bomb_defused', value: true }],
      text: {
        success: 'The yellow wire parts with a snap. The display settles to zeros.',
        failure:
          'The wiring is a tangle of identical cables. You cannot tell which is safe ' +
          'without the defusal manual.',
      },
    },
    {
      verb: 'cut',
      synonyms: ['snip'],
      args: [
        { name: 'target', role: 'object-in-room' },
        { name: 'with', role: 'object-in-inventory' },
      ],
      requires: [
        { op: 'arg_in_room', arg: 'target' },
        { op: 'arg_equals', arg: 'with', value: 'cutters' },
        { op: 'carrying', object: 'cutters' },
        { op: 'flag', key: 'manual_read', value: true },
        { op: 'arg_equals', arg: 'target', value: 'wire_red' },
      ],
      effects: [{ op: 'finish', outcome: 'failure', reason: 'You cut the wrong wire.' }],
      text: {
        success:
          'The red wire parts with a snap. The display flashes once. Then the vault is gone.',
        failure: 'The wiring is a tangle of identical cables. You cannot tell which is safe without the defusal manual.',
      },
    },
    {
      verb: 'cut',
      synonyms: ['snip'],
      args: [
        { name: 'target', role: 'object-in-room' },
        { name: 'with', role: 'object-in-inventory' },
      ],
      requires: [
        { op: 'arg_in_room', arg: 'target' },
        { op: 'arg_equals', arg: 'with', value: 'cutters' },
        { op: 'carrying', object: 'cutters' },
        { op: 'flag', key: 'manual_read', value: true },
        { op: 'arg_equals', arg: 'target', value: 'wire_blue' },
      ],
      effects: [{ op: 'finish', outcome: 'failure', reason: 'You cut the wrong wire.' }],
      text: {
        success:
          'The blue wire parts with a snap. The display flashes once. Then the vault is gone.',
        failure: 'The wiring is a tangle of identical cables. You cannot tell which is safe without the defusal manual.',
      },
    },
    {
      verb: 'go',
      synonyms: ['walk', 'move', 'head'],
      args: [{ name: 'target', role: 'room' }],
      requires: [
        { op: 'in_room', room: 'briefing' },
        { op: 'arg_equals', arg: 'target', value: 'corridor' },
      ],
      effects: [{ op: 'move_to', room: 'corridor' }],
      text: { success: '', failure: 'You cannot go there from here.' },
    },
    {
      verb: 'go',
      synonyms: ['walk', 'move', 'head'],
      args: [{ name: 'target', role: 'room' }],
      requires: [
        { op: 'in_room', room: 'vault' },
        { op: 'arg_equals', arg: 'target', value: 'corridor' },
      ],
      effects: [{ op: 'move_to', room: 'corridor' }],
      text: { success: '', failure: 'You cannot go there from here.' },
    },
    {
      verb: 'go',
      synonyms: ['walk', 'move', 'head'],
      args: [{ name: 'target', role: 'room' }],
      requires: [
        { op: 'in_room', room: 'corridor' },
        { op: 'arg_equals', arg: 'target', value: 'briefing' },
      ],
      effects: [{ op: 'move_to', room: 'briefing' }],
      text: { success: '', failure: 'You cannot go there from here.' },
    },
    {
      verb: 'go',
      synonyms: ['walk', 'move', 'head'],
      args: [{ name: 'target', role: 'room' }],
      requires: [
        { op: 'in_room', room: 'corridor' },
        { op: 'arg_equals', arg: 'target', value: 'vault' },
        { op: 'object_flag', object: 'vault_door', key: 'unlocked', value: true },
      ],
      effects: [{ op: 'move_to', room: 'vault' }],
      text: {
        success: '',
        failure: 'The vault door is locked. A card reader glows beside the frame.',
      },
    },
  ],

  // -----------------------------------------------------------------------
  // Goals
  // -----------------------------------------------------------------------
  goals: [
    {
      id: 'disarm',
      text: 'Disarm the bomb',
      requires: [{ op: 'flag', key: 'bomb_defused', value: true }],
      achievedWhen: [{ op: 'flag', key: 'bomb_defused', value: true }],
    },
    {
      id: 'recover',
      text: 'Recover the case',
      requires: [{ op: 'carrying', object: 'case' }],
      achievedWhen: [{ op: 'carrying', object: 'case' }],
    },
  ],

  hints: HINTS,

  codes: ['4821'],

  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------
  initial: {
    roomId: 'briefing',
    inventory: [],
    objects: {
      keycard: objectState('briefing', { takeable: true }),
      bulletin: objectState('briefing', { readable: true }),
      desk: objectState('briefing'),
      locker: objectState('corridor', { closed: true }),
      cutters: objectState(null, { takeable: true }),
      manual: objectState(null, { readable: true, takeable: true }),
      extinguisher: objectState('corridor'),
      vault_door: objectState('corridor'),
      bomb: objectState('vault'),
      wire_red: objectState('vault'),
      wire_blue: objectState('vault'),
      wire_yellow: objectState('vault'),
      safe: objectState('vault', { closed: true, locked: true }),
      case: objectState(null, { takeable: true }),
    },
    flags: {},
    turn: 0,
    hintsLeft: HINTS.length,
    status: 'running',
  },
};
