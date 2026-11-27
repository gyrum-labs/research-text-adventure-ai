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
import { CUT_OFF_RETRIES } from '../policy.js';
import type {
  AgentPolicy,
  MeasurablePolicy,
  PolicyContext,
  PolicyMetrics,
  PolicyTurnOutcome,
  ReplyAttempt,
  ReplyRecord,
} from '../policy.js';
import { extractCommand } from './extract.js';
import { buildPrompt } from './prompt.js';
import type { LlmProvider, LlmResponse } from './provider.js';

/**
 * What the adapters ask for when a request names no allowance. A retry doubles
 * what the first attempt had, so it starts from here when nothing was named.
 */
const ADAPTERS_OWN_ALLOWANCE = 500;

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
   * How many times a reply that its allowance cut off is asked for again with
   * the room doubled. Defaults to `CUT_OFF_RETRIES`.
   */
  maxCutOffRetries?: number;
  /**
   * How a candidate command is judged before it is sent to the world.
   *
   * The default asks our own parser. A world that parses for itself, such as
   * the QuestKit port, passes its own check instead, and the world's refusal
   * is recorded as the parse error it is.
   */
  parseCheck?: (candidate: string) => boolean;
  /**
   * What a pause left behind, when this policy continues a run.
   *
   * The ledger of issued commands carries observation indexes into the
   * history the runner restores, so the resumed prompt shows the same
   * recent actions as the paused one did. The token counts carry too, so
   * the cap continues from where the pause found it.
   */
  resume?: {
    commands: Array<{ raw: string; observationIndex: number }>;
    inputTokens: number;
    outputTokens: number;
  };
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
  private readonly maxCutOffRetries: number;
  private readonly parseCheck: ((candidate: string) => boolean) | undefined;

  /** The commands this policy has issued, in order. */
  private readonly commands: Array<{ raw: string; observationIndex: number }>;

  private lastTurn: PolicyTurnOutcome = 'stopped';
  private unparsableResponses = 0;
  private transientErrors = 0;
  private tokensUsed = 0;
  private inputTokens = 0;
  private outputTokens = 0;
  private readonly extractionRoutes: Record<string, number> = {};
  private promptHash = '';
  private response = '';
  private reply: ReplyRecord | undefined;

  constructor(options: LlmPolicyOptions) {
    this.adventure = options.adventure;
    this.provider = options.provider;
    this.strategy = options.strategy ?? 'structured';
    this.thinking = options.thinking !== false;
    this.renderer = options.renderer ?? 'text';
    this.temperature = options.temperature;
    this.maxOutputTokens = options.maxOutputTokens;
    this.maxCutOffRetries = options.maxCutOffRetries ?? CUT_OFF_RETRIES;
    this.parseCheck = options.parseCheck;
    this.commands = [...(options.resume?.commands ?? [])];
    this.inputTokens = options.resume?.inputTokens ?? 0;
    this.outputTokens = options.resume?.outputTokens ?? 0;
    this.tokensUsed = this.inputTokens + this.outputTokens;
    this.id = `llm:${options.provider.id}/${options.provider.model}`;
  }

  /** The ledger a pause needs, so a resumed policy remembers what it did. */
  ledger(): Array<{ raw: string; observationIndex: number }> {
    return [...this.commands];
  }

  async next(context: PolicyContext): Promise<string | null> {
    const bundle = buildPrompt(this.adventure, context.observation, this.turnsFrom(context), {
      strategy: this.strategy,
      thinking: this.thinking,
      renderer: this.renderer,
    });
    this.promptHash = bundle.systemHash;

    // One turn is one request, unless the allowance cut the reply off. Then
    // the same question is asked again with twice the room, a bounded number
    // of times, and the turn is still one turn. Every attempt is kept, so that
    // a turn which ended with no command can say why.
    const attempts: ReplyAttempt[] = [];
    let allowance = this.maxOutputTokens;
    let response: LlmResponse;
    for (let attempt = 0; ; attempt += 1) {
      response = await this.provider.complete({
        signal: context.signal,
        system: bundle.system,
        messages: bundle.messages,
        ...(allowance === undefined ? {} : { maxOutputTokens: allowance }),
        ...(attempt === 0 ? {} : { cutOffRetry: attempt }),
        ...(this.temperature === undefined ? {} : { temperature: this.temperature }),
      });
      attempts.push({
        allowance,
        finishReason: response.finishReason,
        inputTokens: response.usage?.inputTokens,
        outputTokens: response.usage?.outputTokens,
        reasoningTokens: response.reasoningTokens,
        textLength: response.text.length,
        failed: response.transientError,
      });
      this.reply = { attempts: [...attempts], cutOff: attempts[0]?.finishReason === 'length', command: false };
      if (response.transientError === undefined) {
        this.inputTokens += response.usage?.inputTokens ?? 0;
        this.outputTokens += response.usage?.outputTokens ?? 0;
        // Kept true after every attempt, and not only once the loop is done:
        // a later attempt can throw, and what was spent before it was spent.
        this.tokensUsed = this.inputTokens + this.outputTokens;
      }
      if (response.transientError !== undefined || response.finishReason !== 'length' || attempt >= this.maxCutOffRetries) break;
      allowance = (allowance ?? ADAPTERS_OWN_ALLOWANCE) * 2;
    }
    this.tokensUsed = this.inputTokens + this.outputTokens;

    this.response = response.text;

    if (response.transientError !== undefined) {
      this.transientErrors += 1;
      this.lastTurn = 'provider_error';
      return null;
    }

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
    this.reply = { attempts: this.reply?.attempts ?? [], cutOff: this.reply?.cutOff ?? false, command: true };
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
      lastReply: this.reply,
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
