import { GenerateWorkflowCommandsInput, WorkflowModelAdapter } from './workflow-model.adapter';
import { EventWorkflowCommandsV1 } from './workflow.types';

export class FakeWorkflowModelAdapter implements WorkflowModelAdapter {
  constructor(
    private readonly handler?: (input: GenerateWorkflowCommandsInput) => EventWorkflowCommandsV1 | Promise<EventWorkflowCommandsV1>,
  ) {}

  async generateCommands(input: GenerateWorkflowCommandsInput): Promise<EventWorkflowCommandsV1> {
    return (await this.generateStructuredOutput(input)) as EventWorkflowCommandsV1;
  }

  async generateStructuredOutput(input: GenerateWorkflowCommandsInput): Promise<unknown> {
    if (this.handler) {
      return this.handler(input);
    }

    return {
      schemaVersion: 'event_workflow_commands_v1',
      workflowId: input.workflowId,
      workflowVersion: input.workflowVersion,
      runId: input.context.workflowRunId ?? 'unknown_workflow_run',
      commands: [],
      diagnostics: [{ level: 'info', message: 'FakeWorkflowModelAdapter returned no commands.' }],
    };
  }
}
