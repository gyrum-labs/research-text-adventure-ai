/*
 * The model-facing surface of the agent layer.
 */

export {
  AnthropicProvider,
  MockProvider,
  OllamaProvider,
  OpenAiProvider,
  estimateTokens,
  redact,
  type AnthropicOptions,
  type ChatMessage,
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
  type OllamaOptions,
  type OpenAiOptions,
} from './provider.js';

export {
  buildPrompt,
  buildSystemPrompt,
  PROMPT_VERSION,
  type PromptBundle,
  type PromptOptions,
} from './prompt.js';

export { extractCommand, type Extraction, type ExtractionRoute } from './extract.js';

export { LlmPolicy, type LlmPolicyOptions } from './policy.js';
