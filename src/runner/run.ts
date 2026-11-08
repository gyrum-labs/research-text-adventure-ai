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
  /** Called with the outcome of every action. */
  onMessage?: (message: string) => void;
  /** Injected so the wall-clock budget is testable without waiting for it. */
  now?: () => number;
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

  let state: GameState = structuredClone(adventure.initial);
  let hash = hashInitial(state);
  const events: Event[] = [];
  const commands: string[] = [];
  const history: Observation[] = [];
  const situations = new Map<string, number>([[situationKey(state), 1]]);
  let messages: string[] = [];
  let parseErrors = 0;
  let invalidActions = 0;
  let hintsUsed = 0;
  let transientErrors = 0;
  let unparsableResponses = 0;
  let extractionRoutes: Record<string, number> = {};
  let promptHash = '';
  let tokensUsed = 0;

  const finish = (outcome: RunOutcome, reason: string, turn: number): RunResult => {
    events.push({ type: 'run_ended', outcome, reason, turn });
    options.transcript?.write({ type: 'events', turn, data: [events[events.length - 1]!] });
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
      if (tokensUsed > budgets.maxTotalTokens) {
        return finish(
          'budget_exhausted',
          `The run used ${tokensUsed} tokens, over its ceiling of ${budgets.maxTotalTokens}.`,
          turn,
        );
      }
    }

    const observation = buildObservation(adventure, state, messages);
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

    const raw = await policy.next(context);
    const after = metricsOf(policy);
    if (after !== undefined) {
      tokensUsed = after.tokensUsed;
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
        messages = ['The provider could not be reached. Trying again.'];
        continue;
      }

      return finish('provider_stopped', context.stopReason ?? 'The agent stopped.', turn);
    }

    commands.push(raw);
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
    const seen = (situations.get(situation) ?? 0) + 1;
    situations.set(situation, seen);
    if (seen >= budgets.maxRepeatedStates) {
      return finish(
        'loop_detected',
        `The agent returned to the same state ${seen} times and stopped making progress.`,
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
