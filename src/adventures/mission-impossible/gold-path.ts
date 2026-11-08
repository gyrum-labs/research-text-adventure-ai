/*
 * The gold path: the shortest winning route, ten commands.
 *
 * This is the denominator for every efficiency measurement, and the upper
 * bound the scripted policy should reach. The BFS oracle in
 * `tests/adventures/mission-impossible.test.ts` proves that ten is the
 * shortest, so the number is measured rather than asserted.
 */

export const GOLD_PATH: string[] = [
  'take keycard',
  'go corridor',
  'open locker',
  'take cutters',
  'read manual',
  'unlock vault door with keycard',
  'go vault',
  'cut yellow wire with cutters',
  'unlock safe with 4821',
  'take case',
];
