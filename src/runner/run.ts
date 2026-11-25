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
import { canonicalJson, hashInitial, hashNext } from '../kernel/hash.js';
import { parseCommand } from '../kernel/parser.js';
import { reduce } from '../kernel/reduce.js';
import { metricsOf, type AgentPolicy, type PolicyContext, type ReplyRecord } from '../agents/policy.js';
import { legalCommands } from '../agents/legal-actions.js';
import { PAGE_GAME_LIMITS } from './limits.js';
import type { Transcript } from './transcript.js';

export const DEFAULT_MAX_TURNS = 30;

/** A policy can refuse an unaffordable request before contacting a provider. */
export class RunBudgetExceeded extends Error {}

/**
 * The budgets.
 *
 * Every one of them is overridable, and every one that ends a run has a test
 * that proves the run stops with the right outcome. One of them ends nothing:
 * `maxRepeatedStates` is only counted.
 */
export interface RunBudgets {
  /** Turns the agent may take. The gold path is 10. */
  maxTurns: number;
  /** Hint credits the agent may spend. */
  maxHints: number;
  /** Tokens the model may produce on one request. A reply cut off by it is asked for again with the room doubled. */
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
  /**
   * How many turns in a row without a change count as a freeze.
   *
   * It is counted and reported. It does not end the run: the turns are the
   * limit, and an agent that looks before it acts is not going in circles.
   */
  maxRepeatedStates: number;
}

export const DEFAULT_BUDGETS: RunBudgets = {
  maxTurns: DEFAULT_MAX_TURNS,
  maxHints: 3,
  maxOutputTokensPerTurn: PAGE_GAME_LIMITS.maxOutputTokensPerTurn,
  maxTotalTokens: 20_000,
  maxWallClockMs: 300_000,
  maxTransientProviderErrors: 3,
  providerRetryDelayMs: 1_000,
  maxParseErrors: 10,
  maxRepeatedStates: 3,
};

export interface RunOptions {
  /** Stop the policy and its provider request without applying a late answer. */
  signal?: AbortSignal;
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
  /**
   * The world to start from, instead of the adventure's first.
   *
   * A run resumed after a pause continues the mission it was paused in, so it
   * starts from the state the pause left behind. Everything else about the
   * run is ordinary: the same reducer, the same guards, the same caps.
   */
  initial?: GameState;
  /**
   * The turn the run resumes from.
   *
   * A pause spends turns, and the caps apply to the whole lineage rather than
   * to each piece of it, so a resumed run counts from here.
   */
  startingTurn?: number;
  /**
   * What a pause left behind, when this run continues one.
   *
   * The runner keeps more than the world in its head: what the agent has
   * seen, what it did, how its loop guard reads the run. A resume that
   * omitted any of these would hand the agent a different run.
   */
  resume?: RunResumeState;
}

/** Everything a pause must carry for the run it stopped to continue as itself. */
export interface RunResumeState {
  /** What the agent has seen, in order. The memory a resume must restore. */
  history: Observation[];
  /** What the agent did, in order. */
  commands: string[];
  /** The run's events so far, for one transcript across the pause. */
  events: Event[];
  /** What the agent was last told, so it does not read a stale view. */
  messages: string[];
  /** The loop guard's reading of the run so far. */
  loop: { lastSituation: string; repeats: number };
  /** The counters that cap attempts: errors, hints, and how turns were spent. */
  counters: {
    parseErrors: number;
    invalidActions: number;
    hintsUsed: number;
    transientErrors: number;
    unparsableResponses: number;
    extractionRoutes: Record<string, number>;
    /** Counted since the limits changed. Absent in a run paused before that. */
    cutOffReplies?: number;
    retriedReplies?: number;
    reasoningTokens?: number;
    longestUnchangedTurns?: number;
    freezes?: number;
  };
  /** What the policy itself remembers, when it keeps a ledger. */
  policyCommands?: Array<{ raw: string; observationIndex: number }>;
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
  /** Turns whose first reply was cut off by its allowance. */
  cutOffReplies: number;
  /** Turns that were asked for more than once, because the reply was cut off. */
  retriedReplies: number;
  /** Output tokens the model spent on reasoning it did not show, as far as the provider reported them. */
  reasoningTokens: number;
  /** The most turns in a row that left the world as they found it. */
  longestUnchangedTurns: number;
  /** Streaks of unchanged turns that reached the run's `maxRepeatedStates`. */
  freezes: number;
  /** How many times each rung of the extraction ladder produced a command. */
  extractionRoutes: Record<string, number>;
  /** The hash of the prompt used on the last turn. */
  promptHash: string;
  /** What a pause left behind; present only when the outcome is paused. */
  pause?: RunResumeState;
}

/**
 * The key that says whether the agent is going in circles.
 *
 * It is the situation, not the hash chain: the chain is path dependent, so
 * the same room reached by two different routes has two different hashes. The
 * Every gameplay field counts, including object string state and hints.
 * The turn counter alone never means progress. The search oracle's smaller
 * key omits examination state and cannot detect progress faithfully here.
 *
 * It is counted, and it stops nothing. Until 25 November 2026 the third turn
 * in the same situation ended the run (warp#23474 took that away). A look and
 * a refused command leave the situation as it was, so the old rule gave an
 * agent two quiet turns after every move, and it ended runs that the world
 * had just told what to do. Now the turns are the limit, and the key only
 * says how long an agent went without changing the world.
 */
function situationKey(state: GameState): string {
  return canonicalJson({ ...state, turn: 0 });
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
    if (delay > 0) await sleepOrAbort(delay, sleep, options.signal);
  };

  let state: GameState = structuredClone(options.initial ?? adventure.initial);
  let hash = hashInitial(state);
  const continueFrom = options.resume;
  const events: Event[] = continueFrom ? [...continueFrom.events] : [];
  const commands: string[] = continueFrom ? [...continueFrom.commands] : [];
  const history: Observation[] = continueFrom ? [...continueFrom.history] : [];
  // The situation at the start of the turn before. A fresh run has none, and
  // an empty string is never a situation, so the first turn counts nothing: a
  // streak begins with the first turn that leaves the world as it found it.
  // A resumed run takes up the count the pause left, and the turn the pause
  // interrupted is counted when it begins again, like any other.
  let lastSituation: string = continueFrom?.loop.lastSituation ?? '';
  let repeats = continueFrom?.loop.repeats ?? 0;
  let messages: string[] = continueFrom ? [...continueFrom.messages] : [];
  let parseErrors = continueFrom?.counters.parseErrors ?? 0;
  let invalidActions = continueFrom?.counters.invalidActions ?? 0;
  let hintsUsed = continueFrom?.counters.hintsUsed ?? 0;
  let transientErrors = continueFrom?.counters.transientErrors ?? 0;
  let unparsableResponses = continueFrom?.counters.unparsableResponses ?? 0;
  let extractionRoutes: Record<string, number> =
    continueFrom ? { ...continueFrom.counters.extractionRoutes } : {};
  let promptHash = '';
  let tokensUsed = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cutOffReplies = continueFrom?.counters.cutOffReplies ?? 0;
  let retriedReplies = continueFrom?.counters.retriedReplies ?? 0;
  let reasoningTokens = continueFrom?.counters.reasoningTokens ?? 0;
  let longestUnchangedTurns = continueFrom?.counters.longestUnchangedTurns ?? 0;
  let freezes = continueFrom?.counters.freezes ?? 0;

  /**
   * The count of unchanged turns as it stood before the running turn began,
   * and which turn that was.
   *
   * A turn's count is taken as the turn begins. A pause can arrive inside that
   * turn, after its count was taken, and the turn is then taken again when the
   * run resumes. The pause hands on what stood before, so that the turn is
   * counted once.
   */
  let countedTurn = -1;
  let countBefore = { lastSituation, repeats, freezes, longestUnchangedTurns };

  /** Note a freeze, on the turn where the streak of unchanged turns reached the run's threshold. It is written down. It ends nothing. */
  const countFreeze = (turn: number): void => {
    if (repeats !== budgets.maxRepeatedStates) return;
    freezes += 1;
    options.transcript?.write({ type: 'freeze', turn, streak: repeats });
  };

  /** The last reply written down, so that a failure on a later turn cannot write it twice. */
  let recorded: ReplyRecord | undefined;

  /**
   * Write what the model sent back for a turn, attempt by attempt, and count
   * it: whether the allowance cut the reply off, and how many tokens were
   * reasoning and how many were the reply. A turn that ended with no command
   * can never again be read as a turn that ran out.
   */
  const recordReply = (turn: number, reply: ReplyRecord, more: Record<string, unknown> = {}): void => {
    options.transcript?.write({ type: 'reply', turn, data: reply, ...more });
    recorded = reply;
    cutOffReplies += reply.cutOff ? 1 : 0;
    retriedReplies += reply.attempts.length > 1 ? 1 : 0;
    reasoningTokens += reply.attempts.reduce((total, attempt) => total + (attempt.reasoningTokens ?? 0), 0);
  };

  /**
   * Count the last turn, when it left the world as it found it.
   *
   * Every earlier turn was counted as the next one began. The last one has no
   * next, so it is counted where the run is known to have spent it: at the
   * turn limit, or on the parse error that ended the run. A run that ends
   * because the agent declined to act, or the provider failed, or the clock
   * ran out, did not spend that turn, and it is not counted.
   */
  const countLastTurn = (turn: number): void => {
    if (situationKey(state) === lastSituation) {
      repeats += 1;
      countFreeze(turn);
    }
    longestUnchangedTurns = Math.max(longestUnchangedTurns, repeats);
  };

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
        unparsableResponses,
        cutOffReplies,
        retriedReplies,
        reasoningTokens,
        longestUnchangedTurns,
        freezes,
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
      cutOffReplies,
      retriedReplies,
      reasoningTokens,
      longestUnchangedTurns,
      freezes,
      extractionRoutes,
      promptHash,
    };
  };

  const interrupted = (turn: number): RunResult | undefined => {
    // A pause is an operator's request, not a failure: it comes before every
    // other reading of the signal, and it ends nothing.
    if (options.signal?.aborted && options.signal.reason instanceof Error &&
        options.signal.reason.name === 'PauseError') return pauseRun(turn);
    if (clock() - startedAt >= budgets.maxWallClockMs ||
        (options.signal?.aborted && options.signal.reason instanceof Error && options.signal.reason.name === 'TimeoutError')) {
      return finish(
        'budget_exhausted',
        `The run used all of its ${budgets.maxWallClockMs}ms of wall-clock time.`,
        turn,
      );
    }
    if (options.signal?.aborted) return finish('provider_stopped', 'The run was stopped.', turn);
    return undefined;
  };

  /** What a pause leaves behind: the run, exactly as it stood, to continue later. */
  const pauseRun = (turn: number): RunResult => {
    options.transcript?.write({ type: 'paused', turn });
    return {
      outcome: 'paused',
      reason: 'The run was paused.',
      state,
      turns: turn,
      hash,
      events,
      commands,
      parseErrors,
      invalidActions,
      tokensUsed,
      unparsableResponses,
      cutOffReplies,
      retriedReplies,
      reasoningTokens,
      longestUnchangedTurns,
      freezes,
      extractionRoutes,
      promptHash,
      pause: {
        history: [...history],
        commands: [...commands],
        events: [...events],
        messages: [...messages],
        loop: countedTurn === turn
          ? { lastSituation: countBefore.lastSituation, repeats: countBefore.repeats }
          : { lastSituation, repeats },
        counters: {
          parseErrors, invalidActions, hintsUsed, transientErrors, unparsableResponses,
          extractionRoutes: { ...extractionRoutes },
          cutOffReplies, retriedReplies, reasoningTokens,
          longestUnchangedTurns: countedTurn === turn ? countBefore.longestUnchangedTurns : longestUnchangedTurns,
          freezes: countedTurn === turn ? countBefore.freezes : freezes,
        },
        ...(policyLedger() === undefined ? {} : { policyCommands: policyLedger() }),
      },
    };
  };

  /** What the policy itself remembers, when it keeps a ledger a resume needs. */
  const policyLedger = (): Array<{ raw: string; observationIndex: number }> | undefined => {
    const keeper = policy as Partial<{ ledger: () => Array<{ raw: string; observationIndex: number }> }>;
    return typeof keeper.ledger === 'function' ? keeper.ledger() : undefined;
  };

  const startingTurn = options.startingTurn ?? 0;
  if (continueFrom !== undefined) options.transcript?.write({ type: 'resumed', turn: startingTurn });
  for (let turn = startingTurn; turn < startingTurn + budgets.maxTurns && state.status === 'running'; turn += 1) {
    const stopped = interrupted(turn);
    if (stopped !== undefined) return stopped;

    // Whether the last turn left the world as it found it. It is counted. It
    // is never a reason to stop: the turns are the limit.
    const situationAtStart = situationKey(state);
    countBefore = { lastSituation, repeats, freezes, longestUnchangedTurns };
    repeats = situationAtStart === lastSituation ? repeats + 1 : 0;
    // The count is taken as this turn begins, and covers the turns before it.
    // So a streak that has just reached three did so on the turn before.
    countFreeze(turn - 1);
    lastSituation = situationAtStart;
    longestUnchangedTurns = Math.max(longestUnchangedTurns, repeats);
    countedTurn = turn;

    const before = metricsOf(policy);
    if (before !== undefined) {
      tokensUsed = before.tokensUsed;
      inputTokens = before.inputTokens;
      outputTokens = before.outputTokens;
      if (tokensUsed >= budgets.maxTotalTokens) {
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
      signal: options.signal,
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
      const stopped = interrupted(turn);
      if (stopped !== undefined) return stopped;
      // What the policy spent before it threw is spent. A reply cut off, and
      // then a retry the run could not afford, comes here. The first attempt
      // was real: its tokens are counted, its record is written, and the record
      // says why nothing followed it.
      const spent = metricsOf(policy);
      if (spent?.lastReply !== undefined && spent.lastReply !== recorded && spent.lastReply.attempts.length > 0) {
        tokensUsed = spent.tokensUsed;
        inputTokens = spent.inputTokens;
        outputTokens = spent.outputTokens;
        recordReply(turn, spent.lastReply, { ended: error instanceof Error ? error.message : 'the policy threw' });
      }
      if (error instanceof RunBudgetExceeded) return finish('budget_exhausted', error.message, turn);
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
    if (after?.lastReply !== undefined) recordReply(turn, after.lastReply);
    const interruptedAfterReply = interrupted(turn);
    if (interruptedAfterReply !== undefined) return interruptedAfterReply;

    if (raw === null) {
      const lastTurn = after?.lastTurn ?? 'stopped';

      if (lastTurn === 'unparsable') {
        // The model answered but held no command. Ask it again rather than
        // ending the run: the turn is spent, but the mission is not.
        messages = ['Your last answer held no command. Reply with one line: COMMAND: <command>.'];
        options.onMessage?.(messages[0]!);
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
        options.onMessage?.(messages[0]!);
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
        countLastTurn(turn);
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

  }

  if (countedTurn >= 0) countLastTurn(countedTurn);
  if (state.status === 'success') {
    return finish('success', 'Every objective was met.', state.turn);
  }
  if (state.status === 'failure') {
    return finish('failure', 'A fatal action ended the run.', state.turn);
  }
  return finish('budget_exhausted', `The agent used all ${budgets.maxTurns} turns.`, state.turn);
}

async function sleepOrAbort(milliseconds: number, sleep: (ms: number) => Promise<void>, signal?: AbortSignal): Promise<void> {
  if (signal === undefined) return sleep(milliseconds);
  if (signal.aborted) return;
  let wake!: () => void;
  const aborted = new Promise<void>(resolve => { wake = resolve; signal.addEventListener('abort', wake, { once: true }); });
  try { await Promise.race([sleep(milliseconds), aborted]); }
  finally { signal.removeEventListener('abort', wake); }
}
