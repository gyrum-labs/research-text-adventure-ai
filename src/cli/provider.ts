/*
 * Choosing a provider from the command line.
 *
 * The mock is the default because the whole harness has to be runnable
 * offline and free. The live providers read their keys from the environment
 * and nowhere else, and a missing key is a clear error rather than a request
 * that fails halfway through a run.
 */

import {
  AnthropicProvider,
  MockProvider,
  OllamaProvider,
  OpenAiProvider,
  type LlmProvider,
} from '../agents/llm/provider.js';
import { GOLD_PATH } from '../adventures/mission-impossible/gold-path.js';

export type ProviderName = 'mock' | 'anthropic' | 'openai' | 'ollama';

/**
 * The mock's scripted answers.
 *
 * They are the gold path in the output envelope, with the reasoning a model
 * would give. The mock is the scripted policy wearing a model's clothes: it
 * knows the answer, exactly as the scripted policy does.
 */
export const MOCK_RESPONSES: string[] = [
  'THINK: The keycard is on the desk, and the vault will need it.\nCOMMAND: take keycard',
  'THINK: The notice says the lockers are in the service corridor.\nCOMMAND: go corridor',
  'THINK: A locker, and lockers are where the tools are kept.\nCOMMAND: open locker',
  'THINK: The cutters are what I need to cut a wire.\nCOMMAND: take cutters',
  'THINK: The manual will say which wire is safe and what the combination is.\nCOMMAND: read manual',
  'THINK: The door has a card reader, and I have the keycard.\nCOMMAND: unlock vault door with keycard',
  'THINK: The door is open now.\nCOMMAND: go vault',
  'THINK: The manual says the yellow wire is the safe one.\nCOMMAND: cut yellow wire with cutters',
  'THINK: The manual gave the combination.\nCOMMAND: unlock safe with 4821',
  'THINK: The case is the objective.\nCOMMAND: take case',
];

/** The default model for each live provider. */
export const DEFAULT_MODELS: Record<ProviderName, string> = {
  mock: 'mock-model',
  anthropic: 'claude-sonnet-4.5',
  openai: 'gpt-4o',
  ollama: 'llama3.1',
};

function requireKey(name: string): string {
  const key = process.env[name];
  if (key === undefined || key.length === 0) {
    throw new Error(`${name} is not set. Put it in the environment, never in a file.`);
  }
  return key;
}

/** Build the provider the command line asked for. */
export function createProvider(name: ProviderName, model?: string): LlmProvider {
  switch (name) {
    case 'mock':
      return new MockProvider(MOCK_RESPONSES, model ?? DEFAULT_MODELS.mock);
    case 'anthropic':
      return new AnthropicProvider({
        apiKey: requireKey('ANTHROPIC_API_KEY'),
        model: model ?? DEFAULT_MODELS.anthropic,
      });
    case 'openai':
      return new OpenAiProvider({
        apiKey: requireKey('OPENAI_API_KEY'),
        model: model ?? DEFAULT_MODELS.openai,
      });
    case 'ollama':
      return new OllamaProvider({ model: model ?? DEFAULT_MODELS.ollama });
  }
}

/** The gold path, as the mock answers it. Exported for the tests. */
export { GOLD_PATH };
