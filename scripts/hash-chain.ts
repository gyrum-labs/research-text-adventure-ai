/*
 * Print the hash chain of the gold path.
 *
 * The chain has to be the same in every process, or a transcript recorded on
 * one machine would not replay on another. The determinism test runs this
 * twice and compares what it prints.
 */

import { hashInitial, hashNext } from '../src/kernel/hash.js';
import { parseCommand } from '../src/kernel/parser.js';
import { reduce } from '../src/kernel/reduce.js';
import { adventure } from '../src/adventures/mission-impossible/adventure.js';
import { GOLD_PATH } from '../src/adventures/mission-impossible/gold-path.js';

let state = structuredClone(adventure.initial);
let hash = hashInitial(state);

for (const raw of GOLD_PATH) {
  const parsed = parseCommand(adventure, state, raw);
  if (!parsed.ok) throw new Error(parsed.message);
  state = reduce(adventure, state, parsed.command).state;
  hash = hashNext(hash, state);
}

console.log(hash);
