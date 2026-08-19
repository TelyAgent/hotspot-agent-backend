# X 热搜 Event Workflow Runtime 实现计划

> **给执行代理：** 必须使用子技能 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans，按任务逐项执行本计划。所有步骤使用复选框（`- [ ]`）跟踪。

**目标：** 构建一个规则无关的 Workflow Runtime，通过 Markdown Workflow 把 X 热搜快照转换为 Event 命令，服务端不硬编码事件触发规则。

**架构：** 后端保持为通用运行时：加载 Workflow 定义、根据已成功落库的快照构建稳定上下文、调用 LLM Adapter、校验 JSON 输出，并执行通用 Event 命令。X 热搜业务规则，例如 TR-01/TR-02/TR-03/TR-04，只存在于 `WORKFLOW.md`。

**技术栈：** NestJS、TypeScript、Prisma、PostgreSQL、Jest；首期使用 `zod` 实现类 JSON Schema 校验；Markdown Workflow 文件存放在本地磁盘。

**规格文档：** `docs/X_TREND_EVENT_WORKFLOW_RUNTIME.md`

## 全局约束

- 服务端代码不得硬编码 TR-01、TR-02、TR-03、TR-04、排名阈值、目标地区数量、代表帖子数量或 T0 定义。
- 规则变化必须通过编辑 Markdown Workflow 文件和示例完成。
- 服务端代码只在新增输入能力、新增命令类型、存储模型变化、权限变化或审计能力变化时调整。
- Workflow 输出必须在任何数据库写入前完成校验。
- LLM 输出不得直接写数据库。
- 失败的采集 run 不产生快照，也不得参与排名变化上下文。
- 代表帖子只能证明某个说法正在 X 上传播，不能证明现实事实为真。
- 每次 workflow run 都必须能按 workflow 版本、checksum、输入、输出、命令和执行结果追溯。

---

## 文件结构

新增文件：

- `src/workflow/workflow.types.ts`  
  共享运行时类型，包括 workflow 定义、运行记录、X 热搜上下文、Event 命令和校验结果。
- `src/workflow/workflow.tokens.ts`  
  repository、workflow loader、model adapter 和 command executor 的依赖注入 token。
- `src/workflow/workflow.repository.ts`  
  workflow 定义、运行记录、命令记录、event intake、event、上下文、证据和忽略信号的 repository 接口。
- `src/workflow/in-memory-workflow.repository.ts`  
  单元测试使用的内存 repository。
- `src/workflow/prisma-workflow.repository.ts`  
  基于 Prisma 的 workflow repository 实现。
- `src/workflow/workflow-loader.ts`  
  从磁盘加载 `WORKFLOW.md` 和 schema 文件，计算 checksum，并解析 frontmatter。
- `src/workflow/workflow-output-validator.ts`  
  使用严格 zod schema 校验 workflow 输出。
- `src/workflow/workflow-model-adapter.ts`  
  模型调用接口，以及测试和本地开发使用的确定性 fake adapter。
- `src/workflow/x-trend-context.builder.ts`  
  根据最新成功热搜快照、前序快照、diff、主题配置和 Event 候选构建 `XTrendEventContextV1`。
- `src/workflow/event-command.executor.ts`  
  执行通用 `create_event`、`update_event_context` 和 `ignore` 命令。
- `src/workflow/workflow-runner.service.ts`  
  编排 loader、context builder、model adapter、validator、repository 和 command executor。
- `src/workflow/workflow.controller.ts`  
  提供运行事件 workflow 和查看 workflow run 的调试/管理接口。
- `src/workflow/workflow.module.ts`  
  负责接入运行时依赖的 Nest 模块。
- `workflows/event-formation/x-trend-event-formation/WORKFLOW.md`  
  保存当前 X 热搜生成 Event 规则的 Markdown workflow。
- `workflows/event-formation/x-trend-event-formation/output.schema.json`  
  面向运营人员和 Codex 编辑的可读输出 schema。
- `workflows/event-formation/x-trend-event-formation/examples/tr-01-top5.json`  
  首次进入 Top 5 触发的输入/输出示例。
- `workflows/event-formation/x-trend-event-formation/examples/ignore-generic-topic.json`  
  泛主题被忽略的示例。
- `workflows/event-formation/x-trend-event-formation/examples/update-existing-event.json`  
  已有 Event 只追加上下文的示例。

修改文件：

- `prisma/schema.prisma`  
  增加 workflow runtime、event intake、event、source context、evidence 和 ignored signal 相关表。
- `src/app.module.ts`  
  引入 `WorkflowModule`。
- `src/collection/collection.repository.ts`  
  在现有方法不足时，增加 context builder 需要的 repository 读取方法。
- `src/collection/prisma-collection.repository.ts`  
  实现 context builder 需要的新采集读取方法。
- `src/collection/in-memory-collection.repository.ts`  
  为单元测试实现对应的内存读取方法。
- `src/monitor/monitor.controller.ts`  
  可选增加“刷新后手动触发事件 workflow”的接口，同时保持现有 API 兼容。
- `package.json`  
  首期不需要新增依赖，因为项目已包含 `zod`。

测试文件：

- `test/unit/workflow-loader.spec.ts`
- `test/unit/workflow-output-validator.spec.ts`
- `test/unit/x-trend-context.builder.spec.ts`
- `test/unit/event-command.executor.spec.ts`
- `test/unit/workflow-runner.service.spec.ts`
- `test/integration/workflow.prisma.spec.ts`
- `test/integration/x-trend-event-workflow.e2e.spec.ts`

---

### 任务 1：新增 Workflow Runtime 数据库表结构

**文件：**
- 修改：`prisma/schema.prisma`
- 测试：`test/integration/workflow.prisma.spec.ts`

**接口：**
- 产出数据库表映射：
  - `workflow_definition`
  - `workflow_run`
  - `workflow_command`
  - `workflow_command_execution`
  - `event`
  - `event_intake`
  - `event_source_context`
  - `event_evidence`
  - `ignored_signal`

- [ ] **步骤 1：Write the failing integration test**

创建 `test/integration/workflow.prisma.spec.ts`：

```ts
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
```

- [ ] **步骤 2：Run test to verify it fails**

运行：`npm test -- test/integration/workflow.prisma.spec.ts --runInBand`

预期：FAIL，因为 `workflowDefinition`、`workflowRun`、`event` 和相关 Prisma model 尚不存在。

- [ ] **步骤 3：Add Prisma models**

把以下模型追加到 `prisma/schema.prisma`：

```prisma
model WorkflowDefinition {
  id               String   @id
  workflowId       String
  name             String
  type             String
  version          String
  status           String
  markdownPath     String
  outputSchemaPath String
  checksum         String
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  runs WorkflowRun[]

  @@unique([workflowId, version])
  @@index([type, status])
  @@map("workflow_definition")
}

model WorkflowRun {
  id                   String    @id
  workflowDefinitionId String
  status               String
  startedAt            DateTime
  finishedAt           DateTime?
  model                String?
  input                Json
  output               Json?
  error                String?

  definition WorkflowDefinition @relation(fields: [workflowDefinitionId], references: [id], onDelete: Cascade)
  commands WorkflowCommand[]
  commandExecutions WorkflowCommandExecution[]
  eventIntakes EventIntake[]
  eventSourceContexts EventSourceContext[]
  eventEvidence EventEvidence[]
  ignoredSignals IgnoredSignal[]

  @@index([workflowDefinitionId, startedAt])
  @@index([status, startedAt])
  @@map("workflow_run")
}

model WorkflowCommand {
  id             String   @id
  workflowRunId  String
  type           String
  idempotencyKey String   @unique
  payload        Json
  createdAt      DateTime @default(now())

  run WorkflowRun @relation(fields: [workflowRunId], references: [id], onDelete: Cascade)
  executions WorkflowCommandExecution[]

  @@index([workflowRunId])
  @@map("workflow_command")
}

model WorkflowCommandExecution {
  id                String   @id
  workflowCommandId String
  workflowRunId     String
  commandType        String
  idempotencyKey     String
  status             String
  targetEventId      String?
  error              String?
  createdAt          DateTime @default(now())

  command WorkflowCommand @relation(fields: [workflowCommandId], references: [id], onDelete: Cascade)
  run WorkflowRun @relation(fields: [workflowRunId], references: [id], onDelete: Cascade)

  @@index([workflowRunId])
  @@index([idempotencyKey])
  @@map("workflow_command_execution")
}

model Event {
  id                 String   @id
  title              String
  normalizedEventKey String   @unique
  status             String
  confidence         String
  formedAt           DateTime
  updatedAt          DateTime @updatedAt

  intakes EventIntake[]
  sourceContexts EventSourceContext[]
  evidence EventEvidence[]

  @@index([status, formedAt])
  @@map("event")
}

model EventIntake {
  id                String   @id
  eventId           String?
  workflowRunId     String
  entryMode         String
  observedAt        DateTime
  t0                DateTime?
  title             String
  oneLineSummary    String
  confirmationLevel String
  expressionBoundary String
  payload           Json
  dedupeKey         String
  createdAt         DateTime @default(now())

  event Event? @relation(fields: [eventId], references: [id], onDelete: SetNull)
  run WorkflowRun @relation(fields: [workflowRunId], references: [id], onDelete: Cascade)

  @@index([workflowRunId])
  @@index([dedupeKey])
  @@map("event_intake")
}

model EventSourceContext {
  id            String   @id
  eventId       String
  workflowRunId String
  sourceType    String
  payload       Json
  createdAt     DateTime @default(now())

  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
  run WorkflowRun @relation(fields: [workflowRunId], references: [id], onDelete: Cascade)

  @@index([eventId, sourceType])
  @@map("event_source_context")
}

model EventEvidence {
  id            String   @id
  eventId       String
  workflowRunId String
  sourceType    String
  url           String?
  claim         String
  payload       Json
  createdAt     DateTime @default(now())

  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
  run WorkflowRun @relation(fields: [workflowRunId], references: [id], onDelete: Cascade)

  @@index([eventId, sourceType])
  @@map("event_evidence")
}

model IgnoredSignal {
  id            String   @id
  workflowRunId String
  reason        String
  sourceRefs    Json
  createdAt     DateTime @default(now())

  run WorkflowRun @relation(fields: [workflowRunId], references: [id], onDelete: Cascade)

  @@index([workflowRunId])
  @@map("ignored_signal")
}
```

- [ ] **步骤 4：Push schema and generate Prisma Client**

运行：`npm run db:push`

预期：Prisma 创建新的 workflow 与 event 相关表。

- [ ] **步骤 5：Run test to verify it passes**

运行：`npm test -- test/integration/workflow.prisma.spec.ts --runInBand`

预期：PASS。

- [ ] **步骤 6：Commit**

```bash
git add prisma/schema.prisma test/integration/workflow.prisma.spec.ts
git commit -m "feat: add workflow runtime schema"
```

---

### 任务 2：定义 Workflow Runtime 类型和 Repository 接口

**文件：**
- 新增：`src/workflow/workflow.types.ts`
- 新增：`src/workflow/workflow.tokens.ts`
- 新增：`src/workflow/workflow.repository.ts`
- 新增：`src/workflow/in-memory-workflow.repository.ts`
- 测试：`test/unit/workflow.repository.spec.ts`

**接口：**
- 产出：
  - `WorkflowDefinitionRecord`
  - `WorkflowRunRecord`
  - `EventWorkflowCommandsV1`
  - `EventCommand`
  - `XTrendEventContextV1`
  - `WorkflowRepository`
  - `InMemoryWorkflowRepository`

- [ ] **步骤 1：Write the failing unit test**

创建 `test/unit/workflow.repository.spec.ts`：

```ts
import { InMemoryWorkflowRepository } from '../../src/workflow/in-memory-workflow.repository';

describe('InMemoryWorkflowRepository', () => {
  it('stores workflow definitions, runs, commands, events, and ignored signals', async () => {
    const repository = new InMemoryWorkflowRepository();

    const definition = await repository.saveWorkflowDefinition({
      id: 'wdef_test',
      workflowId: 'x-trend-event-formation',
      name: 'X 热搜榜生成 Event',
      type: 'event_formation',
      version: '1.0.0',
      status: 'enabled',
      markdownPath: 'workflows/event-formation/x-trend-event-formation/WORKFLOW.md',
      outputSchemaPath: 'workflows/event-formation/x-trend-event-formation/output.schema.json',
      checksum: 'checksum_test',
      createdAt: '2026-08-18T00:00:00.000Z',
      updatedAt: '2026-08-18T00:00:00.000Z',
    });

    const run = await repository.createWorkflowRun({
      id: 'wrun_test',
      workflowDefinitionId: definition.id,
      status: 'running',
      startedAt: '2026-08-18T00:00:01.000Z',
      input: { schemaVersion: 'x_trend_event_context_v1' },
    });

    await repository.saveWorkflowCommands([
      {
        id: 'cmd_test',
        workflowRunId: run.id,
        type: 'ignore',
        idempotencyKey: 'ignore:test',
        payload: { type: 'ignore', idempotencyKey: 'ignore:test', reason: 'generic', sourceRefs: [] },
        createdAt: '2026-08-18T00:00:02.000Z',
      },
    ]);

    await repository.saveIgnoredSignal({
      id: 'ignored_test',
      workflowRunId: run.id,
      reason: 'generic',
      sourceRefs: [],
      createdAt: '2026-08-18T00:00:03.000Z',
    });

    const finished = await repository.finishWorkflowRun(run.id, {
      status: 'success',
      finishedAt: '2026-08-18T00:00:04.000Z',
      output: { schemaVersion: 'event_workflow_commands_v1', commands: [] },
    });

    expect(await repository.findEnabledWorkflowDefinition('x-trend-event-formation')).toEqual(definition);
    expect(repository.workflowRuns).toEqual([finished]);
    expect(repository.workflowCommands).toHaveLength(1);
    expect(repository.ignoredSignals).toHaveLength(1);
  });
});
```

- [ ] **步骤 2：Run test to verify it fails**

运行：`npm test -- test/unit/workflow.repository.spec.ts --runInBand`

预期：FAIL，因为 workflow runtime 相关文件尚不存在。

- [ ] **步骤 3：创建 `src/workflow/workflow.tokens.ts`**

```ts
export const WORKFLOW_REPOSITORY = Symbol('WORKFLOW_REPOSITORY');
export const WORKFLOW_LOADER = Symbol('WORKFLOW_LOADER');
export const WORKFLOW_MODEL_ADAPTER = Symbol('WORKFLOW_MODEL_ADAPTER');
export const EVENT_COMMAND_EXECUTOR = Symbol('EVENT_COMMAND_EXECUTOR');
```

- [ ] **步骤 4：创建 `src/workflow/workflow.types.ts`**

```ts
export type WorkflowType = 'event_formation' | 'content_generation' | 'promotion_monitoring';
export type WorkflowStatus = 'draft' | 'enabled' | 'disabled';
export type WorkflowRunStatus = 'running' | 'success' | 'failed' | 'partial_success';
export type WorkflowCommandExecutionStatus = 'success' | 'skipped' | 'failed';

export interface WorkflowDefinitionRecord {
  id: string;
  workflowId: string;
  name: string;
  type: WorkflowType;
  version: string;
  status: WorkflowStatus;
  markdownPath: string;
  outputSchemaPath: string;
  checksum: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRunRecord {
  id: string;
  workflowDefinitionId: string;
  status: WorkflowRunStatus;
  startedAt: string;
  finishedAt?: string;
  model?: string;
  input: unknown;
  output?: unknown;
  error?: string;
}

export interface WorkflowCommandRecord {
  id: string;
  workflowRunId: string;
  type: EventCommand['type'];
  idempotencyKey: string;
  payload: EventCommand;
  createdAt: string;
}

export interface WorkflowCommandExecutionRecord {
  id: string;
  workflowCommandId: string;
  workflowRunId: string;
  commandType: EventCommand['type'];
  idempotencyKey: string;
  status: WorkflowCommandExecutionStatus;
  targetEventId?: string;
  error?: string;
  createdAt: string;
}

export interface TrendSnapshotItemContext {
  rank: number;
  title: string;
  query?: string;
  normalizedKey: string;
  url?: string;
  rawRef: {
    platform: 'x';
    table: 'x_trend_snapshot_item' | 'source_snapshot_item';
    id: string;
  };
}

export interface TrendRegionSnapshotContext {
  region: string;
  snapshotId: string;
  collectedAt: string;
  items: TrendSnapshotItemContext[];
}

export interface XTrendEventContextV1 {
  schemaVersion: 'x_trend_event_context_v1';
  workflowRunId: string;
  observedAt: string;
  currentBatch: {
    batchId: string;
    collectedAt: string;
    successfulRegions: TrendRegionSnapshotContext[];
    failedRegions: { region: string; error: string; observedAt: string }[];
  };
  previousSuccessfulSnapshots: {
    byRegion: Record<string, TrendRegionSnapshotContext | null>;
  };
  snapshotDiffs: unknown[];
  configuredTopics: {
    id: string;
    name: string;
    semanticKeywords: string[];
    positiveExamples: string[];
    negativeExamples: string[];
    enabled: boolean;
  }[];
  eventCandidates: ExistingEventSummary[];
  recentEventHistory: ExistingEventSummary[];
}

export interface ExistingEventSummary {
  eventId: string;
  title: string;
  summary?: string;
  normalizedKey?: string;
  status: string;
  sourceContexts: unknown[];
  formedAt: string;
}

export interface EventWorkflowCommandsV1 {
  schemaVersion: 'event_workflow_commands_v1';
  workflowId: string;
  workflowVersion: string;
  runId: string;
  commands: EventCommand[];
  diagnostics?: { level: 'info' | 'warning' | 'error'; message: string }[];
}

export type EventCommand = CreateEventCommand | UpdateEventContextCommand | IgnoreSignalCommand;

export interface CreateEventCommand {
  type: 'create_event';
  idempotencyKey: string;
  eventCandidate: {
    title: string;
    subject?: string;
    action?: string;
    object?: string;
    oneLineSummary: string;
    normalizedEventKey: string;
    confidence: 'high' | 'medium' | 'low';
  };
  eventIntake: EventIntakePayload;
  trigger: TriggerPayload;
  sourceContext: XTrendSourceContext;
  evidenceRecords: EvidenceRecordPayload[];
  startResponsePipeline: boolean;
}

export interface UpdateEventContextCommand {
  type: 'update_event_context';
  idempotencyKey: string;
  targetEventId: string;
  reason: string;
  trigger?: TriggerPayload;
  sourceContextPatch: XTrendSourceContext;
  evidenceRecords?: EvidenceRecordPayload[];
  startResponsePipeline: false;
}

export interface IgnoreSignalCommand {
  type: 'ignore';
  idempotencyKey: string;
  reason: string;
  sourceRefs: SourceRef[];
}

export interface EventIntakePayload {
  schemaVersion: 'event_intake_v1';
  entryMode: 'x_trend';
  observedAt: string;
  t0?: string;
  title: string;
  oneLineSummary: string;
  confirmationLevel: 'unconfirmed' | 'partially_supported' | 'confirmed' | 'conflicting';
  expressionBoundary: string;
  confirmedFacts: string[];
  unconfirmedFacts: string[];
  evidenceRecords: EvidenceRecordPayload[];
  trendContext: XTrendSourceContext;
  trigger: TriggerPayload;
  candidateEventIds: string[];
  dedupeKey: string;
}

export interface TriggerPayload {
  ruleId: string;
  reason: string;
  t0: string;
  observedAt: string;
}

export interface XTrendSourceContext {
  regions: {
    region: string;
    rank?: number;
    previousRank?: number;
    snapshotId: string;
    representativePosts: EvidenceRecordPayload[];
  }[];
}

export interface EvidenceRecordPayload {
  sourceType: 'x_trend' | 'x_post' | 'manual' | 'external';
  url?: string;
  claim: string;
  payload: unknown;
}

export interface SourceRef {
  platform: string;
  sourceType: string;
  id: string;
}

export interface EventRecord {
  id: string;
  title: string;
  normalizedEventKey: string;
  status: string;
  confidence: 'high' | 'medium' | 'low';
  formedAt: string;
  updatedAt: string;
}
```

- [ ] **步骤 5：创建 `src/workflow/workflow.repository.ts`**

```ts
import {
  EventCommand,
  EventRecord,
  WorkflowCommandExecutionRecord,
  WorkflowCommandRecord,
  WorkflowDefinitionRecord,
  WorkflowRunRecord,
} from './workflow.types';

type MaybePromise<T> = T | Promise<T>;

export interface WorkflowRepository {
  findEnabledWorkflowDefinition(workflowId: string): MaybePromise<WorkflowDefinitionRecord | undefined>;
  saveWorkflowDefinition(definition: WorkflowDefinitionRecord): MaybePromise<WorkflowDefinitionRecord>;
  createWorkflowRun(run: WorkflowRunRecord): MaybePromise<WorkflowRunRecord>;
  finishWorkflowRun(id: string, patch: Partial<WorkflowRunRecord>): MaybePromise<WorkflowRunRecord>;
  saveWorkflowCommands(commands: WorkflowCommandRecord[]): MaybePromise<WorkflowCommandRecord[]>;
  findCommandExecutionByIdempotencyKey(idempotencyKey: string): MaybePromise<WorkflowCommandExecutionRecord | undefined>;
  saveCommandExecution(execution: WorkflowCommandExecutionRecord): MaybePromise<WorkflowCommandExecutionRecord>;
  findEventByNormalizedKey(normalizedEventKey: string): MaybePromise<EventRecord | undefined>;
  createEvent(input: Omit<EventRecord, 'updatedAt'>): MaybePromise<EventRecord>;
  saveEventIntake(input: {
    id: string;
    eventId?: string;
    workflowRunId: string;
    entryMode: string;
    observedAt: string;
    t0?: string;
    title: string;
    oneLineSummary: string;
    confirmationLevel: string;
    expressionBoundary: string;
    payload: unknown;
    dedupeKey: string;
  }): MaybePromise<void>;
  saveEventSourceContext(input: {
    id: string;
    eventId: string;
    workflowRunId: string;
    sourceType: string;
    payload: unknown;
  }): MaybePromise<void>;
  saveEventEvidence(input: {
    id: string;
    eventId: string;
    workflowRunId: string;
    sourceType: string;
    url?: string;
    claim: string;
    payload: unknown;
  }): MaybePromise<void>;
  saveIgnoredSignal(input: {
    id: string;
    workflowRunId: string;
    reason: string;
    sourceRefs: unknown[];
    createdAt: string;
  }): MaybePromise<void>;
}
```

- [ ] **步骤 6：创建 `src/workflow/in-memory-workflow.repository.ts`**

为所有记录和接口方法实现内存数组存储。参考 `src/collection/in-memory-collection.repository.ts`，直接使用 `push`、`find` 和 `Object.assign`。

- [ ] **步骤 7：Run test to verify it passes**

运行：`npm test -- test/unit/workflow.repository.spec.ts --runInBand`

预期：PASS。

- [ ] **步骤 8：Commit**

```bash
git add src/workflow/workflow.types.ts src/workflow/workflow.tokens.ts src/workflow/workflow.repository.ts src/workflow/in-memory-workflow.repository.ts test/unit/workflow.repository.spec.ts
git commit -m "feat: define workflow runtime contracts"
```

---

### 任务 3：实现 Workflow Loader

**文件：**
- 新增：`src/workflow/workflow-loader.ts`
- 新增：`workflows/event-formation/x-trend-event-formation/WORKFLOW.md`
- 新增：`workflows/event-formation/x-trend-event-formation/output.schema.json`
- 测试：`test/unit/workflow-loader.spec.ts`

**接口：**
- 产出：
  - `WorkflowLoader`
  - `load(workflowId: string): Promise<LoadedWorkflow>`
  - `LoadedWorkflow { definition, markdown, outputSchema }`

- [ ] **步骤 1：Write failing test**

创建 `test/unit/workflow-loader.spec.ts`：

```ts
import { WorkflowLoader } from '../../src/workflow/workflow-loader';

describe('WorkflowLoader', () => {
  it('loads workflow markdown, frontmatter, schema, and checksum', async () => {
    const loader = new WorkflowLoader(process.cwd());

    const workflow = await loader.load('x-trend-event-formation');

    expect(workflow.definition.workflowId).toBe('x-trend-event-formation');
    expect(workflow.definition.type).toBe('event_formation');
    expect(workflow.definition.version).toBe('1.0.0');
    expect(workflow.definition.status).toBe('enabled');
    expect(workflow.markdown).toContain('TR-01');
    expect(workflow.outputSchema).toEqual(expect.objectContaining({ title: 'EventWorkflowCommandsV1' }));
    expect(workflow.definition.checksum).toMatch(/^[a-f0-9]{64}$/);
  });
});
```

- [ ] **步骤 2：Run test to verify it fails**

运行：`npm test -- test/unit/workflow-loader.spec.ts --runInBand`

预期：FAIL，因为 loader 和 workflow 文件尚不存在。

- [ ] **步骤 3：创建 `WORKFLOW.md`**

创建 `workflows/event-formation/x-trend-event-formation/WORKFLOW.md`：

```md
---
id: x-trend-event-formation
name: X 热搜榜生成 Event
type: event_formation
version: 1.0.0
status: enabled
input_schema: x_trend_event_context_v1
output_schema: event_workflow_commands_v1
model: default_reasoning
---

# 目标

根据 X 热搜榜成功快照判断是否创建或更新 Event。

# 当前规则

首期每小时采集 Worldwide、United States、United Kingdom、Japan、Korea 五个榜单，每榜 Top 30。只有成功采集形成快照；失败采集不参与排名变化。

以下任一规则独立触发完整响应：

- TR-01：具体 Event 首次进入任一目标榜单第 1-5 位。
- TR-02：同一 Event 在相邻两次成功小时快照间上升至少 10 位。
- TR-03：具体 Event 语义命中已配置重点主题。
- TR-04：同一具体 Event 同时出现在至少两个目标地区榜单。

四条路径均不等待人工是否参与。T0 只记录系统首次成功发现合格触发的时间；当前不规定 T0 到自动校验完成的最长 SLA。

# 具体 Event 判断

热搜词本身不是 Event。只有能表达具体事实、动作、结果、状态、口径变化或明确传播说法时，才可以创建 Event。泛主题、人物名、公司名、赛事名或没有明确发展的关键词，应输出 ignore 或 update_event_context。

# 证据边界

每个出现地区使用 X 默认热门排序，获取实际可取得的最多 3 条代表帖子；不足时按实际数量继续。帖子证明的是 X 上正在传播的说法，不当然证明现实事实为真。

# 输出要求

只输出符合 event_workflow_commands_v1 的 JSON。不得输出解释性文本。
```

- [ ] **步骤 4：创建 `output.schema.json`**

创建 `workflows/event-formation/x-trend-event-formation/output.schema.json`：

```json
{
  "title": "EventWorkflowCommandsV1",
  "type": "object",
  "required": ["schemaVersion", "workflowId", "workflowVersion", "runId", "commands"],
  "properties": {
    "schemaVersion": { "const": "event_workflow_commands_v1" },
    "workflowId": { "type": "string" },
    "workflowVersion": { "type": "string" },
    "runId": { "type": "string" },
    "commands": { "type": "array" }
  }
}
```

- [ ] **步骤 5：Implement `WorkflowLoader`**

使用 `node:fs/promises`、`node:path` 和 `node:crypto`。

```ts
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { WorkflowDefinitionRecord, WorkflowStatus, WorkflowType } from './workflow.types';

export interface LoadedWorkflow {
  definition: WorkflowDefinitionRecord;
  markdown: string;
  outputSchema: unknown;
}

export class WorkflowLoader {
  constructor(private readonly rootDir = process.cwd()) {}

  async load(workflowId: string): Promise<LoadedWorkflow> {
    const basePath = join(this.rootDir, 'workflows', 'event-formation', workflowId);
    const markdownPath = join(basePath, 'WORKFLOW.md');
    const outputSchemaPath = join(basePath, 'output.schema.json');
    const markdown = await readFile(markdownPath, 'utf8');
    const outputSchema = JSON.parse(await readFile(outputSchemaPath, 'utf8'));
    const frontmatter = this.parseFrontmatter(markdown);
    const checksum = createHash('sha256').update(markdown).update(JSON.stringify(outputSchema)).digest('hex');
    const now = new Date().toISOString();

    return {
      definition: {
        id: `wdef_${randomUUID()}`,
        workflowId: String(frontmatter.id),
        name: String(frontmatter.name),
        type: frontmatter.type as WorkflowType,
        version: String(frontmatter.version),
        status: frontmatter.status as WorkflowStatus,
        markdownPath: `workflows/event-formation/${workflowId}/WORKFLOW.md`,
        outputSchemaPath: `workflows/event-formation/${workflowId}/output.schema.json`,
        checksum,
        createdAt: now,
        updatedAt: now,
      },
      markdown,
      outputSchema,
    };
  }

  private parseFrontmatter(markdown: string): Record<string, string> {
    const match = markdown.match(/^---\n([\s\S]*?)\n---/);
    if (!match) throw new Error('Workflow markdown must include frontmatter');
    return Object.fromEntries(
      match[1]
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const index = line.indexOf(':');
          if (index === -1) throw new Error(`Invalid frontmatter line: ${line}`);
          return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
        }),
    );
  }
}
```

- [ ] **步骤 6：Run test to verify it passes**

运行：`npm test -- test/unit/workflow-loader.spec.ts --runInBand`

预期：PASS。

- [ ] **步骤 7：Commit**

```bash
git add src/workflow/workflow-loader.ts workflows/event-formation/x-trend-event-formation/WORKFLOW.md workflows/event-formation/x-trend-event-formation/output.schema.json test/unit/workflow-loader.spec.ts
git commit -m "feat: load markdown event workflow"
```

---

### 任务 4：实现 Workflow 输出校验器

**文件：**
- 新增：`src/workflow/workflow-output-validator.ts`
- 测试：`test/unit/workflow-output-validator.spec.ts`

**接口：**
- 产出：
  - `WorkflowOutputValidator`
  - `validate(output: unknown): EventWorkflowCommandsV1`

- [ ] **步骤 1：Write failing tests**

创建 `test/unit/workflow-output-validator.spec.ts`：

```ts
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
          sourceContextPatch: { regions: [] },
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
            trendContext: { regions: [] },
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
          sourceContext: { regions: [] },
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
```

- [ ] **步骤 2：Run tests to verify they fail**

运行：`npm test -- test/unit/workflow-output-validator.spec.ts --runInBand`

预期：FAIL，因为 validator 尚不存在。

- [ ] **步骤 3：Implement validator with zod**

为所有命令变体创建严格的 zod schema。每个对象 schema 都使用 `.strict()`。校验失败时抛出 `new Error('Invalid workflow output: ...')`，并附带 `error.message`。

- [ ] **步骤 4：Run tests to verify they pass**

运行：`npm test -- test/unit/workflow-output-validator.spec.ts --runInBand`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/workflow/workflow-output-validator.ts test/unit/workflow-output-validator.spec.ts
git commit -m "feat: validate workflow command output"
```

---

### 任务 5：为 Context Builder 增加采集数据读取能力

**文件：**
- 修改：`src/collection/collection.repository.ts`
- 修改：`src/collection/in-memory-collection.repository.ts`
- 修改：`src/collection/prisma-collection.repository.ts`
- 测试：`test/unit/x-trend-context.collection-reads.spec.ts`

**接口：**
- 产出 collection repository 方法：
  - `findLatestSourceSnapshots(input: { platform: string; sourceType: string; regions: string[] }): MaybePromise<SourceSnapshot[]>`
  - `findSourceSnapshotDiffs(input: { currentSnapshotIds: string[] }): MaybePromise<SourceSnapshotDiff[]>`

- [ ] **步骤 1：Write failing test**

创建 `test/unit/x-trend-context.collection-reads.spec.ts`，使用 `InMemoryCollectionRepository`。插入两个 `sourceSnapshots` 和一个 `sourceSnapshotDiff`，断言新方法按输入地区顺序返回记录。

- [ ] **步骤 2：Run test to verify it fails**

运行：`npm test -- test/unit/x-trend-context.collection-reads.spec.ts --runInBand`

预期：FAIL，因为方法尚不存在。

- [ ] **步骤 3：Add interface methods**

用上面列出的精确方法签名更新 `CollectionRepository`。

- [ ] **步骤 4：Implement in-memory methods**

`findLatestSourceSnapshots` should call existing snapshot arrays and return the newest snapshot per requested region. `findSourceSnapshotDiffs` should filter `sourceSnapshotDiffs` by `currentSnapshotId`.

- [ ] **步骤 5：Implement Prisma methods**

`findLatestSourceSnapshots` 查询时按 `collectedAt desc` 排序，再在 TypeScript 中按地区分组取最新快照。`findSourceSnapshotDiffs` 查询 `sourceSnapshotDiff.findMany({ where: { currentSnapshotId: { in: currentSnapshotIds } } })`，并把 JSON 字段映射回 `SourceSnapshotDiff`。

- [ ] **步骤 6：Run tests**

运行：`npm test -- test/unit/x-trend-context.collection-reads.spec.ts --runInBand`

预期：PASS。

- [ ] **步骤 7：Commit**

```bash
git add src/collection/collection.repository.ts src/collection/in-memory-collection.repository.ts src/collection/prisma-collection.repository.ts test/unit/x-trend-context.collection-reads.spec.ts
git commit -m "feat: add trend context collection reads"
```

---

### 任务 6：构建 X 热搜 Workflow Context

**文件：**
- 新增：`src/workflow/x-trend-context.builder.ts`
- 测试：`test/unit/x-trend-context.builder.spec.ts`

**接口：**
- 消费：
  - `CollectionRepository.findLatestSourceSnapshots`
  - `CollectionRepository.findSourceSnapshotItems`
  - `CollectionRepository.findPreviousSourceSnapshot`
  - `CollectionRepository.findSourceSnapshotDiffs`
- 产出：
  - `XTrendContextBuilder`
  - `build(input: { workflowRunId: string; observedAt: string; regions: string[] }): Promise<XTrendEventContextV1>`

- [ ] **步骤 1：Write failing test**

用内存采集数据创建测试：

```ts
const context = await builder.build({
  workflowRunId: 'wrun_test',
  observedAt: '2026-08-18T01:00:00.000Z',
  regions: ['global'],
});

expect(context.schemaVersion).toBe('x_trend_event_context_v1');
expect(context.currentBatch.successfulRegions[0].items[0].title).toBe('OpenAI');
expect(context.previousSuccessfulSnapshots.byRegion.global?.snapshotId).toBe('snapshot_previous');
```

- [ ] **步骤 2：Run test to verify it fails**

运行：`npm test -- test/unit/x-trend-context.builder.spec.ts --runInBand`

预期：FAIL，因为 builder 尚不存在。

- [ ] **步骤 3：Implement builder**

实现规则：

- 只使用 repository 读取方法。
- 不读取或解释触发阈值。
- 不计算 TR-01/TR-02/TR-03/TR-04。
- 只有在本任务能通过现有 repository 方法拿到明确失败 run 记录时，才把缺失地区写入 `failedRegions`；首期实现里，没有快照只表示不加入 `successfulRegions`，也不写失败项。
- 首期 `configuredTopics` 先返回空数组，直到系统设置里的重点主题接入。
- 首期 `eventCandidates` 和 `recentEventHistory` 先返回空数组，直到 Event 搜索接入。

- [ ] **步骤 4：Run test to verify it passes**

运行：`npm test -- test/unit/x-trend-context.builder.spec.ts --runInBand`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/workflow/x-trend-context.builder.ts test/unit/x-trend-context.builder.spec.ts
git commit -m "feat: build x trend workflow context"
```

---

### 任务 7：实现 Event Command Executor

**文件：**
- 新增：`src/workflow/event-command.executor.ts`
- 测试：`test/unit/event-command.executor.spec.ts`

**接口：**
- 消费：
  - `WorkflowRepository`
  - `EventCommand`
- 产出：
  - `EventCommandExecutor.execute(input: { workflowRunId: string; command: EventCommand }): Promise<WorkflowCommandExecutionRecord>`

- [ ] **步骤 1：Write failing tests**

创建以下测试：

1. `ignore` saves ignored signal and command execution.
2. `create_event` creates event, intake, context, evidence, and command execution.
3. Duplicate `idempotencyKey` skips execution.
4. `update_event_context` appends source context and does not start response pipeline.

- [ ] **步骤 2：Run tests to verify they fail**

运行：`npm test -- test/unit/event-command.executor.spec.ts --runInBand`

预期：FAIL，因为 executor 尚不存在。

- [ ] **步骤 3：Implement executor**

使用 `randomUUID` 生成记录 ID。执行行为：

- 如果 repository 中已经存在相同 `idempotencyKey` 的命令执行记录，则返回一个 `status: 'skipped'` 的新执行结果。
- 对于 `ignore`，调用 `saveIgnoredSignal`。
- 对于 `create_event`，先调用 `findEventByNormalizedKey`。如果找到已有 Event，则复用；否则调用 `createEvent`。
- 对于 `create_event`，保存 intake、context 和 evidence，并保存带 `targetEventId` 的命令执行记录。
- 对于 `update_event_context`，根据 `targetEventId` 追加 context 和 evidence。
- 本任务不实现真实内容流水线启动。把 `startResponsePipeline` 保留在命令 payload 中；内容任务创建属于独立的内容 workflow 实现计划。

- [ ] **步骤 4：Run tests to verify they pass**

运行：`npm test -- test/unit/event-command.executor.spec.ts --runInBand`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/workflow/event-command.executor.ts test/unit/event-command.executor.spec.ts
git commit -m "feat: execute generic event workflow commands"
```

---

### 任务 8：实现 Prisma Workflow Repository

**文件：**
- 新增：`src/workflow/prisma-workflow.repository.ts`
- 测试：`test/integration/workflow.repository.prisma.spec.ts`

**接口：**
- 使用任务 1 中的 Prisma models 实现 `WorkflowRepository`。

- [ ] **步骤 1：Write failing integration test**

复用 `test/unit/workflow.repository.spec.ts` 中相同的行为断言，但用 `PrismaService` 实例化 `PrismaWorkflowRepository`。

- [ ] **步骤 2：Run test to verify it fails**

运行：`npm test -- test/integration/workflow.repository.prisma.spec.ts --runInBand`

预期：FAIL，因为 repository 尚不存在。

- [ ] **步骤 3：Implement Prisma repository**

映射要求：

- 读取时把 `Date` 转换为 ISO 字符串。
- 写入时把 ISO 字符串转换为 `Date`。
- Prisma JSON 字段通过 `unknown` 做类型转换。
- 保留 `idempotencyKey` 唯一约束错误，让 Prisma 原样抛出；executor 通过插入前检查处理 skipped。

- [ ] **步骤 4：Run test to verify it passes**

运行：`npm test -- test/integration/workflow.repository.prisma.spec.ts --runInBand`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/workflow/prisma-workflow.repository.ts test/integration/workflow.repository.prisma.spec.ts
git commit -m "feat: persist workflow runtime records"
```

---

### 任务 9：实现 Workflow Model Adapter

**文件：**
- 新增：`src/workflow/workflow-model-adapter.ts`
- 测试：`test/unit/workflow-model-adapter.spec.ts`

**接口：**
- 产出：
  - `WorkflowModelAdapter`
  - `FakeWorkflowModelAdapter`
  - `run(input: { workflowMarkdown: string; context: unknown; outputSchema: unknown }): Promise<unknown>`

- [ ] **步骤 1：Write failing test**

创建 `test/unit/workflow-model-adapter.spec.ts`：

```ts
import { FakeWorkflowModelAdapter } from '../../src/workflow/workflow-model-adapter';

describe('FakeWorkflowModelAdapter', () => {
  it('returns configured workflow output for deterministic tests', async () => {
    const adapter = new FakeWorkflowModelAdapter({
      schemaVersion: 'event_workflow_commands_v1',
      workflowId: 'x-trend-event-formation',
      workflowVersion: '1.0.0',
      runId: 'wrun_test',
      commands: [],
    });

    await expect(adapter.run({ workflowMarkdown: '# Test', context: {}, outputSchema: {} })).resolves.toEqual({
      schemaVersion: 'event_workflow_commands_v1',
      workflowId: 'x-trend-event-formation',
      workflowVersion: '1.0.0',
      runId: 'wrun_test',
      commands: [],
    });
  });
});
```

- [ ] **步骤 2：Run test to verify it fails**

运行：`npm test -- test/unit/workflow-model-adapter.spec.ts --runInBand`

预期：FAIL，因为 adapter 尚不存在。

- [ ] **步骤 3：Implement interface and fake adapter**

本任务不要增加真实 OpenAI 或 LangChain 依赖。生产级 model adapter 应在独立实现计划中接到同一个接口后面。

- [ ] **步骤 4：Run test to verify it passes**

运行：`npm test -- test/unit/workflow-model-adapter.spec.ts --runInBand`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/workflow/workflow-model-adapter.ts test/unit/workflow-model-adapter.spec.ts
git commit -m "feat: add workflow model adapter interface"
```

---

### 任务 10：实现 Workflow Runner Service

**文件：**
- 新增：`src/workflow/workflow-runner.service.ts`
- 测试：`test/unit/workflow-runner.service.spec.ts`

**接口：**
- 消费：
  - `WorkflowLoader`
  - `WorkflowRepository`
  - `XTrendContextBuilder`
  - `WorkflowModelAdapter`
  - `WorkflowOutputValidator`
  - `EventCommandExecutor`
- 产出：
  - `runXTrendEventFormation(input: { observedAt: string; regions: string[] }): Promise<{ workflowRunId: string; status: string; commandCount: number }>`

- [ ] **步骤 1：Write failing test**

使用 `InMemoryWorkflowRepository`、`InMemoryCollectionRepository`、`FakeWorkflowModelAdapter` 和真实 `WorkflowOutputValidator`。模型输出包含一个 `ignore` 命令。断言 runner 会创建一条 workflow run、保存一条命令、执行一条命令，并以 `success` 结束运行。

- [ ] **步骤 2：Run test to verify it fails**

运行：`npm test -- test/unit/workflow-runner.service.spec.ts --runInBand`

预期：FAIL，因为 runner 尚不存在。

- [ ] **步骤 3：Implement runner**

执行顺序：

1. Load workflow by ID `x-trend-event-formation`.
2. Save workflow definition.
3. 创建 `status: 'running'` 的 workflow run。
4. Build context using run ID.
5. Call model adapter with markdown, context, and output schema.
6. Validate output.
7. Save `WorkflowCommandRecord[]`.
8. Execute each command.
9. Finish run as `success` if all commands are success or skipped.
10. Finish run as `partial_success` if at least one command fails and at least one succeeds.
11. Finish run as `failed` if validation or model call fails before command execution.

- [ ] **步骤 4：Run test to verify it passes**

运行：`npm test -- test/unit/workflow-runner.service.spec.ts --runInBand`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/workflow/workflow-runner.service.ts test/unit/workflow-runner.service.spec.ts
git commit -m "feat: orchestrate event workflow runs"
```

---

### 任务 11：接入 Workflow Module 和调试 Controller

**文件：**
- 新增：`src/workflow/workflow.module.ts`
- 新增：`src/workflow/workflow.controller.ts`
- 修改：`src/app.module.ts`
- 测试：`test/unit/workflow.module.spec.ts`

**接口：**
- 产出接口：
  - `POST /workflows/x-trend-event-formation/run`
  - `GET /workflows/:workflowId/enabled`

- [ ] **步骤 1：Write failing module test**

创建包含 `WorkflowModule` 的 Nest 测试模块，并调用 `WorkflowController.runXTrendEventFormation({ regions: ['global'] })`。测试中覆盖注入 fake model adapter provider。

- [ ] **步骤 2：Run test to verify it fails**

运行：`npm test -- test/unit/workflow.module.spec.ts --runInBand`

预期：FAIL，因为 module/controller 尚不存在。

- [ ] **步骤 3：Implement module**

注册：

- `PrismaWorkflowRepository` as `WORKFLOW_REPOSITORY`
- `WorkflowLoader`
- `WorkflowOutputValidator`
- `XTrendContextBuilder`
- `EventCommandExecutor`
- `WorkflowRunnerService`
- `FakeWorkflowModelAdapter` as `WORKFLOW_MODEL_ADAPTER` for first runtime version

- [ ] **步骤 4：Implement controller**

```ts
@Post('x-trend-event-formation/run')
runXTrendEventFormation(@Body() body: { regions?: string[] }) {
  return this.runner.runXTrendEventFormation({
    observedAt: new Date().toISOString(),
    regions: body.regions?.length ? body.regions : ['global'],
  });
}
```

- [ ] **步骤 5：Modify app module**

在 `src/app.module.ts` 的 `imports` 中加入 `WorkflowModule`。

- [ ] **步骤 6：Run test to verify it passes**

运行：`npm test -- test/unit/workflow.module.spec.ts --runInBand`

预期：PASS。

- [ ] **步骤 7：Commit**

```bash
git add src/workflow/workflow.module.ts src/workflow/workflow.controller.ts src/app.module.ts test/unit/workflow.module.spec.ts
git commit -m "feat: expose workflow runtime endpoints"
```

---

### 任务 12：增加 X 热搜 Event Workflow 端到端测试

**文件：**
- 修改：`src/workflow/workflow-model-adapter.ts`
- 测试：`test/integration/x-trend-event-workflow.e2e.spec.ts`

**接口：**
- 消费：
  - Collection service produces snapshots.
  - Workflow runner consumes snapshots.
  - Fake model adapter emits `create_event`.
  - Command executor creates Event.

- [ ] **步骤 1：Write failing e2e test**

测试流程：

1. Clear collection and workflow data.
2. Seed collection defaults.
3. Run `TwitterCollectionService.runTrendingJob` with mock tool for `global`.
4. Configure `FakeWorkflowModelAdapter` to output one `create_event`.
5. Run `WorkflowRunnerService.runXTrendEventFormation`.
6. Assert one `event`, one `event_intake`, one `event_source_context`, one `workflow_run`, one `workflow_command_execution`.

- [ ] **步骤 2：Run test to verify it fails**

运行：`npm test -- test/integration/x-trend-event-workflow.e2e.spec.ts --runInBand`

预期：FAIL，直到所有模块接线和 repository 方法完成。

- [ ] **步骤 3：Implement missing cleanup helper**

修改 `src/prisma/prisma.service.ts`，加入：

```ts
async clearWorkflowData() {
  await this.workflowCommandExecution.deleteMany();
  await this.workflowCommand.deleteMany();
  await this.eventEvidence.deleteMany();
  await this.eventSourceContext.deleteMany();
  await this.eventIntake.deleteMany();
  await this.ignoredSignal.deleteMany();
  await this.event.deleteMany();
  await this.workflowRun.deleteMany();
  await this.workflowDefinition.deleteMany();
}
```

- [ ] **步骤 4：Run e2e test to verify it passes**

运行：`npm test -- test/integration/x-trend-event-workflow.e2e.spec.ts --runInBand`

预期：PASS。

- [ ] **步骤 5：Run full backend verification**

运行：

```bash
npm run typecheck
npm run lint
npm test -- --runInBand
```

预期：全部通过。

- [ ] **步骤 6：Commit**

```bash
git add src/prisma/prisma.service.ts src/workflow/workflow-model-adapter.ts test/integration/x-trend-event-workflow.e2e.spec.ts
git commit -m "test: verify x trend event workflow end to end"
```

---

## 自检

### 规格覆盖

- 规则无关的服务端边界：任务 3、4、7、10 覆盖。
- 包含 TR 规则的 Markdown Workflow 文件：任务 3 覆盖。
- Workflow Context Builder：任务 5、6 覆盖。
- 数据库写入前的 Schema 校验：任务 4、10 覆盖。
- 通用 Event Commands：任务 7 覆盖。
- 审计表：任务 1、8 覆盖。
- Runtime 编排：任务 10 覆盖。
- 调试/管理接口：任务 11 覆盖。
- 从 X 快照到 Event 的端到端路径：任务 12 覆盖。

### 类型一致性

- `EventWorkflowCommandsV1`、`EventCommand`、`XTrendEventContextV1` 和 `WorkflowRepository` 在任务 2 中定义，早于下游任务使用。
- `findLatestSourceSnapshots` 和 `findSourceSnapshotDiffs` 在任务 5 中定义，早于任务 6 使用。
- `EventCommandExecutor.execute` 在任务 7 中定义，早于任务 10 使用。
- `WorkflowModelAdapter.run` 在任务 9 中定义，早于任务 10 使用。

### 执行说明

- 本计划不实现真实 LLM 接入。首期使用 `FakeWorkflowModelAdapter` 验证运行时边界和数据库行为。
- 本计划不实现代表帖子获取。context 和 command payload 会预留该能力，但实际 `x.searchPosts` connector 应放到独立的数据采集计划中实现。
- 本计划不启动内容生成流水线。只持久化 `startResponsePipeline`，实际任务创建交给内容 workflow 实现。
