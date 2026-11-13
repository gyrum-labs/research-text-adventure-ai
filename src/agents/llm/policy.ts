/*
 * The model policy.
 *
 * It turns an observation into a prompt, asks a provider, and turns the
 * answer back into a command. The interesting part is what it records: the
 * rung of the extraction ladder that worked, the prompt hash, and the count
 * of responses that held no command at all.
 *
 * The policy is the only place that talks to a model. The runner never sees
 * a provider, and the kernel never sees a policy.
 */

import type { Adventure } from '../../kernel/types.js';
import { parseCommand } from '../../kernel/parser.js';
import type { ContextStrategy, ContextTurn, ObservationRenderer } from '../context.js';
import type {
  AgentPolicy,
  MeasurablePolicy,
  PolicyContext,
  PolicyMetrics,
  PolicyTurnOutcome,
} from '../policy.js';
import { extractCommand } from './extract.js';
import { buildPrompt } from './prompt.js';
import type { LlmProvider } from './provider.js';

export interface LlmPolicyOptions {
  adventure: Adventure;
  provider: LlmProvider;
  /** How much of the past the model is shown. Defaults to `structured`. */
  strategy?: ContextStrategy;
  /** Whether the model is asked to explain itself. Defaults to true. */
  thinking?: boolean;
  /** How the observations are rendered in the prompt. Defaults to prose. */
  renderer?: ObservationRenderer;
  temperature?: number;
  maxOutputTokens?: number;
  /**
   * How a candidate command is judged before it is sent to the world.
   *
   * The default asks our own parser. A world that parses for itself, such as
   * the QuestKit port, passes its own check instead, and the world's refusal
   * is recorded as the parse error it is.
   */
  parseCheck?: (candidate: string) => boolean;
}

export class LlmPolicy implements AgentPolicy, MeasurablePolicy {
  readonly id: string;

  private readonly adventure: Adventure;
  private readonly provider: LlmProvider;
  private readonly strategy: ContextStrategy;
  private readonly thinking: boolean;
  private readonly renderer: ObservationRenderer;
  private readonly temperature: number | undefined;
  private readonly maxOutputTokens: number | undefined;
  private readonly parseCheck: ((candidate: string) => boolean) | undefined;

  /** The commands this policy has issued, in order. */
  private readonly commands: Array<{ raw: string; observationIndex: number }> = [];

  private lastTurn: PolicyTurnOutcome = 'stopped';
  private unparsableResponses = 0;
  private transientErrors = 0;
  private tokensUsed = 0;
  private inputTokens = 0;
  private outputTokens = 0;
  private readonly extractionRoutes: Record<string, number> = {};
  private promptHash = '';
  private response = '';

  constructor(options: LlmPolicyOptions) {
    this.adventure = options.adventure;
    this.provider = options.provider;
    this.strategy = options.strategy ?? 'structured';
    this.thinking = options.thinking !== false;
    this.renderer = options.renderer ?? 'text';
    this.temperature = options.temperature;
    this.maxOutputTokens = options.maxOutputTokens;
    this.parseCheck = options.parseCheck;
    this.id = `llm:${options.provider.id}/${options.provider.model}`;
  }

  async next(context: PolicyContext): Promise<string | null> {
    const bundle = buildPrompt(this.adventure, context.observation, this.turnsFrom(context), {
      strategy: this.strategy,
      thinking: this.thinking,
      renderer: this.renderer,
    });
    this.promptHash = bundle.systemHash;

    const response = await this.provider.complete({
      signal: context.signal,
      system: bundle.system,
      messages: bundle.messages,
      ...(this.maxOutputTokens === undefined ? {} : { maxOutputTokens: this.maxOutputTokens }),
      ...(this.temperature === undefined ? {} : { temperature: this.temperature }),
    });

    this.response = response.text;

    if (response.transientError !== undefined) {
      this.transientErrors += 1;
      this.lastTurn = 'provider_error';
      return null;
    }

    this.inputTokens += response.usage?.inputTokens ?? 0;
    this.outputTokens += response.usage?.outputTokens ?? 0;
    this.tokensUsed = this.inputTokens + this.outputTokens;

    const extraction = extractCommand(response.text, (candidate) =>
      this.canParse(candidate, context),
    );
    this.extractionRoutes[extraction.route] = (this.extractionRoutes[extraction.route] ?? 0) + 1;

    if (extraction.command === null) {
      this.unparsableResponses += 1;
      this.lastTurn = 'unparsable';
      return null;
    }

    this.commands.push({ raw: extraction.command, observationIndex: context.history.length - 1 });
    this.lastTurn = 'command';
    return extraction.command;
  }

  metrics(): PolicyMetrics {
    return {
      lastTurn: this.lastTurn,
      unparsableResponses: this.unparsableResponses,
      transientErrors: this.transientErrors,
      tokensUsed: this.tokensUsed,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      extractionRoutes: { ...this.extractionRoutes },
      lastPromptHash: this.promptHash,
      lastResponse: this.response,
    };
  }

  /** The hash of the prompt used on the last turn. */
  lastPromptHash(): string {
    return this.promptHash;
  }

  /**
   * The turns so far, paired with the commands that produced them.
   *
   * The runner hands the policy a history that already includes the current
   * observation, so the last entry is the present and the rest is the past.
   */
  private turnsFrom(context: PolicyContext): ContextTurn[] {
    return this.commands.flatMap(({ raw, observationIndex }) => {
      const before = context.history[observationIndex];
      const observation = context.history[observationIndex + 1];
      return before === undefined || observation === undefined ? [] : [{ command: raw, before, observation }];
    });
  }

  /**
   * Whether the kernel would accept this command.
   *
   * Used only by the two fallback rungs of the extraction chain, so that a
   * stray line of prose is never mistaken for a command.
   */
  private canParse(candidate: string, context: PolicyContext): boolean {
    if (this.parseCheck !== undefined) return this.parseCheck(candidate);
    return parseCommand(this.adventure, context.state, candidate).ok;
  }
}
