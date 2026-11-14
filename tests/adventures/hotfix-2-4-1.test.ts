/*
 * The second world.
 *
 * The central assertion is that the kernel did not change. The rest of the
 * file checks that the organisation is a real world and not a decoration: it
 * can be solved, it is solved in the shortest way, and it has no dead ends.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adventure } from '../../src/adventures/hotfix-2-4-1/adventure.js';
import { GOLD_PATH } from '../../src/adventures/hotfix-2-4-1/gold-path.js';
import { reachable, shortestWinningPath } from '../../src/runner/oracle.js';
import { parseCommand } from '../../src/kernel/parser.js';
import { reduce } from '../../src/kernel/reduce.js';
import { RandomPolicy } from '../../src/agents/random.js';
import { ScriptedPolicy } from '../../src/agents/scripted.js';
import { run } from '../../src/runner/run.js';
import { classifyFailure, gatesOf } from '../../src/runner/classify.js';
import { runFromRecords } from '../../src/runner/metrics.js';
import { Transcript } from '../../src/runner/transcript.js';

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));

/** Play the gold path and return the final state. */
function play(path: string[] = GOLD_PATH): ReturnType<typeof reduce>['state'] {
  let state = structuredClone(adventure.initial);

  for (const raw of path) {
    const parsed = parseCommand(adventure, state, raw);
    expect(parsed.ok, `the gold path step "${raw}" did not parse`).toBe(true);
    if (!parsed.ok) break;
    state = reduce(adventure, state, parsed.command).state;
  }

  return state;
}

describe('the organisation adventure', () => {
  it('wins on its gold path', () => {
    const state = play();

    expect(state.status).toBe('success');
    expect(state.flags['hotfix_shipped']).toBe(true);
    expect(state.inventory).toContain('customer_notification');
  });

  it('takes ten commands, the same depth as the first world', () => {
    expect(GOLD_PATH).toHaveLength(10);
  });

  it('has a gold path that is the shortest winning route', () => {
    const result = shortestWinningPath(adventure, { maxDepth: 12 });

    expect(result.exhausted).toBe(false);
    expect(result.path).toHaveLength(GOLD_PATH.length);
  });

  it('has no unreachable rooms', () => {
    const result = reachable(adventure, { maxDepth: 10 });

    expect(result.exhausted).toBe(false);
    expect(result.rooms).toEqual(new Set(['platform', 'release_engineering', 'customer_success']));
  });

  it('puts every object somewhere reachable', () => {
    const result = reachable(adventure, { maxDepth: 10 });

    expect(result.exhausted).toBe(false);
    expect(result.objects.size).toBe(Object.keys(adventure.objects).length);
  });

  it('fails when the wrong release goes out', () => {
    const state = play([
      'claim incident ticket',
      'go release engineering',
      'open shared inbox',
      'claim deploy credential',
      'read release runbook',
      'unlock release gate with incident ticket',
      'deploy release-2.3.9 with deploy credential',
    ]);

    expect(state.status).toBe('failure');
  });

  it('refuses to deploy before the runbook has been read', () => {
    const state = play([
      'claim incident ticket',
      'go release engineering',
      'open shared inbox',
      'claim deploy credential',
      'unlock release gate with incident ticket',
      'deploy release-2.4.1 with deploy credential',
    ]);

    expect(state.status).toBe('running');
    expect(state.flags['hotfix_shipped']).toBeUndefined();
  });

  it('is beaten by the random policy, like every other world', async () => {
    const result = await run({
      adventure,
      policy: new RandomPolicy(adventure, 7),
      maxTurns: 30,
    });

    expect(result.outcome).not.toBe('success');
  });

  it('is won by the scripted policy', async () => {
    const result = await run({
      adventure,
      policy: new ScriptedPolicy(GOLD_PATH),
      maxTurns: 30,
    });

    expect(result.outcome).toBe('success');
    expect(result.turns).toBe(GOLD_PATH.length);
  });
});

describe('the harness on the second world', () => {
  it('classifies organisation failures without a new category', async () => {
    const directory = fileURLToPath(new URL('../../runs/', import.meta.url));
    const transcript = new Transcript(join(directory, 'org-classify.jsonl'), {
      type: 'header',
      runId: 'org',
      adventure: adventure.id,
      adventureVersion: adventure.version,
      adventureHash: 'sha256:test',
      policy: 'scripted',
      provider: null,
      model: null,
      seed: 1,
      maxTurns: 30,
      startedAt: new Date().toISOString(),
      engineVersion: '0.1.0',
    });

    await run({
      adventure,
      policy: new ScriptedPolicy([
        'claim incident ticket',
        'go release engineering',
        'open shared inbox',
        'claim deploy credential',
        'read release runbook',
        'unlock release gate with incident ticket',
        'deploy release-2.3.9 with deploy credential',
      ]),
      transcript,
    });
    transcript.close();

    const { readTranscript } = await import('../../src/runner/transcript.js');
    const runView = runFromRecords(readTranscript(join(directory, 'org-classify.jsonl')));
    const classification = classifyFailure(runView, adventure);

    expect(classification).not.toBeNull();
    expect(classification?.code).toMatch(/^F[1-9]$/);
  });

  it('finds the organisation gate without a new rule', () => {
    const gates = gatesOf(adventure);

    expect(gates).toHaveLength(1);
    expect(gates[0]!.flag).toBe('runbook_read');
    expect(gates[0]!.object).toBe('runbook');
    expect(gates[0]!.verbs).toContain('deploy');
  });
});

describe('the kernel', () => {
  it('mentions no organisation vocabulary', () => {
    const vocabulary = [
      'incident',
      'runbook',
      'deploy',
      'credential',
      'handover',
      'sla',
      'hotfix',
      'release',
      'customer',
      'on-call',
      'oncall',
      'approval',
    ];

    for (const name of readdirSync(join(SRC, 'kernel'))) {
      if (!name.endsWith('.ts')) continue;
      const source = readFileSync(join(SRC, 'kernel', name), 'utf8').toLowerCase();
      for (const word of vocabulary) {
        const pattern = new RegExp(`\\b${word.replace(/[-]/g, '[-]')}\\b`, 'i');
        expect(source, `src/kernel/${name} mentions "${word}"`).not.toMatch(pattern);
      }
    }
  });

  it('has not changed since the organisation was written', () => {
    // The manifest records the kernel as it stood when the second world was
    // authored. If the kernel changes, this fails until the change is
    // acknowledged, which is the point.
    const manifest = JSON.parse(
      readFileSync(fileURLToPath(new URL('../../src/kernel/kernel.manifest.json', import.meta.url)), 'utf8'),
    ) as Record<string, string>;

    for (const [name, hash] of Object.entries(manifest)) {
      const source = readFileSync(join(SRC, 'kernel', name), 'utf8');
      expect(hashOf(source), `src/kernel/${name} changed`).toBe(hash);
    }
  });
});

/** The content hash the manifest records. */
function hashOf(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}
