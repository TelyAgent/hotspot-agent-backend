import { FakeAssistantModelAdapter } from './fake-assistant-model.adapter';
import { OpenAIAssistantModelAdapter } from './openai-assistant-model.adapter';
import { AssistantModelAdapter } from './assistant.types';

export function createAssistantModelAdapter(env: NodeJS.ProcessEnv = process.env): AssistantModelAdapter {
  if (env.ASSISTANT_MODEL_PROVIDER === 'fake') {
    return new FakeAssistantModelAdapter();
  }

  return new OpenAIAssistantModelAdapter({
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
    baseUrl: env.OPENAI_BASE_URL,
  });
}
