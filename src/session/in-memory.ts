/*
 * The in-memory session.
 *
 * The default. The tests use it, the CLI could use it, and the browser
 * client uses it when the page holds the game on its own. The kernel is a
 * library, so holding the state in a closure is all a session has to do.
 *
 * Nothing here may import a Node builtin: this file is bundled into the
 * browser, where only the platform globals exist.
 */

import type { Adventure, Event } from '../kernel/types.js';
import { buildObservation } from '../kernel/observation.js';
import { hashInitial, hashNext } from '../kernel/hash.js';
import { parseCommand } from '../kernel/parser.js';
import { reduce } from '../kernel/reduce.js';
import type { Session, SessionSnapshot, SessionTurn } from './types.js';

/** A message a human should read, from the events a command produced. */
function messageFrom(events: Event[]): string | null {
  for (const event of events) {
    if (event.type === 'action_succeeded' || event.type === 'action_failed') {
      return event.message;
    }
  }
  return null;
}

/** A game held in this process. */
export class InMemorySession implements Session {
  readonly id: string;
  readonly adventure: Adventure;

  private state: Adventure['initial'];
  private hash: string;
  private turn = 0;

  constructor(id: string, adventure: Adventure) {
    this.id = id;
    this.adventure = adventure;
    this.state = structuredClone(adventure.initial);
    this.hash = hashInitial(this.state);
  }

  async send(raw: string): Promise<SessionTurn> {
    const line = raw.trim();
    const parsed = parseCommand(this.adventure, this.state, line);

    if (!parsed.ok) {
      return {
        raw: line,
        parsed: false,
        message: parsed.message,
        observation: buildObservation(this.adventure, this.state),
        events: [],
        status: this.state.status,
        turn: this.turn,
        hash: this.hash,
      };
    }

    const transition = reduce(this.adventure, this.state, parsed.command);
    this.state = transition.state;
    this.hash = hashNext(this.hash, this.state);
    this.turn += 1;

    return {
      raw: line,
      parsed: true,
      message: messageFrom(transition.events),
      observation: buildObservation(this.adventure, this.state),
      events: transition.events,
      status: this.state.status,
      turn: this.turn,
      hash: this.hash,
    };
  }

  async snapshot(): Promise<SessionSnapshot> {
    return this.toSnapshot();
  }

  async reset(): Promise<SessionSnapshot> {
    this.state = structuredClone(this.adventure.initial);
    this.hash = hashInitial(this.state);
    this.turn = 0;
    return this.toSnapshot();
  }

  /**
   * Adopt a state, hash and turn from outside, as a resume does.
   *
   * The caller is trusted to have computed the hash over the state it
   * passes; the session does not re-derive history it cannot see.
   */
  restore(state: Adventure['initial'], hash: string, turn: number): void {
    this.state = structuredClone(state);
    this.hash = hash;
    this.turn = turn;
  }

  private toSnapshot(): SessionSnapshot {
    return {
      id: this.id,
      adventureId: this.adventure.id,
      turn: this.turn,
      status: this.state.status,
      hash: this.hash,
      state: structuredClone(this.state),
    };
  }
}
