import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { WorkflowLoader } from '../workflow/workflow-loader';
import { WorkflowModelAdapter } from '../workflow/workflow-model.adapter';
import { WorkflowRepository } from '../workflow/workflow.repository';
import { WORKFLOW_LOADER, WORKFLOW_MODEL_ADAPTER, WORKFLOW_REPOSITORY } from '../workflow/workflow.tokens';
import { EventContextPackRecord, OperationAccountRecord } from './content.types';

export interface GenerateContentCandidatesInput {
  generationKind: 'initial' | 'regenerate_all' | 'revise_selected';
  userInstruction?: string;
  task: {
    id: string;
    eventId: string;
    accountId: string;
    status: string;
    skill: string;
    skillVersion: string;
  };
  eventContextPack: EventContextPackRecord;
  account: OperationAccountRecord;
  existingCandidates: {
    id: string;
    text: string;
    status: string;
  }[];
}

export interface GeneratedContentCandidate {
  localKey: string;
  format: 'original_post' | 'thread' | 'quote' | 'reply';
  text: string;
  targetPostUrl?: string;
  angle: string;
  factualClaims: string[];
  uncertaintyNotes: string[];
  productBridge?: 'market_bridge' | 'ambient_brand' | 'quiet_presence' | 'none';
}

export interface ContentCandidateGenerator {
  generate(input: GenerateContentCandidatesInput): Promise<GeneratedContentCandidate[]>;
}

const generatedCandidateSchema = z
  .object({
    localKey: z.string(),
    format: z.enum(['original_post', 'thread', 'quote', 'reply']),
    text: z.string(),
    targetPostUrl: z.string().nullable().optional(),
    angle: z.string(),
    factualClaims: z.array(z.string()),
    uncertaintyNotes: z.array(z.string()),
    productBridge: z.enum(['market_bridge', 'ambient_brand', 'quiet_presence', 'none']).optional(),
  })
  .strict();

const candidateGenerationOutputSchema = z
  .object({
    schemaVersion: z.literal('account_task_candidate_output_v1'),
    workflowId: z.string(),
    workflowVersion: z.string(),
    runId: z.string(),
    candidates: z.array(generatedCandidateSchema).length(3),
    refusal: z
      .object({
        reason: z.string(),
        riskLevel: z.enum(['high', 'blocked']).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

@Injectable()
export class WorkflowContentCandidateGenerator implements ContentCandidateGenerator {
  private readonly fallback = new TemplateContentCandidateGenerator();

  constructor(
    @Inject(WORKFLOW_LOADER) private readonly workflowLoader: WorkflowLoader,
    @Inject(WORKFLOW_MODEL_ADAPTER) private readonly modelAdapter: WorkflowModelAdapter,
    @Optional()
    @Inject(WORKFLOW_REPOSITORY)
    private readonly workflowRepository?: WorkflowRepository,
  ) {}

  async generate(input: GenerateContentCandidatesInput): Promise<GeneratedContentCandidate[]> {
    let workflowRunId: string | undefined;
    try {
      const loadedWorkflow = await this.workflowLoader.load(
        'account-task-candidate-generation',
        'content/account-task-candidate-generation',
      );
      const context = {
        schemaVersion: 'account_task_generation_context_v1',
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
      const parsed = candidateGenerationOutputSchema.safeParse(modelOutput);
      if (!parsed.success) {
        throw new Error(`Invalid content generation workflow output: ${parsed.error.message}`);
      }
      await this.finishAuditRun(workflowRunId, 'success', modelOutput);
      return parsed.data.candidates.map((candidate) => ({
        ...candidate,
        targetPostUrl: candidate.targetPostUrl ?? undefined,
      }));
    } catch (error) {
      await this.finishAuditRun(workflowRunId, 'failed', undefined, error);
      return this.fallback.generate(input);
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

export class TemplateContentCandidateGenerator implements ContentCandidateGenerator {
  async generate(input: GenerateContentCandidatesInput): Promise<GeneratedContentCandidate[]> {
    const summary = input.eventContextPack.oneLineSummary || input.eventContextPack.title;
    const boundary = input.eventContextPack.expressionBoundary;
    const accountName = input.account.name;
    const instruction = input.userInstruction ? ` 要求：${input.userInstruction}` : '';

    return [
      {
        localKey: 'a',
        format: 'original_post',
        text: `${summary} ${boundary ? `(${boundary})` : ''}${instruction}`.trim(),
        angle: `${accountName} 快速事实更新`,
        factualClaims: claims(input),
        uncertaintyNotes: uncertaintyNotes(input),
        productBridge: 'none',
      },
      {
        localKey: 'b',
        format: 'original_post',
        text: `${summary} Watch the evidence boundary before treating the trend as confirmed.${instruction}`,
        angle: `${accountName} 证据边界提醒`,
        factualClaims: claims(input),
        uncertaintyNotes: uncertaintyNotes(input),
        productBridge: 'none',
      },
      {
        localKey: 'c',
        format: 'thread',
        text: `What happened: ${summary}\nWhat we know: ${claims(input).join('; ') || 'limited public signal'}\nWhat remains unclear: ${uncertaintyNotes(input).join('; ') || boundary}${instruction}`,
        angle: `${accountName} 后续观察`,
        factualClaims: claims(input),
        uncertaintyNotes: uncertaintyNotes(input),
        productBridge: 'none',
      },
    ];
  }
}

function claims(input: GenerateContentCandidatesInput) {
  const evidenceClaims = input.eventContextPack.evidenceRecords.map((record) => record.claim).filter(Boolean);
  return evidenceClaims.length ? evidenceClaims : input.eventContextPack.confirmedFacts;
}

function uncertaintyNotes(input: GenerateContentCandidatesInput) {
  return input.eventContextPack.unconfirmedFacts.length
    ? input.eventContextPack.unconfirmedFacts
    : [input.eventContextPack.expressionBoundary].filter(Boolean);
}
