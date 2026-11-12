import { renderObservation } from '../kernel/render.js';
import type { FetchLike } from '../session/http.js';
import { titleOf } from './scenario.js';
import { watchAgent, type RunRecord } from './watch.js';

/** The optional server and adventure selected by the page. */
export interface WatchViewOptions {
  baseUrl: string;
  adventureId: string;
  /** The fetch to use, overridable for the tests. */
  fetch?: FetchLike;
}

/** The watched-run panel, once wired. */
export interface WatchView {
  /** Cancel the run being watched and say why. */
  stop(reason?: string): void;
  /** Move the panel to a world, cancelling whatever it was running. */
  setScenario(adventureId: string): void;
}

interface ModelDescription {
  provider: string;
  model: string;
  budgets: { maxTurns: number; maxTotalTokens: number; maxWallClockMs: number };
}

function describeModel(model: ModelDescription): string {
  const limits = model.budgets;
  return `${model.provider} · ${model.model} · model calls use the server account · up to ${limits.maxTurns} turns / ${limits.maxTotalTokens} tokens / ${limits.maxWallClockMs / 1000} seconds`;
}

function element<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (found === null) throw new Error(`The demo view is missing ${selector}.`);
  return found;
}

function renderRecord(root: HTMLElement, record: RunRecord): void {
  const output = element(root, '.watch-output');
  const log = element(root, '.watch-log');
  const status = element(root, '.watch-status');
  log.textContent += `${record.type}\n`;
  if (record.type === 'run_started') {
    element(root, '.watch-note').textContent = describeModel(record.data);
  } else if (record.type === 'usage') {
    const usage = record.data;
    const cost = usage.estimatedCostUsd === null ? 'cost estimate unavailable' : `est. $${usage.estimatedCostUsd.toFixed(4)}`;
    element(root, '.watch-usage').textContent = `${usage.estimated ? 'Estimated ' : ''}${usage.tokensUsed} tokens · ${cost}`;
  } else if (record.type === 'observation') {
    output.textContent += `${renderObservation({ ...record.data, messages: [] })}\n\n`;
    const complete = record.data.goals.filter(goal => goal.status === 'complete').length;
    status.textContent = `Turn ${record.turn} · goals ${complete}/${record.data.goals.length}`;
  } else if (record.type === 'command') {
    output.textContent += `> ${record.raw}\n`;
  } else if (record.type === 'message') {
    output.textContent += `${record.text}\n`;
  } else if (record.type === 'run_ended') {
    const result = record.data;
    status.textContent += ` · ${result.outcome} · ${result.hash ?? result.reason ?? ''}`;
    output.textContent += `\n${result.outcome}: ${result.reason ?? 'Run complete.'}\n`;
  }
  output.scrollTop = output.scrollHeight;
  log.scrollTop = log.scrollHeight;
}

/** Wire free demonstrations and an explicitly started, cancellable model run. */
export function mountWatchView(root: HTMLElement, options: WatchViewOptions): WatchView {
  const start = element<HTMLButtonElement>(root, '.watch-start');
  const stop = element<HTMLButtonElement>(root, '.watch-stop');
  const policy = element<HTMLSelectElement>(root, '.watch-policy');
  const status = element(root, '.watch-status');
  const fetchLike = options.fetch ?? ((url: string, init?: RequestInit) => fetch(url, init));
  let adventureId = options.adventureId;
  let active: { controller: AbortController } | undefined;
  let model: ModelDescription | undefined;

  const updatePolicy = (): void => {
    const ai = policy.value === 'llm';
    start.textContent = ai ? 'Start AI run' : 'Start demo';
    stop.textContent = ai ? 'Stop AI run' : 'Stop watching';
    element(root, '.watch-note').textContent = ai
      ? model === undefined ? 'AI is unavailable on this server.' : describeModel(model)
      : `${policy.value === 'random' ? 'Random baseline · choices can fail or loop' : 'Scripted reference · known solution'} · no model calls. ${model === undefined ? 'AI is unavailable on this server.' : 'Choose AI agent in Policy for real model play.'}`;
  };
  policy.addEventListener('change', updatePolicy);
  updatePolicy();
  void discoverAi();

  async function discoverAi(): Promise<void> {
    try {
      const response = await fetchLike(`${options.baseUrl.replace(/\/+$/, '')}/api/health`);
      if (!response.ok) return;
      const body = await response.json() as { ai?: ModelDescription | null };
      if (typeof body.ai?.model !== 'string') return;
      model = body.ai;
      const choice = element<HTMLOptionElement>(root, 'option[value="llm"]');
      choice.disabled = false;
      choice.textContent = `AI agent · ${model.model}`;
      updatePolicy();
    } catch { /* Static hosts keep free play and display AI as unavailable. */ }
  }

  const setRunning = (running: boolean): void => {
    start.disabled = running;
    policy.disabled = running;
    stop.disabled = !running;
  };

  /**
   * End the run in flight.
   *
   * The request is aborted, so a model call in flight stops, and the panel
   * forgets the run. Anything the provider says afterwards belongs to a run
   * that is over, so it is dropped rather than shown.
   */
  const cancelRun = (): boolean => {
    if (active === undefined) return false;
    active.controller.abort();
    active = undefined;
    return true;
  };

  const stopWatching = (reason?: string): void => {
    const stopped = cancelRun();
    if (stopped && reason !== undefined) status.textContent = reason;
    setRunning(false);
  };

  /**
   * Move the panel to another world.
   *
   * The run in flight belongs to the world it started in, so it stops here.
   * The transcript is cleared with it, because a transcript of the old world
   * read in the new one would be a lie about what the reader is watching.
   */
  const setScenario = (next: string): void => {
    const wasRunning = cancelRun();
    element(root, '.watch-output').textContent = '';
    element(root, '.watch-log').textContent = '';
    element(root, '.watch-usage').textContent = '';
    adventureId = next;
    setRunning(false);
    const named = `${titleOf(next)} (${next})`;
    status.textContent = wasRunning
      ? `The scenario is now ${named}, so the run was stopped.`
      : `The scenario is now ${named}.`;
  };

  start.addEventListener('click', () => { void startWatching(); });
  stop.addEventListener('click', () => {
    stopWatching(policy.value === 'llm'
      ? 'Stopped the AI run.'
      : 'Stopped watching. The bounded demo may finish on the server.');
  });

  async function startWatching(): Promise<void> {
    if (active !== undefined) return;
    const controller = new AbortController();
    active = { controller };
    setRunning(true);
    element(root, '.watch-output').textContent = '';
    element(root, '.watch-log').textContent = '';
    element(root, '.watch-usage').textContent = '';
    status.textContent = 'Starting demo…';
    try {
      await watchAgent({
        baseUrl: options.baseUrl,
        adventureId,
        fetch: fetchLike,
        signal: controller.signal,
        policy: policy.value === 'llm' ? 'llm' : policy.value === 'random' ? 'random' : 'scripted',
        onRecord: record => { if (active?.controller === controller) renderRecord(root, record); },
      });
    } catch (error) {
      if (active?.controller === controller) {
        status.textContent = `Could not watch the demo: ${error instanceof Error ? error.message : String(error)}. Check that the optional demo server is running, then try again.`;
      }
    } finally {
      if (active?.controller === controller) { active = undefined; setRunning(false); }
    }
  }

  return { stop: stopWatching, setScenario };
}
