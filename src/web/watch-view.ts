import { renderObservation } from '../kernel/render.js';
import { watchAgent, type RunRecord } from './watch.js';

/** The optional server and adventure selected by the page. */
export interface WatchViewOptions {
  baseUrl: string;
  adventureId: string;
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
export function mountWatchView(root: HTMLElement, options: WatchViewOptions): { stop(): void } {
  const start = element<HTMLButtonElement>(root, '.watch-start');
  const stop = element<HTMLButtonElement>(root, '.watch-stop');
  const policy = element<HTMLSelectElement>(root, '.watch-policy');
  const status = element(root, '.watch-status');
  let active: AbortController | undefined;
  let model: ModelDescription | undefined;

  const updatePolicy = (): void => {
    const ai = policy.value === 'llm';
    start.textContent = ai ? 'Start AI run' : 'Start demo';
    stop.textContent = ai ? 'Stop AI run' : 'Stop watching';
    element(root, '.watch-note').textContent = ai
      ? model === undefined ? 'AI is unavailable on this server.' : describeModel(model)
      : `Local demo · no model calls. ${model === undefined ? 'AI is unavailable on this server.' : 'AI is available in Policy.'}`;
  };
  policy.addEventListener('change', updatePolicy);
  void discoverAi();

  async function discoverAi(): Promise<void> {
    try {
      const response = await fetch(`${options.baseUrl.replace(/\/+$/, '')}/api/health`);
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
  const stopWatching = (): void => {
    if (active === undefined) return;
    active.abort();
    active = undefined;
    status.textContent = policy.value === 'llm' ? 'Stopped the AI run.' : 'Stopped watching. The bounded demo may finish on the server.';
    setRunning(false);
  };

  start.addEventListener('click', () => { void startWatching(); });
  stop.addEventListener('click', stopWatching);

  async function startWatching(): Promise<void> {
    if (active !== undefined) return;
    const controller = new AbortController();
    active = controller;
    setRunning(true);
    element(root, '.watch-output').textContent = '';
    element(root, '.watch-log').textContent = '';
    element(root, '.watch-usage').textContent = '';
    status.textContent = 'Starting demo…';
    try {
      await watchAgent({ ...options, signal: controller.signal,
        policy: policy.value === 'llm' ? 'llm' : policy.value === 'random' ? 'random' : 'scripted',
        onRecord: record => { if (active === controller) renderRecord(root, record); },
      });
    } catch (error) {
      if (active === controller) {
        status.textContent = `Could not watch the demo: ${error instanceof Error ? error.message : String(error)}. Check that the optional demo server is running, then try again.`;
      }
    } finally {
      if (active === controller) { active = undefined; setRunning(false); }
    }
  }
  return { stop: stopWatching };
}
