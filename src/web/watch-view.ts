import { renderObservation } from '../kernel/render.js';
import { describeLimits, describeStop, type RunBudgetView, type RunProgress } from './limits.js';
import { titleOf } from './scenario.js';
import type { FetchLike } from '../session/http.js';
import { watchAgent, attachRun, pauseRun, resumeRun, type RunRecord } from './watch.js';
import { listSavedRuns, openSavedRun, replaySavedRun } from './saved-runs.js';

/** The optional server and adventure selected by the page. */
export interface WatchViewOptions {
  baseUrl: string;
  adventureId: string;
  /** The fetch to use, overridable for the tests. */
  fetch?: FetchLike;
  /** How the panel builds the option elements it offers. Defaults to the document. */
  createElement?: (tagName: string) => HTMLElement;
}

/** The watched-run panel, once wired. */
export interface WatchView {
  /** Cancel the run being watched and say why. */
  stop(reason?: string): void;
  /** Move the panel to a world, cancelling whatever it was running. */
  setScenario(adventureId: string): void;
}

/** How the server describes one of its configured agents. */
export interface AgentDescription {
  provider: string;
  model: string;
  budgets: { maxTurns: number; maxTotalTokens: number; maxWallClockMs: number };
}

/** One thing the reader can choose to watch. */
export type WatchChoice =
  | { kind: 'free'; policy: 'scripted' | 'random'; label: string; note: string }
  | { kind: 'agent'; model: string; label: string; described: AgentDescription };

function describeAgent(agent: AgentDescription): string {
  const caps = agent.budgets;
  return `${agent.provider} · ${agent.model} · model calls use the server account · up to ${caps.maxTurns} turns / ${caps.maxTotalTokens} tokens / ${caps.maxWallClockMs / 1000} seconds`;
}

/** The two runs that make no model calls, with how each is described. */
function freeChoices(): Extract<WatchChoice, { kind: 'free' }>[] {
  return [
    { kind: 'free', policy: 'scripted', label: 'Scripted reference (no AI)',
      note: 'Scripted reference · known solution · no model calls.' },
    { kind: 'free', policy: 'random', label: 'Random baseline (no AI)',
      note: 'Random baseline · choices can fail or loop · no model calls.' },
  ];
}

function element<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (found === null) throw new Error(`The demo view is missing ${selector}.`);
  return found;
}

/** Wire free demonstrations and an explicitly started, cancellable model run. */
export function mountWatchView(root: HTMLElement, options: WatchViewOptions): WatchView {
  const start = element<HTMLButtonElement>(root, '.watch-start');
  const stopButton = element<HTMLButtonElement>(root, '.watch-stop');
  const pause = element<HTMLButtonElement>(root, '.watch-pause');
  const resume = element<HTMLButtonElement>(root, '.watch-resume');
  const policy = element<HTMLSelectElement>(root, '.watch-policy');
  const status = element(root, '.watch-status');
  const limits = element(root, '.watch-limits');
  const savedList = element<HTMLSelectElement>(root, '.saved-runs');
  const savedOpen = element<HTMLButtonElement>(root, '.saved-open');
  const savedReplay = element<HTMLButtonElement>(root, '.saved-replay');
  const savedOutput = element(root, '.watch-saved');
  const fetchLike = options.fetch ?? ((url: string, init?: RequestInit) => fetch(url, init));
  const createElement = options.createElement ?? ((tagName: string) => document.createElement(tagName));

  let adventureId = options.adventureId;
  let active: { controller: AbortController } | undefined;
  let choices: WatchChoice[] = freeChoices();
  // The run the server is executing or holding for this panel, and the one a
  // pause left waiting. A paused run spends nothing until Resume is pressed.
  let activeRunId: string | undefined;
  let activeIsAgent = false;
  let pausedRunId: string | undefined;
  // The caps the run reported, and what has been seen of it so far. Both come
  // from the records the server already streams; nothing here asks for more.
  let budget: RunBudgetView | undefined;
  let progress: RunProgress = {};
  let ticker: ReturnType<typeof setInterval> | undefined;

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

  /** The choice matching the select, or undefined when it names nothing real. */
  const chosen = (): WatchChoice | undefined => {
    return choices.find(choice => choiceToValue(choice) === policy.value);
  };

  const updatePolicy = (): void => {
    const choice = chosen();
    if (choice === undefined) {
      start.textContent = 'Start';
      stopButton.textContent = 'Stop';
      element(root, '.watch-note').textContent =
        'The selected agent is not offered by this server, so there is nothing to start.';
      return;
    }
    if (choice.kind === 'agent') {
      start.textContent = 'Start AI run';
      stopButton.textContent = 'Stop AI run';
      element(root, '.watch-note').textContent = describeAgent(choice.described);
      return;
    }
    start.textContent = 'Start demo';
    stopButton.textContent = 'Stop watching';
    const free = choice.note;
    const hint = choices.some(candidate => candidate.kind === 'agent')
      ? `${free} Choose an AI agent in Policy for real model play.`
      : free;
    element(root, '.watch-note').textContent = hint;
  };
  policy.addEventListener('change', updatePolicy);
  updatePolicy();
  void discoverAgents();

  /** The agents the server offers, one policy option each. */
  async function discoverAgents(): Promise<void> {
    let offered: AgentDescription[] = [];
    try {
      const response = await fetchLike(`${options.baseUrl.replace(/\/+$/, '')}/api/health`);
      if (!response.ok) return;
      const body = await response.json() as { ai?: AgentDescription | null; aiModels?: AgentDescription[] };
      offered = body.aiModels ?? (body.ai ? [body.ai] : []);
    } catch {
      // A server that cannot be reached keeps the panel on the free choices.
      return;
    }
    const agents = offered.filter(entry => typeof entry.model === 'string');
    if (agents.length === 0) return;
    choices = [
      ...freeChoices(),
      ...agents.map(agent => ({ kind: 'agent' as const, model: agent.model,
        label: `AI agent · ${agent.model}`, described: agent })),
    ];
    renderChoices();
    updatePolicy();
  }

  /** Fill the policy select: free runs first, then one option per agent. */
  function renderChoices(): void {
    policy.textContent = '';
    for (const choice of choices) {
      const option = createElement('option') as HTMLOptionElement;
      option.value = choiceToValue(choice);
      option.textContent = choice.label;
      policy.appendChild(option);
    }
  }

  function choiceToValue(choice: WatchChoice): string {
    return choice.kind === 'free' ? choice.policy : choice.model;
  }

  const cancelRun = (): boolean => {
    if (active === undefined) return false;
    active.controller.abort();
    active = undefined;
    stopClock();
    return true;
  };

  const stopWatching = (reason?: string): void => {
    const hadPaused = pausedRunId !== undefined;
    const stopped = cancelRun();
    discardPaused();
    if ((stopped || hadPaused) && reason !== undefined) status.textContent = reason;
    setRunning(false);
  };


  start.addEventListener('click', () => { void startWatching(); });
  stopButton.addEventListener('click', () => {
    const choice = chosen();
    stopWatching(choice !== undefined && choice.kind === 'agent'
      ? 'Stopped the AI run.'
      : 'Stopped watching. The bounded demo may finish on the server.');
  });

  // The two views share the run: going back to Play stops a model call, and a
  // page without the watched panel has no second view to switch to.
  const playButton = root.parentElement?.querySelector<HTMLButtonElement>('#play-mode');
  const watchButton = root.parentElement?.querySelector<HTMLButtonElement>('#watch-mode');
  const show = (watching: boolean): void => {
    if (!watching) stopWatching('Stopped the run.');
    root.hidden = watching;
    playButton?.setAttribute('aria-pressed', String(!watching));
    watchButton?.setAttribute('aria-pressed', String(watching));
  };
  playButton?.addEventListener('click', () => show(false));
  watchButton?.addEventListener('click', () => show(true));

  async function startWatching(): Promise<void> {
    const choice = chosen();
    if (choice === undefined) {
      status.textContent =
        'The selected agent is not offered by this server, so there is nothing to start.';
      return;
    }
    if (active !== undefined) return;
    activeIsAgent = choice.kind === 'agent';
    const controller = new AbortController();
    active = { controller };
    setRunning(true);
    element(root, '.watch-output').textContent = '';
    element(root, '.watch-log').textContent = '';
    element(root, '.watch-usage').textContent = '';
    limits.textContent = '';
    status.textContent = 'Starting…';
    try {
      await watchAgent({
        baseUrl: options.baseUrl,
        adventureId,
        ...(choice.kind === 'agent' ? { model: choice.model } : {}),
        fetch: fetchLike,
        signal: controller.signal,
        policy: choice.kind === 'agent' ? 'llm' : choice.policy,
        onRun: id => { activeRunId = id; },
        onRecord: record => {
          if (active?.controller !== controller) return;
          applyRecord(record);
          if (record.type === 'run_started') startClock();
        },
      });
    } catch (error) {
      if (active?.controller === controller) {
        status.textContent = `Could not watch the run: ${error instanceof Error ? error.message : String(error)}. Check that the optional demo server is running, then try again.`;
      }
    } finally {
      if (active?.controller === controller) { active = undefined; setRunning(false); stopClock(); }
    }
  }

  const setRunning = (running: boolean): void => {
    start.disabled = running;
    policy.disabled = running;
    stopButton.disabled = !running && pausedRunId === undefined;
    pause.disabled = !running || !activeIsAgent;
    resume.disabled = pausedRunId === undefined;
  };

  /** Tell the server to let a paused run go: stopping a paused run discards it. */
  const discardPaused = (): void => {
    if (pausedRunId === undefined) return;
    const id = pausedRunId;
    pausedRunId = undefined;
    void fetchLike(`${options.baseUrl.replace(/\/+$/, '')}/api/runs/${encodeURIComponent(id)}`,
      { method: 'DELETE' }).then(async response => { await response.body?.cancel(); }).catch(() => {});
  };

  /** Apply one streamed record to the panel, and keep the limits line true. */
  const applyRecord = (record: RunRecord): void => {
    const output = element(root, '.watch-output');
    const log = element(root, '.watch-log');
    const labels: Record<string, string> = {
      run_started: 'run started', usage: 'usage', observation: 'the world',
      command: 'command', message: 'feedback', run_ended: 'run ended', end: 'end',
    };
    log.textContent += `${labels[record.type] ?? record.type}\n`;
    if (record.type === 'run_started') {
      element(root, '.watch-note').textContent = describeAgent({
        provider: record.data.provider, model: record.data.model, budgets: record.data.budgets,
      });
      budget = { ...record.data.budgets };
      progress = {};
      renderLimits();
    } else if (record.type === 'usage') {
      const usage = record.data;
      const cost = usage.estimatedCostUsd === null ? 'cost estimate unavailable' : `est. $${usage.estimatedCostUsd.toFixed(4)}`;
      element(root, '.watch-usage').textContent = `${usage.estimated ? 'Estimated ' : ''}${usage.tokensUsed} tokens · ${cost}`;
      progress.tokensUsed = usage.tokensUsed;
      progress.tokensEstimated = usage.estimated;
      renderLimits();
    } else if (record.type === 'observation') {
      output.textContent += `${renderObservation({ ...record.data, messages: [] })}\n\n`;
      const complete = record.data.goals.filter(goal => goal.status === 'complete').length;
      progress.turn = record.turn;
      status.textContent = `Turn ${record.turn} · goals ${complete}/${record.data.goals.length}`;
      renderLimits();
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
    } else if (record.type === 'paused') {
      // The run holds still: nothing runs, nothing spends, and the usage it
      // accounted stays on the panel with the caps it has left.
      pausedRunId = activeRunId;
      setRunning(false);
      stopClock();
      const usage = record.data.usage;
      const cost = usage.estimatedCostUsd === null ? 'cost estimate unavailable' : `est. $${usage.estimatedCostUsd.toFixed(4)}`;
      status.textContent = `Paused · ${usage.tokensUsed} tokens · ${cost} · nothing runs until you press Resume.`;
      if (record.data.budgets !== undefined) budget = { ...record.data.budgets };
      limits.textContent = budget === undefined ? '' : describeLimits(budget, progress);
    } else if (record.type === 'resumed') {
      if (record.data.budgets !== undefined) budget = { ...record.data.budgets };
      status.textContent = 'Resumed — the same mission continues.';
      limits.textContent = budget === undefined ? '' : describeLimits(budget, progress);
    }
    output.scrollTop = output.scrollHeight;
    log.scrollTop = log.scrollHeight;
  };

  let savedIds: string[] = [];

  const refreshSaved = async (): Promise<void> => {
    try {
      const runs = await listSavedRuns(options.baseUrl, fetchLike);
      savedIds = runs.map(run => run.id);
      savedList.textContent = '';
      for (const run of runs) {
        const option = createElement('option') as HTMLOptionElement;
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
  stopButton.addEventListener('click', () => {
    const choice = chosen();
    stopWatching(choice !== undefined && choice.kind === 'agent'
      ? 'Stopped the AI run.'
      : 'Stopped watching. The bounded demo may finish on the server.');
  });
  pause.addEventListener('click', () => {
    if (activeRunId === undefined) return;
    pause.disabled = true;
    void pauseRun({ baseUrl: options.baseUrl, id: activeRunId, fetch: fetchLike }).catch((error: unknown) => {
      pause.disabled = active !== undefined && activeIsAgent;
      status.textContent = `Could not pause: ${error instanceof Error ? error.message : String(error)}`;
    });
  });
  resume.addEventListener('click', () => {
    const id = pausedRunId;
    if (id === undefined) return;
    resume.disabled = true;
    const controller = new AbortController();
    active = { controller };
    activeRunId = id;
    activeIsAgent = true;
    setRunning(true);
    void (async () => {
      try {
        await resumeRun({ baseUrl: options.baseUrl, id, fetch: fetchLike });
        pausedRunId = undefined;
        status.textContent = 'Resuming…';
        // The transcript stays: the resumed half appends to what was watched.
        await attachRun({ baseUrl: options.baseUrl, id, signal: controller.signal,
          fetch: fetchLike, onRecord: record => {
            if (active?.controller !== controller) return;
            applyRecord(record);
            if (record.type === 'resumed') startClock();
          } });
      } catch (error) {
        // The server names why a resume cannot happen; say so in its words.
        if (pausedRunId === undefined && active?.controller === controller) {
          pausedRunId = id; // nothing was lost; the run still waits
        }
        if (active?.controller === controller) {
          status.textContent = `Could not resume: ${error instanceof Error ? error.message : String(error)}`;
        }
      } finally {
        if (active?.controller === controller) { active = undefined; setRunning(false); stopClock(); }
      }
    })();
  });

  return {
    stop(reason?: string): void {
      const stopped = cancelRun();
      if (stopped && reason !== undefined) status.textContent = reason;
      setRunning(false);
    },
    setScenario(next: string): void {
      const wasRunning = cancelRun();
      const hadPaused = pausedRunId !== undefined;
      // A paused run belongs to the world it was paused in; the new world gets
      // nothing left over from the old one.
      discardPaused();
      element(root, '.watch-output').textContent = '';
      element(root, '.watch-log').textContent = '';
      element(root, '.watch-usage').textContent = '';
      limits.textContent = '';
      budget = undefined;
      progress = {};
      adventureId = next;
      setRunning(false);
      const named = `${titleOf(next)} (${next})`;
      status.textContent = wasRunning || hadPaused
        ? `The scenario is now ${named}, so the run was stopped.`
        : `The scenario is now ${named}.`;
    },
  };
}
