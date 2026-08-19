# X 热搜榜生成 Event Workflow Runtime 设计

## 1. 核心结论

热搜榜生成 Event 的规则必须外置到 Markdown Workflow。服务端不内置 TR-01、TR-02、TR-03、TR-04，也不写死排名阈值、地区数量、采集地区、代表帖子数量或 T0 定义。

服务端只提供稳定运行时：

```text
采集快照
  -> 构建 Workflow Context
  -> 加载 Markdown Workflow
  -> 调用 LLM 执行业务规则
  -> 校验结构化输出
  -> 执行 Event Commands
  -> 记录版本与审计
```

这样后续规则变化时，默认只改 Workflow Markdown，不改服务端代码。

## 2. 设计目标

### 2.1 要做到

- 规则阈值变化不改服务端代码。
- 触发条件增删改不改服务端代码。
- 目标地区变化不改服务端代码。
- 重点主题语义规则变化不改服务端代码。
- 同一 Event 的重复命中、上下文追加和首次启动响应由 Workflow 输出命令决定。
- 每次判断都记录输入上下文、Workflow 版本、模型输出、校验结果和最终执行命令。

### 2.2 不追求

- 不让服务端理解每条业务规则的具体含义。
- 不把热搜规则做成代码枚举。
- 不把 LLM 输出直接写库。
- 不允许 Workflow 任意修改数据库。

## 3. 职责边界

| 层 | 负责 | 不负责 |
| --- | --- | --- |
| 数据采集层 | 调 Twitter/X API，保存快照、快照条目、diff、signal | 判断是否形成 Event |
| Context Builder | 从数据库取成功快照、相邻快照、重点主题配置、历史 Event 候选，组装输入 | 执行业务规则 |
| Markdown Workflow | 定义规则、语义判断、Event Intake 生成、命令选择 | 直接写数据库、绕过 Schema |
| LLM Runtime | 按 Workflow 和 Context 输出结构化 JSON | 自行读取数据库 |
| Schema Validator | 校验输出字段、命令类型、必填项、幂等键 | 判断业务是否正确 |
| Command Executor | 执行 create/update/ignore 等通用命令 | 理解 TR-01 具体条件 |
| Audit Log | 记录版本、输入、输出、执行结果 | 修改业务结论 |

一句话：**业务规则在 Workflow，服务端只执行通用命令。**

## 4. 规则变动对代码的影响

### 4.1 不需要改服务端代码的变化

这些变化只改 Markdown Workflow：

- `rank <= 5` 改成 `rank <= 8`。
- `上升至少 10 位` 改成 `上升至少 6 位`。
- `至少两个地区` 改成 `至少三个地区`。
- 五个地区改成更多地区，只要采集配置已经能提供这些地区快照。
- 新增 `TR-05：同一 Event 连续两小时在 Top 10`。
- 删除某条触发规则。
- 修改重点主题正例、反例、关键词解释。
- 修改代表帖子证明边界。
- 修改 T0 的业务定义。
- 修改“首次命中启动响应、后续命中只更新上下文”的判断口径。

### 4.2 可能需要改服务端代码的变化

只有这些属于平台能力变化：

- Workflow 需要的输入字段当前 Context 没有，例如账号粉丝数、帖子作者可信度、外部新闻证据。
- Workflow 需要新的外部数据能力，例如 YouTube 搜索、新闻正文抓取、X 代表帖子获取。
- Workflow 需要新的命令类型，例如 `merge_event`、`split_event`、`pause_content_tasks`。
- Event 存储模型无法表达新业务对象。
- 权限、审计或人工审批状态需要新增系统能力。

原则：**规则变化不改代码，输入能力和动作能力变化才改代码。**

## 5. Workflow 文件形态

建议目录：

```text
workflows/
  event-formation/
    x-trend-event-formation/
      WORKFLOW.md
      output.schema.json
      examples/
        tr-01-top5.json
        tr-02-rank-up.json
        tr-04-cross-region.json
```

### 5.1 WORKFLOW.md Frontmatter

```yaml
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
```

### 5.2 WORKFLOW.md 正文结构

```md
# 目标

根据 X 热搜榜成功快照判断是否创建或更新 Event。

# 输入说明

说明 context 中每个字段的业务含义。

# 当前规则

把 TR-01/TR-02/TR-03/TR-04 写在这里。

# 具体 Event 判断

定义什么是“同一具体 Event”，什么只是泛主题。

# 重点主题匹配

定义语义关键词、正例、反例如何使用。

# 证据边界

代表帖子证明 X 上正在传播的说法，不证明现实事实为真。

# 输出要求

只能输出符合 schema 的 JSON。

# 禁止事项

不得编造事实、不得跳过 evidence、不得输出 schema 外命令。
```

## 6. Workflow Context 合同

Context Builder 给 Workflow 的输入应稳定，不包含服务端业务判断结论。

```ts
interface XTrendEventContextV1 {
  schemaVersion: 'x_trend_event_context_v1'
  workflowRunId: string
  observedAt: string
  ruleVersionHint?: string

  currentBatch: {
    batchId: string
    collectedAt: string
    successfulRegions: TrendRegionSnapshot[]
    failedRegions: FailedRegionFetch[]
  }

  previousSuccessfulSnapshots: {
    byRegion: Record<string, TrendRegionSnapshot | null>
  }

  snapshotDiffs: TrendSnapshotDiff[]
  configuredTopics: ConfiguredTopic[]
  eventCandidates: EventCandidate[]
  recentEventHistory: ExistingEventSummary[]
}
```

### 6.1 地区快照

```ts
interface TrendRegionSnapshot {
  region: string
  snapshotId: string
  collectedAt: string
  items: TrendSnapshotItem[]
}

interface TrendSnapshotItem {
  rank: number
  title: string
  query?: string
  normalizedKey: string
  url?: string
  rawRef: {
    platform: 'x'
    table: 'x_trend_snapshot_item'
    id: string
  }
}
```

### 6.2 相邻成功快照差异

```ts
interface TrendSnapshotDiff {
  region: string
  currentSnapshotId: string
  previousSnapshotId?: string
  entered: DiffItem[]
  exited: DiffItem[]
  rankUp: DiffItem[]
  rankDown: DiffItem[]
  unchanged: DiffItem[]
}
```

失败采集不进入 diff。只有相邻两次成功快照参与排名变化判断。

### 6.3 重点主题配置

```ts
interface ConfiguredTopic {
  id: string
  name: string
  semanticKeywords: string[]
  positiveExamples: string[]
  negativeExamples: string[]
  enabled: boolean
}
```

重点主题如何触发由 Workflow 文档解释，服务端只提供配置。

### 6.4 历史 Event 候选

服务端不让模型无边界扫库，只召回少量候选。

```ts
interface ExistingEventSummary {
  eventId: string
  title: string
  summary?: string
  normalizedKey?: string
  status: string
  sourceContexts: unknown[]
  formedAt: string
}
```

## 7. Workflow 输出合同

Workflow 不直接创建数据库记录，只输出命令。

```ts
interface EventWorkflowCommandsV1 {
  schemaVersion: 'event_workflow_commands_v1'
  workflowId: string
  workflowVersion: string
  runId: string
  commands: EventCommand[]
  diagnostics?: WorkflowDiagnostic[]
}
```

### 7.1 命令类型

首期只支持三个命令：

```ts
type EventCommand =
  | CreateEventCommand
  | UpdateEventContextCommand
  | IgnoreSignalCommand
```

### 7.2 create_event

```ts
interface CreateEventCommand {
  type: 'create_event'
  idempotencyKey: string
  eventCandidate: {
    title: string
    subject?: string
    action?: string
    object?: string
    oneLineSummary: string
    normalizedEventKey: string
    confidence: 'high' | 'medium' | 'low'
  }
  eventIntake: EventIntakePayload
  trigger: TriggerPayload
  sourceContext: XTrendSourceContext
  evidenceRecords: EvidenceRecordPayload[]
  startResponsePipeline: boolean
}
```

### 7.3 update_event_context

```ts
interface UpdateEventContextCommand {
  type: 'update_event_context'
  idempotencyKey: string
  targetEventId: string
  reason: string
  trigger?: TriggerPayload
  sourceContextPatch: XTrendSourceContext
  evidenceRecords?: EvidenceRecordPayload[]
  startResponsePipeline: false
}
```

重复进入热搜、更多地区出现、排名变化或补充代表帖子时，优先使用该命令。

### 7.4 ignore

```ts
interface IgnoreSignalCommand {
  type: 'ignore'
  idempotencyKey: string
  reason: string
  sourceRefs: SourceRef[]
}
```

用于泛主题、无具体事件、低置信度或命中反例的情况。

## 8. 热搜规则如何写入 Workflow

SPEC 中的首期规则应写在 Workflow 文档中，而不是服务端代码中：

```md
## X 热搜触发规则

首期每小时采集 Worldwide、United States、United Kingdom、Japan、Korea 五个榜单，每榜 Top 30。
只有成功采集形成快照；失败采集不参与排名变化。

以下任一规则独立触发完整响应：

- TR-01：具体 Event 首次进入任一目标榜单第 1-5 位。
- TR-02：同一 Event 在相邻两次成功小时快照间上升至少 10 位。
- TR-03：具体 Event 语义命中已配置重点主题。
- TR-04：同一具体 Event 同时出现在至少两个目标地区榜单。

四条路径均不等待人工是否参与。
T0 记录系统首次成功发现合格触发的时间。

每个出现地区使用 X 默认热门排序，获取实际可取得的最多 3 条代表帖子。
代表帖子证明 X 上正在传播的说法，不当然证明现实事实为真。
```

未来规则调整只改这一段和示例。

## 9. 代表帖子获取策略

代表帖子是 Workflow 判断后的补充证据。建议分两阶段：

1. Workflow 先根据榜单快照决定候选 Event 和出现地区。
2. Runtime 对命中的地区调用 `x.searchPosts` 或 `x.getRepresentativePosts` 获取最多 3 条代表帖子。
3. Runtime 把代表帖子追加给 Workflow 二次确认，或直接交给 Event Intake 生成 Workflow。

为了保持规则可变，服务端只提供通用能力：

```ts
getRepresentativePosts({
  platform: 'x',
  query: string,
  region: string,
  limit: number
})
```

`limit = 3` 是 Workflow 参数，不是服务端常量。

## 10. 幂等与重复触发

服务端只按 Workflow 输出的 `idempotencyKey` 去重，不理解具体规则。

建议 Workflow 生成：

```text
x_trend:{workflowVersion}:{normalizedEventKey}:{triggerRuleId}:{firstObservedBucket}
```

执行规则：

- 同一 `idempotencyKey` 已执行过，则忽略重复命令。
- 同一 Event 首次 `create_event` 且 `startResponsePipeline=true`，启动内容响应。
- 后续同 Event 命中只允许 `update_event_context`，除非 Workflow 判断为新的动作、结果、更正或反转。

## 11. Event Intake 载荷

```ts
interface EventIntakePayload {
  schemaVersion: 'event_intake_v1'
  entryMode: 'x_trend'
  observedAt: string
  t0?: string
  title: string
  oneLineSummary: string
  confirmationLevel: 'unconfirmed' | 'partially_supported' | 'confirmed' | 'conflicting'
  expressionBoundary: string
  confirmedFacts: string[]
  unconfirmedFacts: string[]
  evidenceRecords: EvidenceRecordPayload[]
  trendContext: XTrendSourceContext
  trigger: TriggerPayload
  candidateEventIds: string[]
  dedupeKey: string
}
```

默认情况下，X 热搜和代表帖子只支持 `unconfirmed` 或 `partially_supported`，不能直接写成现实事实已确认。

## 12. Event Command Executor

Executor 是服务端代码，但它只理解通用命令。

### 12.1 create_event 执行

1. 检查 `idempotencyKey` 是否执行过。
2. 根据 `normalizedEventKey` 和候选 Event 召回复用对象。
3. 无可复用 Event 时创建 Event。
4. 写入 Event Intake、Evidence、Source Context。
5. 如果 `startResponsePipeline=true`，创建内容响应流水线任务。
6. 写审计日志。

### 12.2 update_event_context 执行

1. 检查目标 Event 是否存在。
2. 检查 `idempotencyKey` 是否执行过。
3. 追加热搜上下文、地区、排名、代表帖子、触发说明。
4. 不重复启动内容响应。
5. 写审计日志。

### 12.3 ignore 执行

1. 记录忽略原因。
2. 关联相关 Signal 或 Snapshot Item。
3. 不创建 Event。

## 13. Workflow Runtime 表建议

首期建议增加通用运行表：

```text
workflow_definition
workflow_run
workflow_run_input
workflow_run_output
workflow_command
workflow_command_execution
event_intake
event_source_context
event_evidence
```

### 13.1 workflow_definition

保存 Workflow 元信息和版本：

```ts
{
  id: string
  workflowId: string
  name: string
  type: 'event_formation' | 'content_generation' | 'promotion_monitoring'
  version: string
  status: 'draft' | 'enabled' | 'disabled'
  markdownPath: string
  outputSchemaPath: string
  checksum: string
  createdAt: Date
  updatedAt: Date
}
```

### 13.2 workflow_run

记录每次执行：

```ts
{
  id: string
  workflowDefinitionId: string
  status: 'running' | 'success' | 'failed' | 'partial_success'
  startedAt: Date
  finishedAt?: Date
  model?: string
  error?: string
}
```

### 13.3 workflow_command_execution

记录命令是否执行成功：

```ts
{
  id: string
  workflowRunId: string
  commandType: string
  idempotencyKey: string
  status: 'success' | 'skipped' | 'failed'
  targetEventId?: string
  error?: string
}
```

## 14. 示例：规则变化不改代码

### 14.1 原规则

```md
TR-01：具体 Event 首次进入任一目标榜单第 1-5 位。
```

### 14.2 新规则

```md
TR-01：具体 Event 首次进入任一目标榜单第 1-8 位，且至少取得 2 条代表帖子。
```

服务端不变：

- Context Builder 仍提供榜单快照和代表帖子能力。
- LLM Runtime 仍执行 Workflow。
- Validator 仍校验 `commands[]`。
- Executor 仍执行 `create_event` 或 `update_event_context`。

只需要更新 `WORKFLOW.md` 和示例。

## 15. 与采集层的关系

采集层继续负责：

- 每小时按配置采集 X 榜单。
- 成功采集形成快照。
- 失败采集记录失败 run，但不形成快照。
- 保存 `x_trend_snapshot`、`x_trend_snapshot_item`、`source_snapshot`、`source_snapshot_item`、`source_snapshot_diff`、`signal`。

Workflow Runtime 只消费成功快照和 diff。采集地区、采集频率、Top N 是采集配置；这些配置可以由运营设置或 Workflow 引用，但事件形成规则不进入采集代码。

## 16. 与内容响应流水线的关系

Workflow 输出 `startResponsePipeline=true` 时，Event Command Executor 只发送一个通用动作：

```text
start_content_response(eventId, contextPackVersion)
```

内容生成规则由内容 Workflow 决定，不属于热搜 Event Formation Workflow。

## 17. 失败处理

- Context Builder 失败：本次 Workflow Run 标记失败，不创建 Event。
- LLM 调用失败：最多按运行时策略重试，失败后进入人工异常。
- JSON Schema 校验失败：不执行命令，记录原始输出和错误。
- 单条命令执行失败：其他命令可继续执行，失败命令进入人工处理。
- 代表帖子获取失败：由 Workflow 决定是否允许不足数量继续；服务端只记录实际取得数量和错误。

## 18. 审计要求

每个 Event 必须能追溯：

- 使用了哪个 Workflow。
- Workflow 版本和 checksum。
- 输入了哪些快照、diff、topic 配置和历史 Event 候选。
- 模型输出了哪些命令。
- 哪些命令被执行、跳过或失败。
- 为什么启动或没有启动内容响应流水线。

## 19. 当前推荐落地顺序

1. 建立 Workflow 文件目录和示例 `x-trend-event-formation/WORKFLOW.md`。
2. 建立 Workflow Runtime 最小表。
3. 实现 Context Builder，先支持 X 热搜成功快照。
4. 实现 LLM Workflow Runner 和 JSON Schema 校验。
5. 实现三类命令：`create_event`、`update_event_context`、`ignore`。
6. 接入代表帖子获取工具。
7. 将 SPEC 中 TR-01/TR-02/TR-03/TR-04 写入首版 Workflow。
8. 做端到端审计页面或调试接口。

## 20. 最终边界

服务端可以长期稳定，因为它只提供：

- 数据读取能力。
- Workflow 执行能力。
- 输出校验能力。
- Event 命令执行能力。
- 审计能力。

业务人员和 Codex 后续主要维护：

- Workflow Markdown。
- 示例输入输出。
- 重点主题配置。
- 输出 Schema 的兼容版本。

这才满足“规则怎么变，服务端不用改”的目标。
