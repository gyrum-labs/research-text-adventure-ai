/*
 * The agent loop over a session.
 *
 * The engine comparison needs the agent held still while the world changes
 * underneath it, so this loop is the ordinary agent loop with one thing
 * replaced: the state lives in a session rather than in the kernel's reducer.
 *
 * Everything that makes a run a measurement is unchanged. The same prompt
 * builder, the same extraction ladder, the same budgets, the same transcript
 * format, the same metrics reader and the same failure classifier read the
 * result afterwards. What differs is the world, which is the point.
 */

import type { ContextStrategy } from '../agents/context.js';
import type { ObservationRenderer } from '../agents/context.js';
import type { Adventure, GameState, Observation } from '../kernel/types.js';
import { LlmPolicy } from '../agents/llm/policy.js';
import type { LlmProvider } from '../agents/llm/provider.js';
import type { PolicyContext } from '../agents/policy.js';
import type { Transcript } from './transcript.js';
import { DEFAULT_BUDGETS, type RunBudgets } from './run.js';

/**
 * A session whose current observation can be read without sending anything.
 *
 * The shape is declared here rather than imported, because the runner may
 * not reach up to the session layer. Anything with this shape is a session.
 */
export interface ObservableSession {
  readonly adventure: Adventure;
  /** The world as the agent sees it, right now. */
  observe(): Promise<Observation>;
  /** Apply one command and report what it produced. */
  send(raw: string): Promise<{
    raw: string;
    parsed: boolean;
    message: string | null;
    observation: Observation;
    status: GameState['status'];
    turn: number;
    hash: string;
  }>;
}

/** How a run ended. */
export type SessionOutcome =
  | 'success'
  | 'failure'
  | 'budget_exhausted'
  | 'provider_error'
  | 'provider_stopped';

/** What a session run produced. */
export interface SessionRunResult {
  outcome: SessionOutcome;
  reason: string;
  turns: number;
  commands: string[];
  parseErrors: number;
  invalidActions: number;
  tokensUsed: number;
  inputTokens: number;
  outputTokens: number;
  hash: string;
}

export interface SessionRunOptions {
  session: ObservableSession;
  provider: LlmProvider;
  strategy?: ContextStrategy;
  renderer?: ObservationRenderer;
  budgets?: Partial<RunBudgets>;
  transcript?: Transcript;
}

/** The state a policy is handed: the world's shape, not the kernel's. */
function syntheticState(observation: Observation): GameState {
  return {
    roomId: observation.room.id,
    inventory: observation.inventory.map((thing) => thing.id),
    flags: {},
    status: 'running',
  } as unknown as GameState;
}

/** Whether the world acted or refused. */
function refused(said: string): boolean {
  return !/^You\b/.test(said.trim());
}

/** The agent loop, over a session. */
export async function runSession(options: SessionRunOptions): Promise<SessionRunResult> {
  const budgets: RunBudgets = { ...DEFAULT_BUDGETS, ...options.budgets };
  const session = options.session;
  const policy = new LlmPolicy({
    adventure: session.adventure,
    provider: options.provider,
    strategy: options.strategy ?? 'structured',
    renderer: options.renderer ?? 'text',
    // The world parses for itself: the engine's refusal is the parse error.
    parseCheck: () => true,
  });

  const history: Observation[] = [];
  const commands: string[] = [];
  let parseErrors = 0;
  let invalidActions = 0;
  let transientErrors = 0;
  let turn = 0;
  let hash = '';
  let observation = await session.observe();

  const write = (record: Parameters<Transcript['write']>[0]): void => {
    options.transcript?.write(record);
  };

  write({ type: 'observation', turn, data: observation });

  while (turn < budgets.maxTurns) {
    const used = policy.metrics();
    if (used.tokensUsed > budgets.maxTotalTokens) {
      const reason = 'The run spent its token budget.';
      write({ type: 'events', turn, data: [{ type: 'run_ended', outcome: 'budget_exhausted', reason, turn }] });
      return {
        outcome: 'budget_exhausted',
        reason,
        turns: turn,
        commands,
        parseErrors,
        invalidActions,
        tokensUsed: used.tokensUsed,
        inputTokens: used.inputTokens,
        outputTokens: used.outputTokens,
        hash,
      };
    }

    const context: PolicyContext = {
      history,
      observation,
      state: syntheticState(observation),
      turn,
      turnsLeft: budgets.maxTurns - turn,
      stop: () => undefined,
      get stopped() {
        return false;
      },
      get stopReason() {
        return undefined;
      },
    };

    let raw: string | null;
    try {
      raw = await policy.next(context);
    } catch (error) {
      // A policy that throws is a provider failure, not a crash: it is
      // counted, retried, and the run stops cleanly when the budget is spent.
      transientErrors += 1;
      const reason = error instanceof Error ? error.message : 'the policy threw';
      if (transientErrors >= budgets.maxTransientProviderErrors) {
        const failed = `The provider failed ${transientErrors} times in a row: ${reason}`;
        write({ type: 'events', turn, data: [{ type: 'run_ended', outcome: 'provider_error', reason: failed, turn }] });
        return {
          outcome: 'provider_error',
          reason: failed,
          turns: turn,
          commands,
          parseErrors,
          invalidActions,
          tokensUsed: policy.metrics().tokensUsed,
          inputTokens: policy.metrics().inputTokens,
          outputTokens: policy.metrics().outputTokens,
          hash,
        };
      }
      continue;
    }

    if (raw === null) {
      const last = policy.metrics().lastTurn;
      if (last === 'provider_error') {
        transientErrors += 1;
        if (transientErrors >= budgets.maxTransientProviderErrors) {
          const reason = `The provider failed ${transientErrors} times in a row.`;
          write({ type: 'events', turn, data: [{ type: 'run_ended', outcome: 'provider_error', reason, turn }] });
          return {
            outcome: 'provider_error',
            reason,
            turns: turn,
            commands,
            parseErrors,
            invalidActions,
            tokensUsed: policy.metrics().tokensUsed,
            inputTokens: policy.metrics().inputTokens,
            outputTokens: policy.metrics().outputTokens,
            hash,
          };
        }
        continue;
      }
      if (last === 'unparsable') {
        parseErrors += 1;
        write({ type: 'unparsable_response', turn });
        if (parseErrors >= budgets.maxParseErrors) {
          const reason = 'The model stopped answering with commands.';
          write({ type: 'events', turn, data: [{ type: 'run_ended', outcome: 'budget_exhausted', reason, turn }] });
          return {
            outcome: 'budget_exhausted',
            reason,
            turns: turn,
            commands,
            parseErrors,
            invalidActions,
            tokensUsed: policy.metrics().tokensUsed,
            inputTokens: policy.metrics().inputTokens,
            outputTokens: policy.metrics().outputTokens,
            hash,
          };
        }
        continue;
      }
      const reason = 'The agent stopped.';
      write({ type: 'events', turn, data: [{ type: 'run_ended', outcome: 'provider_stopped', reason, turn }] });
      return {
        outcome: 'provider_stopped',
        reason,
        turns: turn,
        commands,
        parseErrors,
        invalidActions,
        tokensUsed: policy.metrics().tokensUsed,
        inputTokens: policy.metrics().inputTokens,
        outputTokens: policy.metrics().outputTokens,
        hash,
      };
    }

    turn += 1;
    const said = await session.send(raw);
    observation = said.observation;
    hash = said.hash;

    if (!said.parsed) {
      parseErrors += 1;
      write({ type: 'command', turn, raw, verb: raw.split(' ')[0] ?? '', args: {} });
      write({ type: 'parse_error', turn, raw, message: said.message ?? 'The world did not understand it.' });
      write({ type: 'events', turn, data: [{ type: 'action_failed', message: said.message ?? '' }] });
      history.push(observation);
      if (parseErrors >= budgets.maxParseErrors) {
        const reason = 'The world refused every command.';
        write({ type: 'events', turn, data: [{ type: 'run_ended', outcome: 'budget_exhausted', reason, turn }] });
        return {
          outcome: 'budget_exhausted',
          reason,
          turns: turn,
          commands,
          parseErrors,
          invalidActions,
          tokensUsed: policy.metrics().tokensUsed,
          inputTokens: policy.metrics().inputTokens,
          outputTokens: policy.metrics().outputTokens,
          hash,
        };
      }
      continue;
    }

    commands.push(raw);
    if (refused(said.message ?? '')) invalidActions += 1;
    write({ type: 'command', turn, raw, verb: raw.split(' ')[0] ?? '', args: {} });
    write({
      type: 'events',
      turn,
      data: [
        refused(said.message ?? '')
          ? { type: 'action_failed', message: said.message ?? '' }
          : { type: 'action_succeeded', message: said.message ?? '' },
      ],
    });
    write({
      type: 'state',
      turn,
      hash: said.hash,
      summary: {
        roomId: observation.room.id,
        inventory: observation.inventory.map((thing) => thing.id),
      },
    });
    write({ type: 'observation', turn, data: observation });
    history.push(observation);

    if (said.status === 'success') {
      const reason = 'The mission is complete.';
      write({ type: 'events', turn, data: [{ type: 'run_ended', outcome: 'success', reason, turn }] });
      return {
        outcome: 'success',
        reason,
        turns: turn,
        commands,
        parseErrors,
        invalidActions,
        tokensUsed: policy.metrics().tokensUsed,
        inputTokens: policy.metrics().inputTokens,
        outputTokens: policy.metrics().outputTokens,
        hash: said.hash,
      };
    }
  }

  const reason = 'The agent used all 30 turns.';
  write({ type: 'events', turn, data: [{ type: 'run_ended', outcome: 'budget_exhausted', reason, turn }] });
  return {
    outcome: 'budget_exhausted',
    reason,
    turns: turn,
    commands,
    parseErrors,
    invalidActions,
    tokensUsed: policy.metrics().tokensUsed,
    inputTokens: policy.metrics().inputTokens,
    outputTokens: policy.metrics().outputTokens,
    hash,
  };
}
