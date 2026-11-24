/*
 * The watched-run subsystem.
 *
 * Everything a client's watched run needs: the runs this server is holding,
 * the stream each one reads, and the configured AI demos they can watch.
 * server.ts owns the routes and the game sessions; this module owns the runs.
 *
 * The seam to the outside world, stated once: the provider is OpenRouter's
 * models API (via live-ai), consumed server-side with server-held keys; the
 * demos are configured by the operator's environment; nothing here is
 * reachable without a same-origin local request, enforced by the routes.
 */

import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import type { Adventure } from '../kernel/types.js';
import { buildObservation } from '../kernel/observation.js';
import { run } from '../runner/run.js';
import type { AgentPolicy } from '../agents/policy.js';
import { Transcript, readTranscript } from '../runner/transcript.js';
import type { SavedRunStore } from './saved-runs.js';
import type { LiveAiDemo, LiveAiMetadata, LiveAiRun, LiveAiUsage } from './live-ai.js';

/** The models this server can watch, and the run holding the active slot. */
export interface AiState {
  /** One configured demo per model id. Absent when AI is not configured. */
  demos?: Map<string, LiveAiDemo>;
  /** The safe descriptions advertised before a run is opted into. */
  models: LiveAiMetadata[];
  /** The id of the one active run, when there is one. */
  activeAiId?: string;
}

/** Normalize the configuration: one shape, whether one model or several were named. */
export function aiStateFrom(options: {
  liveAi?: LiveAiDemo;
  liveAis?: { demos: Map<string, LiveAiDemo>; models: LiveAiMetadata[] };
}): AiState {
  return {
    demos: options.liveAis?.demos
      ?? (options.liveAi ? new Map([[options.liveAi.metadata.model, options.liveAi]]) : undefined),
    models: options.liveAis?.models ?? (options.liveAi ? [options.liveAi.metadata] : []),
  };
}

/** Whether any AI demo is configured at all. */
export const aiConfigured = (ai: AiState): boolean => ai.demos !== undefined;

/** Whether a named model is one this server offers. */
export const aiOffers = (ai: AiState, model: string): boolean => ai.demos?.has(model) === true;

/** One streaming agent run the server is holding or has held. */
export interface HeldRun {
  id: string;
  adventureId: string;
  seed: number;
  records: Array<Record<string, unknown>>;
  finished: boolean;
  listeners: Set<(record: Record<string, unknown>) => void>;
  live?: LiveAiRun;
  metadata?: LiveAiMetadata;
  start?: () => boolean;
  cancel?: () => void;
}

/** What a continuation hands back to a run a pause stopped. */
export interface RunContinuation {
  /** The world as the pause left it. */
  world: import('../kernel/types.js').GameState;
  /** The runner's bundle: memory, loop guard, counters. */
  resume: import('../runner/run.js').RunResumeState;
  /** Turns the lineage has already spent. */
  turns: number;
  /** Wall-clock the lineage already spent. */
  elapsedMs: number;
  /** What the policy has already counted. */
  tokens: { inputTokens: number; outputTokens: number };
}

/**
 * A run waiting for someone to watch it.
 *
 * The run happens on its own only once its stream is opened: an AI demo that
 * nobody watches never calls a model. The slot expires unopened, because a
 * pending run nobody claimed is a leak, not a reservation.
 */
export function pendingModelRun({ id, adventure, seed, runs, ai, saved, demo, continuation, onPaused }: {
  id: string;
  adventure: Adventure;
  seed: number;
  runs: Map<string, HeldRun>;
  ai: AiState;
  /** Where the run's evidence is kept, next to the replayable copy. */
  saved: SavedRunStore;
  /** The demo a named model selects; absent means the first configured one. */
  demo?: LiveAiDemo;
  /** What a pause left behind, when this run continues one. */
  continuation?: RunContinuation;
  /** Called once, if the run pauses again: the server records the held run. */
  onPaused?: (paused: RunContinuation & { id: string; usage: LiveAiUsage }) => void;
}): HeldRun {
  const live = demo ?? ai.demos?.get([...ai.demos.keys()][0]!);
  const held: HeldRun = { id, adventureId: adventure.id, seed, records: [], finished: false, listeners: new Set(), metadata: live?.metadata };
  const expiry = setTimeout(() => { runs.delete(id); }, 30_000);
  expiry.unref();
  held.cancel = () => {
    clearTimeout(expiry);
    if (held.live !== undefined) held.live.cancel();
    else { held.finished = true; runs.delete(id); }
  };
  held.start = () => {
    if (ai.activeAiId !== undefined || live === undefined) return false;
    const liveRun = live.create({ adventure, runId: id, seed,
      ...(continuation === undefined ? {} : { resume: {
        state: continuation.resume, turns: continuation.turns,
        elapsedMs: continuation.elapsedMs, tokens: continuation.tokens } }) });
    clearTimeout(expiry);
    held.live = liveRun;
    held.start = undefined;
    ai.activeAiId = id;
    void driveRun(held, adventure, liveRun.policy, saved, continuation, onPaused).finally(() => {
      if (ai.activeAiId === id) ai.activeAiId = undefined;
    });
    return true;
  };
  return held;
}

/** Run the policy, pushing each record to whoever is listening. */
export async function driveRun(
  held: HeldRun,
  adventure: Adventure,
  policy: AgentPolicy,
  saved: SavedRunStore,
  /** What a pause left behind, when this run continues one. */
  continuation?: RunContinuation,
  /** Called once, if the run pauses again: the server records the held run. */
  onPaused?: (paused: RunContinuation & { id: string; usage: LiveAiUsage }) => void,
): Promise<void> {
  const push = (record: Record<string, unknown>): void => {
    held.records.push(record);
    for (const listener of held.listeners) listener(record);
  };
  const usage = (): void => { if (held.live !== undefined) push({ type: 'usage', data: held.live.usage() }); };
  const segmentStartedAt = Date.now();
  let paused = false;

  // Every watched run is evidence, whatever its policy: write the transcript
  // the replay route can re-apply, in the format replay already reads.
  const transcript = new Transcript(saved.transcriptPath(held.id), {
    type: 'header',
    runId: held.id,
    adventure: adventure.id,
    adventureVersion: adventure.version,
    adventureHash: 'sha256:unversioned',
    policy: policy.id,
    provider: held.metadata?.provider ?? null,
    model: held.metadata?.model ?? null,
    seed: 1,
    maxTurns: held.live?.budgets.maxTurns ?? 30,
    startedAt: new Date().toISOString(),
    engineVersion: '0.1.0',
  });

  try {
    if (held.metadata === undefined) {
      // nothing: free runs carry no model description
    } else if (continuation === undefined) {
      push({ type: 'run_started', data: held.metadata });
    } else {
      // A resumed run keeps its identity: same mission, same memory, and the
      // usage already accounted, rather than a fresh start.
      push({ type: 'resumed', data: { usage: held.live?.usage(), budgets: held.metadata.budgets } });
    }
    const result = await run({
      adventure,
      policy,
      maxTurns: 30,
      transcript: held.live === undefined ? transcript : held.live.transcript,
      ...(held.live === undefined ? {} : { maxTurns: held.live.budgets.maxTurns,
        budgets: held.live.budgets, signal: held.live.signal }),
      ...(continuation === undefined ? {} : {
        initial: continuation.world, startingTurn: continuation.turns, resume: continuation.resume }),
      onObservation: (observation) => {
        push({ type: 'observation', turn: observation.turn, data: observation });
        usage();
      },
      onMessage: (message) => {
        push({ type: 'message', text: message });
      },
      onCommand: (command) => {
        push({ type: 'command', ...command });
        usage();
      },
    });
    if (result.outcome === 'paused' && held.live !== undefined && result.pause !== undefined) {
      // A paused run spends nothing and runs nothing: it steps out of the
      // active slot and waits, holding everything a resume continues from.
      paused = true;
      const usage = held.live.usage();
      push({ type: 'usage', data: usage });
      push({ type: 'paused', data: { usage, budgets: held.metadata?.budgets } });
      onPaused?.({
        id: held.id, world: result.state, resume: result.pause, turns: result.turns,
        elapsedMs: (continuation?.elapsedMs ?? 0) + (Date.now() - segmentStartedAt),
        tokens: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
        usage,
      });
      held.finished = true;
      push({ type: 'end' });
      return;
    }
    usage();
    push({ type: 'observation', turn: result.turns, data: buildObservation(adventure, result.state) });
    push({
      type: 'run_ended',
      data: { outcome: result.outcome, reason: result.reason, turns: result.turns, hash: result.hash },
    });
  } catch (error) {
    push({
      type: 'run_ended',
      data: { outcome: 'failure', reason: held.live !== undefined ? 'The AI run could not finish.' : error instanceof Error ? error.message : 'the run crashed' },
    });
  } finally {
    if (!paused) {
      held.finished = true;
      // The live transcript is closed before it is copied, so the copy reads a
      // finished file rather than depending on how the writer buffers.
      held.live?.close();
      // A live run writes its own transcript, which carries the prompt evidence
      // the replay does not need; keep a copy of it in the store so a reader can
      // revisit the same evidence. An unreadable transcript is not a reason to
      // lose the run.
      try {
        if (held.live !== undefined) {
          saved.save(held.id, readTranscript(held.live.transcriptPath()));
        }
      } catch (error) {
        // A copy that fails leaves the store holding a run with no commands, so
        // say so there rather than leaving a bare header to look like evidence.
        const reason = error instanceof Error ? error.message : String(error);
        transcript.write({ type: 'copy_failed', reason });
        console.error(`saved run ${held.id}: the live transcript could not be copied: ${reason}`);
      }
      transcript.close();
      // The end marker is a record like the others, so a stream opened after
      // the run finished still terminates.
      push({ type: 'end' });
    }
  }
}

/** Write the run's records to the response as server-sent events. */
export function streamRun(held: HeldRun, response: ServerResponse): void {
  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });

  let queue: Array<Record<string, unknown>> = [];
  let flushing = false;

  const flush = (): void => {
    if (flushing) return;
    flushing = true;
    while (queue.length > 0) {
      const record = queue.shift()!;
      response.write(`data: ${JSON.stringify(record)}\n\n`);
      if (record['type'] === 'end') {
        response.end();
        held.listeners.delete(listener);
        return;
      }
    }
    flushing = false;
  };

  const listener = (record: Record<string, unknown>): void => {
    queue.push(record);
    flush();
  };
  response.on('close', () => {
    held.listeners.delete(listener);
    if (!held.finished && held.listeners.size === 0) held.live?.cancel();
  });

  // Everything already happened is replayed first, then the live tail.
  queue = [...held.records];
  held.listeners.add(listener);
  flush();
}

/** A fresh run id, namespaced so it reads as one of ours in a URL. */
export const newRunId = (): string => randomUUID();
