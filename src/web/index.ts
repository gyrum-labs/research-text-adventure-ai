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
  documentImpl = document,
): Promise<void> {
  const session = await openSession({
    mode: config.mode ?? 'memory',
    baseUrl: config.baseUrl,
    adventureId: config.adventureId,
  });
  await createTerminal({ document: documentImpl, root, session });
  const watchRoot = documentImpl.querySelector<HTMLElement>('#watch');
  if (watchRoot !== null) {
    const watch = mountWatchView(watchRoot, {
      baseUrl: config.baseUrl ?? window.location.origin,
      adventureId: session.adventure.id,
    });
    const playButton = documentImpl.querySelector<HTMLButtonElement>('#play-mode');
    const watchButton = documentImpl.querySelector<HTMLButtonElement>('#watch-mode');
    const show = (watching: boolean): void => {
      if (!watching) watch.stop();
      root.hidden = watching;
      watchRoot.hidden = !watching;
      playButton?.setAttribute('aria-pressed', String(!watching));
      watchButton?.setAttribute('aria-pressed', String(watching));
    };
    playButton?.addEventListener('click', () => show(false));
    watchButton?.addEventListener('click', () => show(true));
  }
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  const root = document.querySelector<HTMLElement>('#terminal');
  if (root !== null) {
    void boot(root, window.TEXT_ADVENTURE_CONFIG ?? {}).catch(error => {
      root.textContent = `Could not open the game: ${error instanceof Error ? error.message : String(error)}`;
    });
  }
}
