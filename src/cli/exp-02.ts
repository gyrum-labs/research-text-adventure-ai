/*
 * Experiment 02: the state beside the observation.
 *
 * The experiment is the gap. The left column is what is true in the world, the
 * right column is what the agent is allowed to see, and the difference between
 * them is the whole point of the measurement.
 *
 * Nothing here decides anything. It walks the gold path, and for every turn it
 * asks the same question: if this fact were in the observation, would the
 * agent have earned it?
 */

import type { Adventure, GameState, Observation } from '../kernel/types.js';
import { buildKnownFacts, buildObservation, messagesFromEvents } from '../kernel/observation.js';
import { parseCommand } from '../kernel/parser.js';
import { reduce } from '../kernel/reduce.js';
import { GOLD_PATH } from '../adventures/mission-impossible/gold-path.js';
import { reachableStates } from '../runner/reachable.js';

/** One line of the comparison: what is true, and what the agent can see. */
export interface ComparisonRow {
  /** The left column: the truth, in the world's words. */
  truth: string;
  /** The right column: what the agent is allowed to see. */
  seen: string;
}

/** One turn of the walk. */
export interface TurnComparison {
  turn: number;
  command: string;
  rows: ComparisonRow[];
}

/** Everything the agent could read in one observation, as one string. */
function observationText(observation: Observation): string {
  return [
    observation.room.name,
    observation.room.description,
    ...observation.visible.map((object) => `${object.name} ${object.description}`),
    ...observation.inventory.map((object) => `${object.name} ${object.description}`),
    ...observation.exits.map((exit) => `${exit.direction} ${exit.label} ${exit.toName} ${exit.status}`),
    ...observation.goals.map((goal) => goal.text),
    ...observation.messages,
  ].join('\n');
}

/**
 * Compare the state with what the agent knows.
 *
 * The right column is computed, not asserted: a fact is shown when the
 * agent's view actually contains it, and marked as hidden when it does not.
 * That way the table cannot drift away from what the engine really does.
 *
 * The agent's view is the current observation plus the facts it has been
 * told, because the observation is memoryless: a message lasts one turn.
 */
export function compareStateToObservation(
  adventure: Adventure,
  state: GameState,
  observation: Observation,
  known = '',
): ComparisonRow[] {
  const seen = `${observationText(observation)}\n${known}`;
  const rows: ComparisonRow[] = [];

  rows.push({
    truth: `location: ${state.roomId}`,
    seen: `location: ${observation.room.name}`,
  });

  const here = Object.values(adventure.objects).filter(
    (object) => state.objects[object.id]?.at === state.roomId,
  );
  rows.push({
    truth: `objects here: ${here.map((object) => object.name).join(', ') || 'nothing'}`,
    seen: `visible: ${observation.visible.map((object) => object.name).join(', ') || 'nothing'}`,
  });

  const carried = state.inventory.map((id) => adventure.objects[id]?.name ?? id);
  rows.push({
    truth: `carrying: ${carried.join(', ') || 'nothing'}`,
    seen: `carrying: ${observation.inventory.map((object) => object.name).join(', ') || 'nothing'}`,
  });

  for (const door of Object.values(adventure.doors)) {
    if (door.locked !== true) continue;
    const object = door.requiresAction?.object;
    if (object !== undefined && state.objects[object]?.flags['unlocked'] === true) continue;

    const exit = observation.exits.find((candidate) => candidate.label === door.label);
    const inRoom = state.roomId === door.from;
    rows.push({
      truth: `${door.label}: locked`,
      seen:
        exit !== undefined
          ? `${door.label}: ${exit.status}`
          : `(not mentioned — ${inRoom ? 'the agent has not noticed it' : 'it is in another room'})`,
    });
  }

  for (const object of Object.values(adventure.objects)) {
    if (object.container === undefined) continue;
    if (state.objects[object.id]?.flags['closed'] !== true) continue;

    const children = object.container.contains.map((id) => adventure.objects[id]?.name ?? id);
    rows.push({
      truth: `${object.name} holds: ${children.join(', ')}`,
      seen: `(not mentioned — the ${object.name} is closed)`,
    });
  }

  for (const code of adventure.codes ?? []) {
    rows.push({
      truth: `safe code: ${code}`,
      seen: seen.includes(code) ? `safe code: ${code}` : '(not mentioned — not known yet)',
    });
  }

  rows.push({
    truth: `goals: ${adventure.goals.map((goal) => goal.id).join(', ')}`,
    seen: `objectives: ${observation.goals.map((goal) => goal.text).join(', ')}`,
  });

  return rows;
}

/**
 * Walk the gold path and compare at every turn.
 *
 * The walk uses the real engine: the real parser, the real reducer, and the
 * real observation builder. Nothing about the path is simulated.
 */
export function buildGoldPathComparison(
  adventure: Adventure,
  path: string[] = GOLD_PATH,
): TurnComparison[] {
  const comparison: TurnComparison[] = [];
  const history: Observation[] = [];
  let state: GameState = structuredClone(adventure.initial);
  let messages: string[] = [];

  path.forEach((command, index) => {
    const observation = buildObservation(adventure, state, messages);
    history.push(observation);
    comparison.push({
      turn: index,
      command,
      rows: compareStateToObservation(adventure, state, observation, buildKnownFacts(history)),
    });

    const parsed = parseCommand(adventure, state, command);
    if (!parsed.ok) return;

    const transition = reduce(adventure, state, parsed.command);
    state = transition.state;
    const said = messagesFromEvents(transition.events);
    if (said.length > 0) messages = said;
  });

  return comparison;
}

/** Render the comparison as a two-column table. */
export function renderComparison(comparison: TurnComparison[]): string {
  const width =
    comparison.reduce(
      (widest, turn) =>
        turn.rows.reduce((inner, row) => Math.max(inner, row.truth.length), widest),
      0,
    ) + 2;
  const lines: string[] = [];

  comparison.forEach((turn) => {
    lines.push(`Turn ${turn.turn}: ${turn.command}`);
    lines.push(`${'STATE'.padEnd(width)}OBSERVATION`);
    for (const row of turn.rows) {
      lines.push(`${row.truth.padEnd(width)}${row.seen}`);
    }
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * How much of the world the agent can actually see.
 *
 * The search finds every state the agent can reach, and counts how many of
 * them look different to the agent. The gap between the two numbers is the
 * experiment: the world is large, and the agent's view of it is small.
 */
export function visibilityRatio(adventure: Adventure): {
  states: number;
  observations: number;
} {
  const reachable = reachableStates(adventure, { withMessages: false });
  const distinct = new Set<string>();

  for (const state of reachable.states) {
    const observation = buildObservation(adventure, state);
    const { turn: _turn, ...rest } = observation;
    distinct.add(JSON.stringify(rest));
  }

  return { states: reachable.states.length, observations: distinct.size };
}

/** The full experiment, ready to print. */
export function runExp02(adventure: Adventure): string {
  const comparison = buildGoldPathComparison(adventure);
  const { states, observations } = visibilityRatio(adventure);

  return [
    'Experiment 02: what the agent sees.',
    '',
    'The left column is what is true. The right column is what the agent is told.',
    'The gap between them is the experiment.',
    '',
    renderComparison(comparison),
    'The whole world:',
    `  ${states} reachable states.`,
    `  ${observations} of them look different to the agent.`,
    '  The agent sees a fraction of the world, and only what it has earned.',
  ].join('\n');
}
