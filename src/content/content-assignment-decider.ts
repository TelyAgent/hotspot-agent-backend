import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { WorkflowLoader } from '../workflow/workflow-loader';
import { WorkflowModelAdapter } from '../workflow/workflow-model.adapter';
import { WorkflowRepository } from '../workflow/workflow.repository';
import { WORKFLOW_LOADER, WORKFLOW_MODEL_ADAPTER, WORKFLOW_REPOSITORY } from '../workflow/workflow.tokens';
import { EventContextPackRecord, OperationAccountRecord } from './content.types';

export type ContentAssignmentDecisionType = 'participate' | 'observe' | 'skip';

export interface ContentAssignmentDecision {
  accountId: string;
  decision: ContentAssignmentDecisionType;
  reason: string;
  priority?: 'urgent' | 'high' | 'normal' | 'low';
}

export interface DecideContentAssignmentInput {
  eventContextPack: EventContextPackRecord;
  accounts: OperationAccountRecord[];
}

export interface ContentAssignmentDecider {
  decide(input: DecideContentAssignmentInput): Promise<ContentAssignmentDecision[]>;
}

const assignmentCommandSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('create_account_response_task'),
      idempotencyKey: z.string(),
      eventId: z.string(),
      accountId: z.string(),
      skill: z.string(),
      skillVersion: z.string(),
      assignmentReason: z.string(),
      priority: z.enum(['urgent', 'high', 'normal', 'low']),
      source: z
        .object({
          workflowRunId: z.string(),
          commandId: z.string().optional(),
          triggerReason: z.string(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal('observe_account'),
      idempotencyKey: z.string(),
      eventId: z.string(),
      accountId: z.string(),
      reason: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal('skip_account'),
      idempotencyKey: z.string(),
      eventId: z.string(),
      accountId: z.string(),
      reason: z.string(),
    })
    .strict(),
]);

const assignmentOutputSchema = z
  .object({
    schemaVersion: z.literal('account_assignment_commands_v1'),
    workflowId: z.string(),
    workflowVersion: z.string(),
    runId: z.string(),
    commands: z.array(assignmentCommandSchema),
    diagnostics: z
      .array(
        z
          .object({
            level: z.enum(['info', 'warning', 'error']),
            message: z.string(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

@Injectable()
export class WorkflowContentAssignmentDecider implements ContentAssignmentDecider {
  private readonly fallback = new RoleKeywordContentAssignmentDecider();

  constructor(
    @Inject(WORKFLOW_LOADER) private readonly workflowLoader: WorkflowLoader,
    @Inject(WORKFLOW_MODEL_ADAPTER) private readonly modelAdapter: WorkflowModelAdapter,
    @Optional()
    @Inject(WORKFLOW_REPOSITORY)
    private readonly workflowRepository?: WorkflowRepository,
  ) {}

  async decide(input: DecideContentAssignmentInput): Promise<ContentAssignmentDecision[]> {
    let workflowRunId: string | undefined;
    try {
      const loadedWorkflow = await this.workflowLoader.load('account-assignment', 'content/account-assignment');
      const context = {
        schemaVersion: 'account_assignment_context_v1',
        eventContextPack: input.eventContextPack,
        accounts: input.accounts,
      };
      workflowRunId = await this.startAuditRun(loadedWorkflow.definition, context);
      const modelOutput = await this.modelAdapter.generateStructuredOutput({
        workflowId: loadedWorkflow.definition.workflowId,
        workflowVersion: loadedWorkflow.definition.version,
        workflowMarkdown: loadedWorkflow.markdown,
        outputSchema: loadedWorkflow.outputSchema,
        context,
      });
      const parsed = assignmentOutputSchema.safeParse(modelOutput);
      if (!parsed.success) {
        throw new Error(`Invalid account assignment workflow output: ${parsed.error.message}`);
      }
      await this.finishAuditRun(workflowRunId, 'success', modelOutput);
      const accountIds = new Set(input.accounts.map((account) => account.id));
      return parsed.data.commands
        .filter((command) => accountIds.has(command.accountId))
        .map((command): ContentAssignmentDecision => {
          if (command.type === 'create_account_response_task') {
            return {
              accountId: command.accountId,
              decision: 'participate',
              reason: command.assignmentReason,
              priority: command.priority,
            };
          }
          return {
            accountId: command.accountId,
            decision: command.type === 'observe_account' ? 'observe' : 'skip',
            reason: command.reason,
            priority: 'low',
          };
        });
    } catch (error) {
      await this.finishAuditRun(workflowRunId, 'failed', undefined, error);
      return this.fallback.decide(input);
    }
  }

  private async startAuditRun(definition: Awaited<ReturnType<WorkflowLoader['load']>>['definition'], input: unknown) {
    if (!this.workflowRepository) {
      return undefined;
    }
    const savedDefinition = await this.workflowRepository.saveWorkflowDefinition(definition);
    const workflowRunId = `wrun_${randomUUID()}`;
    await this.workflowRepository.createWorkflowRun({
      id: workflowRunId,
      workflowDefinitionId: savedDefinition.id,
      status: 'running',
      startedAt: new Date().toISOString(),
      input,
    });
    return workflowRunId;
  }

  private async finishAuditRun(workflowRunId: string | undefined, status: 'success' | 'failed', output?: unknown, error?: unknown) {
    if (!this.workflowRepository || !workflowRunId) {
      return;
    }
    await this.workflowRepository.finishWorkflowRun(workflowRunId, {
      status,
      finishedAt: new Date().toISOString(),
      output,
      error: error instanceof Error ? error.message : error ? String(error) : undefined,
    });
  }
}

export class RoleKeywordContentAssignmentDecider implements ContentAssignmentDecider {
  async decide(input: DecideContentAssignmentInput): Promise<ContentAssignmentDecision[]> {
    const eventText = [
      input.eventContextPack.title,
      input.eventContextPack.oneLineSummary,
      ...input.eventContextPack.confirmedFacts,
      ...input.eventContextPack.unconfirmedFacts,
      ...input.eventContextPack.evidenceRecords.map((record) => record.claim),
    ]
      .join(' ')
      .toLowerCase();

    return input.accounts.map((account) => {
      const roleText = [
        account.name,
        stringField(account, 'personaType'),
        stringField(account, 'scenario'),
        stringField(account, 'description'),
      ]
        .join(' ')
        .toLowerCase();
      const score = keywordScore(eventText, roleText);
      if (score >= 2) {
        return {
          accountId: account.id,
          decision: 'participate',
          reason: '事件内容与账号角色定义存在明确关键词匹配。',
          priority: score >= 4 ? 'high' : 'normal',
        };
      }
      if (score === 1) {
        return {
          accountId: account.id,
          decision: 'observe',
          reason: '事件与账号角色存在弱相关，先观察不自动创建任务。',
          priority: 'low',
        };
      }
      return {
        accountId: account.id,
        decision: 'skip',
        reason: '事件与账号角色定义不匹配。',
        priority: 'low',
      };
    });
  }
}

function keywordScore(eventText: string, roleText: string) {
  const groups = [
    ['market', 'markets', 'money', 'fund', 'funds', 'rate', 'fed', 'financial', 'finance', '资金', '市场', '利率', '监管'],
    ['crypto', 'bitcoin', 'btc', 'eth', 'onchain', 'chain', '加密', '链上'],
    ['music', 'celebrity', 'sports', 'creator', '明星', '音乐', '体育', '创作者'],
    ['probability', 'poll', 'forecast', 'election', 'prediction', '概率', '民调', '选举', '预测'],
    ['science', 'human', 'achievement', '科学', '人文', '成就'],
    ['tool', 'research', 'course', 'education', '工具', '研究', '课程', '教育'],
  ];
  return groups.reduce((score, group) => {
    const eventHit = group.some((keyword) => eventText.includes(keyword));
    const roleHit = group.some((keyword) => roleText.includes(keyword));
    return score + (eventHit && roleHit ? 1 : 0);
  }, 0);
}

function stringField(account: OperationAccountRecord, key: string) {
  const value = account.fields[key];
  return typeof value === 'string' ? value : undefined;
}
