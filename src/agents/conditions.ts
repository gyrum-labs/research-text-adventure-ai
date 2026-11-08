/*
 * The conditions.
 *
 * The experimental variables, one per axis. A condition decides what the model
 * is shown: how the observation is rendered, how much of the past it gets,
 * and whether the legal action set is masked into its view.
 *
 * The conditions are the experiment. The model is held constant across them,
 * so any difference in the outcome is attributable to what the model was told.
 */

import type { ContextStrategy } from './context.js';

export type ConditionId = 'A' | 'B' | 'C' | 'D' | 'E';

export interface ConditionSpec {
  id: ConditionId;
  name: string;
  /** How the observation is rendered in the prompt. */
  renderer: 'text' | 'json';
  /** Which context strategy the model gets. */
  strategy: ContextStrategy;
  /** Whether the legal action set is masked into the observation. */
  masked: boolean;
}

/**
 * The conditions.
 *
 * `D` is the control: the same observation, with no history. A difference
 * between `D` and the others is the difference the history makes, and nothing
 * else.
 *
 * `E` exists so that the three hypotheses can be told apart. Without it,
 * `C` differs from `B` in two ways at once, and the masking effect cannot be
 * separated from the strategy effect. With it, each comparison holds
 * everything else constant.
 */
export const CONDITIONS: Record<ConditionId, ConditionSpec> = {
  A: {
    id: 'A',
    name: 'prose observation, full history',
    renderer: 'text',
    strategy: 'full',
    masked: false,
  },
  B: {
    id: 'B',
    name: 'JSON observation, full history',
    renderer: 'json',
    strategy: 'full',
    masked: false,
  },
  C: {
    id: 'C',
    name: 'JSON observation, masked actions, structured context',
    renderer: 'json',
    strategy: 'structured',
    masked: true,
  },
  D: {
    id: 'D',
    name: 'JSON observation, no history',
    renderer: 'json',
    strategy: 'none',
    masked: false,
  },
  E: {
    id: 'E',
    name: 'JSON observation, masked actions, full history',
    renderer: 'json',
    strategy: 'full',
    masked: true,
  },
};

/** The condition ids, in order. */
export const CONDITION_IDS: ConditionId[] = ['A', 'B', 'C', 'D', 'E'];
