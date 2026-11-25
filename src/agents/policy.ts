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
  /** Cancellation shared with the provider request, when the caller supplies it. */
  signal?: AbortSignal;
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

/** What a policy did on its last turn. */
export type PolicyTurnOutcome =
  /** It produced a command. */
  | 'command'
  /** The model answered, but the answer held no command. */
  | 'unparsable'
  /** The provider call failed. */
  | 'provider_error'
  /** The policy chose to stop. */
  | 'stopped';

/** What a policy can report about itself, for the run metrics. */
export interface PolicyMetrics {
  /** What happened on the last turn. */
  lastTurn: PolicyTurnOutcome;
  /** How many responses held no command at all. */
  unparsableResponses: number;
  /** How many provider calls failed. */
  transientErrors: number;
  /** Tokens spent so far, input and output. */
  tokensUsed: number;
  /** Input tokens spent so far. */
  inputTokens: number;
  /** Output tokens spent so far. */
  outputTokens: number;
  /** How many times each rung of the extraction ladder produced a command. */
  extractionRoutes: Record<string, number>;
  /** The hash of the prompt used on the last turn. */
  lastPromptHash: string;
  /** The raw text the model returned on the last turn. */
  lastResponse: string;
  /**
   * What the model sent back on the last turn, attempt by attempt. Present
   * when the policy can tell: not every policy asks a model.
   */
  lastReply?: ReplyRecord;
}

/**
 * How many times a reply that its allowance cut off is asked for again, with
 * the room doubled each time. After this the reply stands as it came.
 *
 * The cap on a request's output pays for a model's hidden reasoning before it
 * pays for anything the agent can read. A reply cut off that way arrives with
 * no content, so the same question is asked again with more room, and the
 * turn is still one turn.
 */
export const CUT_OFF_RETRIES = 2;

/** One request to a model, and what came back. */
export interface ReplyAttempt {
  /** The output allowance asked for, in tokens. */
  allowance?: number;
  /** `length` when the allowance cut the reply off. */
  finishReason?: 'stop' | 'length' | 'other';
  inputTokens?: number;
  outputTokens?: number;
  /** Output tokens spent on reasoning the model did not show. */
  reasoningTokens?: number;
  /** How long the visible reply was, in characters. */
  textLength: number;
  /** Why the attempt failed, when the provider failed. */
  failed?: string;
}

/** Every attempt made for one turn, and what the turn came to. */
export interface ReplyRecord {
  attempts: ReplyAttempt[];
  /** The first attempt was cut off by its allowance. */
  cutOff: boolean;
  /** Whether the turn produced a command. */
  command: boolean;
}

/**
 * A policy that reports its own metrics.
 *
 * Optional, because a policy has no business being measurable to be useful.
 * The runner asks for the metrics when they are there, and does without them
 * when they are not.
 */
export interface MeasurablePolicy extends AgentPolicy {
  metrics(): PolicyMetrics;
}

/** The metrics of a policy that does not report any. */
export const EMPTY_METRICS: PolicyMetrics = {
  lastTurn: 'stopped',
  unparsableResponses: 0,
  transientErrors: 0,
  tokensUsed: 0,
  inputTokens: 0,
  outputTokens: 0,
  extractionRoutes: {},
  lastPromptHash: '',
  lastResponse: '',
};

/** The metrics of a policy, if it reports them. */
export function metricsOf(policy: AgentPolicy): PolicyMetrics | undefined {
  const measurable = policy as Partial<MeasurablePolicy>;
  if (typeof measurable.metrics !== 'function') return undefined;
  return measurable.metrics();
}
