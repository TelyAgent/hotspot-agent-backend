import { FakeWorkflowModelAdapter } from './fake-workflow-model.adapter';
import { OpenAIWorkflowModelAdapter } from './openai-workflow-model.adapter';
import { WorkflowModelAdapter } from './workflow-model.adapter';

export function createWorkflowModelAdapter(env: NodeJS.ProcessEnv = process.env): WorkflowModelAdapter {
  if (env.WORKFLOW_MODEL_PROVIDER === 'fake') {
    return new FakeWorkflowModelAdapter();
  }

  return new OpenAIWorkflowModelAdapter({
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
    baseUrl: env.OPENAI_BASE_URL,
  });
}
