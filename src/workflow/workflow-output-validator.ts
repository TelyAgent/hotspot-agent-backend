import { z } from 'zod';
import { EventWorkflowCommandsV1 } from './workflow.types';

const evidenceRecordSchema = z
  .object({
    sourceType: z.enum(['x_trend', 'x_post', 'x_topic_circle', 'manual', 'external']),
    url: z.string().optional(),
    claim: z.string(),
    payload: z.unknown(),
  })
  .strict();

const triggerSchema = z
  .object({
    ruleId: z.string(),
    reason: z.string(),
    t0: z.string(),
    observedAt: z.string(),
  })
  .strict();

const xTrendSourceContextSchema = z
  .object({
    regions: z.array(
      z
        .object({
          region: z.string(),
          rank: z.number().int().optional(),
          previousRank: z.number().int().optional(),
          snapshotId: z.string(),
        })
        .strict(),
    ),
    matchedRules: z.array(triggerSchema).optional(),
  })
  .strict();

const topicCircleSourceContextSchema = z
  .object({
    topicCircle: z.record(z.string(), z.unknown()),
    candidate: z.record(z.string(), z.unknown()),
    posts: z.array(z.record(z.string(), z.unknown())),
    matchedRules: z.array(triggerSchema),
  })
  .passthrough();

const eventSourceContextSchema = z.union([xTrendSourceContextSchema, topicCircleSourceContextSchema]);

const eventIntakeSchema = z
  .object({
    schemaVersion: z.literal('event_intake_v1'),
    entryMode: z.enum(['x_trend', 'x_topic_circle']),
    observedAt: z.string(),
    t0: z.string().optional(),
    title: z.string(),
    oneLineSummary: z.string(),
    confirmationLevel: z.enum(['unconfirmed', 'partially_supported', 'confirmed', 'conflicting']),
    expressionBoundary: z.string(),
    confirmedFacts: z.array(z.string()),
    unconfirmedFacts: z.array(z.string()),
    evidenceRecords: z.array(evidenceRecordSchema),
    trendContext: eventSourceContextSchema,
    trigger: triggerSchema,
    candidateEventIds: z.array(z.string()),
    dedupeKey: z.string(),
  })
  .strict();

const createEventCommandSchema = z
  .object({
    type: z.literal('create_event'),
    idempotencyKey: z.string(),
    eventCandidate: z
      .object({
        title: z.string(),
        subject: z.string().optional(),
        action: z.string().optional(),
        object: z.string().optional(),
        oneLineSummary: z.string(),
        normalizedEventKey: z.string(),
        confidence: z.enum(['high', 'medium', 'low']),
      })
      .strict(),
    eventIntake: eventIntakeSchema,
    trigger: triggerSchema,
    sourceContext: eventSourceContextSchema,
    evidenceRecords: z.array(evidenceRecordSchema),
    startResponsePipeline: z.boolean(),
  })
  .strict();

const updateEventContextCommandSchema = z
  .object({
    type: z.literal('update_event_context'),
    idempotencyKey: z.string(),
    targetEventId: z.string(),
    reason: z.string(),
    trigger: triggerSchema.optional(),
    sourceContextPatch: eventSourceContextSchema,
    evidenceRecords: z.array(evidenceRecordSchema).optional(),
    startResponsePipeline: z.literal(false),
  })
  .strict();

const ignoreSignalCommandSchema = z
  .object({
    type: z.literal('ignore'),
    idempotencyKey: z.string(),
    reason: z.string(),
    sourceRefs: z.array(
      z
        .object({
          platform: z.string(),
          sourceType: z.string(),
          id: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

const eventCommandSchema = z.discriminatedUnion('type', [
  createEventCommandSchema,
  updateEventContextCommandSchema,
  ignoreSignalCommandSchema,
]);

const workflowOutputSchema = z
  .object({
    schemaVersion: z.literal('event_workflow_commands_v1'),
    workflowId: z.string(),
    workflowVersion: z.string(),
    runId: z.string(),
    commands: z.array(eventCommandSchema),
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

export class WorkflowOutputValidator {
  validate(output: unknown): EventWorkflowCommandsV1 {
    const parsed = workflowOutputSchema.safeParse(output);
    if (!parsed.success) {
      throw new Error(`Invalid workflow output: ${parsed.error.message}`);
    }
    return parsed.data;
  }
}
