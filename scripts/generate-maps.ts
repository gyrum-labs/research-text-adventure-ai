/*
 * Write the maps, or check them.
 *
 * The maps are drawn by the library in `src/maps/maps.ts` from the
 * repository's own data, so they cannot disagree with the code they
 * describe. Run `npm run maps` to write them and `npm run maps:check` to
 * fail when the committed file has fallen behind.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { buildMaps, OUTPUT } from '../src/maps/maps.js';

const root = process.cwd();
const content = buildMaps(root);

if (process.argv.includes('--check')) {
  const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, 'utf8') : '';
  if (current !== content) {
    console.error(`maps: ${OUTPUT} does not match the data. Run npm run maps.`);
    process.exitCode = 1;
  } else {
    console.log(`maps: ${OUTPUT} is up to date.`);
  }
} else {
  writeFileSync(OUTPUT, content);
  console.log(`maps: wrote ${OUTPUT}`);
}
