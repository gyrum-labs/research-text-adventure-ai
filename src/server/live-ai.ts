import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { Adventure } from '../kernel/types.js';
import { canonicalJson } from '../kernel/hash.js';
import { LlmPolicy } from '../agents/llm/policy.js';
import { PROMPT_VERSION } from '../agents/llm/prompt.js';
import { OpenAiProvider, redact, type LlmProvider, type LlmRequest } from '../agents/llm/provider.js';
import { DEFAULT_BUDGETS, RunBudgetExceeded, type RunBudgets, type RunResumeState } from '../runner/run.js';
import { PRICES } from '../runner/metrics.js';
import { PAGE_GAME_LIMITS, mostOutputTokensInOneRequest } from '../runner/limits.js';
import { Transcript } from '../runner/transcript.js';

/** Server-owned maxima for an explicitly started model demo. */
export const LIVE_AI_BUDGETS: Readonly<RunBudgets> = Object.freeze({
  ...DEFAULT_BUDGETS, ...PAGE_GAME_LIMITS, maxTransientProviderErrors: 2, maxParseErrors: 3,
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
  /** Where the transcript is written, so a caller can copy it into a store. */
  transcriptPath(): string;
  cancel(): void;
  /** Ask the run to pause: it ends nothing, and returns what a resume continues from. */
  pause(): void;
  close(): void;
  usage(): LiveAiUsage;
}

/** What the server holds while a paused run waits for its operator. */
export interface LiveResume {
  /** The runner's bundle: everything a pause took with it. */
  state: RunResumeState;
  /** Turns the lineage has already spent. */
  turns: number;
  /** Wall-clock the lineage already spent, so the timer guards only the rest. */
  elapsedMs: number;
  /** What the policy has already counted, so the token cap continues. */
  tokens: { inputTokens: number; outputTokens: number };
}

/** A configured local demo, with credentials kept inside its factory closure. */
export interface LiveAiDemo {
  metadata: LiveAiMetadata;
  create(options: { adventure: Adventure; runId: string; seed: number; resume?: LiveResume }): LiveAiRun;
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

/**
 * The server's own guard around the model service. It is exported so that it
 * can be tried as itself, with a request that asks for more than any policy
 * would. A guard tried only through the policy is held up by the policy.
 */
export function guardedProvider(options: LiveAiOptions, signal: AbortSignal, limits: { maxPromptBytes: number; budgets: RunBudgets }, alreadyUsed = 0) {
  const remote = new OpenAiProvider({ apiKey: options.apiKey, model: options.model,
    baseUrl: 'https://openrouter.ai/api/v1' });
  let estimated = false;
  let tokensUsed = alreadyUsed;
  const provider: LlmProvider = {
    id: 'openrouter', model: options.model,
    async complete(request: LlmRequest) {
      const bytes = new TextEncoder().encode(JSON.stringify({ system: request.system, messages: request.messages })).length;
      if (bytes > limits.maxPromptBytes) throw new RunBudgetExceeded('The AI prompt exceeded the request-size limit.');
      // UTF-8 bytes conservatively bound text tokens; reserve extra chat framing.
      const inputAllowance = bytes + 1024;
      // The policy asks for the run's allowance, and twice that again when a
      // reply was cut off. The server does not take the policy's word for it.
      // A request gets no more than it asked for, no more than the run's own
      // allowance doubled once for every retry, and no more than the run has
      // left. The ceiling comes from the run's budgets and not from the page
      // game's, so a server that lowers the allowance lowers the ceiling.
      const maxOutputTokens = Math.min(request.maxOutputTokens ?? limits.budgets.maxOutputTokensPerTurn,
        mostOutputTokensInOneRequest(limits.budgets.maxOutputTokensPerTurn),
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
          finishReason: response.finishReason, reasoningTokens: response.reasoningTokens,
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
    create({ adventure, runId, seed, resume }) {
      const controller = new AbortController();
      // The caps belong to the lineage, not to the piece of it after the
      // pause: what the run has left is what the pause left it. The published
      // metadata keeps the full caps, so the reader still sees the ceilings.
      const remaining: RunBudgets = { ...budgets,
        maxTurns: Math.max(0, budgets.maxTurns - (resume?.turns ?? 0)),
        maxWallClockMs: Math.max(0, budgets.maxWallClockMs - (resume?.elapsedMs ?? 0)),
      };
      const guarded = guardedProvider(configuration, controller.signal, { maxPromptBytes, budgets: remaining },
        (resume?.tokens.inputTokens ?? 0) + (resume?.tokens.outputTokens ?? 0));
      const policy = new LlmPolicy({ adventure, provider: guarded.provider, strategy: 'structured',
        renderer: 'json', thinking: false, temperature: 0, maxOutputTokens: budgets.maxOutputTokensPerTurn,
        ...(resume === undefined ? {} : {
          resume: { commands: resume.state.policyCommands ?? [],
            inputTokens: resume.tokens.inputTokens, outputTokens: resume.tokens.outputTokens },
        }) });
      const transcript = resume === undefined
        ? new Transcript(join(options.transcriptRoot ?? 'runs/browser', `${runId}.jsonl`), {
            type: 'header', runId, adventure: adventure.id, adventureVersion: adventure.version,
            adventureHash: `sha256:${createHash('sha256').update(canonicalJson(adventure)).digest('hex')}`,
            policy: policy.id, provider: guarded.provider.id, model: configuration.model, seed,
            maxTurns: budgets.maxTurns, startedAt: new Date().toISOString(), engineVersion: '0.1.0',
          })
        // A resumed run appends to the transcript its pause left behind.
        : new Transcript(join(options.transcriptRoot ?? 'runs/browser', `${runId}.jsonl`));
      if (resume === undefined) {
        transcript.write({ type: 'demo_config', promptVersion: PROMPT_VERSION, strategy: 'structured', renderer: 'json', thinking: false, budgets, maxPromptBytes });
      }
      const timer = setTimeout(() => controller.abort(new DOMException('AI run time limit.', 'TimeoutError')), remaining.maxWallClockMs);
      timer.unref();
      return { policy, budgets: remaining, signal: controller.signal, transcript,
        transcriptPath: () => transcript.file,
        cancel: () => controller.abort(new DOMException('AI run stopped.', 'AbortError')),
        pause: () => controller.abort(new DOMException('AI run paused.', 'PauseError')),
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

/**
 * Several configured models, so the watcher can offer each of them.
 *
 * `AI_DEMO_MODELS` is a comma-separated list; `AI_DEMO_MODEL` still works and
 * remains the first entry, so an existing deployment keeps behaving.
 */
export function liveAisFromEnvironment(environment: NodeJS.ProcessEnv = process.env):
  { demos: Map<string, LiveAiDemo>; models: LiveAiMetadata[] } | undefined {
  const apiKey = environment.OPENROUTER_API_KEY?.trim();
  const listed = (environment.AI_DEMO_MODELS?.trim() || environment.AI_DEMO_MODEL?.trim() || '')
    .split(',').map(name => name.trim()).filter(name => name.length > 0);
  if (!apiKey || listed.length === 0) return undefined;
  const demos = new Map<string, LiveAiDemo>();
  const models: LiveAiMetadata[] = [];
  for (const model of listed) {
    const demo = createLiveAiDemo({ apiKey, model, transcriptRoot: environment.AI_DEMO_TRANSCRIPT_DIR });
    demos.set(model, demo);
    models.push(demo.metadata);
  }
  return { demos, models };
}
