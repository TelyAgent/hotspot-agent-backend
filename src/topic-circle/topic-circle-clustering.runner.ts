import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { WORKFLOW_LOADER, WORKFLOW_MODEL_ADAPTER } from '../workflow/workflow.tokens';
import { WorkflowLoader } from '../workflow/workflow-loader';
import { WorkflowModelAdapter } from '../workflow/workflow-model.adapter';
import type { TopicCircleClusteringInput, TopicCircleClusteredCandidate, TopicCircleClusteringRunner } from './topic-circle.service';

const clusteredCandidateSchema = z
  .object({
    title: z.string(),
    summary: z.string(),
    coreFact: z.string(),
    normalizedEventKey: z.string(),
    confidence: z.number().min(0).max(1),
    postIds: z.array(z.string()),
    mergeTargetCandidateId: z.string().nullable(),
    ignoredPostIds: z.array(z.string()),
    ignoreReason: z.string().nullable(),
  })
  .strict();

const clusteringOutputSchema = z
  .object({
    schemaVersion: z.literal('topic_circle_clustering_output_v1'),
    workflowId: z.string(),
    workflowVersion: z.string(),
    runId: z.string(),
    candidates: z.array(clusteredCandidateSchema),
    diagnostics: z.array(
      z
        .object({
          level: z.enum(['info', 'warning', 'error']),
          message: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

@Injectable()
export class TopicCircleClusteringWorkflowRunner implements TopicCircleClusteringRunner {
  constructor(
    @Inject(WORKFLOW_LOADER) private readonly workflowLoader: WorkflowLoader,
    @Inject(WORKFLOW_MODEL_ADAPTER) private readonly modelAdapter: WorkflowModelAdapter,
  ) {}

  async runTopicCircleClustering(input: TopicCircleClusteringInput): Promise<{ candidates: TopicCircleClusteredCandidate[] }> {
    const loadedWorkflow = await this.workflowLoader.load('topic-clustering', 'topic-circle');
    const modelOutput = await this.modelAdapter.generateStructuredOutput({
      workflowId: loadedWorkflow.definition.workflowId,
      workflowVersion: loadedWorkflow.definition.version,
      workflowMarkdown: loadedWorkflow.markdown,
      outputSchema: loadedWorkflow.outputSchema,
      context: {
        schemaVersion: 'topic_circle_clustering_context_v1',
        ...input,
      },
    });
    const parsed = clusteringOutputSchema.safeParse(modelOutput);
    if (!parsed.success) {
      throw new Error(`Invalid topic circle clustering output: ${parsed.error.message}`);
    }
    return {
      candidates: parsed.data.candidates.map((candidate) => ({
        normalizedEventKey: candidate.mergeTargetCandidateId ?? candidate.normalizedEventKey,
        title: candidate.title,
        summary: candidate.summary,
        coreFact: candidate.coreFact,
        confidence: candidate.confidence,
        postIds: candidate.postIds,
      })),
    };
  }
}
