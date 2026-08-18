# Twitter/X 数据采集设计 V1

## 1. 目标

本阶段只设计“数据采集”部分，先接 Twitter/X 平台。采集层的目标是稳定获取平台数据、保留原始信息、生成标准化数据，供后续事件生成 workflow 使用。

采集层不负责：

- 判断是否形成事件。
- 生成发布内容。
- 做热点业务规则判断。
- 合并或关闭事件。

采集层只回答三个问题：

1. 从哪个平台、哪个能力获取数据。
2. 获取到的数据如何保存。
3. 如何把平台差异数据转换成统一结构。

## 2. 数据是否要分平台存

结论：**原始数据要按平台分表存，公共事件输入再统一成 Signal。**

推荐做法是：

- Twitter/X 原始数据保存到 `x_*` 平台表，例如 `x_trend_snapshot`、`x_trend_snapshot_item`、`x_post`、`x_post_metric`。
- YouTube 后续保存到 `youtube_*` 平台表，例如 `youtube_video`、`youtube_channel`、`youtube_video_metric`。
- 公共层只保存跨平台运行时需要的索引和标准对象，例如 `source_fetch_run`、`signal`、`source_snapshot`。
- 平台特有字段留在平台表中，同时保留 `raw` JSON 方便追溯。
- 事件生成 workflow 默认消费 `signal` 和快照 diff，不直接依赖平台原始表。

这样可以同时满足：

- 平台隔离：Twitter 热搜、帖子、指标不会和 YouTube 视频、评论混在一张大表里。
- 查询清晰：查 Twitter 专有字段时直接查 `x_*` 表。
- 统一判断：事件 workflow 可以从 `signal` 读取跨平台标准输入。
- 审计追溯：平台表保留原始返回值，后续规则变了可以重新标准化。
- 扩展性：后续加 YouTube/TikTok/RSS 不需要重写事件生成层。

不推荐：

```text
raw_source_item 作为所有平台原始数据的大杂烩
```

不同平台的数据结构差异很大，全部塞入一张 `raw_source_item` 会让字段语义变模糊，查询和排错都会变困难。

推荐：

```text
source_fetch_run
x_trend_snapshot
x_trend_snapshot_item
x_post
x_post_metric
source_snapshot
source_snapshot_item
source_snapshot_diff
signal
```

## 3. Twitter/X 第一阶段采集范围

第一阶段建议只做三类数据：

| 类型 | sourceType | 用途 |
| --- | --- | --- |
| 地区热搜排行榜 | `trend` | 发现重点主题是否进入热搜，做快照对比 |
| 重点账号帖子 | `post` | 主题圈关注度、B3h/B24h/Tmax 判断 |
| 帖子指标 | `metric` | 判断单点爆发、后续推广效果 |

暂时不做：

- 评论采集。
- 私信。
- 自动发帖。
- 大规模关键词全网搜索。

## 4. MCP Tool 设计

Twitter/X 数据获取应由 MCP Tool 承担。

当前实现采用 `twitterapi.io` 作为 Twitter/X 数据源：

- Base URL：`https://api.twitterapi.io`
- 鉴权 Header：`X-API-Key: <TWITTERAPI_IO_KEY>`
- 热搜接口：`GET /twitter/trends?woeid={woeid}&count={count}`
- `count` 按接口要求最低传 `30`，系统侧再按 `limit` 截断入库。
- 本地未配置 `TWITTERAPI_IO_KEY`，或 `TWITTER_USE_MOCK=true` 时，`x.getTrending` 会使用 mock 数据，避免开发环境无法启动。

### 4.1 Tool 列表

```text
x.getTrending
x.getAccountPosts
x.searchPosts
x.getPostMetrics
```

第一阶段必须实现：

```text
x.getTrending
x.getAccountPosts
x.getPostMetrics
```

`x.searchPosts` 可以第二阶段再做。

### 4.2 x.getTrending

输入：

```ts
{
  regions: string[]
  regionWoeids?: Record<string, number>
  limit?: number
}
```

输出：

```ts
{
  platform: 'x'
  sourceType: 'trend'
  region: string
  collectedAt: string
  items: XTrendingItem[]
  raw: unknown
}
```

地区不直接写死在业务流程中，而是通过平台采集配置变量传入：

```ts
{
  variables: {
    regions: ['global'],
    regionWoeids: {
      global: 1
    },
    defaultTrendLimit: 50
  }
}
```

采集任务的 `inputTemplate`：

```ts
{
  regions: '{{platform.variables.regions}}',
  regionWoeids: '{{platform.variables.regionWoeids}}',
  limit: '{{platform.variables.defaultTrendLimit}}'
}
```

这样后续运营侧修改采集地区时，只改平台变量；connector 只负责把地区转换为 `woeid` 并调用对应接口。

`XTrendingItem`：

```ts
{
  rank: number
  name: string
  query?: string
  url?: string
  volume?: number
  category?: string
  raw: unknown
}
```

### 4.3 x.getAccountPosts

输入：

```ts
{
  accounts: string[]
  since?: string
  until?: string
  limit?: number
}
```

输出：

```ts
{
  platform: 'x'
  sourceType: 'post'
  account: string
  collectedAt: string
  items: XPostItem[]
  raw: unknown
}
```

`XPostItem`：

```ts
{
  postId: string
  authorHandle: string
  authorName?: string
  text: string
  url?: string
  publishedAt: string
  replyToPostId?: string
  repostedPostId?: string
  quotedPostId?: string
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
```

### 4.4 x.getPostMetrics

输入：

```ts
{
  postIds: string[]
}
```

输出：

```ts
{
  platform: 'x'
  sourceType: 'metric'
  collectedAt: string
  items: XPostMetricItem[]
}
```

`XPostMetricItem`：

```ts
{
  postId: string
  observedAt: string
  views?: number
  likes?: number
  reposts?: number
  replies?: number
  quotes?: number
  bookmarks?: number
  raw: unknown
}
```

## 5. 排行榜快照怎么处理

结论：**排行榜必须存多份快照，不能只保存最新一份。**

原因：

- 事件生成需要判断某个词是否首次进入热搜。
- 需要比较排名上升、下降、消失。
- 需要判断同一主题是否持续出现。
- 需要支持运营复盘：事件形成前后排行榜如何变化。

### 5.1 快照模型

每次采集一个地区排行榜，先生成 Twitter 平台快照 `x_trend_snapshot`，再同步一条公共快照索引 `source_snapshot`。

```ts
XTrendSnapshot {
  id: string
  fetchRunId: string
  region: string
  collectedAt: string
  itemCount: number
  checksum?: string
  raw?: unknown
}
```

公共快照索引用于跨平台查询：

```ts
SourceSnapshot {
  id: string
  platform: 'x'
  platformSnapshotId: string
  sourceType: 'trend'
  region: string
  collectedAt: string
  fetchRunId: string
  itemCount: number
}
```

每条榜单项先保存为 `x_trend_snapshot_item`，再同步必要字段到 `source_snapshot_item`。

```ts
XTrendSnapshotItem {
  id: string
  xTrendSnapshotId: string
  rank: number
  name: string
  query?: string
  url?: string
  volume?: number
  category?: string
  normalizedKey: string
  raw: unknown
}
```

`source_snapshot_item` 只保留跨平台快照对比所需字段：

```ts
SourceSnapshotItem {
  id: string
  sourceSnapshotId: string
  platform: 'x'
  platformItemId: string
  sourceType: 'trend'
  region: string
  rank: number
  title: string
  normalizedKey: string
  metrics?: Record<string, number>
}
```

### 5.2 快照对比

快照对比不在 MCP Tool 里做，由后端数据层或后续 workflow 前置步骤做。

常见对比结果：

```ts
TrendSnapshotDiff {
  platform: 'x'
  region: string
  currentSnapshotId: string
  previousSnapshotId: string
  entered: TrendDiffItem[]
  exited: TrendDiffItem[]
  rankUp: TrendDiffItem[]
  rankDown: TrendDiffItem[]
  unchanged: TrendDiffItem[]
}
```

`TrendDiffItem`：

```ts
{
  normalizedKey: string
  name: string
  previousRank?: number
  currentRank?: number
  rankDelta?: number
}
```

### 5.3 快照查询方式

需要支持：

```text
查询某地区最新快照
查询某地区指定时间范围快照
查询某关键词最近 N 次出现记录
查询当前快照与上一次快照 diff
查询某主题在多个地区的快照出现情况
```

## 6. 标准采集数据字段

采集后建议分四层保存。

### 6.1 source_fetch_run

记录一次采集任务。

```ts
SourceFetchRun {
  id: string
  platform: string
  connectorId: string
  toolName: string
  sourceType: string
  status: 'running' | 'success' | 'partial_success' | 'failed'
  input: unknown
  startedAt: string
  finishedAt?: string
  itemCount: number
  error?: string
}
```

### 6.2 Twitter/X 平台原始表

Twitter/X 平台原始数据不进入一张通用大表，而是进入 `x_*` 表。

```ts
XTrendSnapshot {
  id: string
  fetchRunId: string
  region?: string
  collectedAt: string
  itemCount: number
  checksum?: string
  raw: unknown
}
```

```ts
XTrendSnapshotItem {
  id: string
  xTrendSnapshotId: string
  rank: number
  name: string
  query?: string
  url?: string
  volume?: number
  category?: string
  normalizedKey: string
  raw: unknown
}
```

```ts
XPost {
  id: string
  fetchRunId: string
  postId: string
  authorId?: string
  authorHandle: string
  authorName?: string
  text: string
  url?: string
  publishedAt: string
  replyToPostId?: string
  repostedPostId?: string
  quotedPostId?: string
  observedAt: string
  raw: unknown
}
```

```ts
XPostMetric {
  id: string
  fetchRunId: string
  postId: string
  observedAt: string
  views?: number
  likes?: number
  reposts?: number
  replies?: number
  quotes?: number
  bookmarks?: number
  raw: unknown
}
```

唯一键建议：

```text
x_trend_snapshot: region + collectedAt
x_trend_snapshot_item: xTrendSnapshotId + normalizedKey
x_post: postId
x_post_metric: postId + observedAt
```

### 6.3 公共快照表

公共快照表不是原始数据主存储，只保存跨平台快照查询和 diff 需要的公共字段。

```ts
SourceSnapshot {
  id: string
  platform: string
  platformSnapshotId: string
  sourceType: 'trend'
  region: string
  collectedAt: string
  fetchRunId: string
  itemCount: number
}
```

```ts
SourceSnapshotItem {
  id: string
  sourceSnapshotId: string
  platform: string
  platformItemId: string
  sourceType: 'trend'
  region: string
  rank: number
  title: string
  normalizedKey: string
  metrics?: Record<string, number>
}
```

### 6.4 signal

`signal` 保存给事件 workflow 使用的标准输入。它可以引用平台表记录，但不承载所有平台原始字段。

```ts
Signal {
  id: string
  platformRefTable?: string
  platformRefId?: string
  snapshotId?: string
  fetchRunId: string
  platform: string
  sourceType: 'trend' | 'post' | 'metric'
  sourceItemId: string
  title: string
  summary?: string
  text?: string
  url?: string
  region?: string
  rank?: number
  authorHandle?: string
  publishedAt?: string
  observedAt: string
  metrics?: {
    views?: number
    likes?: number
    reposts?: number
    replies?: number
    quotes?: number
    bookmarks?: number
    volume?: number
  }
  normalizedKey?: string
  raw?: unknown
}
```

## 7. Twitter/X 字段映射

### 7.1 热搜榜 -> XTrendSnapshot

```ts
{
  fetchRunId,
  region,
  collectedAt,
  itemCount: items.length,
  checksum,
  raw,
}
```

### 7.2 热搜榜单项 -> XTrendSnapshotItem

```ts
{
  xTrendSnapshotId,
  rank: item.rank,
  name: item.name,
  query: item.query,
  url: item.url,
  volume: item.volume,
  category: item.category,
  normalizedKey,
  raw: item.raw,
}
```

### 7.3 热搜榜单项 -> Signal

```ts
{
  platform: 'x',
  sourceType: 'trend',
  sourceItemId: `x:trend:${region}:${normalizedKey}:${collectedAt}`,
  title: item.name,
  region,
  rank: item.rank,
  observedAt: collectedAt,
  metrics: {
    volume: item.volume,
  },
  normalizedKey,
  platformRefTable: 'x_trend_snapshot_item',
  platformRefId: xTrendSnapshotItemId,
  snapshotId: sourceSnapshotId,
}
```

### 7.4 账号帖子 -> XPost

```ts
{
  fetchRunId,
  postId: post.postId,
  authorId: post.authorId,
  authorHandle: post.authorHandle,
  authorName: post.authorName,
  text: post.text,
  url: post.url,
  publishedAt: post.publishedAt,
  replyToPostId: post.replyToPostId,
  repostedPostId: post.repostedPostId,
  quotedPostId: post.quotedPostId,
  observedAt: collectedAt,
  raw: post.raw,
}
```

### 7.5 账号帖子 -> Signal

```ts
{
  platform: 'x',
  sourceType: 'post',
  sourceItemId: `x:post:${post.postId}`,
  title: firstLine(post.text),
  text: post.text,
  url: post.url,
  authorHandle: post.authorHandle,
  publishedAt: post.publishedAt,
  observedAt: collectedAt,
  metrics: post.metrics,
  platformRefTable: 'x_post',
  platformRefId: xPostId,
}
```

### 7.6 帖子指标 -> XPostMetric

```ts
{
  fetchRunId,
  postId: metric.postId,
  observedAt: metric.observedAt,
  views: metric.views,
  likes: metric.likes,
  reposts: metric.reposts,
  replies: metric.replies,
  quotes: metric.quotes,
  bookmarks: metric.bookmarks,
  raw: metric.raw,
}
```

### 7.7 帖子指标 -> Signal

指标类数据通常不单独形成一个可读标题，而是作为帖子信号的时间序列补充。需要独立入 `signal` 时使用：

```ts
{
  platform: 'x',
  sourceType: 'metric',
  sourceItemId: `x:metric:${metric.postId}:${metric.observedAt}`,
  title: `Metrics for X post ${metric.postId}`,
  observedAt: metric.observedAt,
  metrics: {
    views: metric.views,
    likes: metric.likes,
    reposts: metric.reposts,
    replies: metric.replies,
    quotes: metric.quotes,
    bookmarks: metric.bookmarks,
  },
  platformRefTable: 'x_post_metric',
  platformRefId: xPostMetricId,
}
```

## 8. 采集配置模型

采集配置必须按平台管理。同一个平台下，不同采集能力有不同变量，例如 Twitter/X 的热搜榜需要地区，账号帖子需要重点账号，主题追踪需要关键词。

### 8.1 平台级配置

平台级配置描述某个平台的连接能力、默认地区、默认限流和可用工具。

```ts
PlatformCollectionConfig {
  id: string
  platform: 'x'
  connectorId: string
  displayName: string
  enabled: boolean
  defaultTimezone: string
  defaultRegions: string[]
  rateLimit?: {
    maxRequestsPerMinute?: number
    maxRequestsPerHour?: number
  }
  variables: {
    regions?: string[]
    monitoredAccounts?: string[]
    topicKeywords?: string[]
    topicNegativeKeywords?: string[]
    defaultTrendLimit?: number
    defaultPostLimit?: number
  }
}
```

示例：

```json
{
  "platform": "x",
  "connectorId": "x-twitterapi-io",
  "enabled": true,
  "defaultTimezone": "Asia/Shanghai",
  "defaultRegions": ["global"],
  "variables": {
    "regions": ["global"],
    "regionWoeids": {
      "global": 1
    },
    "monitoredAccounts": ["tier10k", "WatcherGuru", "lookonchain"],
    "topicKeywords": ["OpenAI", "Anthropic", "Bitcoin", "Ethereum"],
    "topicNegativeKeywords": ["giveaway", "airdrop scam"],
    "defaultTrendLimit": 50,
    "defaultPostLimit": 30
  }
}
```

### 8.2 采集任务配置

采集任务配置描述“调用哪个 MCP Tool、多久调用一次、输入变量如何生成”。

```ts
CollectionJobConfig {
  id: string
  platform: 'x'
  name: string
  toolName: 'x.getTrending' | 'x.getAccountPosts' | 'x.getPostMetrics' | 'x.searchPosts'
  sourceType: 'trend' | 'post' | 'metric'
  enabled: boolean
  schedule: {
    type: 'cron' | 'interval'
    value: string
  }
  inputTemplate: Record<string, unknown>
  variableRefs: string[]
  outputTarget: {
    platformTables: string[]
    emitSignal: boolean
    emitSnapshot?: boolean
    emitSnapshotDiff?: boolean
  }
}
```

热搜榜配置示例：

```json
{
  "id": "x-trending-default",
  "platform": "x",
  "name": "X 目标地区热搜榜",
  "toolName": "x.getTrending",
  "sourceType": "trend",
  "enabled": true,
  "schedule": {
    "type": "cron",
    "value": "0 */2 * * *"
  },
  "inputTemplate": {
    "regions": "{{platform.variables.regions}}",
    "limit": "{{platform.variables.defaultTrendLimit}}"
  },
  "variableRefs": [
    "platform.variables.regions",
    "platform.variables.defaultTrendLimit"
  ],
  "outputTarget": {
    "platformTables": ["x_trend_snapshot", "x_trend_snapshot_item"],
    "emitSignal": true,
    "emitSnapshot": true,
    "emitSnapshotDiff": true
  }
}
```

重点账号帖子配置示例：

```json
{
  "id": "x-monitored-account-posts",
  "platform": "x",
  "name": "X 重点账号帖子",
  "toolName": "x.getAccountPosts",
  "sourceType": "post",
  "enabled": true,
  "schedule": {
    "type": "cron",
    "value": "*/30 * * * *"
  },
  "inputTemplate": {
    "accounts": "{{platform.variables.monitoredAccounts}}",
    "limit": "{{platform.variables.defaultPostLimit}}",
    "since": "{{runtime.lastSuccessAt}}"
  },
  "variableRefs": [
    "platform.variables.monitoredAccounts",
    "platform.variables.defaultPostLimit",
    "runtime.lastSuccessAt"
  ],
  "outputTarget": {
    "platformTables": ["x_post"],
    "emitSignal": true
  }
}
```

重点主题搜索配置示例：

```json
{
  "id": "x-topic-search",
  "platform": "x",
  "name": "X 重点主题搜索",
  "toolName": "x.searchPosts",
  "sourceType": "post",
  "enabled": false,
  "schedule": {
    "type": "cron",
    "value": "*/30 * * * *"
  },
  "inputTemplate": {
    "keywords": "{{platform.variables.topicKeywords}}",
    "negativeKeywords": "{{platform.variables.topicNegativeKeywords}}",
    "regions": "{{platform.variables.regions}}",
    "since": "{{runtime.lastSuccessAt}}"
  },
  "variableRefs": [
    "platform.variables.topicKeywords",
    "platform.variables.topicNegativeKeywords",
    "platform.variables.regions",
    "runtime.lastSuccessAt"
  ],
  "outputTarget": {
    "platformTables": ["x_post"],
    "emitSignal": true
  }
}
```

### 8.3 变量来源

变量分三类：

| 类型 | 示例 | 用途 |
| --- | --- | --- |
| 平台变量 | `platform.variables.regions` | 平台下长期配置，例如目标地区 |
| 任务变量 | `job.inputTemplate.limit` | 单个采集任务自己的输入 |
| 运行时变量 | `runtime.lastSuccessAt` | 上次成功时间、当前时间、任务 ID |

运行时渲染后，才调用 MCP Tool：

```text
CollectionJobConfig.inputTemplate
  -> CollectionVariableResolver
  -> MCP Tool Input
  -> x.getTrending / x.getAccountPosts / x.searchPosts
```

### 8.4 重点主题配置归属

重点主题既会影响采集，也会影响事件生成，所以建议拆成两层：

- 采集层只使用 `topicKeywords` / `topicNegativeKeywords` 来决定抓取哪些数据。
- 事件 workflow 使用完整 `TopicConfig` 来判断是否形成事件、如何归并、是否触发内容流水线。

也就是说，采集层可以按关键词抓数据，但不在采集层判断“这是不是一个事件”。

## 9. 采集频率

第一阶段建议：

| 数据 | 频率 | 说明 |
| --- | --- | --- |
| X 地区热搜榜 | 每 2 小时 | 用于快照对比和重点主题热搜命中 |
| 重点账号帖子 | 每 30 分钟 | 用于 B3h/B24h 讨论密度 |
| 帖子指标 | 每 30 分钟到 1 小时 | 用于 Tmax 和爆发判断 |

采集频率应配置化：

```text
X_TRENDING_CRON=0 */2 * * *
X_ACCOUNT_POSTS_CRON=*/30 * * * *
X_POST_METRICS_CRON=*/30 * * * *
```

## 10. 数据采集流程

```text
Scheduler
  -> 读取 PlatformCollectionConfig / CollectionJobConfig
  -> CollectionVariableResolver 渲染 MCP Tool 输入
  -> SourceFetchService 创建 source_fetch_run
  -> MCP Tool Client 调用 x.getTrending / x.getAccountPosts / x.getPostMetrics
  -> XPlatformWriter 保存 x_trend_snapshot / x_post / x_post_metric
  -> SnapshotService 同步公共 source_snapshot / source_snapshot_item
  -> SnapshotDiffService 生成快照对比结果
  -> SourceNormalizer 生成公共 Signal
  -> 事件生成 Workflow 后续消费 Signal / SnapshotDiff
```

注意：事件生成 workflow 可以消费 `Signal[]`，也可以消费 `TrendSnapshotDiff`，但 workflow 不应该自己去调用 X API。

## 11. 推荐数据库表

第一阶段最小表：

```text
platform_collection_config
collection_job_config
source_fetch_run
x_trend_snapshot
x_trend_snapshot_item
x_post
x_post_metric
source_snapshot
source_snapshot_item
source_snapshot_diff
signal
connector
connector_tool
```

说明：

- `platform_collection_config` 保存 Twitter/X 平台级变量，例如地区、重点账号、重点主题关键词。
- `collection_job_config` 保存每个采集任务的工具、频率、输入模板和输出目标。
- `x_*` 表保存 Twitter/X 原始和平台专有数据，是采集结果的主存储。
- `source_snapshot*` 表保存公共快照索引和 diff，方便跨平台快照能力复用。
- `signal` 是事件 workflow 的统一输入，不代替平台原始表。

### 11.1 source_snapshot_diff 是否必须落库

建议落库。

原因：

- 快照 diff 是事件形成的重要证据。
- 可以避免每次查询都重新计算。
- 方便前端展示“新进榜、排名上升、排名下降”。
- 方便 workflow 解释为什么形成事件。

如果第一阶段想更轻，也可以先动态计算 diff，但最终应该落库。

## 12. API 草案

### 12.1 查询平台采集配置

```text
GET /collection/platforms/x/config
GET /collection/platforms/x/jobs
```

### 12.2 更新平台变量

```text
PATCH /collection/platforms/x/config
```

请求：

```json
{
  "variables": {
    "regions": ["global"],
    "regionWoeids": {
      "global": 1
    },
    "monitoredAccounts": ["tier10k", "WatcherGuru"],
    "topicKeywords": ["OpenAI", "Bitcoin"],
    "topicNegativeKeywords": ["scam"]
  }
}
```

### 12.3 手动触发采集

```text
POST /collection/jobs/:jobId/run
```

请求：

```json
{
  "overrideVariables": {
    "regions": ["global"],
    "limit": 20
  }
}
```

响应：

```json
{
  "fetchRunId": "run_...",
  "status": "running"
}
```

### 12.4 查询采集结果

```text
GET /sources/items?platform=x&sourceType=trend&region=global
GET /sources/signals?platform=x&sourceType=trend&region=global
```

### 12.5 查询排行榜快照

```text
GET /sources/snapshots?platform=x&sourceType=trend&region=global
GET /sources/snapshots/latest?platform=x&sourceType=trend&region=global
GET /sources/snapshots/:snapshotId/items
GET /sources/snapshots/:snapshotId/diff
```

## 13. 对三个问题的明确回答

### 13.1 数据是不是要分平台存

要。平台原始数据必须按平台分表存。Twitter/X 第一阶段使用 `x_trend_snapshot`、`x_trend_snapshot_item`、`x_post`、`x_post_metric`。公共层只保存 `source_fetch_run`、`source_snapshot*` 和 `signal`，用于调度审计、快照能力复用和事件 workflow 输入。

### 13.2 排行榜多份快照怎么处理

每次按地区、采集时间创建一份 `x_trend_snapshot`，榜单项存在 `x_trend_snapshot_item`。同时同步公共 `source_snapshot` 和 `source_snapshot_item`，并计算当前快照和上一个快照的 `source_snapshot_diff`，用于事件形成、前端展示和复盘。

### 13.3 采集数据字段怎么定义

采集数据至少分为：

- `platform_collection_config`：平台级采集变量，例如地区、重点账号、重点主题。
- `collection_job_config`：采集任务配置，例如工具、频率、输入模板。
- `source_fetch_run`：采集任务审计。
- `x_trend_snapshot`：Twitter/X 地区热搜快照。
- `x_trend_snapshot_item`：Twitter/X 快照内榜单项。
- `x_post`：Twitter/X 账号帖子。
- `x_post_metric`：Twitter/X 帖子指标快照。
- `source_snapshot`：公共排行榜快照索引。
- `source_snapshot_item`：公共快照内榜单项索引。
- `source_snapshot_diff`：快照对比结果。
- `signal`：事件 workflow 消费的标准信号。

第一阶段 Twitter/X 必须覆盖热搜榜、重点账号帖子、帖子指标三类数据。
