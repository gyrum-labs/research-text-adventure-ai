/*
 * Choosing a world.
 *
 * The browser ships more than one adventure, and which one a person plays is
 * their decision rather than a constant. This module owns that decision: the
 * worlds on offer, whether an identifier names one of them, and the switch
 * that moves a live client from one to another without letting the old world
 * leak into the new one.
 */

import { ADVENTURES } from '../adventures/index.js';
import type { Session } from '../session/types.js';

/** One world the browser can offer. */
export interface ScenarioChoice {
  id: string;
  title: string;
}

/**
 * The worlds on offer, in the order they are listed.
 *
 * The order is the order the worlds ship in, and the first of them is the
 * world the page opens. That is a decision worth keeping: the ticket pins the
 * existing default world, and tests/web/scenario.test.ts pins both the list
 * and the default, so a refactor that reorders them fails loudly instead of
 * quietly changing which mission a reader lands in.
 */
export function scenarioChoices(): ScenarioChoice[] {
  return Object.entries(ADVENTURES).map(([id, adventure]) => ({ id, title: adventure.title }));
}

/** The world the client opens when nobody chooses. */
export function defaultScenarioId(): string {
  return Object.keys(ADVENTURES)[0]!;
}

/** Whether an identifier names a world the browser ships. */
export function isScenario(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(ADVENTURES, id);
}

/** What a switch needs from the page it belongs to. */
export interface ScenarioSwitchOptions {
  /** Open a fresh game in the named world. */
  openSession(adventureId: string): Promise<Session>;
  /** Show the fresh game to the reader. */
  showSession(session: Session): Promise<void>;
  /** Point the watcher at a world. A run it holds belongs to the old one and is cancelled here. */
  watchScenario(adventureId: string): void;
  /** Report a refusal. The reader stays where they were. */
  reportError(message: string): void;
  /** The world already on show, so a switch that fails late can put it back. */
  initial?: Session;
}

/** A client that can move between worlds. */
export interface ScenarioSwitcher {
  /** The world currently on show. */
  readonly scenarioId: string;
  /** Move to a world, or report why it could not. */
  select(adventureId: string): Promise<void>;
}

/** Build the switcher for a client that starts in the given world. */
export function createScenarioSwitcher(start: string, options: ScenarioSwitchOptions): ScenarioSwitcher {
  let current = start;
  let attempt = 0;
  let shown = options.initial;
  return {
    get scenarioId(): string {
      return current;
    },
    async select(adventureId: string): Promise<void> {
      if (!isScenario(adventureId)) {
        options.reportError(`There is no scenario called "${adventureId}".`);
        return;
      }
      const mine = ++attempt;
      let session: Session;
      try {
        session = await options.openSession(adventureId);
      } catch (error) {
        if (mine !== attempt) return;
        options.reportError(`Could not open ${titleOf(adventureId)}: ${reasonOf(error)}`);
        return;
      }
      // A later request has moved on; this one no longer decides anything.
      if (mine !== attempt) return;
      options.watchScenario(adventureId);
      try {
        await options.showSession(session);
      } catch (error) {
        // The old world is still the one the switcher owns, so put it back
        // rather than leave the reader a blank game and no explanation.
        if (mine !== attempt) return;
        try {
          if (shown !== undefined) await options.showSession(shown);
        } catch { /* the reader keeps the error below either way */ }
        if (mine !== attempt) return;
        options.reportError(`Could not open ${titleOf(adventureId)}: ${reasonOf(error)}`);
        return;
      }
      if (mine !== attempt) return;
      shown = session;
      current = adventureId;
    },
  };
}

/** The name of a world, as the page shows it. */
export function titleOf(adventureId: string): string {
  return ADVENTURES[adventureId]?.title ?? adventureId;
}

/** The reason something failed, as a sentence fragment. */
function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
