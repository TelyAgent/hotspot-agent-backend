import { WorkflowOutputValidator } from '../../src/workflow/workflow-output-validator';

describe('WorkflowOutputValidator', () => {
  const validator = new WorkflowOutputValidator();

  it('accepts create_event, update_event_context, and ignore commands', () => {
    const output = validator.validate({
      schemaVersion: 'event_workflow_commands_v1',
      workflowId: 'x-trend-event-formation',
      workflowVersion: '1.0.0',
      runId: 'wrun_test',
      commands: [
        {
          type: 'ignore',
          idempotencyKey: 'ignore:test',
          reason: 'Generic topic',
          sourceRefs: [{ platform: 'x', sourceType: 'trend', id: 'item_1' }],
        },
        {
          type: 'update_event_context',
          idempotencyKey: 'update:test',
          targetEventId: 'event_1',
          reason: 'Repeated trend hit',
          sourceContextPatch: {
            regions: [],
            matchedRules: [
              {
                ruleId: 'TR-04',
                reason: 'Appeared in another region',
                t0: '2026-08-18T00:00:00.000Z',
                observedAt: '2026-08-18T00:00:00.000Z',
              },
            ],
          },
          startResponsePipeline: false,
        },
        {
          type: 'create_event',
          idempotencyKey: 'create:test',
          eventCandidate: {
            title: 'OpenAI launches GPT-6 API',
            oneLineSummary: 'OpenAI launch claim is trending on X.',
            normalizedEventKey: 'openai-launches-gpt-6-api',
            confidence: 'medium',
          },
          eventIntake: {
            schemaVersion: 'event_intake_v1',
            entryMode: 'x_trend',
            observedAt: '2026-08-18T00:00:00.000Z',
            t0: '2026-08-18T00:00:00.000Z',
            title: 'OpenAI launches GPT-6 API',
            oneLineSummary: 'OpenAI launch claim is trending on X.',
            confirmationLevel: 'unconfirmed',
            expressionBoundary: 'Treat as X discussion until verified.',
            confirmedFacts: [],
            unconfirmedFacts: ['X users are discussing this claim.'],
            evidenceRecords: [],
            trendContext: {
              regions: [],
              matchedRules: [
                {
                  ruleId: 'TR-01',
                  reason: 'First top 5 hit',
                  t0: '2026-08-18T00:00:00.000Z',
                  observedAt: '2026-08-18T00:00:00.000Z',
                },
                {
                  ruleId: 'TR-02',
                  reason: 'Rank rose by at least 10',
                  t0: '2026-08-18T00:00:00.000Z',
                  observedAt: '2026-08-18T00:00:00.000Z',
                },
              ],
            },
            trigger: {
              ruleId: 'TR-01',
              reason: 'First top 5 hit',
              t0: '2026-08-18T00:00:00.000Z',
              observedAt: '2026-08-18T00:00:00.000Z',
            },
            candidateEventIds: [],
            dedupeKey: 'openai-launches-gpt-6-api',
          },
          trigger: {
            ruleId: 'TR-01',
            reason: 'First top 5 hit',
            t0: '2026-08-18T00:00:00.000Z',
            observedAt: '2026-08-18T00:00:00.000Z',
          },
          sourceContext: {
            regions: [],
            matchedRules: [
              {
                ruleId: 'TR-01',
                reason: 'First top 5 hit',
                t0: '2026-08-18T00:00:00.000Z',
                observedAt: '2026-08-18T00:00:00.000Z',
              },
              {
                ruleId: 'TR-02',
                reason: 'Rank rose by at least 10',
                t0: '2026-08-18T00:00:00.000Z',
                observedAt: '2026-08-18T00:00:00.000Z',
              },
            ],
          },
          evidenceRecords: [],
          startResponsePipeline: true,
        },
      ],
    });

    expect(output.commands).toHaveLength(3);
  });

  it('rejects schema-extra command types before database writes', () => {
    expect(() =>
      validator.validate({
        schemaVersion: 'event_workflow_commands_v1',
        workflowId: 'x-trend-event-formation',
        workflowVersion: '1.0.0',
        runId: 'wrun_test',
        commands: [{ type: 'delete_database', idempotencyKey: 'bad' }],
      }),
    ).toThrow(/Invalid workflow output/);
  });
});
