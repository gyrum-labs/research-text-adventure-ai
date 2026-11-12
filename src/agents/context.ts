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
import { renderObservationWith } from '../kernel/render.js';

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

/** How an observation is rendered in the context. */
export type ObservationRenderer = 'text' | 'json';

/** One turn of the agent's own history. */
export interface ContextTurn {
  /** The command the agent issued. */
  command: string;
  /** Public view when this command was issued, preserving the initial view. */
  before?: Observation;
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
  /** How the observations are rendered. Defaults to prose. */
  renderer?: ObservationRenderer;
}

/**
 * Assemble the prompt for one strategy.
 *
 * The prompt is plain text on purpose: a model reads text, a transcript
 * stores text, and a token counter counts text. Nothing here decides what
 * the agent should do.
 */
export function buildContext(strategy: ContextStrategy, input: ContextInput): string {
  const renderer = input.renderer ?? 'text';

  switch (strategy) {
    case 'none':
      return renderContextObservation(input.observation, renderer);
    case 'full':
      return renderFull(input, renderer);
    case 'window':
      return renderWindow(input, renderer);
    case 'structured':
      return renderStructured(input, renderer);
  }
}

/** Everything: the brief, every command, every observation, every outcome. */
function renderFull(input: ContextInput, renderer: ObservationRenderer): string {
  const sections: string[] = [input.brief];
  if (input.turns[0]?.before !== undefined) sections.push(renderContextObservation(input.turns[0].before, renderer));

  input.turns.forEach((turn, index) => {
    sections.push(`Turn ${index + 1}: ${turn.command}`);
    sections.push(renderContextObservation(turn.observation, renderer));
  });

  sections.push('Now:');
  sections.push(renderContextObservation(input.observation, renderer));
  return sections.join('\n\n');
}

/** The brief and the last few turns. */
function renderWindow(input: ContextInput, renderer: ObservationRenderer): string {
  const recent = input.turns.slice(-WINDOW_TURNS);
  const sections: string[] = [input.brief];
  if (recent[0]?.before !== undefined) sections.push(renderContextObservation(recent[0].before, renderer));

  recent.forEach((turn, index) => {
    sections.push(`Turn ${index + 1}: ${turn.command}`);
    sections.push(renderContextObservation(turn.observation, renderer));
  });

  sections.push('Now:');
  sections.push(renderContextObservation(input.observation, renderer));
  return sections.join('\n\n');
}

/**
 * The compact summary: what the agent knows, plus the last few outcomes.
 *
 * The facts block is derived from the agent's own observations, so it is a
 * summary of what the agent has seen rather than a summary of the world.
 */
function renderStructured(input: ContextInput, renderer: ObservationRenderer): string {
  const observations = [...input.turns.flatMap(turn =>
    turn.before === undefined ? [turn.observation] : [turn.before, turn.observation]), input.observation];
  const sections: string[] = [input.brief, 'Facts you know:', buildKnownFacts(observations)];

  const recent = input.turns.slice(-STRUCTURED_OUTCOMES);
  const outcomes = recent.map(turn => `${turn.command}: ${turn.observation.messages.join(' ') || 'Observation updated.'}`);
  if (outcomes.length > 0) {
    sections.push(['Recent outcomes:', ...outcomes.map((outcome) => `- ${outcome}`)].join('\n'));
  }

  sections.push('Now:');
  sections.push(renderContextObservation(input.observation, renderer));
  return sections.join('\n\n');
}

function renderContextObservation(observation: Observation, renderer: ObservationRenderer): string {
  const rendered = renderObservationWith(observation, renderer);
  return renderer === 'json' ? JSON.stringify(JSON.parse(rendered)) : rendered;
}
