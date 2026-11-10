/*
 * The policy port.
 *
 * A policy decides what to do next. The runner cannot tell a scripted policy
 * from a random one from a language model, which is what makes the comparison
 * fair: a human transcript and an agent transcript go through the same loop.
 *
 * A policy returns raw command text, not a parsed command. Parsing belongs to
 * the engine, so an invalid command is counted against the agent rather than
 * quietly repaired.
 */

import type { GameState, Observation } from '../kernel/types.js';

export interface PolicyContext {
  /** Everything the policy has seen so far, oldest first. */
  history: Observation[];
  /** The current observation. */
  observation: Observation;
  /** The current game state, for policies that need the facts directly. */
  state: GameState;
  turn: number;
  turnsLeft: number;
  /** End the run early. */
  stop(reason: string): void;
  /** True when the policy has asked to stop. */
  readonly stopped: boolean;
  readonly stopReason: string | undefined;
}

export interface AgentPolicy {
  readonly id: string;
  /** The next command, or null to end the run. */
  next(context: PolicyContext): Promise<string | null>;
}
