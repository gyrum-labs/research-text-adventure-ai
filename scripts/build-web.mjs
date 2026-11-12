/*
 * Build the web client.
 *
 * esbuild bundles the page with node:crypto aliased to the browser shim,
 * so the kernel's synchronous hash chain works unchanged in the browser.
 * The page itself is copied, not generated: the HTML is hand-written and
 * stays readable.
 */

import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outdir = join(root, 'dist', 'web');

mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: [join(root, 'src', 'web', 'index.ts')],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  outfile: join(outdir, 'index.js'),
  alias: { 'node:crypto': join(root, 'src', 'web', 'shims', 'node-crypto.ts') },
  logLevel: 'info',
});

copyFileSync(join(root, 'src', 'web', 'index.html'), join(outdir, 'index.html'));
