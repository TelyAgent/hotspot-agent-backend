# 动态工作流与工具调用架构设计

## 1. 背景与问题

当前系统已经具备 `WORKFLOW.md + output.schema.json + WorkflowRunner` 的雏形，能够让运营规则以 Markdown 的方式被查看、修改、测试和版本化。这个方向是对的，但现在的工作流仍然偏“静态”：

```text
后端代码先决定采哪些数据、算哪些指标、塞哪些字段
→ Workflow 只能基于这些固定字段判断
→ 模型输出固定命令
→ 后端执行固定命令
```

这会导致一个明显问题：**工作流能修改规则文字，但不能扩展它能看到的数据和能采取的动作**。

例如现在主题圈事件形成可以改：

```text
B3h >= 3
B24h >= 6
Tmax >= 3
B3h >= 2 且 Tmax >= 2
```

但如果运营规则变成：

```text
过去 6 小时某类账号连续讨论同一项目；
其中至少一个账号历史命中率较高；
YouTube 同主题视频也进入升温；
Google 搜索或小众平台同步出现关注度；
且现有事件库中没有相同语义事件。
```

当前工作流就不够用了。原因不是 Markdown 不能表达，而是运行时没有把这些能力暴露给工作流：

- 没有按需查询 X 帖子的工具调用能力。
- 没有查询 YouTube 视频或字幕的工具调用能力。
- 没有搜索外部网页或小众平台的工具调用能力。
- 没有读取历史基线、账号可信度、相似事件的统一工具。
- 没有让模型在执行过程中根据中间结果继续补充证据的循环。
- 输出动作也主要集中在 `create_event`、`update_event_context`、`ignore` 等少数命令。

所以当前瓶颈可以概括为：

```text
工作流文档可改，但工作流能力不可扩展。
```

下一阶段要解决的不是“把规则写得更复杂”，而是让工作流从固定上下文判断升级为：

```text
目标驱动
→ 可调用受控工具
→ 按需补充证据
→ 累积上下文
→ 输出可扩展动作
→ 全链路审计与回放
```

## 2. 设计目标

### 2.1 监测可扩展

系统应支持热搜、指定账号、圈层账号、YouTube、搜索及小众平台。平台首次接入后，业务人员可以配置：

- 监测对象：地区、关键词、账号、频道、圈层、站点、RSS、榜单。
- 监测频率：cron、interval、手动触发、事件驱动触发。
- 触发规则：结构化阈值、自然语言条件、多平台交叉验证。
- 爆款拆解：把视频、帖子、文章等内容拆为可复用洞察。

### 2.2 内容产出可扩展

系统应通过内容类型、生成方式、语气、人设和通用 Skill 的组合，快速适配不同热点、账号和渠道：

- 内容类型：快讯、长文、线程、产品承接、复盘、短视频脚本。
- 生成方式：基于事件、基于爆款、基于未来日程、基于账号历史。
- 账号人设：表达边界、立场、语气、禁用表述、产品承接方式。
- 通用 Skill：事实校验、风险检查、标题优化、产品桥接、格式适配。

### 2.3 渠道分发可扩展

新增渠道时，应复用统一的内容适配、审核、排期、发布和效果回流能力，而不是为每个渠道重建一套流程：

- 渠道适配：长度、标题、封面、标签、话题、链接、媒体格式。
- 审核规则：事实、合规、品牌、平台规则、风险词。
- 排期策略：立即发布、黄金时间、错峰、多账号矩阵。
- 发布连接器：X、YouTube、TikTok、LinkedIn、公众号、小众社区。
- 效果回流：浏览、播放、点赞、评论、转发、引用、点击、转化。

## 3. 核心架构

目标架构分为五层：

```text
平台连接层 Connector / Tool
→ 标准数据与能力注册层
→ 动态工作流运行时
→ 业务动作执行层
→ 审计、回放与治理层
```

### 3.1 平台连接层

平台连接层负责和外部平台打交道，包括鉴权、分页、限流、错误处理和原始数据获取。

典型工具：

```text
x.getTrending
x.searchPosts
x.getAccountPosts
x.getPostMetrics

youtube.getTrendingVideos
youtube.searchVideos
youtube.getVideoTranscript
youtube.getVideoMetrics

search.web
rss.fetchFeed
googleTrends.getInterest
smallPlatform.searchPosts

events.findSimilar
metrics.getHistoricalBaseline
accounts.getPersona
content.generateDraft
```

工具只做稳定的数据能力，不直接写死运营规则。

### 3.2 标准数据与能力注册层

每个工具都必须注册能力描述，告诉工作流它能做什么、输入是什么、输出是什么、成本是多少、权限是什么。

```ts
interface WorkflowToolDefinition {
  name: string
  description: string
  category: 'monitoring' | 'analysis' | 'content' | 'distribution' | 'metrics' | 'system'
  inputSchema: unknown
  outputSchema: unknown
  permissions: {
    read: string[]
    write: string[]
  }
  limits: {
    maxCallsPerRun: number
    timeoutMs: number
    costLevel: 'low' | 'medium' | 'high'
  }
  enabled: boolean
}
```

工具输出需要标准化成可累积证据，而不是只返回原始 JSON：

```ts
interface EvidenceItem {
  id: string
  toolName: string
  platform?: string
  sourceType: string
  sourceItemId?: string
  title?: string
  text?: string
  url?: string
  author?: string
  publishedAt?: string
  observedAt: string
  metrics?: Record<string, number | null>
  confidence?: 'high' | 'medium' | 'low'
  raw?: unknown
}
```

### 3.3 动态工作流运行时

动态工作流不是一次性把所有数据塞给模型，而是支持多轮执行：

```text
1. 初始上下文进入 Workflow
2. 模型或规则节点判断还需要哪些信息
3. 发起 Tool Call
4. 工具结果写入 Evidence Context
5. 模型基于新增证据继续判断
6. 达到停止条件后输出业务命令
7. 后端校验并执行命令
```

运行时需要明确边界：

- 每个 workflow 有工具白名单。
- 每次运行有最大工具调用次数。
- 每次运行有最大耗时。
- 每次运行有最大 token / 成本预算。
- 工具调用必须入库。
- 工具返回必须入库。
- 最终输出必须经过 schema 校验。
- 写操作必须经过命令执行器统一处理。

### 3.4 业务动作执行层

工作流最后输出的不是任意代码，而是业务命令：

```ts
type WorkflowCommand =
  | CreateEventCommand
  | UpdateEventContextCommand
  | CreateInsightCommand
  | CreateContentTaskCommand
  | GenerateContentCandidateCommand
  | RequestHumanReviewCommand
  | SchedulePublicationCommand
  | TrackPublicationCommand
  | IgnoreSignalCommand
```

命令执行器负责：

- 幂等校验。
- 权限校验。
- 数据库写入。
- 后续任务启动。
- 失败状态记录。

模型不能直接改数据库。

### 3.5 审计、回放与治理层

动态工作流必须可追踪，否则系统会变成不可解释的黑盒。

每次运行至少记录：

- 使用的 workflow id / version。
- 初始输入。
- 可用工具清单。
- 每次模型输出。
- 每次工具调用参数。
- 每次工具调用结果。
- Evidence Context 的增量。
- 最终业务命令。
- 命令执行结果。
- 错误和重试记录。
- 人工确认记录。

这样才能回答：

```text
为什么形成这个事件？
用了哪些数据源？
中间有没有工具失败？
模型有没有越界推断？
为什么创建这些账号任务？
为什么没有发布？
后续复盘依据是什么？
```

## 4. Workflow 文档结构升级

当前 `WORKFLOW.md` 主要描述输入、规则和输出。下一版需要增加工具、预算、阶段和停止条件。

建议格式：

```yaml
---
id: cross-platform-event-formation
name: 跨平台事件形成工作流
type: event_formation
version: 2.0.0
status: enabled
runtime: dynamic_tool_calling
toolPolicy:
  allowedTools:
    - x.searchPosts
    - youtube.searchVideos
    - search.web
    - events.findSimilar
    - metrics.getHistoricalBaseline
  maxToolCalls: 8
  timeoutMs: 90000
  requireHumanApprovalForWrite: false
outputs:
  schema: event_workflow_commands_v2
---
```

正文描述业务目标，而不是只描述固定字段：

```md
# 目标

判断输入信号是否应该形成一个运营事件。

# 可用信息

初始输入可能只有一个热搜词、一个主题圈候选或一个 YouTube 视频。
如果证据不足，可以调用白名单工具补充信息。

# 判断规则

当单平台信号不足以形成事件时，优先寻找跨平台印证：

1. X 是否有多个独立账号讨论。
2. YouTube 是否出现相关视频升温。
3. 搜索或新闻是否有事实来源。
4. 历史事件库中是否已有相似事件。

# 输出

只能输出 schema 允许的业务命令。
不能输出工具调用结果之外的事实。
```

## 5. 动态执行状态机

建议新增统一状态机：

```text
created
→ planning
→ tool_call_requested
→ tool_call_running
→ evidence_updated
→ deciding
→ command_ready
→ command_executing
→ success
```

异常状态：

```text
tool_failed
model_failed
validation_failed
budget_exceeded
requires_human_review
failed
```

### 5.1 执行循环

```ts
while (!run.finished) {
  const modelOutput = await model.next({
    workflow,
    initialContext,
    evidenceContext,
    toolResults,
    budgetRemaining,
  })

  if (modelOutput.type === 'tool_call') {
    validateToolCall(modelOutput)
    const result = await executeTool(modelOutput.toolCall)
    appendEvidence(result)
    continue
  }

  if (modelOutput.type === 'final_commands') {
    validateCommands(modelOutput.commands)
    executeCommands(modelOutput.commands)
    finishRun()
  }
}
```

### 5.2 工具调用输出

```ts
interface WorkflowToolCall {
  id: string
  runId: string
  toolName: string
  arguments: unknown
  reason: string
  status: 'pending' | 'running' | 'success' | 'failed'
  result?: unknown
  evidenceItems?: EvidenceItem[]
  error?: string
  startedAt?: string
  finishedAt?: string
}
```

### 5.3 上下文累积

```ts
interface EvidenceContext {
  runId: string
  items: EvidenceItem[]
  summaries: {
    keyFacts: string[]
    uncertainty: string[]
    missingData: string[]
    conflicts: string[]
  }
}
```

模型每次决策都只能基于：

- 初始输入。
- 工具返回证据。
- 系统已有数据库记录。
- workflow 文档。

不能凭空补事实。

## 6. 数据模型建议

### 6.1 WorkflowToolDefinition

保存工具能力定义。

```prisma
model WorkflowToolDefinition {
  id          String   @id
  name        String   @unique
  category    String
  description String
  inputSchema Json
  outputSchema Json
  permissions Json
  limits      Json
  enabled     Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@map("workflow_tool_definition")
}
```

### 6.2 WorkflowRunStep

记录每一步模型决策或工具调用。

```prisma
model WorkflowRunStep {
  id        String   @id
  runId     String
  stepIndex Int
  type      String
  status    String
  input     Json?
  output    Json?
  error     String?
  startedAt DateTime
  finishedAt DateTime?

  @@unique([runId, stepIndex])
  @@index([runId])
  @@map("workflow_run_step")
}
```

### 6.3 WorkflowToolCall

记录工具调用。

```prisma
model WorkflowToolCall {
  id          String   @id
  runId       String
  stepId      String
  toolName    String
  arguments   Json
  reason      String
  status      String
  result      Json?
  error       String?
  startedAt   DateTime
  finishedAt  DateTime?

  @@index([runId])
  @@index([toolName, status])
  @@map("workflow_tool_call")
}
```

### 6.4 WorkflowEvidenceItem

记录工作流运行期间形成的证据项。

```prisma
model WorkflowEvidenceItem {
  id           String   @id
  runId        String
  toolCallId   String?
  platform     String?
  sourceType   String
  sourceItemId String?
  title        String?
  text         String?
  url          String?
  author       String?
  publishedAt  DateTime?
  observedAt   DateTime
  metrics      Json?
  confidence   String?
  raw          Json?
  createdAt    DateTime @default(now())

  @@index([runId])
  @@index([platform, sourceType, observedAt])
  @@map("workflow_evidence_item")
}
```

## 7. 哪些规则放代码，哪些规则放工作流

### 7.1 继续放代码

稳定、机械、成本敏感、强约束的逻辑继续放代码：

- API 鉴权。
- 分页、限流、重试。
- 数据去重。
- 入库。
- 固定窗口统计。
- 幂等命令执行。
- 任务状态机。
- 发布链接追踪。
- YouTube `videos.list` ID 分批。
- X 热搜每地区采集数量。

这些不应该交给模型自由发挥。

### 7.2 放 Workflow

业务语义判断和运营策略适合放 workflow：

- 什么样的信号值得形成事件。
- 是否需要跨平台印证。
- 已有事件是否语义相同。
- 哪类账号应该响应。
- 内容主角度是什么。
- 爆款内容可以复用什么机制。
- 是否需要人工复核。
- 是否需要二次发布。

### 7.3 放 Tool Calling Workflow

当规则需要动态补信息时，适合用工具调用工作流：

- “如果证据不足，搜索更多来源。”
- “如果相似事件存在，更新上下文而不是新建。”
- “如果 X 信号强但 YouTube 无信号，只生成观察洞察不形成事件。”
- “如果账号历史表现差，降低任务优先级。”

## 8. 和现有系统的兼容策略

不要一次性推翻现有工作流。建议按三阶段演进。

### 阶段一：保留现有静态工作流

现有流程继续运行：

- X 热搜事件形成。
- 主题圈事件形成。
- 内容任务分配。
- 内容候选生成。
- 发布回填与效果追踪。
- YouTube 字幕拆解。

新增动态工作流运行时，但先不替换核心链路。

### 阶段二：给事件形成增加工具调用能力

优先改造最痛的地方：

```text
事件形成
主题圈触发
跨平台热点判断
```

原因是这些流程最容易遇到规则变化，也是“工作流太死板”最明显的地方。

推荐先做一个新 workflow：

```text
cross-platform-event-formation
```

它可以调用：

- `x.searchPosts`
- `youtube.searchVideos`
- `events.findSimilar`
- `metrics.getHistoricalBaseline`

先作为旁路测试，不直接替换原流程。

### 阶段三：内容产出与渠道分发接入动态编排

当事件形成的动态工作流稳定后，再扩展到：

- 内容生成前自动补充素材。
- 根据账号人设选择 Skill。
- 根据渠道自动适配格式。
- 发布前自动检查风险。
- 发布后自动复盘并给出调整建议。

## 9. 是否引入 LangChain / LangGraph

本设计不要求立刻引入 LangChain。

当前更重要的是定义本系统自己的业务抽象：

```text
WorkflowRuntime
WorkflowToolDefinition
WorkflowToolCall
EvidenceContext
WorkflowCommand
CommandExecutor
WorkflowAudit
```

如果后续需要引入框架，建议优先评估 LangGraph，而不是传统 LangChain Chain。

原因是本系统更像状态机：

```text
采集
→ 补证据
→ 判断
→ 生成任务
→ 审核
→ 发布
→ 追踪
→ 复盘
```

LangGraph 更适合：

- 多节点状态流转。
- 条件分支。
- 工具调用循环。
- 人工介入。
- 中断恢复。
- 多步审计。

但即使引入，也应该封装在：

```ts
interface WorkflowExecutionEngine {
  run(input: WorkflowRunInput): Promise<WorkflowRunResult>
}
```

业务代码不应该到处直接依赖 LangGraph。这样未来替换执行引擎时，不会重写业务模型。

## 10. 运营人员如何通过对话修改工作流

最终目标不是让运营人员直接编辑复杂 YAML，而是通过对话表达需求：

```text
以后 Polymarket 相关事件需要同时看 X 和 YouTube。
如果 YouTube 没有相关视频，只生成观察洞察，不自动分配账号任务。
如果 X 上至少 3 个高影响力账号在 6 小时内讨论，再形成事件。
```

系统做三件事：

1. 大模型基于系统上下文生成 workflow 草稿。
2. 系统运行短流程测试，展示工具调用、证据和最终命令。
3. 运营人员确认后激活新版本。

修改必须保留：

- 系统默认版本。
- 草稿版本。
- 激活版本。
- 历史版本。
- 测试记录。
- 回滚入口。

## 11. 安全边界

动态工作流比静态工作流更灵活，也更需要边界。

必须限制：

- 工具白名单。
- 工具调用次数。
- 单工具超时。
- 总运行超时。
- 单次运行成本。
- 可查询时间窗口。
- 可查询账号范围。
- 可写命令类型。
- 是否需要人工确认。

必须禁止：

- 模型直接执行 SQL。
- 模型直接调用任意 URL。
- 模型直接写数据库。
- 模型直接发布内容到外部平台。
- 模型输出未经 schema 校验的业务动作。
- 模型把没有工具证据的数据写成事实。

## 12. 推荐落地顺序

### 第一步：工具注册表

先把现有能力注册成工具，而不是马上让模型调用：

- `events.findSimilar`
- `x.searchPosts`
- `youtube.searchVideos`
- `youtube.getVideoTranscript`
- `metrics.getHistoricalBaseline`

产出：工具定义、输入输出 schema、测试。

### 第二步：WorkflowRunStep / ToolCall / EvidenceItem 表

先具备审计结构，再放开动态能力。

产出：运行步骤表、工具调用表、证据项表、查询接口。

### 第三步：动态工作流运行时 MVP

支持一个模型循环：

```text
模型请求工具
→ 后端执行工具
→ 证据回灌
→ 模型输出最终命令
```

先只允许读工具，不允许写工具。

### 第四步：跨平台事件形成旁路工作流

新增 `cross-platform-event-formation`，和现有 X/主题圈事件形成并行运行，先只记录结果，不自动创建事件。

### 第五步：人工确认后执行命令

当旁路结果稳定后，允许它输出 `request_human_review` 或 `create_event`，但初期要求人工确认。

### 第六步：扩展到内容产出和渠道分发

再把工具调用能力扩展到：

- 内容素材补充。
- 内容 Skill 选择。
- 渠道格式适配。
- 发布排期。
- 效果复盘。

## 13. 成功标准

架构升级后，应满足：

- 新增监测平台时，不需要重写事件形成主流程。
- 修改事件触发逻辑时，大多数情况只需要改 workflow 版本和工具白名单。
- 运营人员可以通过对话创建 workflow 草稿。
- 每次动态工具调用都有记录，可复盘、可解释。
- 工具失败时不会伪造结论，前端能看到数据缺失。
- 模型不能越权调用工具或直接写库。
- 旧的静态工作流仍可继续运行。
- 复杂规则可以按需补证据，而不是要求后端提前塞完整上下文。

## 14. 核心结论

当前系统死板的根因不是没有 LangChain，而是：

```text
工作流只能处理后端预先准备好的固定上下文。
```

下一阶段真正需要的是：

```text
可注册工具
可受控调用
可累积证据
可扩展命令
可审计回放
可版本治理
```

LangGraph 可以作为未来执行引擎候选，但不要先把业务模型绑定到框架上。先把本系统自己的动态工作流领域模型定义清楚，再决定执行引擎，风险更低，也更适合长期平台化演进。
