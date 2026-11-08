/*
 * The leakage test: a proof, not a hope.
 *
 * The most expensive mistake in an agent evaluation is handing the model the
 * answer and then reporting how well it did. This file is the defence against
 * that mistake, and it is deliberately exhaustive: it enumerates every state
 * the agent can reach and checks the observation against each one.
 *
 * A sample would prove nothing. The interesting states are the ones nobody
 * thinks to test, which is exactly why the search is a search.
 *
 * The check runs in two parts, because the agent reads the world through two
 * channels:
 *
 *   1. The observation's static content: the room, the visible objects, the
 *      inventory, the exits and the objectives. Checked for every reachable
 *      state.
 *   2. The messages the engine can emit. Checked for every action the
 *      adventure declares, because the message text is where a fact leaks if
 *      it leaks at all.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { adventure } from '../../src/adventures/mission-impossible/adventure.js';
import { GOLD_PATH } from '../../src/adventures/mission-impossible/gold-path.js';
import { reachableStates } from '../../src/runner/reachable.js';
import { buildObservation, messagesFromEvents } from '../../src/kernel/observation.js';
import { parseCommand } from '../../src/kernel/parser.js';
import { reduce } from '../../src/kernel/reduce.js';
import type { Adventure, GameState, Observation } from '../../src/kernel/types.js';

const REPO_ROOT = new URL('../..', import.meta.url).pathname;

/** Everything the agent can read in one observation, as one string. */
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

/** A fact the agent may not know until it has earned it. */
interface ProtectedFact {
  /** The text that would give the fact away. */
  token: string;
  /** The world flags that mean the agent has earned it. */
  earnedBy: string[];
}

/** The flags an action sets, so a fact can be tied to the action that reveals it. */
function flagsSetBy(adventure: Adventure, token: string): string[] {
  const flags = new Set<string>();

  for (const spec of adventure.actions) {
    if (!spec.text.success.includes(token)) continue;
    for (const effect of spec.effects) {
      if (effect.op === 'set_flag') flags.add(effect.key);
    }
  }

  return [...flags];
}

/**
 * The facts that must be earned rather than shown.
 *
 * A code is earned when the action that prints it has run. A readable
 * object's detail is earned the same way, sentence by sentence, so that
 * half-quoting the manual counts as a leak.
 */
function protectedFacts(adventure: Adventure): ProtectedFact[] {
  const facts: ProtectedFact[] = [];

  for (const code of adventure.codes ?? []) {
    facts.push({ token: code, earnedBy: flagsSetBy(adventure, code) });
  }

  for (const object of Object.values(adventure.objects)) {
    if (object.detail === undefined) continue;
    for (const sentence of object.detail.split(/(?<=\.)\s+/)) {
      const token = sentence.trim();
      if (token.length === 0) continue;
      facts.push({ token, earnedBy: flagsSetBy(adventure, token) });
    }
  }

  return facts;
}

describe('the perception boundary', () => {
  // Messages are checked separately, so the search does not have to carry them.
  const reachable = reachableStates(adventure, { withMessages: false });
  const states = reachable.states;
  const facts = protectedFacts(adventure);

  it('finishes the search rather than giving up on it', () => {
    expect(reachable.exhausted).toBe(false);
  });

  it('reaches a meaningful number of states, so the proof is not vacuous', () => {
    expect(states.length).toBeGreaterThan(200);
  });

  it('shows the agent only the objects that are present or carried', () => {
    for (const state of states) {
      const observation = buildObservation(adventure, state);
      const present = new Set<string>([
        ...Object.entries(state.objects)
          .filter(([, object]) => object.at === state.roomId)
          .map(([id]) => id),
        ...state.inventory,
      ]);

      for (const object of [...observation.visible, ...observation.inventory]) {
        expect(
          present.has(object.id),
          `object "${object.id}" appeared in the observation but is not present or carried`,
        ).toBe(true);
      }
    }
  });

  it('never shows the contents of a closed container', () => {
    for (const state of states) {
      const observation = buildObservation(adventure, state);

      for (const object of Object.values(adventure.objects)) {
        if (object.container === undefined) continue;
        if (state.objects[object.id]?.flags['closed'] !== true) continue;

        for (const childId of object.container.contains) {
          expect(
            observation.visible.some((visible) => visible.id === childId),
            `"${childId}" leaked out of the closed "${object.id}"`,
          ).toBe(false);
          expect(
            observation.inventory.some((carried) => carried.id === childId),
            `"${childId}" leaked into the inventory from the closed "${object.id}"`,
          ).toBe(false);
        }
      }
    }
  });

  it('never shows a fact the agent has not earned', () => {
    for (const state of states) {
      const text = observationText(buildObservation(adventure, state));

      for (const fact of facts) {
        if (!text.includes(fact.token)) continue;
        const earned = fact.earnedBy.some((flag) => state.flags[flag] === true);
        expect(earned, `the fact "${fact.token}" appeared before it was earned`).toBe(true);
      }
    }
  });

  it('never contains a step of the gold path', () => {
    for (const state of states) {
      const text = observationText(buildObservation(adventure, state)).toLowerCase();

      for (const command of GOLD_PATH) {
        expect(text, `the gold path leaked: "${command}"`).not.toContain(command.toLowerCase());
      }
    }
  });

  it('never contains a hint that has not been given', () => {
    for (const state of states) {
      const text = observationText(buildObservation(adventure, state));
      const issued = adventure.hints.length - state.hintsLeft;

      adventure.hints.forEach((hint, index) => {
        if (index < issued) return;
        expect(text, `an unissued hint leaked: "${hint.text}"`).not.toContain(hint.text);
      });
    }
  });

  it('discloses the objectives but never the method', () => {
    for (const state of states) {
      const observation = buildObservation(adventure, state);
      expect(observation.goals.map((goal) => goal.text)).toEqual(
        adventure.goals.map((goal) => goal.text),
      );
    }
  });

  it('does not reach the authoring side of the adventure', () => {
    const source = readFileSync(join(REPO_ROOT, 'src/kernel/observation.ts'), 'utf8');

    expect(source).not.toMatch(/from\s+'.*adventures/);
    expect(source).not.toMatch(/\bhints\b/);
    expect(source).not.toMatch(/GOLD_PATH|gold-path/);
  });
});

describe('the messages the engine can emit', () => {
  const facts = protectedFacts(adventure);

  it('print a fact only in the action that earns it', () => {
    for (const spec of adventure.actions) {
      for (const fact of facts) {
        const printed = spec.text.success.includes(fact.token) || spec.text.failure.includes(fact.token);
        if (!printed) continue;

        const earns = spec.effects.some(
          (effect) => effect.op === 'set_flag' && fact.earnedBy.includes(effect.key),
        );
        expect(
          earns,
          `the action "${spec.verb}" prints "${fact.token}" without being the action that earns it`,
        ).toBe(true);
      }
    }
  });

  it('never contain a hint, because a hint is not a property of an action', () => {
    for (const spec of adventure.actions) {
      for (const hint of adventure.hints) {
        expect(spec.text.success).not.toContain(hint.text);
        expect(spec.text.failure).not.toContain(hint.text);
      }
    }
  });

  it('give a hint only when the agent asks for one', () => {
    const state: GameState = structuredClone(adventure.initial);
    const before = observationText(buildObservation(adventure, state));

    for (const hint of adventure.hints) {
      expect(before).not.toContain(hint.text);
    }

    const parsed = parseCommand(adventure, state, 'hint');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const transition = reduce(adventure, state, parsed.command);
    const after = observationText(
      buildObservation(adventure, transition.state, messagesFromEvents(transition.events)),
    );
    expect(after).toContain(adventure.hints[0]!.text);
  });
});

describe('exactly one function converts state into something an agent can see', () => {
  /** Every function that takes a GameState and returns an Observation. */
  function stateToObservationFunctions(file: string): string[] {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.ES2022,
      true,
    );
    const found: string[] = [];

    const visit = (node: ts.Node): void => {
      if (
        ts.isFunctionDeclaration(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node)
      ) {
        const parameters = node.parameters.map((parameter) => parameter.type?.getText(source) ?? '');
        const returns = node.type?.getText(source) ?? '';
        if (parameters.some((type) => type.includes('GameState')) && returns.includes('Observation')) {
          found.push(node.name?.getText(source) ?? '<anonymous>');
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(source);
    return found;
  }

  function sourceFiles(directory: string): string[] {
    const root = join(REPO_ROOT, directory);
    const found: string[] = [];

    for (const entry of readdirSync(root, { withFileTypes: true })) {
      const path = join(root, entry.name);
      if (entry.isDirectory()) {
        found.push(...sourceFiles(relative(REPO_ROOT, path)));
      } else if (entry.name.endsWith('.ts')) {
        found.push(path);
      }
    }

    return found;
  }

  it('has a single conversion point, in the observation builder', () => {
    const converters: string[] = [];

    for (const file of sourceFiles('src')) {
      for (const name of stateToObservationFunctions(file)) {
        converters.push(`${relative(REPO_ROOT, file)}:${name}`);
      }
    }

    expect(converters).toEqual(['src/kernel/observation.ts:buildObservation']);
  });
});
