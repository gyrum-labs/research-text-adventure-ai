/*
 * Operation Nightingale, ported to QuestKit.
 *
 * The same world the series built for itself, declared in the toolkit's own
 * vocabulary: locations, objects, exits and commands, with the rules written
 * as scripts. Nothing about the game changes; the engine does.
 *
 * The comparison this file exists for is not "our engine is better". It is
 * "is the agent's score a fact about the agent, or about the engine", and
 * the honest version of that question needs the same content on both sides.
 */

import type { Section } from './engine.js';

/** The brief the agent is given, the same words our own world gives it. */
export const BRIEF =
  'Mission brief. A booby-trapped case is locked in the server vault. Two objectives: ' +
  'disarm the bomb, and recover the case. Nothing else is known. You are in the briefing ' +
  'room. Discover the rest by exploring.';

/** The world, as the toolkit's sections. */
export const WORLD: Section[] = [
  {
    type: 'game',
    name: 'operation-nightingale',
    attributes: {
      pov: 'player',
      title: 'Operation Nightingale',
      description: BRIEF,
    },
  },

  // -----------------------------------------------------------------------
  // The rooms
  // -----------------------------------------------------------------------
  {
    type: 'location',
    name: 'briefing',
    attributes: {
      name: 'briefing',
      alias: 'Briefing Room',
      description:
        'A windowless office. A desk, a wall notice, and a door south to the service corridor.',
    },
  },
  {
    type: 'location',
    name: 'corridor',
    attributes: {
      name: 'corridor',
      alias: 'Service Corridor',
      description:
        'A narrow corridor lined with dented lockers. A fluorescent tube flickers overhead.',
    },
  },
  {
    type: 'location',
    name: 'vault',
    attributes: {
      name: 'vault',
      alias: 'Server Vault',
      description:
        'A cold room of humming racks. A steel safe squats in the corner beside a dark case.',
    },
  },

  // -----------------------------------------------------------------------
  // The player
  // -----------------------------------------------------------------------
  {
    type: 'object',
    name: 'player',
    attributes: {
      name: 'player',
      alias: 'yourself',
      parent: 'briefing',
      look: 'A plastic keycard on a lanyard would be a start.',
    },
  },

  // -----------------------------------------------------------------------
  // The things
  // -----------------------------------------------------------------------
  {
    type: 'object',
    name: 'keycard',
    attributes: {
      name: 'keycard',
      alias: 'keycard',
      alt: ['card', 'badge', 'key card'],
      description: 'A plastic keycard on a lanyard, the logo worn away.',
      take: true,
      parent: 'briefing',
    },
  },
  {
    type: 'object',
    name: 'bulletin',
    attributes: {
      name: 'bulletin',
      alias: 'wall notice',
      alt: ['bulletin', 'notice', 'memo', 'sign'],
      description: 'A pinned notice about the building, curling at the corners.',
      read:
        'QUIET HOURS 22:00 TO 06:00. MAINTENANCE LOCKERS ARE KEPT IN THE SERVICE CORRIDOR.',
      parent: 'briefing',
    },
  },
  {
    type: 'object',
    name: 'desk',
    attributes: {
      name: 'desk',
      alias: 'desk',
      description: 'A steel desk with a drawer that sticks.',
      parent: 'briefing',
    },
  },
  {
    type: 'object',
    name: 'locker',
    attributes: {
      name: 'locker',
      alias: 'locker',
      alt: ['lockers', 'cabinet'],
      description: 'A tall steel locker with a dented door.',
      closed: true,
      parent: 'corridor',
    },
  },
  {
    type: 'object',
    name: 'cutters',
    attributes: {
      name: 'cutters',
      alias: 'wire cutters',
      alt: ['cutter', 'cutters', 'pliers', 'shears'],
      description: 'Heavy-duty wire cutters, the handles wrapped in tape.',
      take: true,
      parent: 'locker',
    },
  },
  {
    type: 'object',
    name: 'manual',
    attributes: {
      name: 'manual',
      alias: 'defusal manual',
      alt: ['manual', 'booklet', 'instructions', 'handbook'],
      description: 'A stapled booklet, swollen with damp.',
      read:
        'DEFUSAL PROCEDURE. Safe combination: 4821. The safe wire is the YELLOW one. ' +
        'Cut nothing else.',
      take: true,
      parent: 'locker',
    },
  },
  {
    type: 'object',
    name: 'extinguisher',
    attributes: {
      name: 'extinguisher',
      alias: 'fire extinguisher',
      alt: ['extinguisher', 'extinguisher red'],
      description: 'A red fire extinguisher, its inspection tag long expired.',
      parent: 'corridor',
    },
  },
  {
    type: 'object',
    name: 'vault_door',
    attributes: {
      name: 'vault_door',
      alias: 'vault door',
      alt: ['steel door', 'vault'],
      description: 'A steel door with a card reader beside the frame.',
      key: 'keycard',
      parent: 'corridor',
    },
  },
  {
    type: 'object',
    name: 'bomb',
    attributes: {
      name: 'bomb',
      alias: 'bomb',
      alt: ['device', 'package', 'charge'],
      description: 'A black case with a bundle of wires trailing from it.',
      parent: 'vault',
    },
  },
  {
    type: 'object',
    name: 'wire_red',
    attributes: {
      name: 'wire_red',
      alias: 'red wire',
      alt: ['red'],
      description: 'A wire trailing from the case.',
      parent: 'vault',
    },
  },
  {
    type: 'object',
    name: 'wire_blue',
    attributes: {
      name: 'wire_blue',
      alias: 'blue wire',
      alt: ['blue'],
      description: 'A wire trailing from the case.',
      parent: 'vault',
    },
  },
  {
    type: 'object',
    name: 'wire_yellow',
    attributes: {
      name: 'wire_yellow',
      alias: 'yellow wire',
      alt: ['yellow'],
      description: 'A wire trailing from the case.',
      parent: 'vault',
    },
  },
  {
    type: 'object',
    name: 'safe',
    attributes: {
      name: 'safe',
      alias: 'safe',
      alt: ['lockbox', 'strongbox'],
      description: 'A squat steel safe with a keypad.',
      closed: true,
      code: '4821',
      parent: 'vault',
    },
  },
  {
    type: 'object',
    name: 'case',
    attributes: {
      name: 'case',
      alias: 'case',
      alt: ['briefcase', 'black case'],
      description: 'A hard black case, padlocked shut.',
      take: true,
      parent: 'safe',
    },
  },

  // -----------------------------------------------------------------------
  // The doors
  // -----------------------------------------------------------------------
  {
    type: 'exit',
    name: 'briefing_to_corridor',
    attributes: { parent: 'briefing', to: 'corridor', alias: 'corridor', direction: 'south' },
  },
  {
    type: 'exit',
    name: 'corridor_to_briefing',
    attributes: { parent: 'corridor', to: 'briefing', alias: 'briefing', direction: 'south' },
  },
  {
    type: 'exit',
    name: 'corridor_to_vault',
    attributes: {
      parent: 'corridor',
      to: 'vault',
      alias: 'vault',
      direction: 'north',
      locked: true,
      door: 'vault_door',
    },
  },
  {
    type: 'exit',
    name: 'vault_to_corridor',
    attributes: { parent: 'vault', to: 'corridor', alias: 'corridor', direction: 'south' },
  },

  // -----------------------------------------------------------------------
  // The commands this world needs on top of the toolkit's own
  // -----------------------------------------------------------------------
  {
    type: 'command',
    name: 'go',
    patterns: ['go #exit#'],
    action: `
var target = get(exit, 'to');
if (get(exit, 'locked') === true) {
  msg("The vault door is locked. A card reader glows beside the frame.");
  return;
}
questkit.go(target);
`,
  },
  {
    type: 'command',
    name: 'open',
    patterns: ['open #object#'],
    action: `
if (get(object, 'closed') !== true) {
  msg("You cannot open the " + questkit.displayAlias(object) + ".");
  return;
}
set(object + '.closed', false);
var room = questkit.povParent();
questkit.getDirectChildren(object).forEach(function (child) { set(child, 'parent', room); });
msg("You open the " + questkit.displayAlias(object) + ".");
`,
  },
  {
    type: 'command',
    name: 'read',
    patterns: ['read #object#'],
    action: `
var text = get(object, 'read');
if (!text) {
  msg("There is nothing written on the " + questkit.displayAlias(object) + ".");
  return;
}
msg(text);
set('manual_read', true);
`,
  },
  {
    type: 'command',
    name: 'unlock',
    patterns: ['unlock #object# with #text#'],
    action: `
var wanted = get(object, 'key');
var held = questkit.getDirectChildren('player').filter(function (child) {
  return get(child, 'name') === text;
});
if (wanted) {
  if (text !== wanted) {
    msg("That does not unlock the " + questkit.displayAlias(object) + ".");
    return;
  }
  if (held.length === 0) {
    msg("You are not carrying the " + wanted + ".");
    return;
  }
  set(object, 'unlocked', true);
  questkit.allExits().forEach(function (exit) {
    if (get(exit, 'door') === object) set(exit + '.locked', false);
  });
  msg("You unlock the " + questkit.displayAlias(object) + " with the " + wanted + ".");
  return;
}
if (get(object, 'code') === text) {
  set(object, 'unlocked', true);
  set(object + '.closed', false);
  var room = questkit.povParent();
  questkit.getDirectChildren(object).forEach(function (child) { set(child, 'parent', room); });
  msg("The keypad accepts " + text + ". The " + questkit.displayAlias(object) + " swings open.");
  return;
}
msg("That does not unlock the " + questkit.displayAlias(object) + ".");
`,
  },
  {
    type: 'command',
    name: 'cut',
    patterns: ['cut #object# with #object2#'],
    action: `
if (get(object, 'alias') !== 'yellow wire') {
  msg("Cutting that would set the bomb off.");
  return;
}
if (get(object2, 'alias') !== 'wire cutters') {
  msg("You need the wire cutters for that.");
  return;
}
var carried = questkit.getDirectChildren('player').some(function (child) {
  return get(child, 'alias') === 'wire cutters';
});
if (!carried) {
  msg("You are not carrying the wire cutters.");
  return;
}
set('bomb', 'defused', true);
msg("The yellow wire falls away. The bomb is dead.");
`,
  },
  {
    type: 'command',
    name: 'hint',
    patterns: ['hint'],
    action: `
if (!get('manual_read')) {
  msg("Somewhere in this building there is a locker that is not in this room.");
}
else if (get('bomb', 'defused') !== true) {
  msg("The manual says the safe wire is the yellow one.");
}
else {
  msg("The case is in the safe. The combination is four digits.");
}
`,
  },
  {
    type: 'command',
    name: 'wait',
    patterns: ['wait'],
    action: 'msg("Time passes. Nothing changes.");',
  },
  {
    type: 'command',
    name: 'help',
    patterns: ['help'],
    action: `
msg("The commands you know: look, examine, take, open, read, unlock, go, cut, inventory, wait, hint, help.");
`,
  },
];

/** The gold path through this world, the same ten commands our own world takes. */
export const GOLD_PATH: string[] = [
  'take keycard',
  'go corridor',
  'open locker',
  'take cutters',
  'read manual',
  'unlock vault door with keycard',
  'go vault',
  'cut yellow wire with cutters',
  'unlock safe with 4821',
  'take case',
];
