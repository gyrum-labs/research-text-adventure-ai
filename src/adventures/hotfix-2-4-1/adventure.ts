/*
 * The second world: a release, written as an adventure.
 *
 * The kernel does not change. That is the point of this file. A team is a
 * room, a ticket is an object, a gate is a door, a blocked deploy is a
 * detonation, and the vocabulary is the kernel's rather than the game's.
 *
 * What did change, and it changed because the world did:
 *
 *   - The verbs are the organisation's. "claim" rather than "take", "deploy"
 *     rather than "cut". The action vocabulary is data, so an adventure can
 *     name its own commands.
 *   - The flags are the organisation's. The claimable flag is called
 *     "claimable", not "takeable", because the kernel reads whatever key the
 *     action asks for.
 *   - The arguments differ in shape. The release gate is unlocked with an
 *     object the agent is carrying, where the vault door is unlocked with a
 *     word.
 *
 * The dependency chain is the same shape as the first world's, on purpose:
 * a credential opens a gate, a container holds the two things you need, one
 * of them tells you which of three similar things is the right one, and the
 * other one is what lets you act. An agent that learned the game has learned
 * a shape, and the shape has to survive the change of nouns.
 */

import type { Adventure, GameObjectState } from '../../kernel/types.js';

const HINTS = [
  {
    id: 'h1',
    text: 'The on-call board lists where the runbook is kept.',
  },
  {
    id: 'h2',
    text: 'A release gate wants the ticket in your hand, not just its number.',
  },
  {
    id: 'h3',
    text: 'The runbook names exactly one release that is allowed to go out tonight.',
  },
];

/** Seed the runtime state for one object from its definition. */
function objectState(at: string | null, flags: Record<string, boolean> = {}): GameObjectState {
  return { at, flags: { ...flags }, state: {} };
}

export const adventure: Adventure = {
  id: 'hotfix-2-4-1',
  title: 'The 2.4.1 Hotfix',
  version: '1.0.4',

  brief:
    'The customer SLA expires at 17:00 and the 2.4.1 hotfix is not shipped. Two objectives: ' +
    'ship the hotfix, and notify the customer. Nothing else is known. You are platform ' +
    'on-call. Discover the rest by exploring.',

  outcomeText: {
    success: 'The hotfix is out, the customer has been told, and the SLA holds.',
    failure: 'The wrong release went out. The customer is down and the SLA will not hold.',
  },

  // -----------------------------------------------------------------------
  // Rooms
  // -----------------------------------------------------------------------

  rooms: {
    platform: {
      id: 'platform',
      name: 'Platform On-call',
      description:
        'A corner of the office with two chairs and a wall screen showing the incident board.',
      contents: ['incident_ticket', 'oncall_board'],
      exits: ['platform_to_release'],
    },
    release_engineering: {
      id: 'release_engineering',
      name: 'Release Engineering',
      description:
        'Desks facing a wall of build screens. A shared inbox sits between them, and three ' +
        'release artefacts are pinned to the board.',
      contents: ['inbox', 'release_2_3_9', 'release_2_4_0', 'release_2_4_1', 'release_gate'],
      exits: ['release_to_platform', 'release_to_customer'],
    },
    customer_success: {
      id: 'customer_success',
      name: 'Customer Success',
      description:
        'Two desks and a long silence. A customer handover sits on the desk, still sealed.',
      contents: ['customer_handover'],
      exits: ['customer_to_release'],
    },
  },

  // -----------------------------------------------------------------------
  // Doors
  // -----------------------------------------------------------------------

  doors: {
    platform_to_release: {
      id: 'platform_to_release',
      from: 'platform',
      to: 'release_engineering',
      direction: 'north',
      label: 'release engineering',
    },
    release_to_platform: {
      id: 'release_to_platform',
      from: 'release_engineering',
      to: 'platform',
      direction: 'south',
      label: 'platform on-call',
    },
    release_to_customer: {
      id: 'release_to_customer',
      from: 'release_engineering',
      to: 'customer_success',
      direction: 'east',
      label: 'customer success',
      locked: true,
      requiresAction: { verb: 'unlock', object: 'release_gate' },
      lockedMessage: 'The release gate is shut. It wants the incident ticket.',
    },
    customer_to_release: {
      id: 'customer_to_release',
      from: 'customer_success',
      to: 'release_engineering',
      direction: 'west',
      label: 'release engineering',
    },
  },

  // -----------------------------------------------------------------------
  // Objects
  // -----------------------------------------------------------------------

  objects: {
    incident_ticket: {
      id: 'incident_ticket',
      name: 'incident ticket',
      aliases: ['incident-ticket', 'INC-4471', 'ticket'],
      description: 'INC-4471, printed on a single sheet of paper.',
      takeable: true,
    },
    oncall_board: {
      id: 'oncall_board',
      name: 'on-call board',
      aliases: ['board'],
      description: 'A whiteboard with the night rota and three arrows pointing away.',
      readable: true,
      detail:
        'ON CALL. Release engineering holds the deploy credential and the release runbook. ' +
        'The customer success handover is sealed with an approval code.',
    },
    inbox: {
      id: 'inbox',
      name: 'shared inbox',
      aliases: ['inbox'],
      description: 'A shared inbox with a lid that is not easy to open.',
      container: { closed: true, contains: ['runbook', 'deploy_credential'] },
    },
    runbook: {
      id: 'runbook',
      name: 'release runbook',
      aliases: ['runbook'],
      description: 'A thin booklet, swollen with sticky notes.',
      readable: true,
      detail:
        'RELEASE GATE. Deploy release-2.4.1 and nothing else tonight. The customer handover ' +
        'needs the approval code 7311.',
    },
    deploy_credential: {
      id: 'deploy_credential',
      name: 'deploy credential',
      aliases: ['credential'],
      description: 'A short-lived credential on a card, with a timestamp on it.',
      takeable: true,
    },
    release_2_3_9: {
      id: 'release_2_3_9',
      name: 'release-2.3.9',
      aliases: ['2.3.9'],
      description: 'A build artefact labelled release-2.3.9.',
    },
    release_2_4_0: {
      id: 'release_2_4_0',
      name: 'release-2.4.0',
      aliases: ['2.4.0'],
      description: 'A build artefact labelled release-2.4.0.',
    },
    release_2_4_1: {
      id: 'release_2_4_1',
      name: 'release-2.4.1',
      aliases: ['2.4.1'],
      description: 'A build artefact labelled release-2.4.1.',
    },
    release_gate: {
      id: 'release_gate',
      name: 'release gate',
      aliases: ['gate'],
      description: 'A barrier to the east with a reader beside it.',
    },
    customer_handover: {
      id: 'customer_handover',
      name: 'customer handover',
      aliases: ['handover'],
      description: 'A sealed handover pack for the customer.',
      container: { closed: true, contains: ['customer_notification'] },
    },
    customer_notification: {
      id: 'customer_notification',
      name: 'customer notification',
      aliases: ['notification'],
      description: 'A drafted notification, signed but unsent.',
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
      synonyms: ['i', 'inv', 'carrying', 'context'],
      args: [],
      requires: [],
      effects: [],
      text: {
        success: 'You check what you are holding.',
        failure: 'You check what you are holding.',
      },
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
      args: [{ name: 'target', role: 'object' }],
      requires: [{ op: 'arg_in_room', arg: 'target' }],
      effects: [{ op: 'set_arg_state', arg: 'target', key: 'examined', value: 'true' }],
      text: {
        success: 'You take a good look at the {target}.\n{target.description}',
        failure: 'You take a good look at the {target}.',
      },
    },
    {
      verb: 'claim',
      synonyms: ['take', 'get', 'pick up'],
      args: [{ name: 'target', role: 'object-in-room' }],
      requires: [
        { op: 'arg_in_room', arg: 'target' },
        { op: 'arg_flag', arg: 'target', key: 'claimable', value: true },
      ],
      effects: [
        { op: 'add_to_inventory', arg: 'target' },
        { op: 'set_arg_room', arg: 'target', room: null },
      ],
      text: {
        success: 'You pick up the {target}.',
        failure: "You can't pick up the {target}. It is not going anywhere.",
      },
    },
    {
      verb: 'read',
      synonyms: ['study'],
      args: [{ name: 'target', role: 'object-in-room' }],
      requires: [
        { op: 'arg_in_room', arg: 'target' },
        { op: 'arg_flag', arg: 'target', key: 'readable', value: true },
        { op: 'arg_equals', arg: 'target', value: 'runbook' },
      ],
      effects: [{ op: 'set_flag', key: 'runbook_read', value: true }],
      text: {
        success:
          'You read the release runbook.\n\n' +
          'RELEASE GATE. Deploy release-2.4.1 and nothing else tonight. The customer handover ' +
          'needs the approval code 7311.',
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
        { op: 'arg_equals', arg: 'target', value: 'oncall_board' },
      ],
      effects: [{ op: 'set_flag', key: 'board_read', value: true }],
      text: {
        success:
          'You read the on-call board.\n\n' +
          'ON CALL. Release engineering holds the deploy credential and the release runbook. ' +
          'The customer success handover is sealed with an approval code.',
        failure: 'There is nothing written on the {target}.',
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
        failure: 'The {target} does not open.',
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
        { op: 'arg_equals', arg: 'target', value: 'release_gate' },
        { op: 'arg_flag', arg: 'target', key: 'unlocked', value: false },
        { op: 'arg_equals', arg: 'with', value: 'incident-ticket' },
        { op: 'carrying', object: 'incident_ticket' },
      ],
      effects: [{ op: 'set_arg_flag', arg: 'target', key: 'unlocked', value: true }],
      text: {
        success: 'The gate takes the ticket reference. The release track opens.',
        failure: 'The gate needs the incident ticket.',
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
        { op: 'arg_equals', arg: 'target', value: 'customer_handover' },
        { op: 'arg_flag', arg: 'target', key: 'locked', value: true },
        { op: 'arg_equals', arg: 'with', value: '7311' },
      ],
      effects: [
        { op: 'set_arg_flag', arg: 'target', key: 'locked', value: false },
        { op: 'reveal_container', arg: 'target' },
      ],
      text: {
        success: 'The approval code is right. The handover opens.',
        failure: 'The handover does not open. The approval code is four digits.',
      },
    },
    {
      verb: 'deploy',
      synonyms: ['ship', 'release'],
      args: [
        { name: 'target', role: 'object-in-room' },
        { name: 'with', role: 'object-in-inventory' },
      ],
      requires: [
        { op: 'arg_in_room', arg: 'target' },
        { op: 'arg_equals', arg: 'with', value: 'deploy_credential' },
        { op: 'carrying', object: 'deploy_credential' },
        { op: 'flag', key: 'runbook_read', value: true },
        { op: 'arg_equals', arg: 'target', value: 'release_2_4_1' },
      ],
      effects: [{ op: 'set_flag', key: 'hotfix_shipped', value: true }],
      text: {
        success: 'release-2.4.1 rolls out. The dashboards go quiet.',
        failure: 'You cannot tell which release is right without the runbook.',
      },
    },
    {
      verb: 'deploy',
      synonyms: ['ship', 'release'],
      args: [
        { name: 'target', role: 'object-in-room' },
        { name: 'with', role: 'object-in-inventory' },
      ],
      requires: [
        { op: 'arg_in_room', arg: 'target' },
        { op: 'arg_equals', arg: 'with', value: 'deploy_credential' },
        { op: 'carrying', object: 'deploy_credential' },
        { op: 'flag', key: 'runbook_read', value: true },
        { op: 'arg_equals', arg: 'target', value: 'release_2_3_9' },
      ],
      effects: [{ op: 'finish', outcome: 'failure', reason: 'The wrong release went out.' }],
      text: {
        success:
          'release-2.3.9 rolls out. The alerts start immediately. The customer is down.',
        failure: 'You cannot tell which release is right without the runbook.',
      },
    },
    {
      verb: 'deploy',
      synonyms: ['ship', 'release'],
      args: [
        { name: 'target', role: 'object-in-room' },
        { name: 'with', role: 'object-in-inventory' },
      ],
      requires: [
        { op: 'arg_in_room', arg: 'target' },
        { op: 'arg_equals', arg: 'with', value: 'deploy_credential' },
        { op: 'carrying', object: 'deploy_credential' },
        { op: 'flag', key: 'runbook_read', value: true },
        { op: 'arg_equals', arg: 'target', value: 'release_2_4_0' },
      ],
      effects: [{ op: 'finish', outcome: 'failure', reason: 'The wrong release went out.' }],
      text: {
        success:
          'release-2.4.0 rolls out. The dashboards go red. The customer is down.',
        failure: 'You cannot tell which release is right without the runbook.',
      },
    },
    {
      verb: 'go',
      synonyms: ['walk', 'move', 'head'],
      args: [{ name: 'target', role: 'room' }],
      requires: [
        { op: 'in_room', room: 'platform' },
        { op: 'arg_equals', arg: 'target', value: 'release_engineering' },
      ],
      effects: [{ op: 'move_to', room: 'release_engineering' }],
      text: { success: '', failure: 'You cannot go there from here.' },
    },
    {
      verb: 'go',
      synonyms: ['walk', 'move', 'head'],
      args: [{ name: 'target', role: 'room' }],
      requires: [
        { op: 'in_room', room: 'release_engineering' },
        { op: 'arg_equals', arg: 'target', value: 'platform' },
      ],
      effects: [{ op: 'move_to', room: 'platform' }],
      text: { success: '', failure: 'You cannot go there from here.' },
    },
    {
      verb: 'go',
      synonyms: ['walk', 'move', 'head'],
      args: [{ name: 'target', role: 'room' }],
      requires: [
        { op: 'in_room', room: 'release_engineering' },
        { op: 'arg_equals', arg: 'target', value: 'customer_success' },
        { op: 'object_flag', object: 'release_gate', key: 'unlocked', value: true },
      ],
      effects: [{ op: 'move_to', room: 'customer_success' }],
      text: {
        success: '',
        failure: 'The release gate is shut. It wants the incident ticket.',
      },
    },
    {
      verb: 'go',
      synonyms: ['walk', 'move', 'head'],
      args: [{ name: 'target', role: 'room' }],
      requires: [
        { op: 'in_room', room: 'customer_success' },
        { op: 'arg_equals', arg: 'target', value: 'release_engineering' },
      ],
      effects: [{ op: 'move_to', room: 'release_engineering' }],
      text: { success: '', failure: 'You cannot go there from here.' },
    },
  ],

  // -----------------------------------------------------------------------
  // Goals
  // -----------------------------------------------------------------------

  goals: [
    {
      id: 'ship',
      text: 'Ship the 2.4.1 hotfix',
      requires: [{ op: 'flag', key: 'hotfix_shipped', value: true }],
      achievedWhen: [{ op: 'flag', key: 'hotfix_shipped', value: true }],
    },
    {
      id: 'notify',
      text: 'Notify the customer',
      requires: [{ op: 'carrying', object: 'customer_notification' }],
      achievedWhen: [{ op: 'carrying', object: 'customer_notification' }],
    },
  ],

  hints: HINTS,

  codes: ['7311'],

  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------

  initial: {
    roomId: 'platform',
    inventory: [],
    objects: {
      incident_ticket: objectState('platform', { claimable: true, readable: true }),
      oncall_board: objectState('platform', { readable: true }),
      inbox: objectState('release_engineering', { closed: true }),
      runbook: objectState(null, { claimable: true, readable: true }),
      deploy_credential: objectState(null, { claimable: true }),
      release_2_3_9: objectState('release_engineering'),
      release_2_4_0: objectState('release_engineering'),
      release_2_4_1: objectState('release_engineering'),
      release_gate: objectState('release_engineering'),
      customer_handover: objectState('customer_success', { closed: true, locked: true }),
      customer_notification: objectState(null, { claimable: true }),
    },
    flags: {},
    turn: 0,
    hintsLeft: HINTS.length,
    status: 'running',
  },
};
