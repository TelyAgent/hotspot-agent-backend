import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { WorkflowLoader } from '../workflow/workflow-loader';
import { WorkflowModelAdapter } from '../workflow/workflow-model.adapter';
import { WorkflowRepository } from '../workflow/workflow.repository';
import { WORKFLOW_LOADER, WORKFLOW_MODEL_ADAPTER, WORKFLOW_REPOSITORY } from '../workflow/workflow.tokens';
import { GeneratedContentCandidate } from './content-candidate-generator';
import { EventContextPackRecord, OperationAccountRecord } from './content.types';

export type ContentRiskStatus = 'low' | 'medium' | 'high' | 'blocked';
export type PrecheckedCandidateStatus = 'available' | 'warning' | 'blocked';

export interface ContentRiskPrecheckInput {
  candidate: GeneratedContentCandidate;
  eventContextPack: EventContextPackRecord;
  account: OperationAccountRecord;
}

export interface ContentRiskPrecheckResult {
  riskStatus: ContentRiskStatus;
  candidateStatus: PrecheckedCandidateStatus;
  reasons: string[];
}

export interface ContentRiskPrechecker {
  precheck(input: ContentRiskPrecheckInput): Promise<ContentRiskPrecheckResult>;
}

const precheckOutputSchema = z
  .object({
    schemaVersion: z.literal('content_risk_precheck_output_v1'),
    workflowId: z.string(),
    workflowVersion: z.string(),
    runId: z.string(),
    riskStatus: z.enum(['low', 'medium', 'high', 'blocked']),
    candidateStatus: z.enum(['available', 'warning', 'blocked']),
    reasons: z.array(z.string()),
  })
  .strict();

@Injectable()
export class WorkflowContentRiskPrechecker implements ContentRiskPrechecker {
  private readonly fallback = new RuleBasedContentRiskPrechecker();

  constructor(
    @Inject(WORKFLOW_LOADER) private readonly workflowLoader: WorkflowLoader,
    @Inject(WORKFLOW_MODEL_ADAPTER) private readonly modelAdapter: WorkflowModelAdapter,
    @Optional()
    @Inject(WORKFLOW_REPOSITORY)
    private readonly workflowRepository?: WorkflowRepository,
  ) {}

  async precheck(input: ContentRiskPrecheckInput): Promise<ContentRiskPrecheckResult> {
    let workflowRunId: string | undefined;
    try {
      const loadedWorkflow = await this.workflowLoader.load('risk-precheck', 'content/risk-precheck');
      const context = {
        schemaVersion: 'content_risk_precheck_context_v1',
        ...input,
      };
      workflowRunId = await this.startAuditRun(loadedWorkflow.definition, context);
      const modelOutput = await this.modelAdapter.generateStructuredOutput({
        workflowId: loadedWorkflow.definition.workflowId,
        workflowVersion: loadedWorkflow.definition.version,
        workflowMarkdown: loadedWorkflow.markdown,
        outputSchema: loadedWorkflow.outputSchema,
        context,
      });
      const parsed = precheckOutputSchema.safeParse(modelOutput);
      if (!parsed.success) {
        throw new Error(`Invalid risk precheck workflow output: ${parsed.error.message}`);
      }
      await this.finishAuditRun(workflowRunId, 'success', modelOutput);
      return {
        riskStatus: parsed.data.riskStatus,
        candidateStatus: parsed.data.candidateStatus,
        reasons: parsed.data.reasons,
      };
    } catch (error) {
      await this.finishAuditRun(workflowRunId, 'failed', undefined, error);
      return this.fallback.precheck(input);
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

export class RuleBasedContentRiskPrechecker implements ContentRiskPrechecker {
  async precheck(input: ContentRiskPrecheckInput): Promise<ContentRiskPrecheckResult> {
    const text = input.candidate.text.toLowerCase();
    const reasons: string[] = [];

    if (containsAny(text, ['guaranteed', 'risk-free', '稳赚', '保本', '必赚'])) {
      return {
        riskStatus: 'blocked',
        candidateStatus: 'blocked',
        reasons: ['包含禁止的确定收益或无风险表达。'],
      };
    }

    if (
      input.eventContextPack.confirmationLevel === 'unconfirmed' &&
      containsAny(text, ['confirmed', 'officially', '确定', '官方确认', '实锤'])
    ) {
      return {
        riskStatus: 'high',
        candidateStatus: 'blocked',
        reasons: ['候选把未确认事件写成确定事实。'],
      };
    }

    if (input.eventContextPack.confirmationLevel === 'unconfirmed' || input.candidate.uncertaintyNotes.length > 0) {
      reasons.push('事件仍有未确认事实，发布时需要保留限定表达。');
      return {
        riskStatus: 'medium',
        candidateStatus: 'warning',
        reasons,
      };
    }

    return {
      riskStatus: 'low',
      candidateStatus: 'available',
      reasons,
    };
  }
}

function containsAny(text: string, needles: string[]) {
  return needles.some((needle) => text.includes(needle.toLowerCase()));
}
