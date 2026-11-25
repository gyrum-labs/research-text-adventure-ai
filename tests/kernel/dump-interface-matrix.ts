/*
 * Write the interface matrix to a file. Run from the repository root:
 *
 *   npx tsx tests/kernel/dump-interface-matrix.ts tests/kernel/interface-baseline.json
 *
 * Taken before a change, the file is the "before" the honesty test compares
 * against.
 */
import { writeFileSync } from 'node:fs';
import { probeInterface } from './interface-matrix.js';

const probes = probeInterface();
const target = process.argv[2] ?? 'tests/kernel/interface-baseline.json';
const worlds: Record<string, string> = {};
for (const one of probes) worlds[one.world] = one.version;
const answers = Object.fromEntries(probes.map(one => [one.key, [one.status, one.message]]));
writeFileSync(target, `${JSON.stringify({ note: 'The interface as it answered before carried things could be read. Written by dump-interface-matrix.ts; compared by interface-honesty.test.ts.', worlds, answers })}\n`);
const tally = new Map<string, number>();
for (const one of probes) tally.set(one.status, (tally.get(one.status) ?? 0) + 1);
console.log(`${probes.length} probes written to ${target}: ${[...tally].map(([status, count]) => `${status} ${count}`).join(', ')}`);
