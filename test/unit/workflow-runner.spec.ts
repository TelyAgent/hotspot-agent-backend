import { InMemoryCollectionRepository } from '../../src/collection/in-memory-collection.repository';
import { EventCommandExecutor } from '../../src/workflow/event-command.executor';
import { FakeWorkflowModelAdapter } from '../../src/workflow/fake-workflow-model.adapter';
import { InMemoryWorkflowRepository } from '../../src/workflow/in-memory-workflow.repository';
import { WorkflowLoader } from '../../src/workflow/workflow-loader';
import { WorkflowOutputValidator } from '../../src/workflow/workflow-output-validator';
import { WorkflowRunner } from '../../src/workflow/workflow-runner';
import { XTrendContextBuilder } from '../../src/workflow/x-trend-context.builder';

describe('WorkflowRunner', () => {
  it('loads markdown workflow, delegates event decisions to the model, and executes returned commands', async () => {
    const collectionRepository = new InMemoryCollectionRepository();
    await collectionRepository.saveSourceSnapshot({
      id: 'snapshot_us_new',
      platform: 'x',
      platformSnapshotId: 'x_us_new',
      sourceType: 'trend',
      region: 'United States',
      collectedAt: '2026-08-18T02:00:00.000Z',
      fetchRunId: 'fetch_new',
      itemCount: 1,
    });
    await collectionRepository.saveSourceSnapshotItems([
      {
        id: 'item_us_ai',
        sourceSnapshotId: 'snapshot_us_new',
        platform: 'x',
        platformItemId: 'ai',
        sourceType: 'trend',
        region: 'United States',
        rank: 4,
        title: 'AI',
        normalizedKey: 'ai',
      },
    ]);

    const workflowRepository = new InMemoryWorkflowRepository();
    const adapter = new FakeWorkflowModelAdapter((input) => ({
      schemaVersion: 'event_workflow_commands_v1',
      workflowId: input.workflowId,
      workflowVersion: input.workflowVersion,
      runId: String(input.context.workflowRunId),
      commands: [
        {
          type: 'create_event',
          idempotencyKey: 'create:ai:fake',
          eventCandidate: {
            title: 'AI enters top trends',
            oneLineSummary: 'AI enters a target X trend list.',
            normalizedEventKey: 'ai-enters-top-trends',
            confidence: 'high',
          },
          eventIntake: {
            schemaVersion: 'event_intake_v1',
            entryMode: 'x_trend',
            observedAt: '2026-08-18T02:05:00.000Z',
            t0: '2026-08-18T02:05:00.000Z',
            title: 'AI enters top trends',
            oneLineSummary: 'AI enters a target X trend list.',
            confirmationLevel: 'unconfirmed',
            expressionBoundary: 'X trend list only',
            confirmedFacts: [],
            unconfirmedFacts: ['AI appears in X trend list'],
            evidenceRecords: [],
            trendContext: { regions: [] },
            trigger: {
              ruleId: 'FAKE',
              reason: 'Model returned create_event',
              t0: '2026-08-18T02:05:00.000Z',
              observedAt: '2026-08-18T02:05:00.000Z',
            },
            candidateEventIds: [],
            dedupeKey: 'ai-enters-top-trends',
          },
          trigger: {
            ruleId: 'FAKE',
            reason: 'Model returned create_event',
            t0: '2026-08-18T02:05:00.000Z',
            observedAt: '2026-08-18T02:05:00.000Z',
          },
          sourceContext: {
            regions: [{ region: 'United States', rank: 4, snapshotId: 'snapshot_us_new', representativePosts: [] }],
          },
          evidenceRecords: [{ sourceType: 'x_trend', claim: 'AI is #4 in United States trends' }],
          startResponsePipeline: true,
        },
      ],
    }));

    const runner = new WorkflowRunner(
      workflowRepository,
      new WorkflowLoader(process.cwd()),
      new XTrendContextBuilder(collectionRepository),
      adapter,
      new WorkflowOutputValidator(),
      new EventCommandExecutor(workflowRepository),
    );

    const result = await runner.runXTrendEventFormation({
      observedAt: '2026-08-18T02:05:00.000Z',
      regions: ['United States'],
    });

    expect(result.run.status).toBe('success');
    expect(workflowRepository.workflowCommands).toHaveLength(1);
    expect(workflowRepository.events).toEqual([
      expect.objectContaining({ normalizedEventKey: 'ai-enters-top-trends', status: 'responding' }),
    ]);
  });
});
