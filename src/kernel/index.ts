/*
 * The kernel's public surface. Everything else in the project talks to the
 * engine through this file, so the boundary stays visible.
 */

export * from './types.js';
export { canonicalJson, hashInitial, hashNext } from './hash.js';
export { evaluatePredicate, type EvalContext } from './predicates.js';
export { applyEffect, type EffectContext } from './effects.js';
export { reduce, interpolate } from './reduce.js';
export { parseCommand, type ParseResult, DESCRIBE_VERBS } from './parser.js';
export { buildObservation, buildKnownFacts } from './observation.js';
export { renderRoom, renderInventory, renderObservation } from './render.js';
export { isGoalAchieved, allGoalsAchieved, achievedGoalIds } from './goals.js';
