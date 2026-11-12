/*
 * The runner: the turn loop.
 *
 * The loop is deliberately dull. Observe, ask the policy, parse, reduce,
 * record, check the goals. Everything interesting happens inside the policy
 * and inside the kernel; the runner only keeps them honest.
 *
 * The guards are the part that matters here. An agent that loops or babbles
 * must not run up a bill, so every budget terminates the run with an outcome
 * code that says which budget it was. The clock is injected, so the
 * wall-clock budget is proved rather than waited for.
 */

import type { Adventure, Event, GameState, Observation, RunOutcome } from '../kernel/types.js';
import { buildObservation, messagesFromEvents } from '../kernel/observation.js';
import { hashInitial, hashNext } from '../kernel/hash.js';
import { parseCommand } from '../kernel/parser.js';
import { reduce } from '../kernel/reduce.js';
import { metricsOf, type AgentPolicy, type PolicyContext } from '../agents/policy.js';
import { legalCommands } from '../agents/legal-actions.js';
import { stateKey } from './oracle.js';
import type { Transcript } from './transcript.js';

export const DEFAULT_MAX_TURNS = 30;

/**
 * The budgets.
 *
 * Every one of them is overridable, and every one of them has a test that
 * proves the run stops with the right outcome.
 */
export interface RunBudgets {
  /** Turns the agent may take. The gold path is 10. */
  maxTurns: number;
  /** Hint credits the agent may spend. */
  maxHints: number;
  /** Tokens the model may produce on one turn. */
  maxOutputTokensPerTurn: number;
  /** Tokens the whole run may cost. */
  maxTotalTokens: number;
  /** Wall-clock milliseconds the whole run may take. */
  maxWallClockMs: number;
  /** Provider failures the run tolerates before it stops. */
  maxTransientProviderErrors: number;
  /**
   * How long to wait before retrying a provider failure, in milliseconds.
   *
   * The first retry waits this long, the second twice as long. A rate limit
   * is a request to slow down; retrying three times in the same instant
   * turns a recoverable 429 into a recorded provider failure.
   */
  providerRetryDelayMs: number;
  /** Unparsable answers the run tolerates before it stops. */
  maxParseErrors: number;
  /** How many times the agent may return to the same situation. */
  maxRepeatedStates: number;
}

export const DEFAULT_BUDGETS: RunBudgets = {
  maxTurns: DEFAULT_MAX_TURNS,
  maxHints: 3,
  maxOutputTokensPerTurn: 500,
  maxTotalTokens: 20_000,
  maxWallClockMs: 300_000,
  maxTransientProviderErrors: 3,
  providerRetryDelayMs: 1_000,
  maxParseErrors: 10,
  maxRepeatedStates: 3,
};

export interface RunOptions {
  adventure: Adventure;
  policy: AgentPolicy;
  /** Shorthand for `budgets.maxTurns`, kept for the older call sites. */
  maxTurns?: number;
  budgets?: Partial<RunBudgets>;
  transcript?: Transcript | undefined;
  /** Called with every observation, for a live view. */
  onObservation?: (observation: Observation) => void;
  /** Called with each public action before parsing, including invalid attempts. */
  onCommand?: (command: { turn: number; raw: string }) => void;
  /** Called with the outcome of every action. */
  onMessage?: (message: string) => void;
  /** Injected so the wall-clock budget is testable without waiting for it. */
  now?: () => number;
  /** Injected so the provider backoff is testable without waiting for it. */
  sleep?: (milliseconds: number) => Promise<void>;
  /**
   * Whether the legal action set is masked into the observation.
   *
   * The masking happens here rather than in the policy, so the transcript
   * records exactly what the agent was shown.
   */
  maskLegalActions?: boolean;
}

export interface RunResult {
  outcome: RunOutcome;
  reason: string;
  state: GameState;
  turns: number;
  hash: string;
  events: Event[];
  commands: string[];
  parseErrors: number;
  invalidActions: number;
  /** Tokens the run spent, as the policy reported them. */
  tokensUsed: number;
  /** Responses that held no command at all. */
  unparsableResponses: number;
  /** How many times each rung of the extraction ladder produced a command. */
  extractionRoutes: Record<string, number>;
  /** The hash of the prompt used on the last turn. */
  promptHash: string;
}

/**
 * The key that says whether the agent is going in circles.
 *
 * It is the situation, not the hash chain: the chain is path dependent, so
 * the same room reached by two different routes has two different hashes. The
 * hint count is part of the key, because spending a hint is progress even
 * though the room did not change.
 *
 * Only consecutive repeats count. An agent that is stuck in one place is in a
 * loop; an agent that wanders between two places is making a mess, and the
 * turn budget is the right thing to stop it. Counting every repeat would put
 * a three-room adventure out of reach of its own turn budget.
 */
function situationKey(state: GameState): string {
  return `${stateKey(state)}|h${state.hintsLeft}`;
}

export async function run(options: RunOptions): Promise<RunResult> {
  const { adventure, policy } = options;
  const budgets: RunBudgets = { ...DEFAULT_BUDGETS, ...options.budgets };
  if (options.maxTurns !== undefined) budgets.maxTurns = options.maxTurns;

  const clock = options.now ?? ((): number => Date.now());
  const startedAt = clock();
  const sleep =
    options.sleep ??
    ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  /** Wait longer after each consecutive provider failure. */
  const backoff = async (failures: number): Promise<void> => {
    const delay = budgets.providerRetryDelayMs * 2 ** Math.max(0, failures - 1);
    if (delay > 0) await sleep(delay);
  };

  let state: GameState = structuredClone(adventure.initial);
  let hash = hashInitial(state);
  const events: Event[] = [];
  const commands: string[] = [];
  const history: Observation[] = [];
  let lastSituation = situationKey(state);
  let repeats = 1;
  let messages: string[] = [];
  let parseErrors = 0;
  let invalidActions = 0;
  let hintsUsed = 0;
  let transientErrors = 0;
  let unparsableResponses = 0;
  let extractionRoutes: Record<string, number> = {};
  let promptHash = '';
  let tokensUsed = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  const finish = (outcome: RunOutcome, reason: string, turn: number): RunResult => {
    events.push({ type: 'run_ended', outcome, reason, turn });
    options.transcript?.write({ type: 'events', turn, data: [events[events.length - 1]!] });
    options.transcript?.write({
      type: 'metrics',
      turn,
      data: {
        outcome,
        reason,
        turns: turn,
        parseErrors,
        invalidActions,
        tokensUsed,
        inputTokens,
        outputTokens,
        wallClockMs: clock() - startedAt,
        hash,
      },
    });
    return {
      outcome,
      reason,
      state,
      turns: turn,
      hash,
      events,
      commands,
      parseErrors,
      invalidActions,
      tokensUsed,
      unparsableResponses,
      extractionRoutes,
      promptHash,
    };
  };

  for (let turn = 0; turn < budgets.maxTurns && state.status === 'running'; turn += 1) {
    if (clock() - startedAt >= budgets.maxWallClockMs) {
      return finish(
        'budget_exhausted',
        `The run used all of its ${budgets.maxWallClockMs}ms of wall-clock time.`,
        turn,
      );
    }

    const before = metricsOf(policy);
    if (before !== undefined) {
      tokensUsed = before.tokensUsed;
      inputTokens = before.inputTokens;
      outputTokens = before.outputTokens;
      if (tokensUsed > budgets.maxTotalTokens) {
        return finish(
          'budget_exhausted',
          `The run used ${tokensUsed} tokens, over its ceiling of ${budgets.maxTotalTokens}.`,
          turn,
        );
      }
    }

    const base = buildObservation(adventure, state, messages);
    const observation =
      options.maskLegalActions === true
        ? { ...base, legalActions: legalCommands(adventure, state) }
        : base;
    history.push(observation);
    options.onObservation?.(observation);
    options.transcript?.write({ type: 'observation', turn, data: observation });

    let stopReason: string | undefined;
    const context: PolicyContext = {
      history,
      observation,
      state,
      turn,
      turnsLeft: budgets.maxTurns - turn,
      stop: (reason: string) => {
        stopReason = reason;
      },
      get stopped() {
        return stopReason !== undefined;
      },
      get stopReason() {
        return stopReason;
      },
    };

    let raw: string | null;
    try {
      raw = await policy.next(context);
    } catch (error) {
      // A policy that throws is a provider failure, not a crash. It is
      // counted, retried, and the run stops cleanly when the budget is spent.
      transientErrors += 1;
      const reason = error instanceof Error ? error.message : 'the policy threw';
      if (transientErrors >= budgets.maxTransientProviderErrors) {
        return finish('provider_error', `The provider failed ${transientErrors} times in a row.`, turn);
      }
      await backoff(transientErrors);
      messages = [`The provider could not be reached: ${reason}`];
      options.onMessage?.(messages[0]!);
      continue;
    }

    const after = metricsOf(policy);
    if (after !== undefined) {
      tokensUsed = after.tokensUsed;
      inputTokens = after.inputTokens;
      outputTokens = after.outputTokens;
      extractionRoutes = after.extractionRoutes;
      promptHash = after.lastPromptHash;
      unparsableResponses = after.unparsableResponses;
    }
    if (promptHash.length > 0) {
      options.transcript?.write({ type: 'prompt', turn, hash: promptHash });
    }
    if (after !== undefined && after.lastResponse.length > 0) {
      options.transcript?.write({ type: 'response', turn, text: after.lastResponse });
    }

    if (raw === null) {
      const lastTurn = after?.lastTurn ?? 'stopped';

      if (lastTurn === 'unparsable') {
        // The model answered but held no command. Ask it again rather than
        // ending the run: the turn is spent, but the mission is not.
        messages = ['Your last answer held no command. Reply with one line: COMMAND: <command>.'];
        options.transcript?.write({ type: 'unparsable_response', turn });
        continue;
      }

      if (lastTurn === 'provider_error') {
        transientErrors += 1;
        if (transientErrors >= budgets.maxTransientProviderErrors) {
          return finish('provider_error', `The provider failed ${transientErrors} times in a row.`, turn);
        }
        await backoff(transientErrors);
        messages = ['The provider could not be reached. Trying again.'];
        continue;
      }

      return finish('provider_stopped', context.stopReason ?? 'The agent stopped.', turn);
    }

    commands.push(raw);
    options.onCommand?.({ turn, raw });
    const parsed = parseCommand(adventure, state, raw);
    if (!parsed.ok) {
      parseErrors += 1;
      messages = [parsed.message];
      events.push({ type: 'parse_error', raw, message: parsed.message, turn });
      options.transcript?.write({ type: 'parse_error', turn, raw, message: parsed.message });
      options.onMessage?.(parsed.message);

      if (parseErrors >= budgets.maxParseErrors) {
        return finish(
          'budget_exhausted',
          `The agent made ${parseErrors} parse errors and stopped being useful.`,
          turn,
        );
      }
      continue;
    }

    // The hint budget belongs to the run, not only to the adventure. An agent
    // that has spent its hints is told so, and carries on.
    if (parsed.command.verb === 'hint' && hintsUsed >= budgets.maxHints) {
      const message = 'You have no hints left.';
      messages = [message];
      events.push({ type: 'action_failed', verb: 'hint', message, turn });
      options.transcript?.write({ type: 'events', turn, data: [events[events.length - 1]!] });
      options.onMessage?.(message);
      continue;
    }

    const transition = reduce(adventure, state, parsed.command);
    state = transition.state;
    hash = hashNext(hash, state);
    events.push(...transition.events);
    if (!transition.changed) invalidActions += 1;

    for (const event of transition.events) {
      if (event.type === 'hint_given') hintsUsed += 1;
    }

    // The observation is the agent's only channel, so a hint that stayed in
    // the event stream would be a hint the agent paid for and never read.
    // The messages are the outcome of the action just taken, so an action
    // that said nothing leaves the agent with nothing stale in its view.
    messages = messagesFromEvents(transition.events);
    options.transcript?.write({
      type: 'command',
      turn,
      raw,
      verb: parsed.command.verb,
      args: parsed.command.args,
    });
    options.transcript?.write({ type: 'events', turn, data: transition.events });
    options.transcript?.write({
      type: 'state',
      turn,
      hash,
      summary: { roomId: state.roomId, inventory: state.inventory, status: state.status },
    });
    for (const message of messages) options.onMessage?.(message);

    const situation = situationKey(state);
    repeats = situation === lastSituation ? repeats + 1 : 1;
    lastSituation = situation;
    if (repeats >= budgets.maxRepeatedStates) {
      return finish(
        'loop_detected',
        `The agent returned to the same state ${repeats} times in a row and stopped making progress.`,
        turn + 1,
      );
    }
  }

  if (state.status === 'success') {
    return finish('success', 'Every objective was met.', state.turn);
  }
  if (state.status === 'failure') {
    return finish('failure', 'A fatal action ended the run.', state.turn);
  }
  return finish('budget_exhausted', `The agent used all ${budgets.maxTurns} turns.`, state.turn);
}
