/*
 * The provider port.
 *
 * One interface, four adapters, plain fetch. No vendor SDKs, so provider
 * churn never becomes a dependency problem, and the whole harness can be run
 * against a mock for nothing at all.
 *
 * Two rules hold for every adapter here. A provider failure comes back as a
 * transient error rather than an exception, so the runner can count it and
 * stop cleanly instead of crashing. And no adapter ever puts its key into an
 * error message, a response body, or anything else the runner might write
 * down.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  /** Cancel a local in-flight model request. */
  signal?: AbortSignal;
  system: string;
  messages: ChatMessage[];
  maxOutputTokens?: number;
  temperature?: number;
  /** Provider-specific extra body. */
  extra?: Record<string, unknown>;
}

export interface LlmResponse {
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  raw?: unknown;
  /** Non-fatal provider error (rate limit, transient). */
  transientError?: string;
}

export interface LlmProvider {
  readonly id: string;
  readonly model: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}

/** A rough token count, good enough to budget with. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Keep a secret out of anything that might be written down. */
export function redact(text: string, secret: string): string {
  if (secret.length === 0) return text;
  return text.split(secret).join('[redacted]');
}

/**
 * The mock provider: scripted responses, no network, no cost.
 *
 * It is the backbone of the offline harness. A whole experiment runs against
 * it, and the same scripted responses make a failing run reproducible.
 */
export class MockProvider implements LlmProvider {
  readonly id = 'mock';
  readonly model: string;

  /** Every request it was given, in order. */
  readonly requests: LlmRequest[] = [];

  /** How many times it was asked to complete. */
  calls = 0;

  private readonly responses: string[];
  private index = 0;

  constructor(responses: string[] | string, model = 'mock-model') {
    this.responses = typeof responses === 'string' ? [responses] : [...responses];
    this.model = model;
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    this.calls += 1;
    this.requests.push(req);

    if (this.index >= this.responses.length) {
      return {
        text: '',
        transientError: 'the mock provider has no scripted response left',
      };
    }

    const text = this.responses[this.index]!;
    this.index += 1;

    const input = estimateTokens(req.system) + req.messages.reduce(
      (total, message) => total + estimateTokens(message.content),
      0,
    );

    return {
      text,
      usage: { inputTokens: input, outputTokens: estimateTokens(text) },
    };
  }
}

/** The Anthropic messages API. */
export interface AnthropicOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export class AnthropicProvider implements LlmProvider {
  readonly id = 'anthropic';
  readonly model: string;

  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: AnthropicOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = options.baseUrl ?? 'https://api.anthropic.com';
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const body = {
      model: this.model,
      max_tokens: req.maxOutputTokens ?? 500,
      system: req.system,
      messages: req.messages.map((message) => ({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: message.content,
      })),
      ...(req.temperature === undefined ? {} : { temperature: req.temperature }),
      ...(req.extra ?? {}),
    };

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1/messages`, {
        signal: req.signal,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'the request failed';
      return { text: '', transientError: redact(`the anthropic request failed: ${reason}`, this.apiKey) };
    }

    if (!response.ok) {
      return {
        text: '',
        transientError: `the anthropic api answered ${response.status}`,
      };
    }

    const payload = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const text = (payload.content ?? [])
      .filter((block) => block.type === undefined || block.type === 'text')
      .map((block) => block.text ?? '')
      .join('');

    return {
      text,
      usage: {
        inputTokens: payload.usage?.input_tokens,
        outputTokens: payload.usage?.output_tokens,
      },
      raw: payload,
    };
  }
}

/** Any endpoint that speaks the OpenAI chat completions shape. */
export interface OpenAiOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export class OpenAiProvider implements LlmProvider {
  readonly id = 'openai';
  readonly model: string;

  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: OpenAiOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: req.system },
        ...req.messages.map((message) => ({ role: message.role, content: message.content })),
      ],
      max_tokens: req.maxOutputTokens ?? 500,
      ...(req.temperature === undefined ? {} : { temperature: req.temperature }),
      ...(req.extra ?? {}),
    };

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        signal: req.signal,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'the request failed';
      return { text: '', transientError: redact(`the openai request failed: ${reason}`, this.apiKey) };
    }

    if (!response.ok) {
      return { text: '', transientError: `the openai api answered ${response.status}` };
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const text = payload.choices?.[0]?.message?.content ?? '';

    return {
      text,
      usage: {
        inputTokens: payload.usage?.prompt_tokens,
        outputTokens: payload.usage?.completion_tokens,
      },
      raw: payload,
    };
  }
}

/** A local Ollama, which needs no key at all. */
export interface OllamaOptions {
  model: string;
  baseUrl?: string;
}

export class OllamaProvider implements LlmProvider {
  readonly id = 'ollama';
  readonly model: string;

  private readonly baseUrl: string;

  constructor(options: OllamaOptions) {
    this.model = options.model;
    this.baseUrl = options.baseUrl ?? 'http://127.0.0.1:11434';
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const options: Record<string, unknown> = { num_predict: req.maxOutputTokens ?? 500 };
    if (req.temperature !== undefined) options['temperature'] = req.temperature;

    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: req.system },
        ...req.messages.map((message) => ({ role: message.role, content: message.content })),
      ],
      stream: false,
      options,
      ...(req.extra ?? {}),
    };

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        signal: req.signal,
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'the request failed';
      return { text: '', transientError: `the ollama request failed: ${reason}` };
    }

    if (!response.ok) {
      return { text: '', transientError: `the ollama api answered ${response.status}` };
    }

    const payload = (await response.json()) as {
      message?: { content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
    };

    return {
      text: payload.message?.content ?? '',
      usage: {
        inputTokens: payload.prompt_eval_count,
        outputTokens: payload.eval_count,
      },
      raw: payload,
    };
  }
}
