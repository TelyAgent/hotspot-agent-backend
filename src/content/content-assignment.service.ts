import { Inject, Injectable, Optional } from '@nestjs/common';
import { ContentAssignmentDecider, RoleKeywordContentAssignmentDecider } from './content-assignment-decider';
import { ContentCommandExecutor } from './content-command.executor';
import { ContentRepository } from './content.repository';
import { CONTENT_ASSIGNMENT_DECIDER, CONTENT_REPOSITORY } from './content.tokens';
import { OperationAccountRecord } from './content.types';

export interface StartContentResponseInput {
  eventId: string;
  workflowRunId: string;
  workflowCommandId: string;
  triggerReason: string;
  now?: string;
}

export interface StartContentResponseResult {
  createdOrReused: number;
  skippedAccounts: { accountId: string; reason: string }[];
}

@Injectable()
export class ContentAssignmentService {
  constructor(
    @Inject(CONTENT_REPOSITORY) private readonly contentRepository: ContentRepository,
    private readonly contentCommandExecutor: ContentCommandExecutor,
    @Optional()
    @Inject(CONTENT_ASSIGNMENT_DECIDER)
    private readonly assignmentDecider: ContentAssignmentDecider = new RoleKeywordContentAssignmentDecider(),
  ) {}

  async startForEvent(input: StartContentResponseInput): Promise<StartContentResponseResult> {
    const accounts = await this.contentRepository.listOperationAccounts();
    const skippedAccounts: StartContentResponseResult['skippedAccounts'] = [];
    let createdOrReused = 0;
    const personaAccounts = accounts.filter((account) => account.enabled && !isBasePipelineAccount(account));

    for (const account of accounts) {
      if (!account.enabled) {
        continue;
      }
      if (!isBasePipelineAccount(account)) {
        continue;
      }

      const execution = await this.contentCommandExecutor.execute({
        workflowRunId: input.workflowRunId,
        workflowCommandId: input.workflowCommandId,
        command: {
          type: 'create_content_task',
          idempotencyKey: `content_task:${input.eventId}:${account.id}`,
          eventId: input.eventId,
          accountId: account.id,
          skill: stringField(account, 'skill') ?? account.key,
          skillVersion: stringField(account, 'skillVersion') ?? '1.0.0',
          assignmentReason: 'Base pipeline account assigned automatically for triggered Event.',
          priority: 'normal',
          source: {
            workflowRunId: input.workflowRunId,
            commandId: input.workflowCommandId,
            triggerReason: input.triggerReason,
          },
        },
        now: input.now,
      });
      if (execution.status === 'success' || execution.status === 'skipped') {
        createdOrReused += 1;
      }
    }

    if (personaAccounts.length > 0) {
      const eventContextPack = await this.contentRepository.findEventContextPackById(input.eventId);
      if (!eventContextPack) {
        for (const account of personaAccounts) {
          skippedAccounts.push({
            accountId: account.id,
            reason: '缺少 Event Context Pack，无法进行人设账号分配判断。',
          });
        }
      } else {
        const decisions = await this.assignmentDecider.decide({
          eventContextPack,
          accounts: personaAccounts,
        });
        for (const account of personaAccounts) {
          const decision = decisions.find((item) => item.accountId === account.id);
          if (!decision || decision.decision !== 'participate') {
            skippedAccounts.push({
              accountId: account.id,
              reason: decision?.reason ?? '账号分配决策未返回该账号。',
            });
            continue;
          }
          const execution = await this.contentCommandExecutor.execute({
            workflowRunId: input.workflowRunId,
            workflowCommandId: input.workflowCommandId,
            command: {
              type: 'create_content_task',
              idempotencyKey: `content_task:${input.eventId}:${account.id}`,
              eventId: input.eventId,
              accountId: account.id,
              skill: stringField(account, 'skill') ?? account.key,
              skillVersion: stringField(account, 'skillVersion') ?? '1.0.0',
              assignmentReason: decision.reason,
              priority: decision.priority ?? 'normal',
              source: {
                workflowRunId: input.workflowRunId,
                commandId: input.workflowCommandId,
                triggerReason: input.triggerReason,
              },
            },
            now: input.now,
          });
          if (execution.status === 'success' || execution.status === 'skipped') {
            createdOrReused += 1;
          }
        }
      }
    }

    return { createdOrReused, skippedAccounts };
  }
}

function isBasePipelineAccount(account: OperationAccountRecord) {
  const type = stringField(account, 'type');
  const responseMode = stringField(account, 'responseMode');
  return type === '基础生产线' || type === 'base_pipeline' || responseMode === 'always';
}

function stringField(account: OperationAccountRecord, key: string) {
  const value = account.fields[key];
  return typeof value === 'string' ? value : undefined;
}
