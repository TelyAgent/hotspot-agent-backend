# 主题圈雷达 Workflow 架构设计

## 1. 核心结论

主题圈雷达应该作为独立事件来源接入统一 Event 系统，不应该依附于 X 热搜榜逻辑。

它的主流程是：

```text
主题圈配置
  -> 按主题圈采集账号帖子
  -> 保存平台原始帖子与主题圈采集批次
  -> 用 Markdown Workflow 归并帖子为候选话题
  -> 计算 B3h / B24h / Tmax
  -> 用 Markdown Workflow 判断是否形成或更新 Event
  -> 执行统一 Event Commands
  -> 进入内容响应流水线
```

这里有两类能力要分清：

| 能力 | 推荐形态 | 原因 |
| --- | --- | --- |
| X 账号帖子采集 | Connector / Tool 代码 | 需要调用 twitterapi.io、处理分页、限流、游标、错误恢复 |
| 话题归并与事件触发 | Markdown Workflow + LLM | 规则、语义、阈值和触发口径会频繁变化，应该允许运营/维护人员改文档 |

服务端不应写死“什么内容算同一话题”“命中哪条触发规则就建 Event”。服务端只负责稳定输入、稳定存储、稳定命令执行和审计。

## 2. 与旧后端的关系

旧后端 `/Users/qmk/work/hotspot-monitor-v1/hotspot-monitor-server/src/topic-circle/topic-circle.service.ts` 有参考价值，但不能整体照搬。

可复用的业务口径：

- 每 3 小时采集一次启用账号。
- 采集窗口从上一次成功采集时间前 10 分钟开始。
- 首次采集回看最近 3 小时。
- 帖子用 `postId` 幂等去重。
- 单账号单次最多翻页，避免失控。
- 同一事件识别需要主体、动作、对象、时间、地点、状态。
- 自动合并阈值为 `0.95`。
- B3h、B24h 按不同启用账号数计算，同账号重复表达只贡献 1。
- Tmax 使用账号近期表现基线，优先看浏览表现，不可得时降级到转发、引用、回复、点赞。
- 四条关注度规则是“或”的关系。

需要重做的部分：

- 旧代码直接在 service 里写死总结 Prompt、阈值判断和 Event 创建，新架构应改为 Markdown Workflow。
- 旧代码直接创建旧 Event/Task，新架构必须走统一 `event`、`event_intake`、`event_source_context`、`event_evidence` 和 workflow command executor。
- 旧代码使用 `TopicCircleTopic.postIds: Json` 聚合帖子，新架构建议用关系表保存话题与帖子关系，方便追溯和重新计算。
- 旧代码将账号配置混在旧 `Topic.accounts` 文本字段，新架构应拆成主题圈表和主题圈账号表。

## 3. 业务边界

主题圈雷达只证明“这些账号正在讨论某个具体事件或说法”，不证明现实事实为真。

主题圈生成 Event 后，事实状态仍然由 Event 与 Evidence 层表达：

- confirmed
- unconfirmed
- conflicting
- rumor
- denied

主题圈触发不自动发布内容，只自动进入内容响应流水线。最终发布仍由运营人员选择、编辑、复制发布并回填 URL。

## 4. 主题圈配置

本期固定支持 5 个主题圈，每圈最多或默认 10 个账号：

- 政治与选举
- Crypto 与 Web3
- AI 与科技
- 宏观经济与金融
- 预测市场行业

每个监控账号只保留：

- `handle`: X handle，例如 `@Reuters`
- `topicCircleId`: 所属主题圈
- `enabled`: 是否启用

不配置账号权重、重点等级、角色或永久事实可信等级。讨论广度计算中所有启用账号平权。

语义关键词、正例、反例保留在主题圈配置中，用于两个场景：

- X 热搜 TR-03 判断：热搜词是否命中重点主题。
- 主题圈帖子过滤与话题理解：帖子是否属于主题圈业务范围。

## 5. 数据模型建议

### 5.1 主题圈配置表

```prisma
model TopicCircleConfig {
  id               String   @id
  name             String   @unique
  description      String?
  enabled          Boolean  @default(true)
  keywords         Json
  positiveExamples Json
  negativeExamples Json
  workflowId       String
  ruleVersion      String
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  accounts TopicCircleAccount[]

  @@map("topic_circle_config")
}
```

### 5.2 主题圈账号表

```prisma
model TopicCircleAccount {
  id            String   @id
  topicCircleId String
  handle        String
  enabled       Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  topicCircle TopicCircleConfig @relation(fields: [topicCircleId], references: [id], onDelete: Cascade)

  @@unique([topicCircleId, handle])
  @@index([handle])
  @@map("topic_circle_account")
}
```

### 5.3 主题圈采集运行表

```prisma
model TopicCircleFetchRun {
  id          String    @id
  platform    String
  status      String
  startedAt   DateTime
  finishedAt  DateTime?
  accountCount Int     @default(0)
  itemCount    Int     @default(0)
  error       String?
  input       Json

  accountRuns TopicCircleAccountFetchRun[]

  @@index([platform, status, startedAt])
  @@map("topic_circle_fetch_run")
}
```

### 5.4 单账号采集状态与运行表

```prisma
model TopicCircleAccountSyncState {
  id                      String   @id
  platform                String
  handle                  String
  lastSuccessfulCollectedAt DateTime?
  lastAttemptedAt         DateTime?
  lastError               String?
  updatedAt               DateTime @updatedAt

  @@unique([platform, handle])
  @@map("topic_circle_account_sync_state")
}

model TopicCircleAccountFetchRun {
  id          String    @id
  fetchRunId  String
  topicCircleId String
  handle      String
  status      String
  startedAt   DateTime
  finishedAt  DateTime?
  since       DateTime
  until       DateTime
  itemCount   Int       @default(0)
  error       String?

  fetchRun TopicCircleFetchRun @relation(fields: [fetchRunId], references: [id], onDelete: Cascade)

  @@index([handle, startedAt])
  @@map("topic_circle_account_fetch_run")
}
```

### 5.5 X 主题圈帖子表

不同平台帖子字段不同，所以平台原始数据要分平台存。X 账号帖子建议单独落表：

```prisma
model XTopicCirclePost {
  id             String   @id
  postId         String   @unique
  fetchRunId     String
  accountRunId   String
  topicCircleId  String
  authorHandle   String
  authorId       String?
  authorName     String?
  text           String
  url            String?
  postType       String
  replyToPostId  String?
  repostedPostId String?
  quotedPostId   String?
  publishedAt    DateTime
  observedAt     DateTime
  metrics        Json?
  raw            Json

  @@index([topicCircleId, publishedAt])
  @@index([authorHandle, publishedAt])
  @@map("x_topic_circle_post")
}
```

`postType` 推荐取值：

- `original`
- `quote`
- `reply`
- `repost`

只有原创、包含新增表达的引用帖、包含实际表达内容的回复进入话题理解。纯转发不计入讨论广度。

### 5.6 主题圈候选话题表

```prisma
model TopicCircleCandidate {
  id                 String    @id
  topicCircleId      String
  title              String
  summary            String
  coreFact           String
  normalizedEventKey String
  confidence         Float
  status             String
  b3h                Int       @default(0)
  b24h               Int       @default(0)
  tmax               Float?
  tmaxPostId         String?
  tmaxTop5           Boolean   @default(false)
  triggeredAt        DateTime?
  triggerType        String?
  eventId            String?
  workflowRunId      String?
  ruleVersion        String
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  posts TopicCircleCandidatePost[]

  @@index([topicCircleId, status, updatedAt])
  @@index([normalizedEventKey])
  @@map("topic_circle_candidate")
}
```

### 5.7 候选话题与帖子关系表

```prisma
model TopicCircleCandidatePost {
  id          String   @id
  candidateId String
  platform    String
  postTable   String
  postId      String
  handle      String
  publishedAt DateTime
  contributionWindow Json
  createdAt   DateTime @default(now())

  candidate TopicCircleCandidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)

  @@unique([candidateId, platform, postId])
  @@index([postId])
  @@map("topic_circle_candidate_post")
}
```

`contributionWindow` 用来记录该帖子是否贡献 B3h、B24h、Tmax，例如：

```json
{
  "b3h": true,
  "b24h": true,
  "tmax": false
}
```

## 6. Connector 与 Tool

主题圈采集使用 X Connector，先提供一个工具：

```ts
interface XGetAccountPostsInput {
  handle: string
  since: string
  until: string
  maxPages: number
  includeReplies: boolean
  includeQuotes: boolean
  includeReposts: boolean
}

interface XAccountPost {
  postId: string
  authorHandle: string
  authorId?: string
  authorName?: string
  text: string
  url?: string
  postType: 'original' | 'quote' | 'reply' | 'repost'
  replyToPostId?: string
  repostedPostId?: string
  quotedPostId?: string
  publishedAt: string
  metrics?: {
    views?: number
    likes?: number
    reposts?: number
    replies?: number
    quotes?: number
    bookmarks?: number
  }
  raw: unknown
}

interface XGetAccountPostsOutput {
  platform: 'x'
  sourceType: 'topic_circle_post'
  handle: string
  collectedAt: string
  posts: XAccountPost[]
  nextCursor?: string
}
```

twitterapi.io 可参考旧后端 `TwitterService.getUserTimeline()` 的处理方式：

- 先用 handle 获取 user id。
- 调 `/twitter/user/tweet_timeline`。
- 兼容 `body.tweets`、`body.data`、`body.data.tweets` 等返回结构。
- 返回空数组而不是让 `page.tweets is not iterable` 这种结构错误中断全部批次。

## 7. 采集策略

主题圈采集频率：

```text
0 */3 * * *
```

每次调度：

1. 读取所有启用主题圈。
2. 读取主题圈下启用账号。
3. 对每个账号计算采集窗口。
4. 调用 `x.getAccountPosts`。
5. 保存 `x_topic_circle_post`。
6. 更新账号级 sync state。
7. 任一账号失败只标记该账号失败，不阻塞其它账号。
8. 至少一个账号成功时，进入话题形成 Workflow。

采集窗口：

```text
如果账号有 lastSuccessfulCollectedAt:
  since = lastSuccessfulCollectedAt - 10 分钟
否则:
  since = now - 3 小时
until = now
```

去重：

- X 平台用 `postId` 唯一。
- 10 分钟重叠只防止边界遗漏，不允许重复帖子重复贡献声量。

## 8. Workflow 设计

主题圈建议拆成两个 Workflow，而不是一个大 Workflow。

### 8.1 话题形成 Workflow

目录：

```text
workflows/topic-circle/topic-clustering/
  WORKFLOW.md
  output.schema.json
```

输入：

```ts
interface TopicCircleClusteringContextV1 {
  schemaVersion: 'topic_circle_clustering_context_v1'
  workflowRunId: string
  observedAt: string
  topicCircle: {
    id: string
    name: string
    keywords: string[]
    positiveExamples: string[]
    negativeExamples: string[]
  }
  posts: {
    id: string
    postId: string
    handle: string
    text: string
    url?: string
    postType: string
    publishedAt: string
    metrics?: unknown
  }[]
  existingCandidates: {
    id: string
    title: string
    summary: string
    coreFact: string
    normalizedEventKey: string
    updatedAt: string
  }[]
}
```

输出：

```ts
interface TopicCircleClusteringOutputV1 {
  schemaVersion: 'topic_circle_clustering_output_v1'
  workflowId: string
  workflowVersion: string
  runId: string
  candidates: {
    title: string
    summary: string
    coreFact: string
    normalizedEventKey: string
    confidence: number
    postIds: string[]
    mergeTargetCandidateId?: string
    ignoredPostIds: string[]
    ignoreReason?: string
  }[]
  diagnostics?: { level: 'info' | 'warning' | 'error'; message: string }[]
}
```

职责：

- 判断哪些帖子属于该主题圈。
- 过滤纯转发、广告、灌水、无法识别具体事件的内容。
- 把不同表达归并成候选话题。
- 对已有候选做延续判断。
- 不计算 B3h/B24h/Tmax。
- 不直接创建 Event。

### 8.2 主题圈 Event 触发 Workflow

目录：

```text
workflows/topic-circle/event-formation/
  WORKFLOW.md
  output.schema.json
```

输入：

```ts
interface TopicCircleEventFormationContextV1 {
  schemaVersion: 'topic_circle_event_formation_context_v1'
  workflowRunId: string
  observedAt: string
  candidate: {
    id: string
    topicCircleId: string
    topicCircleName: string
    title: string
    summary: string
    coreFact: string
    normalizedEventKey: string
    confidence: number
    b3h: number
    b24h: number
    tmax?: number
    tmaxTop5: boolean
    triggeredAt?: string
    eventId?: string
    posts: {
      postId: string
      handle: string
      text: string
      url?: string
      publishedAt: string
      metrics?: unknown
    }[]
  }
  recentEventHistory: {
    eventId: string
    title: string
    normalizedEventKey: string
    status: string
    formedAt: string
  }[]
}
```

输出复用现有 `event_workflow_commands_v1`，命令类型仍然是：

- `create_event`
- `update_event_context`
- `ignore`

职责：

- 根据 B3h、B24h、Tmax、tmaxTop5 判断是否命中规则。
- 首次命中输出 `create_event`。
- 已有 `eventId` 后续命中输出 `update_event_context`。
- 与热搜路径命中同一 `normalizedEventKey` 时复用已有 Event。
- 触发后 `sourceContext` 中必须记录主题圈、账号、帖子、指标、触发规则和 ruleVersion。

## 9. 指标计算

指标计算建议由服务端代码完成，因为它是确定性聚合，不适合交给模型自由解释。

### 9.1 B3h

```text
B3h = 最近 3 小时内讨论同一 Candidate 的不同启用账号数
```

### 9.2 B24h

```text
B24h = 最近 24 小时内讨论同一 Candidate 的不同启用账号数
```

### 9.3 Tmax

```text
Tmax = 候选话题内最强帖表现 / 该账号相同帖龄下近期正常表现
```

首期实现可以使用旧后端简化口径：

- 取该账号最近 30 条有效帖子的浏览量中位数作为 baseline。
- `ratio = post.views / baseline`。
- baseline 不存在时，Tmax 为空。
- Top 5% 判断使用账号最近 30 条有效帖子的降序分位。

后续增强为同帖龄归一化：

- 0-1h
- 1-3h
- 3-6h
- 6-24h
- 24h+

## 10. Event Context 示例

主题圈触发创建 Event 时，`event_source_context.payload` 建议形态：

```json
{
  "sourceType": "topic_circle",
  "topicCircle": {
    "id": "topic-ai-tech",
    "name": "AI 与科技"
  },
  "metrics": {
    "b3h": 3,
    "b24h": 5,
    "tmax": 2.4,
    "tmaxTop5": false
  },
  "matchedRules": [
    {
      "ruleId": "TC-01",
      "name": "短期集中讨论",
      "reason": "3 小时内 3 个启用账号讨论同一具体事件"
    }
  ],
  "posts": [
    {
      "postId": "123",
      "handle": "OpenAI",
      "url": "https://x.com/OpenAI/status/123",
      "publishedAt": "2026-08-19T01:00:00.000Z"
    }
  ],
  "ruleVersion": "topic-circle-radar-v1.2"
}
```

触发规则建议命名：

| ID | 规则 | 条件 |
| --- | --- | --- |
| TC-01 | 短期集中讨论 | `B3h >= 3` |
| TC-02 | 24 小时持续热议 | `B24h >= 6` |
| TC-03 | 单点流量爆发 | `Tmax >= 3` 且 `tmaxTop5 = true` |
| TC-04 | 讨论与流量混合上升 | `B3h >= 2` 且 `Tmax >= 2` |

## 11. API 建议

### 11.1 配置接口

```text
GET    /topic-circles
POST   /topic-circles
PUT    /topic-circles/:id
DELETE /topic-circles/:id

POST   /topic-circles/:id/accounts
PUT    /topic-circles/:id/accounts/:accountId
DELETE /topic-circles/:id/accounts/:accountId
```

### 11.2 采集与调试接口

```text
POST /topic-circle/collect
POST /topic-circle/workflows/cluster/run
POST /topic-circle/workflows/event-formation/run
GET  /topic-circle/fetch-runs
GET  /topic-circle/candidates
GET  /topic-circle/posts
```

手动接口只用于调试和回放，正式路径依赖后端定时任务。

### 11.3 兼容前端接口

现有前端 `Topics.tsx` 可以先接：

```text
GET /monitor/topics
```

返回：

```ts
interface TopicMonitorResponse {
  topics: {
    id: string
    name: string
    enabled: boolean
    accountCount: number
    recentPostCount3h: number
    candidateCount24h: number
    triggeredEventCount24h: number
    latestCandidates: {
      id: string
      title: string
      summary: string
      b3h: number
      b24h: number
      tmax?: number
      triggerType?: string
      eventId?: string
      updatedAt: string
    }[]
  }[]
}
```

## 12. 调度

建议新增 `TopicCircleSchedulerService`：

```text
@Cron('0 */3 * * *')
```

调度一次完整主题圈管线：

```text
collect enabled accounts
  -> cluster posts by topic circle
  -> upsert candidates
  -> compute metrics
  -> run event formation workflow for candidates updated in last 24h
```

调度并发控制：

- 全局只允许一个主题圈采集批次运行。
- 单账号失败不影响其它账号。
- 同一账号上一轮还在运行时跳过该账号。
- 采集成功才推进该账号 `lastSuccessfulCollectedAt`。

## 13. 幂等与去重

### 13.1 帖子幂等

`x_topic_circle_post.postId` 唯一。

### 13.2 候选话题幂等

同一主题圈内，`normalizedEventKey` 相同优先合并；不同表达但语义相同，由 clustering Workflow 给出 `mergeTargetCandidateId`。

### 13.3 Event 幂等

Event 层继续使用 `event.normalizedEventKey` 唯一。主题圈与热搜命中同一核心事实时，不创建第二个 Event。

### 13.4 响应任务幂等

后续内容系统必须使用：

```text
Event × Account × Skill Version
```

作为唯一边界。主题圈、热搜、未来事件多路径命中同一 Event，不重复创建同账号任务。

## 14. 失败恢复

采集失败：

- 写 `topic_circle_account_fetch_run.status = failed`。
- 保留错误信息。
- 不更新该账号 `lastSuccessfulCollectedAt`。
- 下一次仍从上一次成功时间前 10 分钟开始补齐。

部分成功：

- 成功账号帖子正常入库。
- 失败账号记录失败。
- 至少一个账号成功即可继续做话题聚类，但 context 里要记录失败账号。

Workflow 失败：

- 写 `workflow_run.status = failed`。
- 不改 candidate 的 `triggeredAt`。
- 下一轮重新评估该 candidate。

命令执行失败：

- 写 `workflow_command_execution.status = failed`。
- 不影响其它命令。
- 后台或人工入口可以按 workflowRunId 重试。

## 15. 验收口径

实现完成后至少验证：

- 5 个主题圈和 50 个账号可配置、启停。
- 每 3 小时自动采集启用账号。
- 首次采集回看 3 小时，后续采集带 10 分钟重叠。
- 帖子 ID 去重有效。
- `page.tweets is not iterable` 这类 API 结构变化不会中断全部批次。
- 纯转发不计入讨论广度。
- 同账号多帖讨论同一 Candidate，在 B3h/B24h 中只贡献 1。
- B3h、B24h、Tmax、混合规则任一命中都能形成或更新 Event。
- 主题圈 Event 与 X 热搜 Event 命中同一 normalizedEventKey 时复用同一 Event。
- 每次触发可追溯到主题圈、账号、帖子、指标、规则版本和 Workflow 版本。

## 16. 分阶段实现建议

### Phase 1：数据采集落库

先实现主题圈配置表、账号表、账号帖子采集、采集运行记录和 `/monitor/topics` 空状态兼容。

### Phase 2：话题形成 Workflow

实现 `topic_circle_clustering_context_v1`、Markdown Workflow、输出 schema、候选话题表和帖子关系表。

### Phase 3：指标计算

实现 B3h、B24h、Tmax、Top 5% 判断，并为每个 Candidate 保存最新指标。

### Phase 4：Event 触发 Workflow

实现 `topic_circle_event_formation_context_v1`，复用现有 Event Command Executor 创建或更新 Event。

### Phase 5：前端接入与影子监测

接入 `Topics.tsx`，展示主题圈、账号数、近 3 小时帖子数、候选话题、触发事件和失败账号。

正式自动响应前，建议至少跑一段影子监测，观察误报率、漏报率、账号贡献和触发分布。
