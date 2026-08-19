import { FakeWorkflowModelAdapter } from '../../src/workflow/fake-workflow-model.adapter';
import { OpenAIWorkflowModelAdapter } from '../../src/workflow/openai-workflow-model.adapter';
import { createWorkflowModelAdapter } from '../../src/workflow/workflow-model-adapter.factory';

describe('createWorkflowModelAdapter', () => {
  it('uses OpenAI by default', () => {
    expect(createWorkflowModelAdapter({})).toBeInstanceOf(OpenAIWorkflowModelAdapter);
  });

  it('uses fake adapter only when explicitly configured', () => {
    expect(createWorkflowModelAdapter({ WORKFLOW_MODEL_PROVIDER: 'fake' })).toBeInstanceOf(FakeWorkflowModelAdapter);
  });
});
