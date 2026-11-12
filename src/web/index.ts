/*
 * The page's entry point.
 *
 * Reads the runtime configuration, opens the session on the configured
 * side, and wires the terminal to the document. Nothing else: the entry
 * point is where the browser and the tests part ways, so it stays thin.
 */

import { openSession, type SessionMode } from './client.js';
import { createTerminal } from './ui.js';
import { mountWatchView } from './watch-view.js';
import {
  createScenarioSwitcher,
  defaultScenarioId,
  isScenario,
  scenarioChoices,
} from './scenario.js';

/** The configuration the page may set before the bundle runs. */
export interface RuntimeConfig {
  mode?: SessionMode;
  baseUrl?: string;
  adventureId?: string;
}

declare global {
  interface Window {
    TEXT_ADVENTURE_CONFIG?: RuntimeConfig;
  }
}

/** Boot the client into a root element. Exported for the tests. */
export async function boot(
  root: HTMLElement,
  config: RuntimeConfig = {},
  documentImpl: Document = document,
): Promise<void> {
  const requested = config.adventureId ?? defaultScenarioId();
  if (!isScenario(requested)) {
    const known = scenarioChoices().map(choice => choice.id).join(', ');
    throw new Error(`there is no scenario called "${requested}". Known scenarios: ${known}`);
  }
  const mode = config.mode ?? 'memory';
  const session = await openSession({ mode, baseUrl: config.baseUrl, adventureId: requested });
  await createTerminal({ document: documentImpl, root, session });
  const watchRoot = documentImpl.querySelector<HTMLElement>('#watch');
  if (watchRoot === null) return;

  const watch = mountWatchView(watchRoot, {
    baseUrl: config.baseUrl ?? window.location.origin,
    adventureId: session.adventure.id,
  });
  const playButton = documentImpl.querySelector<HTMLButtonElement>('#play-mode');
  const watchButton = documentImpl.querySelector<HTMLButtonElement>('#watch-mode');
  const show = (watching: boolean): void => {
    if (!watching) watch.stop('Stopped the run.');
    root.hidden = watching;
    watchRoot.hidden = !watching;
    playButton?.setAttribute('aria-pressed', String(!watching));
    watchButton?.setAttribute('aria-pressed', String(watching));
  };
  playButton?.addEventListener('click', () => show(false));
  watchButton?.addEventListener('click', () => show(true));

  const note = documentImpl.querySelector<HTMLElement>('.scenario-note');
  const select = documentImpl.querySelector<HTMLSelectElement>('.scenario-select');
  const switcher = createScenarioSwitcher(requested, {
    openSession: adventureId => openSession({ mode, baseUrl: config.baseUrl, adventureId }),
    showSession: async next => {
      root.textContent = '';
      await createTerminal({ document: documentImpl, root, session: next });
    },
    watchScenario: adventureId => watch.setScenario(adventureId),
    reportError: message => {
      if (note !== null) note.textContent = message;
      if (select !== null) select.value = switcher.scenarioId;
    },
  });
  if (select !== null) {
    for (const choice of scenarioChoices()) {
      const option = documentImpl.createElement('option');
      option.value = choice.id;
      option.textContent = choice.title;
      select.appendChild(option);
    }
    select.value = requested;
    select.addEventListener('change', () => { void switcher.select(select.value); });
  }

  // A tab nobody is looking at should not hold a model request open.
  documentImpl.addEventListener('visibilitychange', () => {
    if (documentImpl.hidden) watch.stop('Stopped the run because the tab was hidden.');
  });
  documentImpl.addEventListener('pagehide', () => { watch.stop(); });
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  const root = document.querySelector<HTMLElement>('#terminal');
  if (root !== null) {
    void boot(root, window.TEXT_ADVENTURE_CONFIG ?? {}).catch(error => {
      root.textContent = `Could not open the game: ${error instanceof Error ? error.message : String(error)}`;
    });
  }
}
