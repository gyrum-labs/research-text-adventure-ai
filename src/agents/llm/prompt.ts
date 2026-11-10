/*
 * The prompt.
 *
 * A pure function of the adventure, the observation and the context, so it
 * can be tested without a network call and hashed so a transcript can be tied
 * to the exact words the model saw.
 *
 * The prompt says five things: the mission, the world, the verbs, the rules
 * and the answer format. It never says how to solve the mission. The
 * adventure's authoring data, its gold path and its hint table are not in
 * here and must never be.
 */

import { createHash } from 'node:crypto';
import type { Adventure, Observation } from '../../kernel/types.js';
import { buildContext, type ContextStrategy, type ContextTurn } from '../context.js';
import type { ChatMessage } from './provider.js';

/** Bumped whenever the prompt changes, so a result can be tied to it. */
export const PROMPT_VERSION = 'llm-prompt-v1';

export interface PromptOptions {
  /** How much of the past the model is shown. */
  strategy: ContextStrategy;
  /** Whether the model is asked to explain itself. */
  thinking?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface PromptBundle {
  system: string;
  messages: ChatMessage[];
  /** The hash of the system prompt. */
  systemHash: string;
}

/** What each context strategy shows, in one line. */
const STRATEGY_NOTE: Record<ContextStrategy, string> = {
  none: 'the situation in front of you and nothing else.',
  full: 'the whole history of the mission: every command, every observation and every outcome.',
  window: 'the last five turns and the mission brief.',
  structured: 'a summary of what you know, the last two outcomes and the mission brief.',
};

/** The verbs, with the shape each one takes. */
function verbLines(adventure: Adventure): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const spec of adventure.actions) {
    if (seen.has(spec.verb)) continue;
    seen.add(spec.verb);

    const shapes = spec.args.map((arg) => `<${arg.name}>`).join(' ');
    lines.push(spec.args.length === 0 ? spec.verb : `${spec.verb} ${shapes}`);
  }

  return lines;
}

/**
 * The system prompt.
 *
 * The mission, the world, the verbs, the rules and the answer format. The
 * adventure's brief is the mission, and the brief is public by definition.
 */
export function buildSystemPrompt(
  adventure: Adventure,
  options: PromptOptions,
): string {
  const thinking = options.thinking !== false;

  const envelope = thinking
    ? 'Reply in exactly this form:\nTHINK: <one or two sentences of reasoning>\nCOMMAND: <one command>'
    : 'Reply in exactly this form:\nCOMMAND: <one command>';

  return [
    `You are the operator in a text adventure. You are not a reader. You are the one who acts.`,
    '',
    `Prompt version: ${PROMPT_VERSION}`,
    '',
    '## Your mission',
    adventure.brief,
    '',
    '## The world',
    'Rooms, objects and doors exist. You travel between rooms, pick things up, open containers,',
    'read what can be read, unlock things with keys and codes, and cut things with the right tool.',
    'A turn is exactly one command, and one command only.',
    '',
    '## The verbs you may use',
    ...verbLines(adventure).map((line) => `- ${line}`),
    '',
    '## What you can see',
    `You are shown ${STRATEGY_NOTE[options.strategy]}`,
    '',
    '## The rules',
    '- Issue exactly one command per turn.',
    '- Only refer to things you can currently see or carry.',
    '- If you are unsure, explore rather than guess.',
    '- A failed action does not cost the mission. Read what the world said and try something else.',
    '',
    '## How to answer',
    envelope,
  ].join('\n');
}

/**
 * Assemble the prompt.
 *
 * The system prompt carries the standing instructions. The messages carry the
 * context, which is what the strategy chooses.
 */
export function buildPrompt(
  adventure: Adventure,
  observation: Observation,
  turns: ContextTurn[],
  options: PromptOptions,
): PromptBundle {
  const system = buildSystemPrompt(adventure, options);
  const context = buildContext(options.strategy, { brief: adventure.brief, turns, observation });

  return {
    system,
    messages: [{ role: 'user', content: context }],
    systemHash: `sha256:${createHash('sha256').update(system).digest('hex')}`,
  };
}
