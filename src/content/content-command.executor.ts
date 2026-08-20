import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ContentRepository } from './content.repository';
import {
  ContentCommand,
  ContentCommandExecutionRecord,
  CreateAccountResponseTaskCommand,
} from './content.types';
import { CONTENT_REPOSITORY } from './content.tokens';

export interface ExecuteContentCommandInput {
  workflowRunId: string;
  workflowCommandId: string;
  command: ContentCommand;
  now?: string;
}

@Injectable()
export class ContentCommandExecutor {
  constructor(@Inject(CONTENT_REPOSITORY) private readonly contentRepository: ContentRepository) {}

  async execute(input: ExecuteContentCommandInput): Promise<ContentCommandExecutionRecord> {
    const existingExecution = await this.contentRepository.findCommandExecutionByIdempotencyKey(
      input.command.idempotencyKey,
    );
    if (existingExecution) {
      return this.saveExecution(input, {
        status: 'skipped',
        targetTaskId: existingExecution.targetTaskId,
      });
    }

    if (input.command.type === 'create_account_response_task') {
      const existingTask = await this.contentRepository.findAccountResponseTaskByEventAndAccount(
        input.command.eventId,
        input.command.accountId,
      );
      if (existingTask) {
        return this.saveExecution(input, {
          status: 'skipped',
          targetTaskId: existingTask.id,
        });
      }
    }

    try {
      const targetTaskId = await this.executeCommand(input);
      return this.saveExecution(input, { status: 'success', targetTaskId });
    } catch (error) {
      return this.saveExecution(input, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async executeCommand(input: ExecuteContentCommandInput): Promise<string | undefined> {
    switch (input.command.type) {
      case 'create_account_response_task':
        return this.executeCreateTask(input.workflowRunId, input.workflowCommandId, input.command, input.now);
      case 'observe_account':
      case 'skip_account':
        return undefined;
    }
  }

  private async executeCreateTask(
    workflowRunId: string,
    workflowCommandId: string,
    command: CreateAccountResponseTaskCommand,
    now = new Date().toISOString(),
  ) {
    const existing = await this.contentRepository.findAccountResponseTaskByEventAndAccount(
      command.eventId,
      command.accountId,
    );
    if (existing) {
      return existing.id;
    }

    const task = await this.contentRepository.createAccountResponseTask({
      id: `account_response_task_${randomUUID()}`,
      eventId: command.eventId,
      accountId: command.accountId,
      workflowRunId,
      assignmentCommandId: workflowCommandId,
      status: 'ready_for_generation',
      priority: command.priority,
      skill: command.skill,
      skillVersion: command.skillVersion,
      assignmentReason: command.assignmentReason,
      riskStatus: 'not_checked',
      createdAt: now,
      updatedAt: now,
    });
    return task.id;
  }

  private async saveExecution(
    input: ExecuteContentCommandInput,
    patch: Pick<ContentCommandExecutionRecord, 'status'> &
      Partial<Pick<ContentCommandExecutionRecord, 'targetTaskId' | 'error'>>,
  ) {
    const execution: ContentCommandExecutionRecord = {
      id: `content_cmd_exec_${randomUUID()}`,
      workflowCommandId: input.workflowCommandId,
      workflowRunId: input.workflowRunId,
      commandType: input.command.type,
      idempotencyKey: input.command.idempotencyKey,
      status: patch.status,
      targetTaskId: patch.targetTaskId,
      error: patch.error,
      createdAt: input.now ?? new Date().toISOString(),
    };
    return this.contentRepository.saveCommandExecution(execution);
  }
}
