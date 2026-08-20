# 内容生成与账号任务 Workflow 架构设计

## 1. 核心结论

内容发布链路分成两个阶段：

```text
Event 进入响应链路
  -> 账号分配 Workflow 判断哪些账号应该响应
  -> 创建 Account Response Task
  -> 运营人员进入任务详情页
  -> 按需生成或重生成候选内容
  -> 预检、人工发布、URL 回填、效果追踪
```

本轮实现只在 Event 形成后创建账号任务，不提前生成 3 条候选内容。候选内容生成延后到任务详情页，由运营人员点击生成、重生成或带要求生成时触发。

这和平台总规则 SPEC 当前 5.1 中“每个参与账号自动生成 3 条候选”的旧合同不同。本设计以新的产品决策为准：触发后必须完成账号分配和任务创建，但候选不在后台自动批量生成。

## 2. 设计目标

### 2.1 要做到

- 同一 Event 对同一账号最多创建一个账号响应任务。
- 账号是否参与由账号配置和账号分配 Workflow 决定，不写死在服务端代码里。
- 基础生产线账号默认参与所有自动响应 Event。
- 人设账号根据 Event Context Pack、账号角色定义和 Skill 描述返回 `participate`、`observe` 或 `skip`。
- 创建任务后任务进入待处理状态，不生成候选。
- 任务详情页支持首次生成候选、按用户要求重生成、编辑后预检、发布 URL 回填。
- 候选内容必须绑定 Event、账号、Skill 版本和生成输入版本。
- 单账号失败不阻塞其他账号任务创建。
- 所有分配、生成、预检、人工修改和发布动作有审计记录。

### 2.2 不追求

- 不在 Event 形成时批量生成候选。
- 不把账号参与规则硬编码成固定 if/else。
- 不让内容生成 Workflow 绕过 Event Context Pack 直接读取页面状态。
- 不实现自动发布到 X。
- 本模块通过可替换的 `PublicationMetricsCollector` 自动抓取发布后的 X 指标；当前默认实现使用发布 URL 解析账号和 statusId，再调用 `x.getAccountPosts` 匹配账号时间线中的对应帖子。

## 3. 与 v1 服务的关系

参考旧服务：

- `/Users/qmk/work/hotspot-monitor-v1/hotspot-monitor-server/src/account/account.seed.ts`
- `/Users/qmk/work/hotspot-monitor-v1/hotspot-monitor-server/src/task/task.service.ts`

可保留的思想：

- 账号有基础层和人设层。
- 基础层账号等价于 v1 的 `takesAllEvents = true`，默认承接所有触发 Event。
- 人设层账号需要根据事件和账号人设判断是否参与。
- 同一 `eventId + accountId` 幂等去重，只建一个任务。
- 任务详情页可以基于账号、Event 和用户要求生成 3 条候选。

需要废弃的实现方式：

- v1 的 `assignAndGenerate` 把账号分配、任务创建、批量候选生成耦合在一个服务方法里。
- v1 的 `GENERATE_SYSTEM_PROMPT` 和 `PARTICIPATE_SYSTEM_PROMPT` 固定写在 TypeScript 代码里。
- v1 在任务创建时使用 `status = '生成中'`，随后立即写入 `candidates`。
- v1 的候选只是 `Task.candidates` JSON 数组，缺少候选版本、预检、审计和最终采用版本。

新架构应把业务规则放在 Markdown Workflow，把后端保留为运行时、存储、审计和通用命令执行器。

## 4. 职责边界

| 层 | 负责 | 不负责 |
| --- | --- | --- |
| Event Workflow | 判断是否创建或更新 Event，输出是否启动响应链路 | 选择账号、生成内容 |
| Account Assignment Workflow | 根据 Event Context Pack 和账号配置决定任务分配 | 写数据库、生成候选 |
| Content Generation Workflow | 在任务详情页生成账号专属候选 | 创建任务、发布内容 |
| Risk Precheck Workflow | 校验候选事实、平台、法律、品牌、产品风险 | 绕过账号规则、自动发布 |
| Backend Runtime | 加载 Workflow、构建 Context、校验输出、执行命令、记录审计 | 写死业务判断 |
| Content API | 暴露任务列表、详情、生成、发布回填接口 | 直接调用外部社媒发布 |

## 5. 主链路

### 5.1 Event 触发响应

当 Event Workflow 输出 `startResponsePipeline = true`，Command Executor 创建或复用 Event 后，应启动账号分配入口。

服务端行为：

1. 构建 `AccountAssignmentContextV1`。
2. 加载启用的 `workflows/content/account-assignment` Markdown Workflow。
3. 调用模型输出结构化分配命令。
4. 校验命令只包含已启用账号。
5. 为每个参与账号创建或复用 `content_task`。
6. Event 状态保持或更新为 `responding`。
7. 记录 Workflow Definition 和 Workflow Run 审计；如果 Workflow 不可用或输出不合法，后端使用关键词规则兜底，保证基础链路不中断。

### 5.2 账号任务创建

账号任务创建后不生成候选，默认进入 `ready_for_generation`。

任务列表展示：

- Event 标题和事实摘要。
- 账号名称、账号类型、角色说明和 Skill。
- 触发来源、优先级、创建时间。
- 任务状态。
- 是否已有候选。
- 风险状态摘要。

### 5.3 任务详情页生成候选

运营人员进入任务详情页后，可以点击生成候选。

服务端行为：

1. 读取最新 Event Context Pack。
2. 读取任务绑定的账号配置和 Skill 版本。
3. 读取当前任务已有候选和用户指令。
4. 运行 Content Generation Workflow。
5. 校验输出为 3 条候选，或明确失败原因。
6. 对每条候选运行 Risk Precheck Workflow。
7. 保存候选版本、预检结果和生成审计。
8. 将合格候选展示在任务详情页。

首次生成和重生成使用同一入口，区别只在 `generationKind`：

- `initial`：任务首次生成。
- `regenerate_all`：整批重生成。
- `revise_selected`：基于某条候选和用户要求生成新版本。

## 6. Account Assignment Workflow

建议目录：

```text
workflows/content/account-assignment/
  WORKFLOW.md
  output.schema.json
  examples/
    base-and-persona-response.json
```

Frontmatter：

```yaml
---
id: account-assignment
name: 内容响应账号分配
type: content_generation
version: 1.0.0
status: enabled
input_schema: account_assignment_context_v1
output_schema: account_assignment_commands_v1
model: default_reasoning
---
```

输入合同：

```ts
interface AccountAssignmentContextV1 {
  schemaVersion: 'account_assignment_context_v1';
  workflowRunId: string;
  eventContextPack: EventContextPackV1;
  responseTrigger: {
    sourceWorkflowRunId: string;
    sourceCommandId: string;
    entryMode: 'x_trend' | 'x_topic_circle' | 'future_event' | 'manual';
    triggerReason: string;
    businessPriority: string;
    observedAt: string;
  };
  accounts: OperationAccountForAssignment[];
  existingTasks: ExistingContentTask[];
}

interface OperationAccountForAssignment {
  id: string;
  key: string;
  name: string;
  enabled: boolean;
  accountType: 'base_pipeline' | 'persona';
  responseMode: 'always' | 'workflow_decision' | 'manual_only';
  xAccountId: string;
  skill: string;
  skillVersion: string;
  roleDefinition: string;
  scenario: string;
  capacity?: {
    dailySuggestedMin?: number;
    dailySuggestedMax?: number;
  };
}

interface ExistingContentTask {
  id: string;
  eventId: string;
  accountId: string;
  status: string;
  skill: string;
  skillVersion: string;
  createdAt: string;
}
```

输出合同：

```ts
interface AccountAssignmentCommandsV1 {
  schemaVersion: 'account_assignment_commands_v1';
  workflowId: 'account-assignment';
  workflowVersion: string;
  runId: string;
  commands: AccountAssignmentCommand[];
  diagnostics?: { level: 'info' | 'warning' | 'error'; message: string }[];
}

type AccountAssignmentCommand =
  | CreateContentTaskCommand
  | ObserveAccountCommand
  | SkipAccountCommand;

interface CreateContentTaskCommand {
  type: 'create_content_task';
  idempotencyKey: string;
  eventId: string;
  accountId: string;
  skill: string;
  skillVersion: string;
  assignmentReason: string;
  priority: 'urgent' | 'high' | 'normal' | 'low';
  source: {
    workflowRunId: string;
    commandId?: string;
    triggerReason: string;
  };
}

interface ObserveAccountCommand {
  type: 'observe_account';
  idempotencyKey: string;
  eventId: string;
  accountId: string;
  reason: string;
}

interface SkipAccountCommand {
  type: 'skip_account';
  idempotencyKey: string;
  eventId: string;
  accountId: string;
  reason: string;
}
```

规则：

- `responseMode = always` 的基础生产线默认输出 `create_content_task`，除非 Event 被标记为 `blocked` 或 `internal_only`。
- `responseMode = workflow_decision` 的人设账号必须按角色定义判断参与、观察或跳过。
- `responseMode = manual_only` 不自动创建任务，只能人工指派。
- Workflow 不得给未启用账号创建任务。
- Workflow 不得创建重复的 `eventId + accountId` 任务；已有任务时应输出诊断或跳过。

## 7. Content Generation Workflow

建议目录：

```text
workflows/content/account-task-candidate-generation/
  WORKFLOW.md
  output.schema.json
  examples/
    initial-generation.json
    regenerate-with-instruction.json
```

输入合同：

```ts
interface AccountTaskGenerationContextV1 {
  schemaVersion: 'account_task_generation_context_v1';
  workflowRunId: string;
  generationKind: 'initial' | 'regenerate_all' | 'revise_selected';
  task: {
    id: string;
    eventId: string;
    accountId: string;
    status: string;
    skill: string;
    skillVersion: string;
  };
  eventContextPack: EventContextPackV1;
  account: OperationAccountForAssignment;
  existingCandidates: ExistingContentCandidate[];
  userInstruction?: string;
}

interface ExistingContentCandidate {
  id: string;
  batchId: string;
  format: 'original_post' | 'thread' | 'quote' | 'reply';
  text: string;
  targetPostUrl?: string;
  angle: string;
  riskStatus: string;
  status: string;
  createdAt: string;
}
```

输出合同：

```ts
interface AccountTaskCandidateOutputV1 {
  schemaVersion: 'account_task_candidate_output_v1';
  workflowId: 'account-task-candidate-generation';
  workflowVersion: string;
  runId: string;
  candidates: GeneratedContentCandidate[];
  refusal?: {
    reason: string;
    riskLevel?: 'high' | 'blocked';
  };
}

interface GeneratedContentCandidate {
  localKey: string;
  format: 'original_post' | 'thread' | 'quote' | 'reply';
  text: string;
  targetPostUrl?: string;
  angle: string;
  factualClaims: string[];
  uncertaintyNotes: string[];
  productBridge?: 'market_bridge' | 'ambient_brand' | 'quiet_presence' | 'none';
}
```

规则：

- 正常生成必须返回 3 条候选。
- 引用或评论必须提供真实 `targetPostUrl`；没有合适目标时改用原创或拒绝。
- 用户要求不能改变 Event 事实、突破表达边界或绕过账号 Skill。
- 生成失败不删除已有候选。
- 重新生成会创建新的候选批次，不静默覆盖历史版本。

## 8. 数据模型建议

当前已有 `OperationAccount`，但缺少账号响应任务和候选版本表。建议新增：

```prisma
model ContentTask {
  id                     String   @id
  eventId                String
  accountId              String
  workflowRunId          String?
  assignmentCommandId    String?
  status                 String
  priority               String
  skill                  String
  skillVersion           String
  assignmentReason       String
  riskStatus             String
  latestCandidateBatchId String?
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt

  @@unique([eventId, accountId])
  @@index([status, priority, createdAt])
  @@map("content_task")
}

model ContentCandidateBatch {
  id              String   @id
  taskId          String
  workflowRunId   String
  generationKind  String
  userInstruction String?
  status          String
  createdAt       DateTime @default(now())

  @@index([taskId, createdAt])
  @@map("content_candidate_batch")
}

model ContentCandidate {
  id               String   @id
  batchId          String
  taskId           String
  localKey         String
  format           String
  text             String
  targetPostUrl    String?
  angle            String
  factualClaims    Json
  uncertaintyNotes Json
  productBridge    String?
  riskStatus       String
  precheckPayload  Json?
  status           String
  createdAt        DateTime @default(now())

  @@index([taskId, status])
  @@map("content_candidate")
}

model PublicationRecord {
  id              String   @id
  taskId          String
  candidateId     String
  eventId         String
  accountId       String
  url             String   @unique
  status          String
  publishedAt     DateTime
  trackingStatus  String
  trackingEndsAt  DateTime?
  createdAt       DateTime @default(now())

  @@index([eventId, accountId])
  @@map("publication_record")
}

model PublicationMetric {
  id                  String   @id
  publicationRecordId String
  likes               Int
  replies             Int
  reposts             Int
  quotes              Int?
  views               Int?
  capturedAt          DateTime
  createdAt           DateTime @default(now())

  @@index([publicationRecordId, capturedAt])
  @@map("publication_metric")
}
```

`OperationAccount.fields` 当前已保存 `xAccountId`、`type`、`personaType`、`skill` 和 `scenario`。实现时可以先用 JSON 字段兼容读取，再逐步决定是否把高频字段列化。

## 9. 状态机

账号任务状态：

| 状态 | 含义 |
| --- | --- |
| `ready_for_generation` | 任务已创建，尚未生成候选 |
| `generating` | 正在生成候选 |
| `generation_failed` | 本次生成失败，保留任务和历史候选 |
| `ready_for_publish` | 有可发布候选，等待人工发布并回填 URL |
| `precheck_blocked` | 候选高风险或禁止生成，需要授权处理 |
| `published` | 已回填有效 URL |
| `tracking` | 发布完成且追踪中 |
| `completed` | 发布和追踪建立完成 |
| `abandoned` | 人工放弃发布 |

候选状态：

| 状态 | 含义 |
| --- | --- |
| `draft` | 生成后待预检或预检中 |
| `available` | 通过预检，可发布 |
| `warning` | 中风险，可发布但显示提示 |
| `blocked` | 高风险或禁止生成，不可复制发布 |
| `superseded` | 被新批次替代 |
| `published` | 已作为发布记录使用 |

## 10. API 建议

```text
GET  /content/tasks
GET  /content/tasks/:id
POST /content/tasks/:id/generate
POST /content/tasks/:id/candidates/:candidateId/revise
POST /content/tasks/:id/candidates/:candidateId/precheck
POST /content/tasks/:id/publish
POST /content/publications/:id/metrics
POST /content/publications/:id/complete-tracking
POST /content/tasks/:id/abandon
```

`POST /content/tasks/:id/generate` 请求：

```json
{
  "generationKind": "initial",
  "instruction": ""
}
```

响应：

```json
{
  "taskId": "task_...",
  "batchId": "candidate_batch_...",
  "status": "ready_for_publish",
  "candidates": [
    {
      "id": "candidate_...",
      "format": "original_post",
      "text": "...",
      "riskStatus": "low",
      "status": "available"
    },
    {
      "id": "candidate_...",
      "format": "thread",
      "text": "...",
      "riskStatus": "low",
      "status": "available"
    },
    {
      "id": "candidate_...",
      "format": "quote",
      "text": "...",
      "riskStatus": "warning",
      "status": "warning"
    }
  ]
}
```

`POST /content/publications/:id/metrics` 请求：

```json
{
  "likes": 12,
  "replies": 3,
  "reposts": 4,
  "quotes": 1,
  "views": 3200,
  "capturedAt": "2026-08-20T01:55:00.000Z"
}
```

响应：

```json
{
  "publicationRecordId": "pub_...",
  "trackingStatus": "tracking",
  "metric": {
    "id": "metric_...",
    "likes": 12,
    "replies": 3,
    "reposts": 4,
    "quotes": 1,
    "views": 3200,
    "capturedAt": "2026-08-20T01:55:00.000Z"
  }
}
```

## 11. Command Executor 扩展

当前 `EventCommandExecutor` 只处理 `create_event`、`update_event_context` 和 `ignore`。建议新增独立的 `ContentCommandExecutor`，不要把账号任务命令塞进事件执行器。

新增命令类型：

- `create_content_task`
- `observe_account`
- `skip_account`

执行要求：

- `create_content_task` 使用 `eventId + accountId` 幂等。
- 已存在任务时记录 command execution 为 `skipped`，并返回已有任务 ID。
- 账号禁用、账号不存在或 Event 不存在时记录失败，不影响其他命令。
- `observe_account` 和 `skip_account` 写入审计表或任务分配日志，方便复盘为什么某账号没有参与。

## 12. Event Context Pack

内容生成和账号分配都必须通过 Event Context Pack 获取事实边界。首期可由服务端从 `event`、`event_intake`、`event_source_context`、`event_evidence` 组装，不需要新表。

最低字段：

```ts
interface EventContextPackV1 {
  schemaVersion: 'event_context_pack_v1';
  eventId: string;
  title: string;
  oneLineSummary: string;
  status: string;
  confirmationLevel: string;
  expressionBoundary: string;
  confirmedFacts: string[];
  unconfirmedFacts: string[];
  evidenceRecords: {
    sourceType: string;
    url?: string;
    claim: string;
    payload?: unknown;
  }[];
  sourceContexts: unknown[];
  relatedEvents: {
    eventId: string;
    relationType: string;
    title: string;
    oneLineSummary?: string;
  }[];
  generatedAt: string;
}
```

## 13. 异常与幂等

- Event 重复触发响应时，不重复创建同账号任务。
- 任务创建失败只影响该账号，其他账号继续创建。
- 候选生成失败不关闭任务，任务保持可重试。
- 新关联 Event 出现后，未发布候选标记为 `superseded` 或 `blocked`，任务提示基于最新 Context Pack 重新生成。
- URL 回填必须校验格式、去重，并尽量校验 URL 账号与任务账号一致。
- 发布失败不占用单账号单 Event 的发布名额。

## 14. 测试范围

单元测试：

- `AccountAssignmentContextBuilder` 正确组装 Event Context Pack、账号配置和已有任务。
- `AccountAssignmentOutputValidator` 拒绝未启用账号、重复账号和 schema 外命令。
- `ContentCommandExecutor` 对 `eventId + accountId` 幂等创建任务。
- `AccountTaskGenerationContextBuilder` 使用最新 Event Context Pack 和账号 Skill。
- `ContentCandidateOutputValidator` 要求正常输出 3 条候选。
- URL 校验拒绝重复 URL 和非 X status URL。

集成测试：

- X 热搜 Event 创建后触发账号任务创建，但不会创建候选。
- 主题圈 Event 创建后复用同一账号任务入口。
- 未来事件手动响应创建或复用 Event 后进入同一账号任务入口。
- 任务详情页首次生成后创建候选批次和 3 条候选。
- 人设账号分配失败不影响基础生产线账号任务。

## 15. 实施顺序

1. 更新平台规则 SPEC 中内容生成合同：从“触发后生成 3 条候选”改为“触发后创建账号任务，任务详情页按需生成候选”。
2. 新增 `ContentTask`、`ContentCandidateBatch`、`ContentCandidate`、`PublicationRecord`、`PublicationMetric` 数据模型。
3. 实现 Event Context Pack Builder。
4. 实现 Account Assignment Workflow、schema、validator 和 context builder。
5. 实现 Content Command Executor 并接入 Event 创建后的响应链路。
6. 实现内容任务 API 的列表和详情。
7. 实现任务详情页候选生成 Workflow、schema、validator 和保存逻辑。
8. 实现预检 Workflow、发布 URL 回填和放弃发布。
9. 补齐指标写入、自动采集和追踪完成入口，由自动采集模块消费 `PublicationRecord` 并写入 `PublicationMetric`。
10. 补齐 content Workflow run 级审计；命令级细分审计后续根据复盘需求再扩展。

## 16. SPEC 修订点

需要同步修订 `hotspot-monitor-doc/_bmad-output/specs/spec-platform-rules/SPEC.md`：

- CAP-4 的 success 从“每个参与账号生成规定候选或明确异常”改为“每个参与账号建立唯一任务；候选在任务详情页按需生成，生成失败记录明确异常”。
- 第 5 节共同规则中删除“每个被触发响应的账号 Skill 必须生成 3 条账号专属候选”作为触发时义务，改为“每个账号任务首次生成时默认生成 3 条账号专属候选”。
- 第 5.1 节从“每个账号的 3 条合格候选全部进入待发布区”改为“候选生成后，合格候选进入该账号任务详情的待发布区”。
- 预检部分保留“生成后必须预检”的约束，但不要求没有候选的任务进入内容异常。

以上修订完成后，后端实现文档和 canonical SPEC 才不会互相打架。
