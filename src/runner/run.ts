/*
 * The runner: the turn loop.
 *
 * The loop is deliberately dull. Observe, ask the policy, parse, reduce,
 * record, check the goals. Everything interesting happens inside the policy
 * and inside the kernel; the runner only keeps them honest.
 */

import type { Adventure, Event, GameState, Observation, RunOutcome } from '../kernel/types.js';
import { buildObservation } from '../kernel/observation.js';
import { hashInitial, hashNext } from '../kernel/hash.js';
import { parseCommand } from '../kernel/parser.js';
import { reduce } from '../kernel/reduce.js';
import type { AgentPolicy, PolicyContext } from '../agents/policy.js';
import type { Transcript } from './transcript.js';

export const DEFAULT_MAX_TURNS = 30;

export interface RunOptions {
  adventure: Adventure;
  policy: AgentPolicy;
  maxTurns?: number;
  transcript?: Transcript | undefined;
  /** Called with every observation, for a live view. */
  onObservation?: (observation: Observation) => void;
  /** Called with the outcome of every action. */
  onMessage?: (message: string) => void;
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
}

export async function run(options: RunOptions): Promise<RunResult> {
  const { adventure, policy } = options;
  const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;

  let state: GameState = structuredClone(adventure.initial);
  let hash = hashInitial(state);
  const events: Event[] = [];
  const commands: string[] = [];
  const history: Observation[] = [];
  let messages: string[] = [];
  let parseErrors = 0;
  let invalidActions = 0;

  for (let turn = 0; turn < maxTurns && state.status === 'running'; turn += 1) {
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
      turnsLeft: maxTurns - turn,
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
    if (raw === null || context.stopped) {
      const reason = context.stopReason ?? 'The agent stopped.';
      events.push({ type: 'run_ended', outcome: 'provider_stopped', reason, turn });
      options.transcript?.write({ type: 'events', turn, data: events.slice(-1) });
      return {
        outcome: 'provider_stopped',
        reason,
        state,
        turns: turn,
        hash,
        events,
        commands,
        parseErrors,
        invalidActions,
      };
    }

    commands.push(raw);
    const parsed = parseCommand(adventure, state, raw);
    if (!parsed.ok) {
      parseErrors += 1;
      messages = [parsed.message];
      events.push({ type: 'parse_error', raw, message: parsed.message, turn });
      options.transcript?.write({ type: 'parse_error', turn, raw, message: parsed.message });
      options.onMessage?.(parsed.message);
      continue;
    }

    const transition = reduce(adventure, state, parsed.command);
    state = transition.state;
    hash = hashNext(hash, state);
    events.push(...transition.events);
    if (!transition.changed) invalidActions += 1;

    const outcomeMessages = transition.events
      .filter((event) => event.type === 'action_succeeded' || event.type === 'action_failed')
      .map((event) => (event as { message: string }).message);
    messages = outcomeMessages.length > 0 ? outcomeMessages : messages;

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
    for (const message of outcomeMessages) options.onMessage?.(message);
  }

  let outcome: RunOutcome;
  let reason: string;
  if (state.status === 'success') {
    outcome = 'success';
    reason = 'Every objective was met.';
  } else if (state.status === 'failure') {
    outcome = 'failure';
    reason = 'A fatal action ended the run.';
  } else {
    outcome = 'budget_exhausted';
    reason = `The agent used all ${maxTurns} turns.`;
  }
  events.push({ type: 'run_ended', outcome, reason, turn: state.turn });

  return {
    outcome,
    reason,
    state,
    turns: state.turn,
    hash,
    events,
    commands,
    parseErrors,
    invalidActions,
  };
}
