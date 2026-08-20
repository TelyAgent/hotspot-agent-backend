import { WorkflowContentAssignmentDecider } from '../../src/content/content-assignment-decider';
import { WorkflowContentCandidateGenerator } from '../../src/content/content-candidate-generator';
import { WorkflowContentRiskPrechecker } from '../../src/content/content-risk-prechecker';
import { InMemoryWorkflowRepository } from '../../src/workflow/in-memory-workflow.repository';

describe('Content workflow adapters', () => {
  it('uses account-assignment workflow output as content assignment decisions', async () => {
    const loader = workflowLoader('account-assignment', '1.0.0');
    const model = {
      generateStructuredOutput: jest.fn().mockResolvedValue({
        schemaVersion: 'account_assignment_commands_v1',
        workflowId: 'account-assignment',
        workflowVersion: '1.0.0',
        runId: 'wrun_assignment',
        commands: [
          {
            type: 'create_content_task',
            idempotencyKey: 'content_assignment:event_1:account_persona',
            eventId: 'event_1',
            accountId: 'account_persona',
            skill: 'persona-skill',
            skillVersion: '1.0.0',
            assignmentReason: '角色定义与事件中的监管和市场影响匹配。',
            priority: 'high',
            source: {
              workflowRunId: 'wrun_assignment',
              triggerReason: 'TR-01',
            },
          },
          {
            type: 'observe_account',
            idempotencyKey: 'content_observe:event_1:account_observer',
            eventId: 'event_1',
            accountId: 'account_observer',
            reason: '相关性弱，先观察。',
          },
        ],
        diagnostics: [],
      }),
    };
    const workflowRepository = new InMemoryWorkflowRepository();
    const decider = new WorkflowContentAssignmentDecider(loader as never, model as never, workflowRepository);

    const result = await decider.decide({
      eventContextPack: eventContextPack(),
      accounts: [
        operationAccount('account_persona', 'Persona'),
        operationAccount('account_observer', 'Observer'),
      ],
    });

    expect(loader.load).toHaveBeenCalledWith('account-assignment', 'content/account-assignment');
    expect(model.generateStructuredOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: 'account-assignment',
        context: expect.objectContaining({
          schemaVersion: 'account_assignment_context_v1',
          eventContextPack: expect.objectContaining({ eventId: 'event_1' }),
        }),
      }),
    );
    expect(result).toEqual([
      {
        accountId: 'account_persona',
        decision: 'participate',
        reason: '角色定义与事件中的监管和市场影响匹配。',
        priority: 'high',
      },
      {
        accountId: 'account_observer',
        decision: 'observe',
        reason: '相关性弱，先观察。',
        priority: 'low',
      },
    ]);
    expect(workflowRepository.workflowDefinitions).toEqual([
      expect.objectContaining({
        workflowId: 'account-assignment',
        version: '1.0.0',
      }),
    ]);
    expect(workflowRepository.workflowRuns).toEqual([
      expect.objectContaining({
        workflowDefinitionId: expect.any(String),
        status: 'success',
        input: expect.objectContaining({ schemaVersion: 'account_assignment_context_v1' }),
        output: expect.objectContaining({ schemaVersion: 'account_assignment_commands_v1' }),
      }),
    ]);
  });

  it('uses account-task-candidate-generation workflow output as generated candidates', async () => {
    const loader = workflowLoader('account-task-candidate-generation', '1.0.0');
    const model = {
      generateStructuredOutput: jest.fn().mockResolvedValue({
        schemaVersion: 'account_task_candidate_output_v1',
        workflowId: 'account-task-candidate-generation',
        workflowVersion: '1.0.0',
        runId: 'wrun_generation',
        candidates: ['a', 'b', 'c'].map((key) => ({
          localKey: key,
          format: 'original_post',
          text: `候选 ${key}`,
          targetPostUrl: null,
          angle: `角度 ${key}`,
          factualClaims: ['Fed decision entered X trends.'],
          uncertaintyNotes: ['仍需限定表达。'],
          productBridge: 'none',
        })),
      }),
    };
    const workflowRepository = new InMemoryWorkflowRepository();
    const generator = new WorkflowContentCandidateGenerator(loader as never, model as never, workflowRepository);

    const result = await generator.generate({
      generationKind: 'initial',
      userInstruction: '短一点',
      task: {
        id: 'task_1',
        eventId: 'event_1',
        accountId: 'account_persona',
        status: 'ready_for_generation',
        skill: 'persona-skill',
        skillVersion: '1.0.0',
      },
      eventContextPack: eventContextPack(),
      account: operationAccount('account_persona', 'Persona'),
      existingCandidates: [],
    });

    expect(loader.load).toHaveBeenCalledWith(
      'account-task-candidate-generation',
      'content/account-task-candidate-generation',
    );
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual(
      expect.objectContaining({
        localKey: 'a',
        text: '候选 a',
        targetPostUrl: undefined,
      }),
    );
    expect(workflowRepository.workflowRuns).toEqual([
      expect.objectContaining({
        status: 'success',
        input: expect.objectContaining({ schemaVersion: 'account_task_generation_context_v1' }),
        output: expect.objectContaining({ schemaVersion: 'account_task_candidate_output_v1' }),
      }),
    ]);
  });

  it('uses risk-precheck workflow output as precheck result', async () => {
    const loader = workflowLoader('risk-precheck', '1.0.0');
    const model = {
      generateStructuredOutput: jest.fn().mockResolvedValue({
        schemaVersion: 'content_risk_precheck_output_v1',
        workflowId: 'risk-precheck',
        workflowVersion: '1.0.0',
        runId: 'wrun_precheck',
        riskStatus: 'medium',
        candidateStatus: 'warning',
        reasons: ['事件仍有未确认事实，发布时需要保留限定表达。'],
      }),
    };
    const workflowRepository = new InMemoryWorkflowRepository();
    const prechecker = new WorkflowContentRiskPrechecker(loader as never, model as never, workflowRepository);

    const result = await prechecker.precheck({
      candidate: {
        localKey: 'a',
        format: 'original_post',
        text: '候选文案',
        angle: '事实边界',
        factualClaims: ['Fed decision entered X trends.'],
        uncertaintyNotes: ['仍需限定表达。'],
        productBridge: 'none',
      },
      eventContextPack: eventContextPack(),
      account: operationAccount('account_persona', 'Persona'),
    });

    expect(loader.load).toHaveBeenCalledWith('risk-precheck', 'content/risk-precheck');
    expect(result).toEqual({
      riskStatus: 'medium',
      candidateStatus: 'warning',
      reasons: ['事件仍有未确认事实，发布时需要保留限定表达。'],
    });
    expect(workflowRepository.workflowRuns).toEqual([
      expect.objectContaining({
        status: 'success',
        input: expect.objectContaining({ schemaVersion: 'content_risk_precheck_context_v1' }),
        output: expect.objectContaining({ schemaVersion: 'content_risk_precheck_output_v1' }),
      }),
    ]);
  });

  it('records failed workflow runs before falling back to template generation', async () => {
    const loader = workflowLoader('account-task-candidate-generation', '1.0.0');
    const model = {
      generateStructuredOutput: jest.fn().mockResolvedValue({
        schemaVersion: 'account_task_candidate_output_v1',
        workflowId: 'account-task-candidate-generation',
        workflowVersion: '1.0.0',
        runId: 'wrun_generation',
        candidates: [],
      }),
    };
    const workflowRepository = new InMemoryWorkflowRepository();
    const generator = new WorkflowContentCandidateGenerator(loader as never, model as never, workflowRepository);

    const result = await generator.generate({
      generationKind: 'initial',
      task: {
        id: 'task_1',
        eventId: 'event_1',
        accountId: 'account_persona',
        status: 'ready_for_generation',
        skill: 'persona-skill',
        skillVersion: '1.0.0',
      },
      eventContextPack: eventContextPack(),
      account: operationAccount('account_persona', 'Persona'),
      existingCandidates: [],
    });

    expect(result).toHaveLength(3);
    expect(workflowRepository.workflowRuns).toEqual([
      expect.objectContaining({
        status: 'failed',
        error: expect.stringContaining('Invalid content generation workflow output'),
      }),
    ]);
  });
});

function workflowLoader(workflowId: string, version: string) {
  return {
    load: jest.fn().mockResolvedValue({
      definition: {
        id: `wdef_${workflowId}`,
        workflowId,
        version,
        name: workflowId,
        type: 'content_generation',
        status: 'enabled',
        markdownPath: `workflows/content/${workflowId}/WORKFLOW.md`,
        outputSchemaPath: `workflows/content/${workflowId}/output.schema.json`,
        checksum: `checksum_${workflowId}`,
        createdAt: '2026-08-20T00:00:00.000Z',
        updatedAt: '2026-08-20T00:00:00.000Z',
      },
      markdown: `# ${workflowId}`,
      outputSchema: { title: workflowId },
    }),
  };
}

function eventContextPack() {
  return {
    eventId: 'event_1',
    title: 'Fed rate decision moves markets',
    oneLineSummary: 'The Fed rate decision is trending on X.',
    status: 'responding',
    confirmationLevel: 'partially_supported',
    expressionBoundary: 'Treat market interpretation as developing.',
    confirmedFacts: ['The Fed decision is a live market topic.'],
    unconfirmedFacts: [],
    evidenceRecords: [{ sourceType: 'x_trend', claim: 'Fed decision entered X trends.' }],
    sourceContexts: [],
  };
}

function operationAccount(id: string, name: string) {
  return {
    id,
    key: id,
    name,
    enabled: true,
    fields: {
      type: '人设账号',
      skill: 'persona-skill',
      personaType: '公司、监管、政治、资金与利益后果',
    },
  };
}
