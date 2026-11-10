/*
 * The transcript: the record of a run.
 *
 * JSON Lines, one record per line, written as the run happens. It is the
 * audit trail, and it is what replay reads back.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface TranscriptHeader {
  type: 'header';
  runId: string;
  adventure: string;
  adventureVersion: string;
  adventureHash: string;
  policy: string;
  provider: string | null;
  model: string | null;
  seed: number;
  maxTurns: number;
  startedAt: string;
  engineVersion: string;
}

export interface TranscriptRecord {
  type: string;
  [key: string]: unknown;
}

export class Transcript {
  private readonly path: string;
  private readonly records: TranscriptRecord[] = [];

  constructor(path: string, header: TranscriptHeader) {
    this.path = path;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, '');
    this.write(header as unknown as TranscriptRecord);
  }

  write(record: TranscriptRecord): void {
    this.records.push(record);
    // Written synchronously on purpose: a transcript is the audit trail, and
    // a reader must never see a half-flushed file.
    appendFileSync(this.path, `${JSON.stringify(record)}\n`);
  }

  all(): TranscriptRecord[] {
    return [...this.records];
  }

  close(): void {
    /* every record is already on disk */
  }
}

/**
 * Read a transcript back.
 *
 * The transcript is the audit trail, and the audit trail has to be readable by
 * the things that judge a run: the failure classifier and the metrics.
 */
export function readTranscript(path: string): TranscriptRecord[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as TranscriptRecord);
}
