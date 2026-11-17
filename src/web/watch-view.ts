import { renderObservation } from '../kernel/render.js';
import { describeLimits, describeStop, type RunBudgetView, type RunProgress } from './limits.js';
import { titleOf } from './scenario.js';
import type { FetchLike } from '../session/http.js';
import { watchAgent, type RunRecord } from './watch.js';
import { listSavedRuns, openSavedRun, replaySavedRun } from './saved-runs.js';

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
  // The caps the run reported, and what has been seen of it so far. Both come
  // from the records the server already streams; nothing here asks for more.
  let budget: RunBudgetView | undefined;
  let progress: RunProgress = {};
  let ticker: ReturnType<typeof setInterval> | undefined;

  const limits = element(root, '.watch-limits');
  const savedList = element<HTMLSelectElement>(root, '.saved-runs');
  const savedOpen = element<HTMLButtonElement>(root, '.saved-open');
  const savedReplay = element<HTMLButtonElement>(root, '.saved-replay');
  const savedOutput = element(root, '.watch-saved');
  const renderLimits = (): void => {
    limits.textContent = budget === undefined ? '' : describeLimits(budget, progress);
  };
  const tick = (): void => {
    progress.elapsedMs = Date.now() - startedAt;
    renderLimits();
  };
  let startedAt = 0;
  const startClock = (): void => {
    startedAt = Date.now();
    if (ticker === undefined) ticker = setInterval(tick, 1_000);
    tick();
  };
  const stopClock = (): void => {
    if (ticker !== undefined) { clearInterval(ticker); ticker = undefined; }
  };

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
  /** Apply one streamed record to the panel, and keep the limits line true. */
  const applyRecord = (record: RunRecord): void => {
    const output = element(root, '.watch-output');
    const log = element(root, '.watch-log');
    const status = element(root, '.watch-status');
    log.textContent += `${record.type}\n`;
    if (record.type === 'run_started') {
      element(root, '.watch-note').textContent = describeModel(record.data);
      budget = { ...record.data.budgets };
      progress = {};
      limits.textContent = describeLimits(budget, progress);
    } else if (record.type === 'usage') {
      const usage = record.data;
      const cost = usage.estimatedCostUsd === null ? 'cost estimate unavailable' : `est. $${usage.estimatedCostUsd.toFixed(4)}`;
      element(root, '.watch-usage').textContent = `${usage.estimated ? 'Estimated ' : ''}${usage.tokensUsed} tokens · ${cost}`;
      progress.tokensUsed = usage.tokensUsed;
      progress.tokensEstimated = usage.estimated;
      if (budget !== undefined) limits.textContent = describeLimits(budget, progress);
    } else if (record.type === 'observation') {
      output.textContent += `${renderObservation({ ...record.data, messages: [] })}\n\n`;
      const complete = record.data.goals.filter(goal => goal.status === 'complete').length;
      progress.turn = record.turn;
      status.textContent = `Turn ${record.turn} · goals ${complete}/${record.data.goals.length}`;
      if (budget !== undefined) limits.textContent = describeLimits(budget, progress);
    } else if (record.type === 'command') {
      output.textContent += `> ${record.raw}\n`;
    } else if (record.type === 'message') {
      output.textContent += `${record.text}\n`;
    } else if (record.type === 'run_ended') {
      const result = record.data;
      status.textContent += ` · ${result.outcome} · ${result.hash ?? result.reason ?? ''}`;
      output.textContent += `\n${result.outcome}: ${result.reason ?? 'Run complete.'}\n`;
      progress.outcome = result.outcome;
      progress.reason = result.reason;
      if (budget !== undefined) limits.textContent = describeStop(budget, progress);
      stopClock();
    }
    output.scrollTop = output.scrollHeight;
    log.scrollTop = log.scrollHeight;
  };

  const cancelRun = (): boolean => {
    if (active === undefined) return false;
    active.controller.abort();
    active = undefined;
    stopClock();
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
    limits.textContent = '';
    budget = undefined;
    progress = {};
    adventureId = next;
    setRunning(false);
    const named = `${titleOf(next)} (${next})`;
    status.textContent = wasRunning
      ? `The scenario is now ${named}, so the run was stopped.`
      : `The scenario is now ${named}.`;
  };

  let savedIds: string[] = [];

  const refreshSaved = async (): Promise<void> => {
    try {
      const runs = await listSavedRuns(options.baseUrl, fetchLike);
      savedIds = runs.map(run => run.id);
      savedList.textContent = '';
      for (const run of runs) {
        const option = document.createElement('option');
        option.value = run.id;
        option.textContent = `${run.startedAt.slice(0, 19).replace('T', ' ')} · ${run.adventure} · ${run.outcome} · ${run.turns} turns`;
        savedList.appendChild(option);
      }
      savedOpen.disabled = savedIds.length === 0;
      savedReplay.disabled = savedIds.length === 0;
    } catch { // a static host has no saved runs to show
      savedOpen.disabled = true;
      savedReplay.disabled = true;
    }
  };
  void refreshSaved();

  const showSaved = async (): Promise<void> => {
    const id = savedList.value;
    try {
      const run = await openSavedRun(options.baseUrl, id, fetchLike);
      savedOutput.textContent = [
        `${run.adventure} @ ${run.id}`,
        ...run.commands.map(command => `> ${command.raw}`),
        `\n${run.outcome}: ${run.reason ?? 'Run complete.'}`,
        `${run.turns} turns · ${run.hash}`,
      ].join('\n');
    } catch (error) {
      savedOutput.textContent = error instanceof Error ? error.message : String(error);
    }
  };

  const replay = async (): Promise<void> => {
    const id = savedList.value;
    savedReplay.disabled = true;
    try {
      const result = await replaySavedRun(options.baseUrl, id, fetchLike);
      savedOutput.textContent = result.ok
        ? `Replayed ${result.steps} commands: the chain matches what was recorded. No model was asked for anything.`
        : `Replayed ${result.steps} commands: the chain does not match what was recorded.`;
    } catch (error) {
      savedOutput.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      savedReplay.disabled = false;
    }
  };

  savedOpen.addEventListener('click', () => { void showSaved(); });
  savedReplay.addEventListener('click', () => { void replay(); });

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
    limits.textContent = '';
    budget = undefined;
    progress = {};
    status.textContent = 'Starting demo…';
    try {
      await watchAgent({
        baseUrl: options.baseUrl,
        adventureId,
        fetch: fetchLike,
        signal: controller.signal,
        policy: policy.value === 'llm' ? 'llm' : policy.value === 'random' ? 'random' : 'scripted',
        onRecord: record => {
          if (active?.controller !== controller) return;
          applyRecord(record);
          if (record.type === 'run_started') startClock();
        },
      });
    } catch (error) {
      if (active?.controller === controller) {
        status.textContent = `Could not watch the demo: ${error instanceof Error ? error.message : String(error)}. Check that the optional demo server is running, then try again.`;
      }
    } finally {
      if (active?.controller === controller) { active = undefined; setRunning(false); stopClock(); }
    }
  }

  return { stop: stopWatching, setScenario };
}
