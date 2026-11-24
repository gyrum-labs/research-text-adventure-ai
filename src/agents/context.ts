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

export type ContextStrategy = 'none' | 'full' | 'window' | 'structured' | 'map';

/** The strategies, in the order they are described in the specification. */
export const CONTEXT_STRATEGIES: readonly ContextStrategy[] = [
  'none',
  'full',
  'window',
  'structured',
  'map',
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
    case 'map':
      return renderMap(input);
  }
}

/**
 * The map and the ledger: the world as the agent knows it, stated once.
 *
 * Connections, objects and facts are collected across every observation and
 * deduplicated, so an agent re-reading its context reads a state rather than a
 * transcript. The moves are one line each: what was tried, what came back.
 */
function renderMap(input: ContextInput): string {
  const observations = [...input.turns.flatMap(turn =>
    turn.before === undefined ? [turn.observation] : [turn.before, turn.observation]), input.observation];
  const latest = input.observation;

  const lines: string[] = ['MAP:'];
  // The map is a state, not a transcript: each exit keeps only its latest
  // known status, so an exit seen locked and then opened reads as open, once.
  const connections = new Map<string, Map<string, string>>();
  for (const observation of observations) {
    const room = observation.room.name;
    const known = connections.get(room) ?? new Map<string, string>();
    for (const exit of observation.exits) {
      known.set(exit.direction,
        `${exit.direction} -> ${exit.toName}${exit.status === 'locked' ? ' (locked)' : ''}`);
    }
    connections.set(room, known);
  }
  for (const [room, links] of connections) {
    lines.push(`  ${room}${room === latest.room.name ? '  <- you are here' : ''}`);
    for (const link of links.values()) lines.push(`    ${link}`);
  }

  lines.push(`YOU ARE AT: ${latest.room.name}`);
  lines.push(`CARRYING: ${latest.inventory.map(object => object.name).join(', ') || 'nothing'}`);

  const objects = new Map<string, string>();
  for (const observation of observations) {
    for (const object of observation.visible) {
      const bits: string[] = [object.name];
      if (object.takeable === true) bits.push('takeable');
      if (object.readable === true) bits.push('readable');
      if (object.container !== undefined) {
        bits.push(object.container.locked ? 'locked' : object.container.open ? 'open' : 'closed');
      }
      objects.set(object.id, bits.join(', '));
    }
    for (const object of observation.inventory) {
      objects.set(object.id, `${object.name}, carried`);
    }
  }
  lines.push('OBJECTS KNOWN:');
  for (const described of objects.values()) lines.push(`  - ${described}`);

  const goals = new Map<string, 'complete' | 'incomplete'>();
  const told = new Set<string>();
  for (const observation of observations) {
    for (const goal of observation.goals) goals.set(goal.text, goal.status);
    for (const message of observation.messages) {
      for (const line of message.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.length > 0) told.add(trimmed);
      }
    }
  }
  if (goals.size > 0) {
    lines.push('OBJECTIVES:');
    for (const [text, status] of goals) lines.push(`  - ${text} [${status === 'complete' ? 'done' : 'not done'}]`);
  }
  if (told.size > 0) {
    lines.push('WHAT YOU HAVE BEEN TOLD:');
    for (const fact of told) lines.push(`  - ${fact}`);
  }

  lines.push('MOVES:');
  input.turns.forEach((turn, index) => {
    const movedTo = turn.before === undefined || turn.before.room.id === turn.observation.room.id
      ? undefined
      : turn.observation.room.name;
    const said = turn.observation.messages.join(' ').replace(/\s+/g, ' ').trim();
    const outcome = movedTo !== undefined
      ? `moved to ${movedTo}`
      : said.length > 0 ? said.slice(0, 120) : 'no change';
    lines.push(`  ${index + 1}. ${turn.command} -> ${outcome}`);
  });

  lines.push('NOW:');
  lines.push(renderContextObservation(latest, input.renderer ?? 'text'));
  return lines.join('\n\n');
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
