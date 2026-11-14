/*
 * Saved runs.
 *
 * A run somebody watched is evidence, so every watched run writes its
 * transcript, whatever its policy. The store is the directory of those
 * transcripts plus the small summaries that make them findable, and the
 * routes on top of it let a reader list, open and replay a run without a
 * model being asked for anything.
 */


import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Adventure } from '../kernel/types.js';
import { readTranscript, type TranscriptRecord } from '../runner/transcript.js';
import { replayTranscript } from '../runner/replay.js';
import { ADVENTURES } from '../adventures/index.js';

/** The small description of a saved run a reader chooses from. */
export interface SavedRunSummary {
  id: string;
  adventure: string;
  adventureVersion: string;
  policy: string;
  model: string | null;
  seed: number;
  startedAt: string;
  outcome: string;
  turns: number;
  hash: string;
}

/** What replaying produced. An unreadable transcript reports an error, not a mismatch. */
export interface SavedReplay {
  ok: boolean;
  steps: number;
  inferenceRequests: 0;
  mismatch: unknown;
  error?: string;
}

/** A saved run opened for inspection. */
export interface SavedRun {
  id: string;
  adventure: string;
  adventureVersion: string;
  policy: string;
  model: string | null;
  seed: number;
  startedAt: string;
  outcome: string;
  reason?: string;
  turns: number;
  hash: string;
  commands: Array<{ turn: number; raw: string }>;
  records: TranscriptRecord[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Where a run's transcript lives. */
function pathFor(root: string, id: string): string {
  return join(root, `${id}.jsonl`);
}

/** Read the records of a saved run, or null when the store does not hold it. */
function recordsFor(root: string, id: string): TranscriptRecord[] | null {
  const path = pathFor(root, id);
  if (!existsSync(path)) return null;
  try {
    return readTranscript(path).filter(isRecord);
  } catch {
    return null;
  }
}

/** Pull the identifying header and the terminal outcome out of the records. */
function describe(id: string, records: TranscriptRecord[]): {
  adventure: string;
  adventureVersion: string;
  policy: string;
  model: string | null;
  seed: number;
  startedAt: string;
  outcome: string;
  reason?: string;
  turns: number;
  hash: string;
} {
  const header = (records.find(record => record.type === 'header') ?? {}) as Record<string, unknown>;
  const metricsEntry = [...records].reverse().find(record => record.type === 'metrics');
  const metricsData = isRecord(metricsEntry?.['data']) ? metricsEntry!['data'] : {};

  return {
    adventure: String(header['adventure'] ?? 'unknown'),
    adventureVersion: String(header['adventureVersion'] ?? 'unknown'),
    policy: String(header['policy'] ?? 'unknown'),
    model: header['model'] === null ? null : String(header['model'] ?? null),
    seed: Number(header['seed'] ?? 0),
    startedAt: String(header['startedAt'] ?? ''),
    outcome: String(metricsData["outcome"] ?? 'unknown'),
    ...(metricsData["reason"] === undefined ? {} : { reason: String(metricsData["reason"]) }),
    turns: Number(metricsData["turns"] ?? 0),
    hash: String(metricsData["hash"] ?? ''),
  };
}

/** Whether an id is safe to use as a filename. */
export function isSavedRunId(id: string): boolean {
  return /^[A-Za-z0-9._-]{1,120}$/.test(id) && !id.startsWith('.');
}

/** The store: a directory of transcripts and the answers it can give. */
export class SavedRunStore {
  private readonly root: string;

  constructor(root: string) {
    mkdirSync(root, { recursive: true });
    this.root = root;
  }

  /** Where a run's transcript lives. */
  transcriptPath(id: string): string {
    if (!isSavedRunId(id)) throw new Error(`a run id must be a simple name, not "${id}"`);
    return pathFor(this.root, id);
  }

  /** Keep a run's transcript. The id is the run's own. */
  save(id: string, records: TranscriptRecord[]): void {
    if (!isSavedRunId(id)) throw new Error(`a run id must be a simple name, not "${id}"`);
    mkdirSync(this.root, { recursive: true });
    writeFileSync(
      pathFor(this.root, id),
      records.map(record => JSON.stringify(record)).join('\n') + '\n',
    );
  }

  /** The runs on disk, newest first. */
  list(): SavedRunSummary[] {
    if (!existsSync(this.root)) return [];
    const summaries: SavedRunSummary[] = [];
    for (const name of readdirSync(this.root)) {
      if (!name.endsWith('.jsonl')) continue;
      const id = name.slice(0, -'.jsonl'.length);
      const records = recordsFor(this.root, id);
      if (records === null) continue;
      summaries.push({ id, ...describe(id, records) });
    }
    return summaries.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  }

  /** Open a saved run: header, commands and every record. */
  open(id: string): SavedRun | null {
    if (!isSavedRunId(id)) return null;
    const records = recordsFor(this.root, id);
    if (records === null) return null;
    const described = describe(id, records);
    const commands = records
      .filter(record => record.type === 'command')
      .map(record => ({ turn: Number(record['turn'] ?? 0), raw: String(record['raw'] ?? '') }));
    return { id, ...described, commands, records };
  }

  /**
   * Replay a saved run: re-apply its commands to a fresh state and compare the
   * chain. Nothing is asked of any provider, and the world's current
   * definition is what the commands are re-applied to.
   */
  replay(id: string): SavedReplay | null {
    const opened = this.open(id);
    if (opened === null) return null;
    const adventure: Adventure | undefined = ADVENTURES[opened.adventure] ?? undefined;
    if (adventure === undefined) return null;
    try {
      const result = replayTranscript(pathFor(this.root, id), adventure);
      return { ok: result.ok, steps: result.steps, inferenceRequests: 0, mismatch: result.mismatch };
    } catch (error) {
      // A transcript this store wrote is readable; one a caller tampered with
      // is not a reason to hand an internal error to the reader.
      return { ok: false, steps: 0, inferenceRequests: 0, mismatch: null,
        error: `the saved run could not be replayed: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
}
