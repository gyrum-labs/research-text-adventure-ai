/*
 * The architecture test.
 *
 * `SPEC.md` section 4.4 states the dependency rules and says a test enforces
 * them. This is that test. It also proves the kernel is pure, because the
 * whole research rests on the environment being a thing you can trust: no
 * clock, no randomness, no I/O, and no way to reach the layers above it.
 *
 * The rules are checked against the source rather than against a diagram,
 * because a diagram is a claim and this is a check.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

/**
 * What each layer may import.
 *
 * `SPEC.md` section 4.4. The kernel is a leaf. Everything else may look
 * down, never up.
 */
const ALLOWED: Record<string, string[]> = {
  kernel: [],
  adventures: ['kernel'],
  agents: ['kernel', 'adventures'],
  runner: ['kernel', 'agents', 'adventures'],
  cli: ['kernel', 'adventures', 'agents', 'runner'],
};

/** The layer a source file belongs to. */
function layerOf(path: string): string {
  return relative(SRC, path).split('/')[0]!;
}

/** Every source file under `src/`. */
function sourceFiles(directory = SRC): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(path));
    else if (entry.name.endsWith('.ts')) found.push(path);
  }

  return found;
}

/** The module specifiers a file imports, as written in the source. */
function importsOf(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true);
  const specifiers: string[] = [];

  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return specifiers;
}

/**
 * The layer a relative import reaches.
 *
 * An import that leaves `src/` belongs to no layer, so the kernel's rule is
 * checked separately: it may reach `node:crypto` and nothing else.
 */
function layerOfImport(from: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;

  const resolved = join(from, '..', specifier.replace(/\.js$/, ''));
  const relativePath = relative(SRC, resolved);
  if (relativePath.startsWith('..')) return null;

  return relativePath.split('/')[0]!;
}

describe('the dependency rules', () => {
  it('hold for every file in the project', () => {
    const violations: string[] = [];

    for (const file of sourceFiles()) {
      const layer = layerOf(file);
      const allowed = ALLOWED[layer];
      if (allowed === undefined) continue;

      for (const specifier of importsOf(file)) {
        const target = layerOfImport(file, specifier);
        if (target === null) continue;
        if (target === layer) continue;
        if (!allowed.includes(target)) {
          violations.push(
            `${relative(SRC, file)} imports ${target}, and ${layer} may not reach ${target}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('place the kernel below everything else', () => {
    expect(ALLOWED['kernel']).toEqual([]);
  });
});

describe('the kernel is pure', () => {
  const kernelFiles = sourceFiles(join(SRC, 'kernel'));

  it('imports nothing but node:crypto', () => {
    const violations: string[] = [];

    for (const file of kernelFiles) {
      for (const specifier of importsOf(file)) {
        if (specifier === 'node:crypto') continue;
        if (specifier.startsWith('.')) continue;
        violations.push(`${relative(SRC, file)} imports "${specifier}"`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('reads no clock, no randomness and no I/O', () => {
    const forbidden = [
      /\bDate\b/,
      /\bnew\s+Date\b/,
      /\bperformance\b/,
      /\bMath\s*\.\s*random\b/,
      /\bprocess\s*\./,
      /\bfetch\s*\(/,
      /\bsetTimeout\b/,
      /\bsetInterval\b/,
    ];
    const violations: string[] = [];

    for (const file of kernelFiles) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of forbidden) {
        if (pattern.test(source)) {
          violations.push(`${relative(SRC, file)} matches ${pattern.source}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

describe('the adventure layer is data', () => {
  it('reaches the kernel only for its types', () => {
    const violations: string[] = [];

    for (const file of sourceFiles(join(SRC, 'adventures'))) {
      for (const specifier of importsOf(file)) {
        if (!specifier.startsWith('.')) continue;
        if (specifier.includes('/kernel/types.js')) continue;
        if (!specifier.includes('/kernel/')) continue;
        violations.push(`${relative(SRC, file)} imports "${specifier}" and so carries logic`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps every adventure file free of engine logic', () => {
    const engine = ['parser', 'reduce', 'predicates', 'effects', 'render', 'observation', 'goals'];
    const violations: string[] = [];

    for (const file of sourceFiles(join(SRC, 'adventures'))) {
      const source = readFileSync(file, 'utf8');
      for (const module of engine) {
        if (source.includes(`kernel/${module}.js`)) {
          violations.push(`${relative(SRC, file)} reaches the ${module}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
