import { Test } from '@nestjs/testing';
import { PrismaService } from '../../src/prisma/prisma.service';
import { WorkflowGovernanceService } from '../../src/workflow/workflow-governance.service';
import { WorkflowOutputValidator } from '../../src/workflow/workflow-output-validator';
import { WORKFLOW_LOADER, WORKFLOW_MODEL_ADAPTER } from '../../src/workflow/workflow.tokens';

describe('WorkflowGovernanceService', () => {
  it('resolves WorkflowLoader from the workflow loader provider token', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        WorkflowGovernanceService,
        { provide: PrismaService, useValue: createPrismaDouble({ activeVersion: null, history: [] }) },
        { provide: WORKFLOW_LOADER, useValue: createLoaderDouble() },
        { provide: WORKFLOW_MODEL_ADAPTER, useValue: { generateStructuredOutput: jest.fn() } },
      ],
    }).compile();

    expect(moduleRef.get(WorkflowGovernanceService)).toBeInstanceOf(WorkflowGovernanceService);
  });

  it('returns system default, active version, and history for a workflow', async () => {
    const prisma = createPrismaDouble({
      activeVersion: workflowVersionRow({
        id: 'wv_active',
        workflowId: 'x-trend-event-formation',
        version: 'custom-1',
        source: 'ai_custom',
        status: 'active',
        markdown: '# Custom workflow',
      }),
      history: [
        workflowVersionRow({
          id: 'wv_active',
          workflowId: 'x-trend-event-formation',
          version: 'custom-1',
          source: 'ai_custom',
          status: 'active',
          markdown: '# Custom workflow',
        }),
      ],
    });
    const loader = createLoaderDouble();
    const service = new WorkflowGovernanceService(prisma as never, loader as never);

    const document = await service.getWorkflowDocument('x-trend-event-formation', 'event-formation');

    expect(document.workflowId).toBe('x-trend-event-formation');
    expect(document.activeVersion?.id).toBe('wv_active');
    expect(document.activeVersion?.markdown).toBe('# Custom workflow');
    expect(document.systemVersion.markdown).toBe('# System workflow');
    expect(document.history).toHaveLength(1);
    expect(loader.loadSystem).toHaveBeenCalledWith('x-trend-event-formation', 'event-formation');
    expect(prisma.workflowActiveVersion.findUnique).toHaveBeenCalledWith({
      where: { workflowId: 'x-trend-event-formation' },
      include: { version: true },
    });
  });

  it('falls back to the system default when there is no active version', async () => {
    const prisma = createPrismaDouble({ activeVersion: null, history: [] });
    const loader = createLoaderDouble();
    const service = new WorkflowGovernanceService(prisma as never, loader as never);

    const document = await service.getWorkflowDocument('x-trend-event-formation', 'event-formation');

    expect(document.activeVersion?.source).toBe('system');
    expect(document.activeVersion?.markdown).toBe('# System workflow');
    expect(document.activeVersion?.isDatabaseVersion).toBe(false);
  });

  it('resets workflow to a database active version copied from the system default', async () => {
    const prisma = createPrismaDouble({ activeVersion: null, history: [] });
    const loader = createLoaderDouble();
    const service = new WorkflowGovernanceService(prisma as never, loader as never);

    const result = await service.resetToSystemDefault('x-trend-event-formation', 'event-formation', {
      actor: 'operator',
      reason: '恢复系统默认',
    });

    expect(result.activeVersion.source).toBe('system');
    expect(result.activeVersion.status).toBe('active');
    expect(result.activeVersion.markdown).toBe('# System workflow');
    expect(prisma.workflowVersion.updateMany).toHaveBeenCalledWith({
      where: { workflowId: 'x-trend-event-formation', status: 'active' },
      data: { status: 'archived', archivedAt: expect.any(Date) },
    });
    expect(prisma.workflowVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workflowId: 'x-trend-event-formation',
        source: 'system',
        status: 'active',
        markdown: '# System workflow',
        changeSummary: '重置为系统默认工作流',
      }),
    });
    expect(prisma.workflowActiveVersion.upsert).toHaveBeenCalledWith({
      where: { workflowId: 'x-trend-event-formation' },
      update: expect.objectContaining({ activatedBy: 'operator', reason: '恢复系统默认' }),
      create: expect.objectContaining({ workflowId: 'x-trend-event-formation', activatedBy: 'operator' }),
    });
    expect(prisma.workflowAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workflowId: 'x-trend-event-formation',
        action: 'reset_to_system_default',
        actor: 'operator',
      }),
    });
  });

  it('creates an AI draft version from an operator instruction without activating it', async () => {
    const prisma = createPrismaDouble({ activeVersion: null, history: [] });
    const loader = createLoaderDouble();
    const model = {
      generateStructuredOutput: jest.fn().mockResolvedValue({
        markdown: '# Stricter workflow',
        changeSummary: '收紧泛娱乐事件形成条件',
        riskNotes: ['可能降低事件召回率'],
        compatibilityNotes: ['保留原输出 schema'],
      }),
    };
    const service = new WorkflowGovernanceService(prisma as never, loader as never, model as never);

    const result = await service.createAiDraft('x-trend-event-formation', 'event-formation', {
      instruction: '泛娱乐话题更严格一点',
      actor: 'operator',
    });

    expect(result.draftVersion.status).toBe('draft');
    expect(result.draftVersion.source).toBe('ai_custom');
    expect(result.draftVersion.markdown).toBe('# Stricter workflow');
    expect(model.generateStructuredOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: 'x-trend-event-formation-workflow-editor',
        workflowMarkdown: expect.stringContaining('你是热点运营平台的工作流修改代理'),
        context: expect.objectContaining({
          userInstruction: '泛娱乐话题更严格一点',
          activeMarkdown: '# System workflow',
        }),
      }),
    );
    expect(prisma.workflowVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workflowId: 'x-trend-event-formation',
        source: 'ai_custom',
        status: 'draft',
        markdown: '# Stricter workflow',
        changeSummary: '收紧泛娱乐事件形成条件',
        createdBy: 'operator',
      }),
    });
    expect(prisma.workflowActiveVersion.upsert).not.toHaveBeenCalled();
    expect(prisma.workflowAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workflowId: 'x-trend-event-formation',
        action: 'create_ai_draft',
        actor: 'operator',
      }),
    });
  });

  it('runs a short structure test for a draft workflow version', async () => {
    const validMarkdown = [
      '---',
      'id: x-trend-event-formation',
      'name: X 趋势事件形成',
      'type: event_formation',
      'version: draft-1',
      'status: enabled',
      '---',
      '# Workflow',
      '## 输入',
      '## 输出',
    ].join('\n')
    const prisma = createPrismaDouble({ activeVersion: null, history: [] });
    prisma.workflowVersion.findUnique.mockResolvedValue(
      workflowVersionRow({
        id: 'wv_draft',
        status: 'draft',
        markdown: validMarkdown,
      }),
    );
    prisma.workflowTestRun.create.mockResolvedValue({ id: 'wtr_1' });
    prisma.workflowTestRun.update.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'wtr_1',
        workflowVersionId: 'wv_draft',
        ...data,
        startedAt: new Date('2026-08-21T00:00:00.000Z'),
        finishedAt: data.finishedAt ?? null,
      }),
    );
    const service = new WorkflowGovernanceService(prisma as never, createLoaderDouble() as never);

    const result = await service.runShortTest('wv_draft', { actor: 'operator' });

    expect(result.status).toBe('passed');
    expect(prisma.workflowTestRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workflowVersionId: 'wv_draft',
        status: 'running',
        sampleSource: 'structure_only',
      }),
    });
    expect(prisma.workflowTestRun.update).toHaveBeenCalledWith({
      where: { id: 'wtr_1' },
      data: expect.objectContaining({
        status: 'passed',
        dryRunResult: expect.objectContaining({ checks: expect.arrayContaining(['frontmatter', 'input_section', 'output_section']) }),
      }),
    });
  });

  it('validates model output during a short test when a model adapter is available', async () => {
    const validMarkdown = [
      '---',
      'id: x-trend-event-formation',
      'name: X 趋势事件形成',
      'type: event_formation',
      'version: draft-1',
      'status: enabled',
      '---',
      '# Workflow',
      '## 输入',
      '## 输出',
    ].join('\n');
    const prisma = createPrismaDouble({ activeVersion: null, history: [] });
    prisma.workflowVersion.findUnique.mockResolvedValue(
      workflowVersionRow({
        id: 'wv_draft',
        workflowId: 'x-trend-event-formation',
        version: 'draft-1',
        status: 'draft',
        markdown: validMarkdown,
      }),
    );
    prisma.workflowTestRun.create.mockResolvedValue({ id: 'wtr_1' });
    prisma.workflowTestRun.update.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'wtr_1',
        workflowVersionId: 'wv_draft',
        ...data,
        startedAt: new Date('2026-08-21T00:00:00.000Z'),
        finishedAt: data.finishedAt ?? null,
      }),
    );
    const model = {
      generateStructuredOutput: jest.fn().mockResolvedValue({
        schemaVersion: 'event_workflow_commands_v1',
        workflowId: 'x-trend-event-formation',
        workflowVersion: 'draft-1',
        runId: 'wrun_short_test',
        commands: [],
      }),
    };
    const service = new WorkflowGovernanceService(
      prisma as never,
      createLoaderDouble() as never,
      model as never,
      new WorkflowOutputValidator(),
    );

    const result = await service.runShortTest('wv_draft', { actor: 'operator' });

    expect(result.status).toBe('passed');
    expect(model.generateStructuredOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: 'x-trend-event-formation',
        workflowVersion: 'draft-1',
        workflowMarkdown: validMarkdown,
        context: expect.objectContaining({
          schemaVersion: 'x_trend_event_context_v1',
          workflowRunId: 'wrun_short_test',
        }),
      }),
    );
    expect(prisma.workflowTestRun.update).toHaveBeenCalledWith({
      where: { id: 'wtr_1' },
      data: expect.objectContaining({
        status: 'passed',
        dryRunResult: expect.objectContaining({
          checks: expect.arrayContaining(['model_output_schema', 'command_dry_run']),
        }),
      }),
    });
  });

  it('marks short test failed when model output does not match workflow command schema', async () => {
    const validMarkdown = [
      '---',
      'id: x-trend-event-formation',
      'name: X 趋势事件形成',
      'type: event_formation',
      'version: draft-1',
      'status: enabled',
      '---',
      '# Workflow',
      '## 输入',
      '## 输出',
    ].join('\n');
    const prisma = createPrismaDouble({ activeVersion: null, history: [] });
    prisma.workflowVersion.findUnique.mockResolvedValue(
      workflowVersionRow({
        id: 'wv_draft',
        workflowId: 'x-trend-event-formation',
        version: 'draft-1',
        status: 'draft',
        markdown: validMarkdown,
      }),
    );
    prisma.workflowTestRun.create.mockResolvedValue({ id: 'wtr_1' });
    prisma.workflowTestRun.update.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'wtr_1',
        workflowVersionId: 'wv_draft',
        ...data,
        startedAt: new Date('2026-08-21T00:00:00.000Z'),
        finishedAt: data.finishedAt ?? null,
      }),
    );
    const model = {
      generateStructuredOutput: jest.fn().mockResolvedValue({ invalid: true }),
    };
    const service = new WorkflowGovernanceService(
      prisma as never,
      createLoaderDouble() as never,
      model as never,
      new WorkflowOutputValidator(),
    );

    const result = await service.runShortTest('wv_draft', { actor: 'operator' });

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toContain('Invalid workflow output');
    expect(prisma.workflowTestRun.update).toHaveBeenCalledWith({
      where: { id: 'wtr_1' },
      data: expect.objectContaining({
        status: 'failed',
        errorMessage: expect.stringContaining('Invalid workflow output'),
      }),
    });
  });

  it('creates an AI repair draft from a failed workflow test result', async () => {
    const prisma = createPrismaDouble({ activeVersion: null, history: [] });
    prisma.workflowVersion.findUnique.mockResolvedValue(
      workflowVersionRow({
        id: 'wv_failed',
        version: 'draft-failed',
        status: 'test_failed',
        markdown: '# Broken workflow',
      }),
    );
    prisma.workflowTestRun.findFirst.mockResolvedValue({
      id: 'wtr_failed',
      status: 'failed',
      errorMessage: '缺少输出章节',
      dryRunResult: { checks: ['frontmatter'], errors: ['缺少输出章节'] },
      startedAt: new Date('2026-08-21T00:00:00.000Z'),
    });
    const model = {
      generateStructuredOutput: jest.fn().mockResolvedValue({
        markdown: '# Fixed workflow\n## 输入\n## 输出',
        changeSummary: '补充输出章节',
        riskNotes: [],
        compatibilityNotes: ['保留原命令结构'],
      }),
    };
    const service = new WorkflowGovernanceService(prisma as never, createLoaderDouble() as never, model as never);

    const result = await service.repairAiDraft('wv_failed', { actor: 'operator' });

    expect(result.draftVersion.status).toBe('draft');
    expect(result.draftVersion.markdown).toBe('# Fixed workflow\n## 输入\n## 输出');
    expect(model.generateStructuredOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: 'x-trend-event-formation-workflow-repair',
        context: expect.objectContaining({
          failedMarkdown: '# Broken workflow',
          failureMessage: '缺少输出章节',
        }),
      }),
    );
    expect(prisma.workflowVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workflowId: 'x-trend-event-formation',
        source: 'ai_custom',
        status: 'draft',
        markdown: '# Fixed workflow\n## 输入\n## 输出',
        baseVersionId: 'wv_failed',
      }),
    });
  });

  it('returns a line diff between two workflow versions', async () => {
    const prisma = createPrismaDouble({ activeVersion: null, history: [] });
    prisma.workflowVersion.findUnique
      .mockResolvedValueOnce(
        workflowVersionRow({
          id: 'wv_base',
          markdown: ['# Workflow', 'old rule', 'same line'].join('\n'),
        }),
      )
      .mockResolvedValueOnce(
        workflowVersionRow({
          id: 'wv_next',
          markdown: ['# Workflow', 'new rule', 'same line'].join('\n'),
        }),
      );
    const service = new WorkflowGovernanceService(prisma as never, createLoaderDouble() as never);

    const result = await service.getVersionDiff('wv_base', 'wv_next');

    expect(result.baseVersionId).toBe('wv_base');
    expect(result.compareVersionId).toBe('wv_next');
    expect(result.summary).toEqual({ added: 1, removed: 1, unchanged: 2 });
    expect(result.lines).toEqual([
      { type: 'unchanged', text: '# Workflow' },
      { type: 'removed', text: 'old rule' },
      { type: 'added', text: 'new rule' },
      { type: 'unchanged', text: 'same line' },
    ]);
  });

  it('lists workflow audit logs', async () => {
    const prisma = createPrismaDouble({ activeVersion: null, history: [] });
    prisma.workflowAuditLog.findMany.mockResolvedValue([
      {
        id: 'wal_1',
        workflowId: 'x-trend-event-formation',
        versionId: 'wv_1',
        action: 'activate_version',
        actor: 'operator',
        summary: '启用工作流版本',
        payload: { latestTestRunId: 'wtr_1' },
        createdAt: new Date('2026-08-21T00:00:00.000Z'),
      },
    ]);
    const service = new WorkflowGovernanceService(prisma as never, createLoaderDouble() as never);

    const logs = await service.listAuditLogs('x-trend-event-formation');

    expect(logs).toEqual([
      {
        id: 'wal_1',
        workflowId: 'x-trend-event-formation',
        versionId: 'wv_1',
        action: 'activate_version',
        actor: 'operator',
        summary: '启用工作流版本',
        payload: { latestTestRunId: 'wtr_1' },
        createdAt: '2026-08-21T00:00:00.000Z',
      },
    ]);
    expect(prisma.workflowAuditLog.findMany).toHaveBeenCalledWith({
      where: { workflowId: 'x-trend-event-formation' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  });

  it('activates a workflow version after a passed short test', async () => {
    const prisma = createPrismaDouble({ activeVersion: null, history: [] });
    prisma.workflowVersion.findUnique.mockResolvedValue(
      workflowVersionRow({
        id: 'wv_draft',
        status: 'draft',
        source: 'ai_custom',
        version: 'draft-1',
      }),
    );
    prisma.workflowTestRun.findFirst.mockResolvedValue({
      id: 'wtr_passed',
      status: 'passed',
      startedAt: new Date('2026-08-21T00:00:00.000Z'),
    });
    prisma.workflowVersion.update.mockImplementation(({ data }) =>
      Promise.resolve(
        workflowVersionRow({
          id: 'wv_draft',
          status: data.status,
          activatedAt: data.activatedAt,
        }),
      ),
    );
    const service = new WorkflowGovernanceService(prisma as never, createLoaderDouble() as never);

    const result = await service.activateVersion('wv_draft', {
      actor: 'operator',
      reason: '短流程测试通过后启用',
    });

    expect(result.activeVersion.id).toBe('wv_draft');
    expect(result.activeVersion.status).toBe('active');
    expect(prisma.workflowVersion.updateMany).toHaveBeenCalledWith({
      where: { workflowId: 'x-trend-event-formation', status: 'active', id: { not: 'wv_draft' } },
      data: { status: 'archived', archivedAt: expect.any(Date) },
    });
    expect(prisma.workflowVersion.update).toHaveBeenCalledWith({
      where: { id: 'wv_draft' },
      data: { status: 'active', activatedAt: expect.any(Date), archivedAt: null },
    });
    expect(prisma.workflowActiveVersion.upsert).toHaveBeenCalledWith({
      where: { workflowId: 'x-trend-event-formation' },
      update: expect.objectContaining({ versionId: 'wv_draft', activatedBy: 'operator' }),
      create: expect.objectContaining({ workflowId: 'x-trend-event-formation', versionId: 'wv_draft' }),
    });
    expect(prisma.workflowAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workflowId: 'x-trend-event-formation',
        versionId: 'wv_draft',
        action: 'activate_version',
        actor: 'operator',
      }),
    });
  });

  it('rejects activation when the latest short test did not pass', async () => {
    const prisma = createPrismaDouble({ activeVersion: null, history: [] });
    prisma.workflowVersion.findUnique.mockResolvedValue(workflowVersionRow({ id: 'wv_draft', status: 'draft' }));
    prisma.workflowTestRun.findFirst.mockResolvedValue({
      id: 'wtr_failed',
      status: 'failed',
      startedAt: new Date('2026-08-21T00:00:00.000Z'),
    });
    const service = new WorkflowGovernanceService(prisma as never, createLoaderDouble() as never);

    await expect(service.activateVersion('wv_draft', { actor: 'operator' })).rejects.toThrow(
      '工作流版本必须先通过短流程测试才能启用',
    );
    expect(prisma.workflowActiveVersion.upsert).not.toHaveBeenCalled();
  });
});

function createLoaderDouble() {
  return {
    loadSystem: jest.fn().mockResolvedValue({
      definition: {
        workflowId: 'x-trend-event-formation',
        name: 'X 趋势事件形成',
        type: 'event_formation',
        version: '1.0.0',
        status: 'enabled',
        checksum: 'checksum_system',
      },
      markdown: '# System workflow',
      outputSchema: { title: 'EventWorkflowCommandsV1' },
    }),
  };
}

function createPrismaDouble(input: { activeVersion: unknown; history: unknown[] }) {
  const prisma = {
    workflowActiveVersion: {
      findUnique: jest.fn().mockResolvedValue(input.activeVersion ? { version: input.activeVersion } : null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    workflowVersion: {
      findMany: jest.fn().mockResolvedValue(input.history),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn(),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...data, id: 'wv_reset' })),
    },
    workflowTestRun: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
    workflowAuditLog: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation(async (callback) => callback(prisma)),
  };
  return prisma;
}

function workflowVersionRow(overrides: Record<string, unknown>) {
  return {
    id: 'wv_1',
    workflowId: 'x-trend-event-formation',
    version: '1.0.0',
    source: 'system',
    status: 'active',
    title: 'X 趋势事件形成',
    markdown: '# Workflow',
    changeSummary: '初始化',
    riskNotes: [],
    baseVersionId: null,
    createdBy: 'system',
    createdAt: new Date('2026-08-21T00:00:00.000Z'),
    activatedAt: new Date('2026-08-21T00:00:00.000Z'),
    archivedAt: null,
    ...overrides,
  };
}
