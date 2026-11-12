import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { Adventure } from '../kernel/types.js';
import { canonicalJson } from '../kernel/hash.js';
import { LlmPolicy } from '../agents/llm/policy.js';
import { PROMPT_VERSION } from '../agents/llm/prompt.js';
import { OpenAiProvider, redact, type LlmProvider, type LlmRequest } from '../agents/llm/provider.js';
import { DEFAULT_BUDGETS, RunBudgetExceeded, type RunBudgets } from '../runner/run.js';
import { PRICES } from '../runner/metrics.js';
import { Transcript } from '../runner/transcript.js';

/** Server-owned maxima for an explicitly started model demo. */
export const LIVE_AI_BUDGETS: Readonly<RunBudgets> = Object.freeze({
  ...DEFAULT_BUDGETS, maxTurns: 20, maxTotalTokens: 30_000, maxOutputTokensPerTurn: 300,
  maxWallClockMs: 120_000, maxTransientProviderErrors: 2, maxParseErrors: 3,
});

/** Private configuration; none of this object is serialized to the browser. */
export interface LiveAiOptions {
  apiKey: string;
  model: string;
  transcriptRoot?: string;
  /** A server embedding can lower, but cannot raise, the demo maxima. */
  budgets?: Partial<RunBudgets>;
  maxPromptBytes?: number;
}

/** Safe model identity and limits advertised before the user opts in. */
export interface LiveAiMetadata {
  provider: string;
  model: string;
  budgets: Readonly<RunBudgets>;
  maxPromptBytes: number;
}

/** Reported usage, with a conservative fallback if a provider omits counts. */
export interface LiveAiUsage {
  inputTokens: number;
  outputTokens: number;
  tokensUsed: number;
  estimatedCostUsd: number | null;
  estimated: boolean;
}

/** One cancellable model run, created only when someone watches its stream. */
export interface LiveAiRun {
  policy: LlmPolicy;
  budgets: RunBudgets;
  signal: AbortSignal;
  transcript: Transcript;
  cancel(): void;
  close(): void;
  usage(): LiveAiUsage;
}

/** A configured local demo, with credentials kept inside its factory closure. */
export interface LiveAiDemo {
  metadata: LiveAiMetadata;
  create(options: { adventure: Adventure; runId: string; seed: number }): LiveAiRun;
}

function boundedBudgets(overrides: Partial<RunBudgets> = {}): RunBudgets {
  const budgets = { ...LIVE_AI_BUDGETS };
  for (const key of Object.keys(budgets) as (keyof RunBudgets)[]) {
    const value = overrides[key];
    if (value === undefined) continue;
    const minimum = key === 'maxHints' || key === 'providerRetryDelayMs' ? 0 : 1;
    if (!Number.isSafeInteger(value) || value < minimum) throw new Error('Invalid AI run budget.');
    budgets[key] = Math.min(value, budgets[key]);
  }
  return budgets;
}

function guardedProvider(options: LiveAiOptions, signal: AbortSignal, limits: { maxPromptBytes: number; budgets: RunBudgets }) {
  const remote = new OpenAiProvider({ apiKey: options.apiKey, model: options.model,
    baseUrl: 'https://openrouter.ai/api/v1' });
  let estimated = false;
  let tokensUsed = 0;
  const provider: LlmProvider = {
    id: 'openrouter', model: options.model,
    async complete(request: LlmRequest) {
      const bytes = new TextEncoder().encode(JSON.stringify({ system: request.system, messages: request.messages })).length;
      if (bytes > limits.maxPromptBytes) throw new RunBudgetExceeded('The AI prompt exceeded the request-size limit.');
      // UTF-8 bytes conservatively bound text tokens; reserve extra chat framing.
      const inputAllowance = bytes + 1024;
      const maxOutputTokens = Math.min(request.maxOutputTokens ?? 300, limits.budgets.maxOutputTokensPerTurn,
        limits.budgets.maxTotalTokens - tokensUsed - inputAllowance);
      if (maxOutputTokens < 1) throw new RunBudgetExceeded('The next model request would exceed the token budget.');
      try {
        const response = await remote.complete({ ...request, signal, maxOutputTokens });
        const text = redact(response.text, options.apiKey);
        estimated ||= response.usage?.inputTokens === undefined || response.usage.outputTokens === undefined;
        const usage = { inputTokens: response.usage?.inputTokens ?? inputAllowance,
          outputTokens: response.usage?.outputTokens ?? new TextEncoder().encode(text).length };
        tokensUsed += response.transientError === undefined ? usage.inputTokens + usage.outputTokens : inputAllowance + maxOutputTokens;
        return { text, usage,
          ...(response.transientError === undefined ? {} : { transientError: redact(response.transientError, options.apiKey) }),
        };
      } catch {
        tokensUsed += inputAllowance + maxOutputTokens;
        return { text: '', transientError: 'The model request failed.' };
      }
    },
  };
  return { provider, estimated: () => estimated };
}

function usageOf(policy: LlmPolicy, model: string, estimated: boolean): LiveAiUsage {
  const { inputTokens, outputTokens, tokensUsed } = policy.metrics();
  const price = PRICES[`openrouter/${model}`];
  return { inputTokens, outputTokens, tokensUsed, estimated,
    estimatedCostUsd: price === undefined ? null : (inputTokens * price.input + outputTokens * price.output) / 1_000_000,
  };
}

/** Configure a bounded OpenRouter demo without making a network request. */
export function createLiveAiDemo(options: LiveAiOptions): LiveAiDemo {
  if (!options.apiKey.trim() || !options.model.trim()) throw new Error('The AI demo needs a server key and model.');
  const configuration = { ...options, model: options.model.trim() };
  const budgets = boundedBudgets(options.budgets);
  const requestedBytes = options.maxPromptBytes ?? 16_000;
  if (!Number.isSafeInteger(requestedBytes) || requestedBytes < 1) throw new Error('Invalid AI prompt limit.');
  const maxPromptBytes = Math.min(requestedBytes, 16_000);
  return {
    metadata: { provider: 'OpenRouter', model: configuration.model, budgets: Object.freeze({ ...budgets }), maxPromptBytes },
    create({ adventure, runId, seed }) {
      const controller = new AbortController();
      const guarded = guardedProvider(configuration, controller.signal, { maxPromptBytes, budgets });
      const policy = new LlmPolicy({ adventure, provider: guarded.provider, strategy: 'structured',
        renderer: 'json', thinking: false, temperature: 0, maxOutputTokens: budgets.maxOutputTokensPerTurn });
      const transcript = new Transcript(join(options.transcriptRoot ?? 'runs/browser', `${runId}.jsonl`), {
        type: 'header', runId, adventure: adventure.id, adventureVersion: adventure.version,
        adventureHash: `sha256:${createHash('sha256').update(canonicalJson(adventure)).digest('hex')}`,
        policy: policy.id, provider: guarded.provider.id, model: configuration.model, seed,
        maxTurns: budgets.maxTurns, startedAt: new Date().toISOString(), engineVersion: '0.1.0',
      });
      transcript.write({ type: 'demo_config', promptVersion: PROMPT_VERSION, strategy: 'structured', renderer: 'json', thinking: false, budgets, maxPromptBytes });
      const timer = setTimeout(() => controller.abort(new DOMException('AI run time limit.', 'TimeoutError')), budgets.maxWallClockMs);
      timer.unref();
      return { policy, budgets: { ...budgets }, signal: controller.signal, transcript,
        cancel: () => controller.abort(new DOMException('AI run stopped.', 'AbortError')),
        close: () => { clearTimeout(timer); transcript.close(); },
        usage: () => usageOf(policy, configuration.model, guarded.estimated()),
      };
    },
  };
}

/** Missing configuration keeps the ordinary free demos available. */
export function liveAiFromEnvironment(environment: NodeJS.ProcessEnv = process.env): LiveAiDemo | undefined {
  const apiKey = environment.OPENROUTER_API_KEY?.trim();
  const model = environment.AI_DEMO_MODEL?.trim();
  if (!apiKey || !model) return undefined;
  return createLiveAiDemo({ apiKey, model, transcriptRoot: environment.AI_DEMO_TRANSCRIPT_DIR });
}
