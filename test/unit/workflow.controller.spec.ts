import { WorkflowController } from '../../src/workflow/workflow.controller';

describe('WorkflowController', () => {
  it('returns the X trend event formation workflow document', async () => {
    const workflowRunner = {};
    const workflowLoader = {
      load: jest.fn().mockResolvedValue({
        definition: {
          workflowId: 'x-trend-event-formation',
          version: '1.0.0',
        },
        markdown: '# X trend workflow',
      }),
    };
    const collectionRepository = {};
    const workflowGovernance = {
      getWorkflowDocument: jest.fn(),
      resetToSystemDefault: jest.fn(),
      listVersions: jest.fn(),
    };
    const controller = new WorkflowController(
      workflowRunner as never,
      workflowLoader as never,
      collectionRepository as never,
      workflowGovernance as never,
    );

    await expect(controller.getXTrendEventFormationDocument()).resolves.toEqual({
      definition: {
        workflowId: 'x-trend-event-formation',
        version: '1.0.0',
      },
      markdown: '# X trend workflow',
    });
    expect(workflowLoader.load).toHaveBeenCalledWith('x-trend-event-formation', 'event-formation');
  });

  it('returns governed workflow document for a workflow id', async () => {
    const workflowRunner = {};
    const workflowLoader = {};
    const collectionRepository = {};
    const workflowGovernance = {
      getWorkflowDocument: jest.fn().mockResolvedValue({
        workflowId: 'x-trend-event-formation',
        activeVersion: { markdown: '# Active' },
        systemVersion: { markdown: '# System' },
        history: [],
      }),
      resetToSystemDefault: jest.fn(),
      listVersions: jest.fn(),
    };
    const controller = new WorkflowController(
      workflowRunner as never,
      workflowLoader as never,
      collectionRepository as never,
      workflowGovernance as never,
    );

    await expect(controller.getWorkflowDocument('x-trend-event-formation')).resolves.toEqual({
      workflowId: 'x-trend-event-formation',
      activeVersion: { markdown: '# Active' },
      systemVersion: { markdown: '# System' },
      history: [],
    });
    expect(workflowGovernance.getWorkflowDocument).toHaveBeenCalledWith(
      'x-trend-event-formation',
      'event-formation',
    );
  });

  it('uses the topic-circle workflow folder for topic event formation', async () => {
    const workflowGovernance = {
      getWorkflowDocument: jest.fn().mockResolvedValue({
        workflowId: 'event-formation',
        activeVersion: { markdown: '# Topic active' },
        systemVersion: { markdown: '# Topic system' },
        history: [],
      }),
    };
    const controller = new WorkflowController({} as never, {} as never, {} as never, workflowGovernance as never);

    await expect(controller.getWorkflowDocument('event-formation')).resolves.toEqual({
      workflowId: 'event-formation',
      activeVersion: { markdown: '# Topic active' },
      systemVersion: { markdown: '# Topic system' },
      history: [],
    });
    expect(workflowGovernance.getWorkflowDocument).toHaveBeenCalledWith('event-formation', 'topic-circle');
  });

  it('creates an AI draft workflow version', async () => {
    const workflowRunner = {};
    const workflowLoader = {};
    const collectionRepository = {};
    const workflowGovernance = {
      getWorkflowDocument: jest.fn(),
      resetToSystemDefault: jest.fn(),
      listVersions: jest.fn(),
      createAiDraft: jest.fn().mockResolvedValue({
        draftVersion: { id: 'wv_draft', status: 'draft' },
      }),
    };
    const controller = new WorkflowController(
      workflowRunner as never,
      workflowLoader as never,
      collectionRepository as never,
      workflowGovernance as never,
    );

    await expect(
      controller.createWorkflowDraft('x-trend-event-formation', {
        instruction: '泛娱乐更严格',
      }),
    ).resolves.toEqual({
      draftVersion: { id: 'wv_draft', status: 'draft' },
    });
    expect(workflowGovernance.createAiDraft).toHaveBeenCalledWith(
      'x-trend-event-formation',
      'event-formation',
      {
        instruction: '泛娱乐更严格',
        actor: 'operator',
      },
    );
  });

  it('activates a workflow version', async () => {
    const workflowGovernance = {
      getWorkflowDocument: jest.fn(),
      resetToSystemDefault: jest.fn(),
      listVersions: jest.fn(),
      activateVersion: jest.fn().mockResolvedValue({
        activeVersion: { id: 'wv_active', status: 'active' },
      }),
    };
    const controller = new WorkflowController({} as never, {} as never, {} as never, workflowGovernance as never);

    await expect(controller.activateWorkflowVersion('wv_active')).resolves.toEqual({
      activeVersion: { id: 'wv_active', status: 'active' },
    });
    expect(workflowGovernance.activateVersion).toHaveBeenCalledWith('wv_active', {
      actor: 'operator',
      reason: '短流程测试通过后启用',
    });
  });

  it('returns workflow audit logs', async () => {
    const workflowGovernance = {
      listAuditLogs: jest.fn().mockResolvedValue([{ id: 'wal_1', action: 'activate_version' }]),
    };
    const controller = new WorkflowController({} as never, {} as never, {} as never, workflowGovernance as never);

    await expect(controller.listWorkflowAuditLogs('x-trend-event-formation')).resolves.toEqual({
      workflowId: 'x-trend-event-formation',
      logs: [{ id: 'wal_1', action: 'activate_version' }],
    });
    expect(workflowGovernance.listAuditLogs).toHaveBeenCalledWith('x-trend-event-formation');
  });

  it('returns workflow version diff against a base version', async () => {
    const workflowGovernance = {
      getVersionDiff: jest.fn().mockResolvedValue({
        baseVersionId: 'wv_base',
        compareVersionId: 'wv_next',
        lines: [],
      }),
    };
    const controller = new WorkflowController({} as never, {} as never, {} as never, workflowGovernance as never);

    await expect(controller.getWorkflowVersionDiff('wv_next', 'wv_base')).resolves.toEqual({
      baseVersionId: 'wv_base',
      compareVersionId: 'wv_next',
      lines: [],
    });
    expect(workflowGovernance.getVersionDiff).toHaveBeenCalledWith('wv_base', 'wv_next');
  });
});
