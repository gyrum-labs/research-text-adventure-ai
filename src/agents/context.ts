/*
 * Context strategies.
 *
 * How much of the past the agent sees is an experimental variable, not an
 * implementation detail. The same state, the same agent, the same budget, and
 * four different prompts. If the strategies produced the same prompt the
 * variable would not exist, and every comparison built on it would be hollow.
 *
 * The strategies read the agent's own history and nothing else. The brief is
 * public, the observations are what the agent earned, and the commands are
 * the agent's own. The gold path, the hint table and the action predicates
 * are not reachable from here.
 */

import type { Observation } from '../kernel/types.js';
import { buildKnownFacts } from '../kernel/observation.js';
import { renderObservation } from '../kernel/render.js';

export type ContextStrategy = 'none' | 'full' | 'window' | 'structured';

/** The strategies, in the order they are described in the specification. */
export const CONTEXT_STRATEGIES: readonly ContextStrategy[] = [
  'none',
  'full',
  'window',
  'structured',
];

/** How many turns the window strategy keeps. */
export const WINDOW_TURNS = 5;

/** How many past outcomes the structured strategy keeps. */
export const STRUCTURED_OUTCOMES = 2;

/** One turn of the agent's own history. */
export interface ContextTurn {
  /** The command the agent issued. */
  command: string;
  /** The observation that came back. */
  observation: Observation;
}

/** Everything a strategy is allowed to read. */
export interface ContextInput {
  /** The adventure brief. Public by definition. */
  brief: string;
  /** The turns so far, oldest first. */
  turns: ContextTurn[];
  /** The observation the agent is about to act on. */
  observation: Observation;
}

/**
 * Assemble the prompt for one strategy.
 *
 * The prompt is plain text on purpose: a model reads text, a transcript
 * stores text, and a token counter counts text. Nothing here decides what
 * the agent should do.
 */
export function buildContext(strategy: ContextStrategy, input: ContextInput): string {
  switch (strategy) {
    case 'none':
      return renderObservation(input.observation);
    case 'full':
      return renderFull(input);
    case 'window':
      return renderWindow(input);
    case 'structured':
      return renderStructured(input);
  }
}

/** Everything: the brief, every command, every observation, every outcome. */
function renderFull(input: ContextInput): string {
  const sections: string[] = [input.brief];

  input.turns.forEach((turn, index) => {
    sections.push(`Turn ${index + 1}: ${turn.command}`);
    sections.push(renderObservation(turn.observation));
  });

  sections.push('Now:');
  sections.push(renderObservation(input.observation));
  return sections.join('\n\n');
}

/** The brief and the last few turns. */
function renderWindow(input: ContextInput): string {
  const recent = input.turns.slice(-WINDOW_TURNS);
  const sections: string[] = [input.brief];

  recent.forEach((turn, index) => {
    sections.push(`Turn ${index + 1}: ${turn.command}`);
    sections.push(renderObservation(turn.observation));
  });

  sections.push('Now:');
  sections.push(renderObservation(input.observation));
  return sections.join('\n\n');
}

/**
 * The compact summary: what the agent knows, plus the last few outcomes.
 *
 * The facts block is derived from the agent's own observations, so it is a
 * summary of what the agent has seen rather than a summary of the world.
 */
function renderStructured(input: ContextInput): string {
  const observations = [...input.turns.map((turn) => turn.observation), input.observation];
  const sections: string[] = [input.brief, 'Facts you know:', buildKnownFacts(observations)];

  const recent = input.turns.slice(-STRUCTURED_OUTCOMES);
  const outcomes = recent.flatMap((turn) => turn.observation.messages);
  if (outcomes.length > 0) {
    sections.push(['Recent outcomes:', ...outcomes.map((outcome) => `- ${outcome}`)].join('\n'));
  }

  sections.push('Now:');
  sections.push(renderObservation(input.observation));
  return sections.join('\n\n');
}
