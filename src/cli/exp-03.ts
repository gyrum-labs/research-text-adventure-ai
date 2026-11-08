/*
 * Experiment 03: the agent plays.
 *
 * The loop, the prompt and the budgets, shown turn by turn. The point is not
 * that the agent wins. The point is that every turn is accounted for: which
 * rung of the extraction ladder produced the command, what the world said
 * back, and what the run spent.
 */

import type { Adventure } from '../kernel/types.js';
import { LlmPolicy } from '../agents/llm/policy.js';
import type { ContextStrategy } from '../agents/context.js';
import type { LlmProvider } from '../agents/llm/provider.js';
import { run, DEFAULT_BUDGETS, type RunBudgets } from '../runner/run.js';

export interface Exp03Options {
  provider: LlmProvider;
  strategy?: ContextStrategy;
  thinking?: boolean;
  budgets?: Partial<RunBudgets>;
}

/** The experiment, ready to print. */
export async function runExp03(adventure: Adventure, options: Exp03Options): Promise<string> {
  const budgets: RunBudgets = { ...DEFAULT_BUDGETS, ...options.budgets };
  const policy = new LlmPolicy({
    adventure,
    provider: options.provider,
    strategy: options.strategy ?? 'structured',
    thinking: options.thinking !== false,
    maxOutputTokens: budgets.maxOutputTokensPerTurn,
  });

  const result = await run({ adventure, policy, budgets });

  const lines: string[] = [
    'Experiment 03: the agent plays.',
    '',
    `provider: ${options.provider.id}  model: ${options.provider.model}`,
    `strategy: ${options.strategy ?? 'structured'}  thinking: ${options.thinking !== false}`,
    '',
  ];

  // The messages come from the event stream rather than the observations,
  // because the last command of a run has no following observation to carry
  // its outcome.
  const said = new Map<number, string[]>();
  for (const event of result.events) {
    if (event.type !== 'action_succeeded' && event.type !== 'action_failed') continue;
    const messages = said.get(event.turn) ?? [];
    messages.push(event.message);
    said.set(event.turn, messages);
  }

  result.commands.forEach((command, index) => {
    lines.push(`turn ${index + 1}  COMMAND: ${command}`);
    for (const message of said.get(index) ?? []) {
      if (message.trim().length === 0) continue;
      lines.push(`        → ${message.replace(/\n/g, ' ')}`);
    }
  });

  lines.push('');
  lines.push(`outcome:    ${result.outcome}`);
  lines.push(`reason:     ${result.reason}`);
  lines.push(`turns:      ${result.turns}`);
  lines.push(`tokens:     ${result.tokensUsed}`);
  lines.push(`parse errors: ${result.parseErrors}`);
  lines.push(`extraction: ${describeRoutes(result.extractionRoutes)}`);
  lines.push(`prompt:     ${result.promptHash}`);

  return lines.join('\n');
}

function describeRoutes(routes: Record<string, number>): string {
  const entries = Object.entries(routes);
  if (entries.length === 0) return 'none';
  return entries.map(([route, count]) => `${route} ${count}`).join(', ');
}
