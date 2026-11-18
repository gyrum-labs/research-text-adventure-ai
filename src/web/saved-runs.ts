/*
 * Saved runs, in the browser.
 *
 * A run somebody watched is evidence they may want again, so the panel can
 * list what the server kept, open one to read its commands and results, and
 * replay it: the server re-applies the recorded commands to the world and
 * reports whether the chain matches. Nothing here can start inference, spend
 * money, or disturb a live run.
 */

import type { FetchLike } from '../session/http.js';

/** What the list shows for one saved run. */
export interface SavedRunSummary {
  id: string;
  adventure: string;
  adventureVersion: string;
  policy: string;
  model: string | null;
  startedAt: string;
  outcome: string;
  turns: number;
}

/** A saved run opened for inspection. */
export interface SavedRun {
  id: string;
  adventure: string;
  commands: Array<{ turn: number; raw: string }>;
  outcome: string;
  reason?: string;
  turns: number;
  hash: string;
}

/** What replaying produced. */
export interface SavedReplay {
  ok: boolean;
  steps: number;
  inferenceRequests: number;
}

const base = (baseUrl: string): string => baseUrl.replace(/\/+$/, '');

/** List the runs the server kept. */
export async function listSavedRuns(baseUrl: string, fetchLike: FetchLike): Promise<SavedRunSummary[]> {
  const response = await fetchLike(`${base(baseUrl)}/api/runs/saved`);
  if (!response.ok) throw new Error(`the server refused the saved-run list (${response.status})`);
  const body = (await response.json()) as { runs?: SavedRunSummary[] };
  return body.runs ?? [];
}

/** Open one saved run. */
export async function openSavedRun(baseUrl: string, id: string, fetchLike: FetchLike): Promise<SavedRun> {
  const response = await fetchLike(`${base(baseUrl)}/api/runs/saved/${encodeURIComponent(id)}`);
  if (response.status === 404) throw new Error(`there is no saved run called "${id}"`);
  if (!response.ok) throw new Error(`the server refused the saved run (${response.status})`);
  return (await response.json()) as SavedRun;
}

/** Replay one saved run. The server answers from its own world. */
export async function replaySavedRun(baseUrl: string, id: string, fetchLike: FetchLike): Promise<SavedReplay> {
  const response = await fetchLike(`${base(baseUrl)}/api/runs/saved/${encodeURIComponent(id)}/replay`, { method: 'POST' });
  if (response.status === 404) throw new Error(`there is no saved run called "${id}"`);
  if (!response.ok) throw new Error(`the server refused the replay (${response.status})`);
  return (await response.json()) as SavedReplay;
}
