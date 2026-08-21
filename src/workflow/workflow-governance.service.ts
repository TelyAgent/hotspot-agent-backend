import { Inject, Injectable, Optional } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoadedWorkflow, WorkflowLoader } from './workflow-loader';
import { WorkflowModelAdapter } from './workflow-model.adapter';
import { WorkflowOutputValidator } from './workflow-output-validator';
import { WORKFLOW_LOADER, WORKFLOW_MODEL_ADAPTER } from './workflow.tokens';

export interface WorkflowVersionView {
  id: string;
  workflowId: string;
  version: string;
  source: string;
  status: string;
  title: string;
  markdown: string;
  changeSummary?: string;
  riskNotes: unknown[];
  baseVersionId?: string;
  createdBy: string;
  createdAt: string;
  activatedAt?: string;
  archivedAt?: string;
  isDatabaseVersion: boolean;
}

export interface WorkflowDocumentView {
  workflowId: string;
  activeVersion: WorkflowVersionView;
  systemVersion: WorkflowVersionView;
  history: WorkflowVersionView[];
}

export interface WorkflowAuditLogView {
  id: string;
  workflowId: string;
  versionId?: string;
  action: string;
  actor: string;
  summary?: string;
  payload: unknown;
  createdAt: string;
}

@Injectable()
export class WorkflowGovernanceService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(WORKFLOW_LOADER)
    private readonly workflowLoader: WorkflowLoader,
    @Optional()
    @Inject(WORKFLOW_MODEL_ADAPTER)
    private readonly modelAdapter?: WorkflowModelAdapter,
    @Optional()
    private readonly outputValidator?: WorkflowOutputValidator,
  ) {}

  async getWorkflowDocument(workflowId: string, groupPath = 'event-formation'): Promise<WorkflowDocumentView> {
    const [systemWorkflow, active, history] = await Promise.all([
      this.workflowLoader.loadSystem(workflowId, groupPath),
      this.prisma.workflowActiveVersion.findUnique({
        where: { workflowId },
        include: { version: true },
      }),
      this.prisma.workflowVersion.findMany({
        where: { workflowId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    const systemVersion = this.toSystemVersion(systemWorkflow);

    return {
      workflowId,
      activeVersion: active?.version ? this.toVersionView(active.version) : systemVersion,
      systemVersion,
      history: history.map((version) => this.toVersionView(version)),
    };
  }

  async listVersions(workflowId: string): Promise<WorkflowVersionView[]> {
    const versions = await this.prisma.workflowVersion.findMany({
      where: { workflowId },
      orderBy: { createdAt: 'desc' },
    });
    return versions.map((version) => this.toVersionView(version));
  }

  async listAuditLogs(workflowId: string): Promise<WorkflowAuditLogView[]> {
    const logs = await this.prisma.workflowAuditLog.findMany({
      where: { workflowId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return logs.map((log) => ({
      id: log.id,
      workflowId: log.workflowId,
      versionId: log.versionId ?? undefined,
      action: log.action,
      actor: log.actor,
      summary: log.summary ?? undefined,
      payload: log.payload,
      createdAt: log.createdAt.toISOString(),
    }));
  }

  async getVersionDiff(baseVersionId: string, compareVersionId: string) {
    const [base, compare] = await Promise.all([
      this.prisma.workflowVersion.findUnique({ where: { id: baseVersionId } }),
      this.prisma.workflowVersion.findUnique({ where: { id: compareVersionId } }),
    ]);
    if (!base) {
      throw new Error(`工作流版本不存在: ${baseVersionId}`);
    }
    if (!compare) {
      throw new Error(`工作流版本不存在: ${compareVersionId}`);
    }
    const lines = this.diffLines(base.markdown, compare.markdown);
    return {
      baseVersionId,
      compareVersionId,
      summary: {
        added: lines.filter((line) => line.type === 'added').length,
        removed: lines.filter((line) => line.type === 'removed').length,
        unchanged: lines.filter((line) => line.type === 'unchanged').length,
      },
      lines,
    };
  }

  async loadExecutableWorkflow(workflowId: string, groupPath = 'event-formation'): Promise<LoadedWorkflow> {
    const systemWorkflow = await this.workflowLoader.loadSystem(workflowId, groupPath);
    const active = await this.prisma.workflowActiveVersion.findUnique({
      where: { workflowId },
      include: { version: true },
    });
    if (!active?.version) {
      return systemWorkflow;
    }

    return {
      ...systemWorkflow,
      markdown: active.version.markdown,
      definition: {
        ...systemWorkflow.definition,
        version: active.version.version,
        checksum: createHash('sha256')
          .update(active.version.markdown)
          .update(JSON.stringify(systemWorkflow.outputSchema))
          .digest('hex'),
        updatedAt: active.version.createdAt.toISOString(),
      },
    };
  }

  async resetToSystemDefault(
    workflowId: string,
    groupPath = 'event-formation',
    options: { actor?: string; reason?: string } = {},
  ) {
    const systemWorkflow = await this.workflowLoader.loadSystem(workflowId, groupPath);
    const now = new Date();
    const actor = options.actor ?? 'system';
    const reason = options.reason ?? '重置为系统默认';
    const versionId = `wv_${randomUUID()}`;
    const version = await this.prisma.$transaction(async (tx) => {
      await tx.workflowVersion.updateMany({
        where: { workflowId, status: 'active' },
        data: { status: 'archived', archivedAt: now },
      });
      const created = await tx.workflowVersion.create({
        data: {
          id: versionId,
          workflowId,
          version: `system-${now.getTime()}`,
          source: 'system',
          status: 'active',
          title: systemWorkflow.definition.name,
          markdown: systemWorkflow.markdown,
          changeSummary: '重置为系统默认工作流',
          riskNotes: [],
          createdBy: actor,
          createdAt: now,
          activatedAt: now,
        },
      });
      await tx.workflowActiveVersion.upsert({
        where: { workflowId },
        update: {
          versionId: created.id,
          activatedBy: actor,
          activatedAt: now,
          reason,
        },
        create: {
          workflowId,
          versionId: created.id,
          activatedBy: actor,
          activatedAt: now,
          reason,
        },
      });
      await tx.workflowAuditLog.create({
        data: {
          id: `wal_${randomUUID()}`,
          workflowId,
          versionId: created.id,
          action: 'reset_to_system_default',
          actor,
          summary: reason,
          payload: { sourceChecksum: systemWorkflow.definition.checksum } as Prisma.InputJsonValue,
          createdAt: now,
        },
      });
      return created;
    });

    return { activeVersion: this.toVersionView(version) };
  }

  async createAiDraft(
    workflowId: string,
    groupPath = 'event-formation',
    input: { instruction: string; actor?: string },
  ) {
    if (!this.modelAdapter) {
      throw new Error('工作流修改模型未配置');
    }
    const instruction = input.instruction.trim();
    if (!instruction) {
      throw new Error('修改要求不能为空');
    }

    const document = await this.getWorkflowDocument(workflowId, groupPath);
    const output = this.parseDraftOutput(
      await this.modelAdapter.generateStructuredOutput({
        workflowId: `${workflowId}-workflow-editor`,
        workflowVersion: document.activeVersion.version,
        workflowMarkdown: this.workflowEditorPrompt(),
        outputSchema: WORKFLOW_DRAFT_SCHEMA,
        context: {
          workflowId,
          groupPath,
          userInstruction: instruction,
          activeMarkdown: document.activeVersion.markdown,
          systemMarkdown: document.systemVersion.markdown,
          outputContract:
            '返回完整 WORKFLOW.md，不要只返回片段；不得修改后端不存在的 command 名称、必填字段或风险边界。',
        },
      }),
    );

    const now = new Date();
    const actor = input.actor ?? 'operator';
    const version = await this.prisma.workflowVersion.create({
      data: {
        id: `wv_${randomUUID()}`,
        workflowId,
        version: `draft-${now.getTime()}`,
        source: 'ai_custom',
        status: 'draft',
        title: document.activeVersion.title,
        markdown: output.markdown,
        changeSummary: output.changeSummary,
        riskNotes: output.riskNotes as Prisma.InputJsonValue,
        baseVersionId: document.activeVersion.isDatabaseVersion ? document.activeVersion.id : undefined,
        createdBy: actor,
        createdAt: now,
      },
    });
    await this.prisma.workflowAuditLog.create({
      data: {
        id: `wal_${randomUUID()}`,
        workflowId,
        versionId: version.id,
        action: 'create_ai_draft',
        actor,
        summary: output.changeSummary,
        payload: {
          instruction,
          riskNotes: output.riskNotes,
          compatibilityNotes: output.compatibilityNotes,
        } as Prisma.InputJsonValue,
        createdAt: now,
      },
    });

    return { draftVersion: this.toVersionView(version) };
  }

  async runShortTest(versionId: string, options: { actor?: string } = {}) {
    const version = await this.prisma.workflowVersion.findUnique({ where: { id: versionId } });
    if (!version) {
      throw new Error(`工作流版本不存在: ${versionId}`);
    }

    const now = new Date();
    const testRun = await this.prisma.workflowTestRun.create({
      data: {
        id: `wtr_${randomUUID()}`,
        workflowVersionId: versionId,
        status: 'running',
        sampleSource: 'structure_only',
        inputSummary: { workflowId: version.workflowId, version: version.version } as Prisma.InputJsonValue,
        startedAt: now,
      },
    });

    const result = this.validateWorkflowMarkdown(version.markdown);
    if (result.ok && this.modelAdapter) {
      try {
        const loadedSystemWorkflow = await this.workflowLoader.loadSystem(
          version.workflowId,
          this.resolveWorkflowGroupPath(version.workflowId),
        );
        const modelOutput = await this.modelAdapter.generateStructuredOutput({
          workflowId: version.workflowId,
          workflowVersion: version.version,
          workflowMarkdown: version.markdown,
          outputSchema: loadedSystemWorkflow.outputSchema,
          context: this.createShortTestContext(),
        });
        const validatedOutput = (this.outputValidator ?? new WorkflowOutputValidator()).validate(modelOutput);
        result.checks.push('model_output_schema', 'command_dry_run');
        result.modelOutputSummary = {
          commandCount: validatedOutput.commands.length,
          commandTypes: validatedOutput.commands.map((command) => command.type),
        };
      } catch (error) {
        result.errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    const finishedAt = new Date();
    const passed = result.errors.length === 0;
    const saved = await this.prisma.workflowTestRun.update({
      where: { id: testRun.id },
      data: {
        status: passed ? 'passed' : 'failed',
        errorMessage: passed ? undefined : result.errors.join('；'),
        modelOutputSummary: result.modelOutputSummary as Prisma.InputJsonValue | undefined,
        dryRunResult: {
          checks: result.checks,
          errors: result.errors,
        } as Prisma.InputJsonValue,
        finishedAt,
      },
    });
    await this.prisma.workflowAuditLog.create({
      data: {
        id: `wal_${randomUUID()}`,
        workflowId: version.workflowId,
        versionId,
        action: 'run_short_test',
        actor: options.actor ?? 'operator',
        summary: result.ok ? '短流程结构测试通过' : '短流程结构测试失败',
        payload: {
          status: saved.status,
          errors: result.errors,
        } as Prisma.InputJsonValue,
        createdAt: finishedAt,
      },
    });

    return {
      id: saved.id,
      workflowVersionId: versionId,
      status: saved.status,
      errorMessage: saved.errorMessage ?? undefined,
      dryRunResult: saved.dryRunResult,
      startedAt: saved.startedAt.toISOString(),
      finishedAt: saved.finishedAt?.toISOString(),
    };
  }

  async activateVersion(versionId: string, options: { actor?: string; reason?: string } = {}) {
    const version = await this.prisma.workflowVersion.findUnique({ where: { id: versionId } });
    if (!version) {
      throw new Error(`工作流版本不存在: ${versionId}`);
    }
    const latestTest = await this.prisma.workflowTestRun.findFirst({
      where: { workflowVersionId: versionId },
      orderBy: { startedAt: 'desc' },
    });
    if (latestTest?.status !== 'passed') {
      throw new Error('工作流版本必须先通过短流程测试才能启用');
    }

    const now = new Date();
    const actor = options.actor ?? 'operator';
    const reason = options.reason ?? '启用工作流版本';
    const activeVersion = await this.prisma.$transaction(async (tx) => {
      await tx.workflowVersion.updateMany({
        where: { workflowId: version.workflowId, status: 'active', id: { not: versionId } },
        data: { status: 'archived', archivedAt: now },
      });
      const activated = await tx.workflowVersion.update({
        where: { id: versionId },
        data: { status: 'active', activatedAt: now, archivedAt: null },
      });
      await tx.workflowActiveVersion.upsert({
        where: { workflowId: version.workflowId },
        update: {
          versionId,
          activatedBy: actor,
          activatedAt: now,
          reason,
        },
        create: {
          workflowId: version.workflowId,
          versionId,
          activatedBy: actor,
          activatedAt: now,
          reason,
        },
      });
      await tx.workflowAuditLog.create({
        data: {
          id: `wal_${randomUUID()}`,
          workflowId: version.workflowId,
          versionId,
          action: 'activate_version',
          actor,
          summary: reason,
          payload: { latestTestRunId: latestTest.id } as Prisma.InputJsonValue,
          createdAt: now,
        },
      });
      return activated;
    });

    return { activeVersion: this.toVersionView(activeVersion) };
  }

  async repairAiDraft(versionId: string, options: { actor?: string } = {}) {
    if (!this.modelAdapter) {
      throw new Error('工作流修改模型未配置');
    }
    const version = await this.prisma.workflowVersion.findUnique({ where: { id: versionId } });
    if (!version) {
      throw new Error(`工作流版本不存在: ${versionId}`);
    }
    const failedTest = await this.prisma.workflowTestRun.findFirst({
      where: { workflowVersionId: versionId, status: 'failed' },
      orderBy: { startedAt: 'desc' },
    });
    if (!failedTest) {
      throw new Error('没有可用于修复的失败测试结果');
    }

    const output = this.parseDraftOutput(
      await this.modelAdapter.generateStructuredOutput({
        workflowId: `${version.workflowId}-workflow-repair`,
        workflowVersion: version.version,
        workflowMarkdown: this.workflowEditorPrompt(),
        outputSchema: WORKFLOW_DRAFT_SCHEMA,
        context: {
          workflowId: version.workflowId,
          failedMarkdown: version.markdown,
          failureMessage: failedTest.errorMessage ?? '短流程测试失败',
          dryRunResult: failedTest.dryRunResult,
          repairInstruction: '请根据失败原因修复 WORKFLOW.md，并返回完整 Markdown。不要改变后端 command schema。',
        },
      }),
    );

    const now = new Date();
    const actor = options.actor ?? 'operator';
    const draft = await this.prisma.workflowVersion.create({
      data: {
        id: `wv_${randomUUID()}`,
        workflowId: version.workflowId,
        version: `repair-${now.getTime()}`,
        source: 'ai_custom',
        status: 'draft',
        title: version.title,
        markdown: output.markdown,
        changeSummary: output.changeSummary,
        riskNotes: output.riskNotes as Prisma.InputJsonValue,
        baseVersionId: versionId,
        createdBy: actor,
        createdAt: now,
      },
    });
    await this.prisma.workflowAuditLog.create({
      data: {
        id: `wal_${randomUUID()}`,
        workflowId: version.workflowId,
        versionId: draft.id,
        action: 'repair_ai_draft',
        actor,
        summary: output.changeSummary,
        payload: {
          failedVersionId: versionId,
          failedTestRunId: failedTest.id,
          failureMessage: failedTest.errorMessage,
          compatibilityNotes: output.compatibilityNotes,
        } as Prisma.InputJsonValue,
        createdAt: now,
      },
    });

    return { draftVersion: this.toVersionView(draft) };
  }

  private toSystemVersion(workflow: LoadedWorkflow): WorkflowVersionView {
    return {
      id: `system:${workflow.definition.workflowId}:${workflow.definition.version}`,
      workflowId: workflow.definition.workflowId,
      version: workflow.definition.version,
      source: 'system',
      status: 'active',
      title: workflow.definition.name,
      markdown: workflow.markdown,
      changeSummary: '系统预置工作流',
      riskNotes: [],
      createdBy: 'system',
      createdAt: workflow.definition.createdAt,
      activatedAt: undefined,
      archivedAt: undefined,
      isDatabaseVersion: false,
    };
  }

  private toVersionView(version: {
    id: string;
    workflowId: string;
    version: string;
    source: string;
    status: string;
    title: string;
    markdown: string;
    changeSummary: string | null;
    riskNotes: Prisma.JsonValue | null;
    baseVersionId: string | null;
    createdBy: string;
    createdAt: Date;
    activatedAt: Date | null;
    archivedAt: Date | null;
  }): WorkflowVersionView {
    return {
      id: version.id,
      workflowId: version.workflowId,
      version: version.version,
      source: version.source,
      status: version.status,
      title: version.title,
      markdown: version.markdown,
      changeSummary: version.changeSummary ?? undefined,
      riskNotes: Array.isArray(version.riskNotes) ? version.riskNotes : [],
      baseVersionId: version.baseVersionId ?? undefined,
      createdBy: version.createdBy,
      createdAt: version.createdAt.toISOString(),
      activatedAt: version.activatedAt?.toISOString(),
      archivedAt: version.archivedAt?.toISOString(),
      isDatabaseVersion: true,
    };
  }

  private workflowEditorPrompt() {
    return [
      '你是热点运营平台的工作流修改代理。',
      '你的任务是根据运营人员的中文修改意图，生成一份适配当前系统的完整 WORKFLOW.md。',
      '必须保留当前系统所需的输入输出合同，不得创造后端不存在的 command、字段或工具。',
      '修改后的工作流只是草稿，不会直接启用。',
    ].join('\n');
  }

  private parseDraftOutput(output: unknown) {
    if (!output || typeof output !== 'object') {
      throw new Error('AI 工作流草稿输出不是对象');
    }
    const record = output as Record<string, unknown>;
    if (typeof record.markdown !== 'string' || !record.markdown.trim()) {
      throw new Error('AI 工作流草稿缺少 markdown');
    }
    if (typeof record.changeSummary !== 'string' || !record.changeSummary.trim()) {
      throw new Error('AI 工作流草稿缺少 changeSummary');
    }
    return {
      markdown: record.markdown,
      changeSummary: record.changeSummary,
      riskNotes: Array.isArray(record.riskNotes) ? record.riskNotes.map(String) : [],
      compatibilityNotes: Array.isArray(record.compatibilityNotes) ? record.compatibilityNotes.map(String) : [],
    };
  }

  private validateWorkflowMarkdown(markdown: string) {
    const checks: string[] = [];
    const errors: string[] = [];

    if (/^---\n[\s\S]*?\n---/.test(markdown)) {
      checks.push('frontmatter');
    } else {
      errors.push('缺少 frontmatter');
    }

    if (/##\s*(输入|Input)/i.test(markdown)) {
      checks.push('input_section');
    } else {
      errors.push('缺少输入章节');
    }

    if (/##\s*(输出|Output)/i.test(markdown)) {
      checks.push('output_section');
    } else {
      errors.push('缺少输出章节');
    }

    return { ok: errors.length === 0, checks, errors, modelOutputSummary: undefined as unknown };
  }

  private createShortTestContext() {
    return {
      schemaVersion: 'x_trend_event_context_v1',
      workflowRunId: 'wrun_short_test',
      observedAt: '2026-08-21T00:00:00.000Z',
      currentBatch: {
        batchId: 'short_test_batch',
        collectedAt: '2026-08-21T00:00:00.000Z',
        successfulRegions: [
          {
            region: 'United States',
            snapshotId: 'short_test_snapshot_us',
            collectedAt: '2026-08-21T00:00:00.000Z',
            items: [
              {
                rank: 3,
                title: 'OpenAI launches new API',
                normalizedKey: 'openai-launches-new-api',
                rawRef: {
                  platform: 'x',
                  table: 'x_trend_snapshot_item',
                  id: 'short_test_item_1',
                },
              },
            ],
          },
        ],
        failedRegions: [],
      },
      previousSuccessfulSnapshots: { byRegion: { 'United States': null } },
      snapshotDiffs: [],
      configuredTopics: [],
      eventCandidates: [],
      recentEventHistory: [],
    };
  }

  private resolveWorkflowGroupPath(workflowId: string) {
    if (workflowId === 'event-formation') {
      return 'topic-circle';
    }
    return 'event-formation';
  }

  private diffLines(baseMarkdown: string, compareMarkdown: string) {
    const baseLines = baseMarkdown.split(/\r?\n/);
    const compareLines = compareMarkdown.split(/\r?\n/);
    const dp = Array.from({ length: baseLines.length + 1 }, () => Array(compareLines.length + 1).fill(0) as number[]);
    for (let i = baseLines.length - 1; i >= 0; i -= 1) {
      for (let j = compareLines.length - 1; j >= 0; j -= 1) {
        dp[i][j] = baseLines[i] === compareLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }

    const result: Array<{ type: 'added' | 'removed' | 'unchanged'; text: string }> = [];
    let i = 0;
    let j = 0;
    while (i < baseLines.length && j < compareLines.length) {
      if (baseLines[i] === compareLines[j]) {
        result.push({ type: 'unchanged', text: baseLines[i] });
        i += 1;
        j += 1;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        result.push({ type: 'removed', text: baseLines[i] });
        i += 1;
      } else {
        result.push({ type: 'added', text: compareLines[j] });
        j += 1;
      }
    }
    while (i < baseLines.length) {
      result.push({ type: 'removed', text: baseLines[i] });
      i += 1;
    }
    while (j < compareLines.length) {
      result.push({ type: 'added', text: compareLines[j] });
      j += 1;
    }
    return result;
  }
}

const WORKFLOW_DRAFT_SCHEMA = {
  title: 'WorkflowDraftVersion',
  type: 'object',
  additionalProperties: false,
  required: ['markdown', 'changeSummary', 'riskNotes', 'compatibilityNotes'],
  properties: {
    markdown: { type: 'string' },
    changeSummary: { type: 'string' },
    riskNotes: { type: 'array', items: { type: 'string' } },
    compatibilityNotes: { type: 'array', items: { type: 'string' } },
  },
};
