import { PrismaService } from '../../src/prisma/prisma.service';

describe('Workflow Prisma schema', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.ensureReady();
  });

  beforeEach(async () => {
    await prisma.workflowCommandExecution.deleteMany();
    await prisma.workflowCommand.deleteMany();
    await prisma.eventEvidence.deleteMany();
    await prisma.eventSourceContext.deleteMany();
    await prisma.eventIntake.deleteMany();
    await prisma.ignoredSignal.deleteMany();
    await prisma.event.deleteMany();
    await prisma.workflowRun.deleteMany();
    await prisma.workflowDefinition.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('persists workflow definition, run, command, event intake, event context, evidence, and ignored signal', async () => {
    const definition = await prisma.workflowDefinition.create({
      data: {
        id: 'wdef_test',
        workflowId: 'x-trend-event-formation',
        name: 'X 热搜榜生成 Event',
        type: 'event_formation',
        version: '1.0.0',
        status: 'enabled',
        markdownPath: 'workflows/event-formation/x-trend-event-formation/WORKFLOW.md',
        outputSchemaPath: 'workflows/event-formation/x-trend-event-formation/output.schema.json',
        checksum: 'checksum_test',
      },
    });

    const run = await prisma.workflowRun.create({
      data: {
        id: 'wrun_test',
        workflowDefinitionId: definition.id,
        status: 'success',
        startedAt: new Date('2026-08-18T00:00:00.000Z'),
        finishedAt: new Date('2026-08-18T00:00:01.000Z'),
        model: 'fake-model',
        input: { schemaVersion: 'x_trend_event_context_v1' },
        output: { schemaVersion: 'event_workflow_commands_v1', commands: [] },
      },
    });

    const event = await prisma.event.create({
      data: {
        id: 'event_test',
        title: 'OpenAI launches GPT-6 API',
        normalizedEventKey: 'openai-launches-gpt-6-api',
        status: 'responding',
        confidence: 'medium',
        formedAt: new Date('2026-08-18T00:00:01.000Z'),
      },
    });

    await prisma.eventIntake.create({
      data: {
        id: 'intake_test',
        eventId: event.id,
        workflowRunId: run.id,
        entryMode: 'x_trend',
        observedAt: new Date('2026-08-18T00:00:00.000Z'),
        t0: new Date('2026-08-18T00:00:00.000Z'),
        title: event.title,
        oneLineSummary: 'OpenAI is spreading on X as a launch claim.',
        confirmationLevel: 'unconfirmed',
        expressionBoundary: 'Treat as X trend claim until confirmed.',
        payload: { trigger: { ruleId: 'TR-01' } },
        dedupeKey: 'openai-launches-gpt-6-api',
      },
    });

    await prisma.eventSourceContext.create({
      data: {
        id: 'ctx_test',
        eventId: event.id,
        workflowRunId: run.id,
        sourceType: 'x_trend',
        payload: { regions: ['Worldwide'] },
      },
    });

    await prisma.eventEvidence.create({
      data: {
        id: 'evidence_test',
        eventId: event.id,
        workflowRunId: run.id,
        sourceType: 'x_post',
        url: 'https://x.com/example/status/1',
        claim: 'X users are discussing the launch.',
        payload: { postId: '1' },
      },
    });

    const command = await prisma.workflowCommand.create({
      data: {
        id: 'cmd_test',
        workflowRunId: run.id,
        type: 'create_event',
        idempotencyKey: 'x_trend:1.0.0:openai:TR-01:2026-08-18T00',
        payload: { type: 'create_event' },
      },
    });

    await prisma.workflowCommandExecution.create({
      data: {
        id: 'cmd_exec_test',
        workflowCommandId: command.id,
        workflowRunId: run.id,
        commandType: 'create_event',
        idempotencyKey: command.idempotencyKey,
        status: 'success',
        targetEventId: event.id,
      },
    });

    await prisma.ignoredSignal.create({
      data: {
        id: 'ignored_test',
        workflowRunId: run.id,
        reason: 'Generic topic without concrete event.',
        sourceRefs: [{ platform: 'x', id: 'signal_test' }],
      },
    });

    expect(await prisma.workflowDefinition.count()).toBe(1);
    expect(await prisma.workflowRun.count()).toBe(1);
    expect(await prisma.event.count()).toBe(1);
    expect(await prisma.eventIntake.count()).toBe(1);
    expect(await prisma.eventSourceContext.count()).toBe(1);
    expect(await prisma.eventEvidence.count()).toBe(1);
    expect(await prisma.workflowCommandExecution.count()).toBe(1);
    expect(await prisma.ignoredSignal.count()).toBe(1);
  });
});
