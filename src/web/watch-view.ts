import { renderObservation } from '../kernel/render.js';
import { watchAgent, type RunRecord } from './watch.js';

/** The optional server and adventure selected by the page. */
export interface WatchViewOptions {
  baseUrl: string;
  adventureId: string;
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
  if (record.type === 'observation') {
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

/** Wire the optional demo controls; stopping disconnects the view, not the bounded run. */
export function mountWatchView(root: HTMLElement, options: WatchViewOptions): { stop(): void } {
  const start = element<HTMLButtonElement>(root, '.watch-start');
  const stop = element<HTMLButtonElement>(root, '.watch-stop');
  const policy = element<HTMLSelectElement>(root, '.watch-policy');
  const status = element(root, '.watch-status');
  let active: AbortController | undefined;

  const setRunning = (running: boolean): void => {
    start.disabled = running;
    policy.disabled = running;
    stop.disabled = !running;
  };
  const stopWatching = (): void => {
    if (active === undefined) return;
    active.abort();
    active = undefined;
    status.textContent = 'Stopped watching. The bounded demo may finish on the server.';
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
    status.textContent = 'Starting demo…';
    try {
      await watchAgent({ ...options, signal: controller.signal,
        policy: policy.value === 'random' ? 'random' : 'scripted',
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
