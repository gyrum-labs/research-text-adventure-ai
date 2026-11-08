/*
 * The human CLI.
 *
 * A person plays the adventure at the terminal. The point is not the game.
 * The point is that this produces a transcript in exactly the format the agent
 * produces, so the two can be compared.
 */

import { createInterface } from 'node:readline';
import type { Adventure, GameState, Observation } from '../kernel/types.js';
import { buildObservation } from '../kernel/observation.js';
import { parseCommand } from '../kernel/parser.js';
import { reduce } from '../kernel/reduce.js';
import { renderInventory, renderObservation } from '../kernel/render.js';

export async function play(adventure: Adventure): Promise<void> {
  // The line iterator, not rl.question. A question callback is a one-shot
  // listener, so piped input that arrives faster than the loop asks for it
  // is dropped. The iterator consumes every line, in order, whichever way the
  // input arrives.
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY === true,
  });

  let state: GameState = structuredClone(adventure.initial);

  console.log(adventure.brief);
  console.log('');
  console.log(renderObservation(buildObservation(adventure, state)));

  process.stdout.write('> ');

  for await (const line of rl) {
    const raw = line.trim();
    if (raw.length === 0) {
      process.stdout.write('> ');
      continue;
    }
    if (raw === 'quit' || raw === 'exit') break;

    const parsed = parseCommand(adventure, state, raw);
    if (!parsed.ok) {
      console.log(parsed.message);
      process.stdout.write('> ');
      continue;
    }

    const before = state.roomId;
    const transition = reduce(adventure, state, parsed.command);
    state = transition.state;

    for (const event of transition.events) {
      if (event.type === 'action_succeeded' || event.type === 'action_failed') {
        console.log(event.message);
      }
      if (event.type === 'hint_given') console.log(`(${event.text})`);
    }

    const observation: Observation = buildObservation(adventure, state);
    if (parsed.command.verb === 'look' || state.roomId !== before) {
      console.log('');
      console.log(renderObservation(observation));
    } else if (parsed.command.verb === 'inventory') {
      console.log(renderInventory(adventure, state));
    }

    if (state.status !== 'running') {
      console.log('');
      console.log(
        state.status === 'success'
          ? adventure.outcomeText.success
          : adventure.outcomeText.failure,
      );
      break;
    }

    process.stdout.write('> ');
  }

  rl.close();
}
