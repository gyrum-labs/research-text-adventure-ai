/*
 * Record the kernel as it stands.
 *
 * The second world was written without touching the kernel, and this manifest
 * is the evidence. Changing the kernel on purpose means changing this file on
 * purpose, which is a decision someone has to make in the open rather than an
 * accident.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const kernel = fileURLToPath(new URL('../src/kernel/', import.meta.url));
const target = join(kernel, 'kernel.manifest.json');

const manifest: Record<string, string> = {};

for (const name of readdirSync(kernel).sort()) {
  if (!name.endsWith('.ts')) continue;
  const content = readFileSync(join(kernel, name), 'utf8');
  manifest[name] = `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${Object.keys(manifest).length} kernel hashes to ${target}`);
