/*
 * The surrogate model.
 *
 * A stand-in for a language model, so the matrix can be driven end to end
 * without a key or a bill. It is an instrument, not a model, and the numbers
 * it produces are about the instrument. The live matrix is a separate run.
 *
 * What it models is the one thing the conditions actually manipulate: an agent
 * can only act on what is in its context. The surrogate has a plan, and a plan
 * step whose fact is not in the part of the prompt it can attend to is
 * answered with a guess, which is what a model does when the information is
 * not in front of it.
 *
 * The attention budget is the dilution mechanism. A prompt that carries the
 * whole history grows without bound, and the fact the agent needs falls out
 * of the window; a prompt that carries a summary stays small, and the fact
 * stays in it.
 */

import type { LlmProvider, LlmRequest, LlmResponse } from './llm/provider.js';
import { seededRandom } from './random.js';

/** One step of the surrogate's plan. */
export interface PlanStep {
  /** The command it wants to issue. */
  command: string;
  /** The text that has to be in its context for the step to come out right. */
  evidence?: string;
  /** What it issues when the evidence is not there. */
  guess?: string;
}

export interface SurrogateOptions {
  /** The plan it follows. */
  plan: PlanStep[];
  /** How much of the prompt it can attend to, in tokens from the end. */
  attentionTokens: number;
  /** How reliably it recalls a fact it did read, from 0 to 1. */
  reliability: number;
  /** The seed, so a run is reproducible. */
  seed: number;
  /** The model name it reports. */
  model?: string;
}

export class SurrogateProvider implements LlmProvider {
  readonly id = 'surrogate';
  readonly model: string;

  private readonly options: SurrogateOptions;
  private readonly random: () => number;
  private step = 0;

  constructor(options: SurrogateOptions) {
    this.options = options;
    this.model = options.model ?? 'surrogate';
    this.random = seededRandom(options.seed);
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const prompt = [req.system, ...req.messages.map((message) => message.content)].join('\n');
    // The budget is in tokens, because that is what a model's context is
    // measured in, and the tail of the prompt is what survives.
    const attended = prompt.slice(-this.options.attentionTokens * 4);

    const plan = this.options.plan;
    const index = Math.min(this.step, plan.length - 1);
    const step = plan[index]!;
    this.step += 1;

    let command = step.command;

    if (step.evidence !== undefined && !attended.includes(step.evidence)) {
      // The fact is not in front of it. It guesses.
      command = step.guess ?? step.command;
    } else if (step.evidence !== undefined && this.random() > this.options.reliability) {
      // It saw the fact and still got it wrong. Models do this.
      command = step.guess ?? step.command;
    }

    return {
      text: `THINK: step ${index + 1}\nCOMMAND: ${command}`,
      usage: { inputTokens: Math.ceil(prompt.length / 4), outputTokens: 8 },
    };
  }
}

/**
 * The plan for the Mission Impossible adventure.
 *
 * Two steps need a fact the agent has to read: which wire is safe, and the
 * safe combination. Both come from the manual, and the game refuses both
 * actions until the manual has been read, so a wrong guess fails safely
 * rather than detonating anything.
 */
export const MISSION_IMPOSSIBLE_PLAN: PlanStep[] = [
  { command: 'take keycard' },
  { command: 'go corridor' },
  { command: 'open locker' },
  { command: 'take cutters' },
  { command: 'read manual' },
  { command: 'unlock vault door with keycard' },
  { command: 'go vault' },
  {
    command: 'cut yellow wire with cutters',
    evidence: 'YELLOW',
    guess: 'cut blue wire with cutters',
  },
  {
    command: 'unlock safe with 4821',
    evidence: '4821',
    guess: 'unlock safe with 0000',
  },
  { command: 'take case' },
];
