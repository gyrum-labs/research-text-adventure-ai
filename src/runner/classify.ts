/*
 * The failure classifier.
 *
 * "It failed" is not a finding. The category is.
 *
 * The classifier is a deterministic function of a run and the adventure's own
 * data. It never calls a model, never guesses, and every unsuccessful run
 * gets exactly one code.
 *
 * The order matters. A category that names what actually ended the run comes
 * before one that explains the path, because the terminal fact is the most
 * consequential single thing about the run. The behavioural categories then
 * explain the path, and the process metrics in `metrics.ts` record the detail
 * separately so that nothing is lost by the choice of a single code.
 */

import type { Adventure, Id, RunOutcome } from '../kernel/types.js';
import { NOT_CARRYING_PREFIX, NOT_VISIBLE_PREFIX } from '../kernel/parser.js';

export type FailureCode = 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6' | 'F7' | 'F8' | 'F9';

export interface FailureCategory {
  code: FailureCode;
  name: string;
  description: string;
}

/** The nine categories, in the order the classifier checks them. */
export const CATEGORIES: FailureCategory[] = [
  {
    code: 'F6',
    name: 'lethal trap',
    description: 'The run ended in failure: the model detonated the bomb.',
  },
  {
    code: 'F8',
    name: 'provider error',
    description: 'The run ended in a provider failure. The agent is not at fault.',
  },
  {
    code: 'F9',
    name: 'abstention',
    description: 'The run ended because the model stopped or declared itself stuck.',
  },
  {
    code: 'F2',
    name: 'hallucination',
    description: 'The model referenced objects that were not in the room or the inventory.',
  },
  {
    code: 'F1',
    name: 'parsing',
    description: 'The model never produced a command the parser accepted.',
  },
  {
    code: 'F3',
    name: 'planning',
    description: 'The model repeated an action that had already failed.',
  },
  {
    code: 'F4',
    name: 'ordering / precondition',
    description: 'The model attempted a gated action before discovering the gate.',
  },
  {
    code: 'F5',
    name: 'exploration failure',
    description: 'The model never found a required fact within the budget.',
  },
  {
    code: 'F7',
    name: 'budget exhaustion',
    description: 'Nothing more specific applied: the run ran out of turns.',
  },
];

/** The category for a code. */
export function categoryOf(code: FailureCode): FailureCategory {
  const found = CATEGORIES.find((category) => category.code === code);
  if (found === undefined) throw new Error(`unknown failure code: ${code}`);
  return found;
}

/** One turn of a run, as the classifier sees it. */
export interface ClassifiableTurn {
  turn: number;
  /** The command the parser accepted, if it accepted one. */
  command: { raw: string; verb: string; args: Record<string, string> } | null;
  /** The refusal, if the parser rejected the command. */
  parseError: string | null;
  /** What the action did. */
  outcome: 'succeeded' | 'failed' | 'none';
  /** The names the agent could see in the room. */
  visible: string[];
  /** The names the agent was carrying. */
  inventory: string[];
  /** The model's raw answer. */
  response: string;
}

/** A run, as the classifier sees it. */
export interface ClassifiableRun {
  outcome: RunOutcome | null;
  turns: ClassifiableTurn[];
}

export interface Classification {
  code: FailureCode;
  name: string;
  reason: string;
}

/**
 * A gate: an action that cannot work until the agent has read something.
 *
 * A gate is a world flag that a `read` action sets and that some other action
 * requires. The agent has to find the fact before the action will work, and
 * trying before it has found the fact is an ordering violation.
 */
export interface Gate {
  /** The world flag the read sets and the gated action needs. */
  flag: string;
  /** The object the agent has to read. */
  object: Id;
  /** The verbs that need the flag. */
  verbs: string[];
}

/** The gates in an adventure. */
export function gatesOf(adventure: Adventure): Gate[] {
  const gates = new Map<string, Gate>();

  for (const spec of adventure.actions) {
    if (spec.verb !== 'read') continue;
    for (const effect of spec.effects) {
      if (effect.op !== 'set_flag') continue;

      let object = '';
      for (const predicate of spec.requires) {
        if (predicate.op === 'arg_equals' && predicate.arg === 'target') object = predicate.value;
      }
      if (object === '') continue;

      gates.set(effect.key, { flag: effect.key, object, verbs: [] });
    }
  }

  for (const spec of adventure.actions) {
    for (const predicate of spec.requires) {
      if (predicate.op !== 'flag') continue;
      const gate = gates.get(predicate.key);
      if (gate !== undefined && !gate.verbs.includes(spec.verb)) gate.verbs.push(spec.verb);
    }
  }

  return [...gates.values()].filter((gate) => gate.verbs.length > 0);
}

/**
 * Compare two names the way a person means them.
 *
 * "the keycard" and "keycard" are the same thing to the person saying it. The
 * parser is deliberately stricter than this, so the classifier has to be
 * gentler or it would call every article a hallucination.
 */
function sameName(left: string, right: string): boolean {
  const strip = (value: string): string =>
    value
      .toLowerCase()
      .replace(/\b(the|a|an|my|some)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  return strip(left) === strip(right);
}

/** The object a refusal names, if it names one. */
function refusedObject(message: string): string | null {
  if (!message.startsWith(NOT_VISIBLE_PREFIX) && !message.startsWith(NOT_CARRYING_PREFIX)) {
    return null;
  }
  const match = message.match(/"([^"]+)"/);
  return match === null ? null : match[1]!;
}

/** The turns that read a gate's object successfully. */
function readsOf(run: ClassifiableRun, object: Id): ClassifiableTurn[] {
  return run.turns.filter(
    (turn) =>
      turn.command !== null &&
      turn.command.verb === 'read' &&
      turn.command.args['target'] === object &&
      turn.outcome === 'succeeded',
  );
}

/** A command that named something the agent could not see or carry. */
function hallucinated(run: ClassifiableRun): boolean {
  for (const turn of run.turns) {
    if (turn.parseError === null) continue;
    const named = refusedObject(turn.parseError);
    if (named === null) continue;

    const inScope = [...turn.visible, ...turn.inventory].some((name) => sameName(name, named));
    if (!inScope) return true;
  }
  return false;
}

/** The same command, twice, with a failure in between. */
function repeatedFailedAction(run: ClassifiableRun): boolean {
  const failed = new Set<string>();
  for (const turn of run.turns) {
    if (turn.command === null) continue;
    const raw = turn.command.raw.trim().toLowerCase();
    if (failed.has(raw)) return true;
    if (turn.outcome === 'failed') failed.add(raw);
  }
  return false;
}

/** A gated action used before the fact it needs was read. */
export function orderingViolations(run: ClassifiableRun, adventure: Adventure): number {
  const gates = gatesOf(adventure);
  let count = 0;

  for (const gate of gates) {
    const reads = readsOf(run, gate.object);
    // A gated action used before the agent read the thing it needed is a
    // violation whether or not the agent ever gets round to reading it.
    const firstRead =
      reads.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...reads.map((turn) => turn.turn));

    for (const turn of run.turns) {
      if (turn.command === null) continue;
      if (!gate.verbs.includes(turn.command.verb)) continue;
      if (turn.turn < firstRead) count += 1;
    }
  }

  return count;
}

/** The agent never read the thing that the gate needs. */
function neverFoundTheFact(run: ClassifiableRun, adventure: Adventure): boolean {
  const gates = gatesOf(adventure);
  if (gates.length === 0) return false;
  return gates.every((gate) => readsOf(run, gate.object).length === 0);
}

/**
 * Classify a run.
 *
 * A successful run has no failure code. Every other run has exactly one.
 */
export function classifyFailure(
  run: ClassifiableRun,
  adventure: Adventure,
): Classification | null {
  if (run.outcome === 'success') return null;

  if (run.outcome === 'failure') {
    return {
      code: 'F6',
      name: categoryOf('F6').name,
      reason: 'The run ended in failure: the bomb detonated.',
    };
  }

  if (run.outcome === 'provider_error') {
    return {
      code: 'F8',
      name: categoryOf('F8').name,
      reason: 'The provider failed and the run could not continue.',
    };
  }

  if (run.outcome === 'provider_stopped') {
    return {
      code: 'F9',
      name: categoryOf('F9').name,
      reason: 'The agent stopped before it ran out of turns.',
    };
  }

  const commands = run.turns.filter((turn) => turn.command !== null);

  // A refusal that names an object that is not there is more specific than a
  // refusal about the shape of the command, so F2 is checked before F1.
  if (hallucinated(run)) {
    return {
      code: 'F2',
      name: categoryOf('F2').name,
      reason: 'The agent referred to something it could not see or carry.',
    };
  }

  if (commands.length === 0) {
    return {
      code: 'F1',
      name: categoryOf('F1').name,
      reason: 'The agent never produced a command the parser accepted.',
    };
  }

  if (repeatedFailedAction(run)) {
    return {
      code: 'F3',
      name: categoryOf('F3').name,
      reason: 'The agent repeated an action that had already failed.',
    };
  }

  if (orderingViolations(run, adventure) > 0) {
    return {
      code: 'F4',
      name: categoryOf('F4').name,
      reason: 'The agent used a gated action before it had read what the action needed.',
    };
  }

  if (neverFoundTheFact(run, adventure)) {
    return {
      code: 'F5',
      name: categoryOf('F5').name,
      reason: 'The agent never found the fact the mission needed.',
    };
  }

  return {
    code: 'F7',
    name: categoryOf('F7').name,
    reason: 'The agent ran out of turns with nothing more specific to say.',
  };
}
