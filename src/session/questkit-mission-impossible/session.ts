/*
 * The QuestKit world, as a session.
 *
 * The Phase 5 session interface is the seam this experiment needed: the
 * agent loop is unchanged, and only the thing that holds the state changes.
 * Here the state lives in a QuestKit engine, and the observation the agent
 * sees is built from what that engine knows.
 *
 * The observation is deliberately the engine's own view: everything in the
 * room and everything carried. That is the difference the comparison is
 * about, and hiding it would make the comparison meaningless.
 */

import { createHash } from 'node:crypto';
import type { Adventure, Event, GameState, Observation } from '../../kernel/types.js';
import { canonicalJson } from '../../kernel/hash.js';
import { createEngine, type Engine, type EngineState } from './engine.js';
import { BRIEF, GOLD_PATH, WORLD } from './world.js';

/** The verbs this world answers to, in the shape the prompt builder reads. */
const VERBS = [
  { verb: 'look', args: [] },
  { verb: 'examine', args: [{ name: 'target' }] },
  { verb: 'take', args: [{ name: 'target' }] },
  { verb: 'open', args: [{ name: 'target' }] },
  { verb: 'read', args: [{ name: 'target' }] },
  { verb: 'unlock', args: [{ name: 'target' }, { name: 'key' }] },
  { verb: 'go', args: [{ name: 'target' }] },
  { verb: 'cut', args: [{ name: 'target' }, { name: 'tool' }] },
  { verb: 'inventory', args: [] },
  { verb: 'wait', args: [] },
  { verb: 'hint', args: [] },
  { verb: 'help', args: [] },
];

/** The description of the world the prompt builder is given. */
export const QUESTKIT_ADVENTURE = {
  id: 'questkit-mission-impossible',
  title: 'Operation Nightingale (QuestKit)',
  version: '1.0.0',
  brief: BRIEF,
  outcomeText: {
    success: 'The bomb is dead and the case is in your hands. Exfiltration complete.',
    failure: 'The blast takes the vault with it. There is nothing left to recover.',
  },
  actions: VERBS.map((verb) => ({ ...verb, synonyms: [], requires: [], effects: [], text: { success: '', failure: '' } })),
  // The same two objectives, under the same identifiers, so the agent is
  // told the same mission on both engines.
  goals: [
    { id: 'disarm', text: 'Disarm the bomb' },
    { id: 'recover', text: 'Recover the case' },
  ],
  hints: [],
} as unknown as Adventure;

/**
 * What one command produced.
 *
 * The same shape as the session interface the browser client uses, declared
 * here because this layer may not reach up to it: a world is data plus rules,
 * and it does not know what a session is.
 */
export interface QuestKitTurn {
  raw: string;
  parsed: boolean;
  message: string | null;
  observation: Observation;
  events: Event[];
  status: GameState['status'];
  turn: number;
  hash: string;
}

/** The state of the world, for a caller that wants it. */
export interface QuestKitSnapshot {
  id: string;
  adventureId: string;
  turn: number;
  status: GameState['status'];
  hash: string;
  state: GameState;
}

/** A world whose state lives in a QuestKit engine. */
export class QuestKitSession {
  readonly id: string;
  readonly adventure: Adventure;

  private engine: Engine;
  private turn = 0;
  private hash: string;

  constructor(id: string, engine: Engine = createEngine(WORLD)) {
    this.id = id;
    this.engine = engine;
    this.adventure = QUESTKIT_ADVENTURE;
    this.hash = this.hashOf(this.engine.state());
  }

  /** The engine's own state. */
  private rich(): EngineState {
    return this.engine.state();
  }

  /** A hash over what the engine knows, so a run can be checked afterwards. */
  private hashOf(state: EngineState): string {
    const payload = canonicalJson({
      room: state.room.id,
      contents: state.contents,
      inventory: state.inventory,
      exits: state.exits,
    });
    return `sha256:${createHash('sha256').update(payload).digest('hex')}`;
  }

  /** The observation the agent sees. */
  private view(state: EngineState, said: string): Observation {
    return {
      turn: this.turn,
      room: state.room,
      visible: state.contents,
      inventory: state.inventory,
      exits: state.exits.map((exit) => ({
        direction: exit.label,
        label: exit.label,
        toName: exit.to,
        status: 'open' as const,
      })),
      messages: said.length === 0 ? [] : [said],
      goals: [
        { id: 'disarm', text: 'Disarm the bomb', status: this.done('bomb.defused') ? 'complete' : 'incomplete' },
        { id: 'recover', text: 'Recover the case', status: this.done('case.carried') ? 'complete' : 'incomplete' },
      ],
    };
  }

  /** Whether the world has reached a state the mission cares about. */
  private done(flag: string): boolean {
    const state = this.engine.state();
    if (flag === 'bomb.defused') return state.flag('bomb.defused');
    return state.inventory.some((carried) => carried.id === 'case');
  }

  /** The status the mission is in. */
  private status(): GameState['status'] {
    if (this.done('bomb.defused') && this.done('case.carried')) return 'success';
    return 'running';
  }

  /** The world as the agent sees it, right now. */
  async observe(): Promise<Observation> {
    const state = this.rich();
    return this.view(state, '');
  }

  async send(raw: string): Promise<QuestKitTurn> {
    const line = raw.trim();
    const said = this.engine.send(line);
    const state = this.rich();
    const understood = !/^I don't understand your command\.$/.test(said.trim());
    if (understood) this.turn += 1;
    this.hash = this.hashOf(state);

    const events: Event[] = understood
      ? [{ type: 'action_succeeded', message: said } as unknown as Event]
      : [];

    return {
      raw: line,
      parsed: understood,
      message: said.length === 0 ? null : said,
      observation: this.view(state, said),
      events,
      status: this.status(),
      turn: this.turn,
      hash: this.hash,
    };
  }

  async snapshot(): Promise<QuestKitSnapshot> {
    const state = this.rich();
    return {
      id: this.id,
      adventureId: this.adventure.id,
      turn: this.turn,
      status: this.status(),
      hash: this.hash,
      state: {
        roomId: state.room.id,
        inventory: state.inventory.map((thing) => thing.id),
        flags: {},
        status: this.status(),
      } as unknown as GameState,
    };
  }

  async reset(): Promise<QuestKitSnapshot> {
    this.engine = createEngine(WORLD);
    this.turn = 0;
    this.hash = this.hashOf(this.engine.state());
    return this.snapshot();
  }
}

/** The gold path this port takes, the same ten commands our own world takes. */
export { GOLD_PATH };
