/*
 * The session interface.
 *
 * A session is one held game: a world, its state, and the turn counter and
 * hash chain that identity rests on. The kernel does the work; a session
 * decides where the state lives, which is the only decision the three
 * implementations differ on.
 *
 * The methods are async because one of the implementations is a network
 * away. The in-memory and file implementations resolve immediately, and a
 * caller written against this interface cannot tell them apart, which is
 * the point: the same game logic works against all three.
 */

import type { Adventure, Event, GameState, Observation } from '../kernel/types.js';

/** What one sent command produced. */
export interface SessionTurn {
  /** The line the session was given, trimmed. */
  raw: string;
  /** Whether the line parsed into a command the world knows. */
  parsed: boolean;
  /** The message a human should read: the parser's or the engine's own. */
  message: string | null;
  /** The world as it stands after the command. */
  observation: Observation;
  /** The events the command produced, in order. */
  events: Event[];
  /** The mission's status after the command. */
  status: GameState['status'];
  /** How many commands have been accepted, this one included. */
  turn: number;
  /** The state hash after this command. Unchanged when the line did not parse. */
  hash: string;
}

/** The state of a held game, serialisable, with nothing else attached. */
export interface SessionSnapshot {
  id: string;
  adventureId: string;
  turn: number;
  status: GameState['status'];
  hash: string;
  state: GameState;
}

/** A held game. */
export interface Session {
  readonly id: string;
  readonly adventure: Adventure;
  /** Apply one command line and report what it produced. */
  send(raw: string): Promise<SessionTurn>;
  /** The current state, hash and turn. */
  snapshot(): Promise<SessionSnapshot>;
  /** Return the world to its first state. */
  reset(): Promise<SessionSnapshot>;
}
