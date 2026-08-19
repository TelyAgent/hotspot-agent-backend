import { EventWorkflowCommandsV1 } from './workflow.types';

export interface WorkflowModelContext {
  workflowRunId?: string;
  [key: string]: unknown;
}

export interface GenerateWorkflowOutputInput {
  workflowId: string;
  workflowVersion: string;
  workflowMarkdown: string;
  outputSchema: unknown;
  context: WorkflowModelContext;
}

export type GenerateWorkflowCommandsInput = GenerateWorkflowOutputInput;

export interface WorkflowModelAdapter {
  generateStructuredOutput(input: GenerateWorkflowOutputInput): Promise<unknown>;
  generateCommands(input: GenerateWorkflowCommandsInput): Promise<EventWorkflowCommandsV1>;
}
