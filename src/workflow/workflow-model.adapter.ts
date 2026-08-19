import { EventWorkflowCommandsV1 } from './workflow.types';

export interface WorkflowModelContext {
  workflowRunId?: string;
  [key: string]: unknown;
}

export interface GenerateWorkflowCommandsInput {
  workflowId: string;
  workflowVersion: string;
  workflowMarkdown: string;
  outputSchema: unknown;
  context: WorkflowModelContext;
}

export interface WorkflowModelAdapter {
  generateCommands(input: GenerateWorkflowCommandsInput): Promise<EventWorkflowCommandsV1>;
}
