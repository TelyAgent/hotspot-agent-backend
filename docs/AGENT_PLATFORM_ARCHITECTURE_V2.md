# Agent 热点运营平台 V2 架构设计

## 1. 核心结论

V2 架构废弃“把数据源采集也做成 Skill”的思路，重新划分系统边界：

```text
平台数据接入 MCP Tools
  -> 标准化数据层
  -> 事件生成 Markdown Workflow
  -> 内容生成 Markdown Workflow
  -> 推广效果监控 Markdown Workflow
```

新的职责定义：

| 层 | 负责 | 不负责 |
| --- | --- | --- |
| MCP Tool | 连接外部平台、鉴权、分页、限流、获取原始数据 | 判断热点、生成事件、写运营内容 |
| 标准化数据层 | 把不同平台数据转换为统一结构 | 平台 API 细节、业务决策 |
| Markdown Workflow | 用自然语言和结构化规则定义事件判断、内容生成、效果复盘 | 直接调用平台私有 API、管理密钥 |
| Backend Runtime | 调度、存储、审计、权限、执行 workflow、暴露业务接口 | 写死平台业务规则 |
| Codex 工作区 | 帮运营人员通过对话创建、修改、验证 workflow | 代替生产运行时 |

一句话：**平台差异放 MCP Tool，业务规则放 Markdown Workflow，后端只做运行时和数据底座。**

## 2. 业务主链路

系统分四个阶段：

```text
获取数据源
  -> 根据数据源生成事件
  -> 根据事件生成发布内容
  -> 根据发布内容监控推广效果
```

### 2.1 获取数据源

数据源来自不同平台，每个平台能力不同。例如：

- X/Twitter：热搜榜、账号帖子、关键词搜索、互动指标。
- YouTube：视频搜索、频道视频、评论、播放量和互动指标。
- TikTok：热门视频、话题页、账号视频、互动指标。
- RSS/新闻站点：文章列表、标题、正文摘要、发布时间。
- Google Trends：关键词趋势、地区热度。
- 内部运营日历：活动、发布计划、节假日、会议、产品节点。

这些能力应实现为 MCP Tools，而不是 Markdown Skill。

### 2.2 根据数据源生成事件

事件生成是业务判断，应由 Markdown Workflow 定义。它接收标准化后的 `Signal` / `RawSourceItem`，执行规则：

- 重点主题或关键词是否进入目标地区热搜。
- 单平台信号是否足够强。
- 多平台信号是否相互印证。
- 新信号应该创建新事件，还是合并到已有事件。
- 命中规则后是否启动内容响应流水线。
- 后续重复命中是否只更新原 Event 上下文。

### 2.3 根据事件生成发布内容

内容生成也属于 Markdown Workflow。它接收 `Event`、目标账号、平台策略、素材库、风控要求，输出 `ContentTask` 和候选文案。

### 2.4 根据发布内容监控推广效果

推广效果监控通过 MCP Tools 获取各平台指标，再由 Markdown Workflow 复盘：

- 内容是否达到预期曝光。
- 哪类事件更容易转化。
- 哪个平台响应更快。
- 是否需要二次发布、改标题、换角度或停止跟进。

## 3. MCP Tool 层设计

MCP Tool 是平台接入能力。它应该尽量稳定、可测试、可复用。

### 3.1 Tool 命名建议

```text
x.getTrending
x.searchPosts
x.getAccountPosts
x.getPostMetrics

youtube.searchVideos
youtube.getChannelVideos
youtube.getVideoMetrics
youtube.getVideoComments

rss.fetchFeed
web.fetchArticle
googleTrends.getInterest
calendar.getEvents
```

### 3.2 Tool 输出原则

MCP Tool 可以返回平台原始结构，但必须附带最小可识别字段：

```ts
RawSourceItem {
  platform: string
  sourceType: 'trend' | 'post' | 'video' | 'article' | 'comment' | 'metric' | 'calendar_event'
  sourceItemId: string
  title?: string
  text?: string
  url?: string
  author?: string
  region?: string
  publishedAt?: string
  observedAt: string
  metrics?: Record<string, number>
  raw: unknown
}
```

### 3.3 Tool 不做的事

MCP Tool 不应该：

- 判断是否形成热点事件。
- 生成运营内容。
- 修改业务数据库。
- 合并事件。
- 写死某个运营团队的规则。

## 4. 标准数据模型

### 4.1 RawSourceItem

`RawSourceItem` 表示从平台获取的一条原始数据。它保留平台差异，用于审计和追溯。

### 4.2 Signal

`Signal` 是被系统标准化后的热点信号。它比 `RawSourceItem` 更适合业务判断。

```ts
Signal {
  id?: string
  platform: string
  sourceType: string
  sourceItemId: string
  title: string
  summary?: string
  url?: string
  region?: string
  rank?: number
  author?: string
  publishedAt?: string
  observedAt: string
  metrics?: Record<string, number>
  rawSourceItemId?: string
  raw?: unknown
}
```

### 4.3 Event

`Event` 是系统真正要运营响应的对象。

```ts
Event {
  id: string
  title: string
  topicKey: string
  triggerType: string
  status: 'new' | 'active' | 'responding' | 'published' | 'monitoring' | 'closed'
  confidence: number
  formedAt: string
  evidence: Evidence[]
  context: unknown
}
```

### 4.4 ContentTask

`ContentTask` 表示围绕事件生成的内容生产任务。

### 4.5 PublishedContent

`PublishedContent` 表示已经发布到平台的内容。

### 4.6 PromotionMetric

`PromotionMetric` 表示发布后的曝光、互动、点击、转化等效果数据。

## 5. Markdown Workflow 层设计

Markdown Workflow 只处理业务流程，不直接承担平台接入。

建议目录：

```text
workflows/
  event-formation/
    topic-hotlist-event/SKILL.md
    cross-platform-event/SKILL.md
  content-generation/
    x-post-response/SKILL.md
    youtube-short-script/SKILL.md
  promotion-monitoring/
    published-content-review/SKILL.md
    weekly-learning-review/SKILL.md
```

### 5.1 Workflow Manifest

每个 workflow 的 Markdown 文档包含 frontmatter：

```yaml
---
id: topic-hotlist-event
name: 重点主题热搜成事规则
type: event_formation
version: 1.0.0
status: enabled
description: 判断标准化信号是否形成运营事件。
inputs:
  signals: Signal[]
  existingEvents: Event[]
  topicConfig: TopicConfig[]
outputs:
  events: Event[]
  eventUpdates: EventUpdate[]
tools:
  read:
    - event.searchSimilar
  write:
    - event.create
    - event.updateContext
llm: true
---
```

### 5.2 Workflow 正文

正文用自然语言和结构化规则描述业务判断，例如：

```md
# 重点主题热搜成事规则

当已配置重点主题或关键词进入任意目标地区热搜榜时，直接形成 Event。

同一主题、同一语义事件后续重复进入热搜，不新建 Event，只更新原 Event 上下文。

满足以下任一条件，也形成主题圈关注度触发：

- B3h >= 3
- B24h >= 6
- Tmax >= 3 且该帖子进入账号近期表现前 5%
- B3h >= 2 且 Tmax >= 2

输出必须包含事件标题、触发类型、证据、置信度和上下文。
```

## 6. 事件生成 Workflow

事件生成 workflow 是整个系统的核心。

输入：

- 最新 `Signal[]`
- 重点主题配置
- 已存在 Event
- 目标地区配置
- 账号圈配置
- 历史表现基线

输出：

- 新建 Event
- 更新已有 Event 的上下文
- 不成事原因
- 证据链

事件形成规则包括：

| 触发类型 | 条件 | 结果 |
| --- | --- | --- |
| 重点主题热搜命中 | 已配置主题或关键词进入任意目标地区热搜 | 直接形成 Event |
| 短期集中讨论 | B3h >= 3 | 形成 Event |
| 24 小时持续热议 | B24h >= 6 | 形成 Event |
| 单点流量爆发 | Tmax >= 3 且进入账号近期表现前 5% | 形成 Event |
| 讨论与流量混合上升 | B3h >= 2 且 Tmax >= 2 | 形成 Event |

这些规则是“或”的关系。任一规则首次命中后，启动内容响应流水线；后续规则命中只更新原 Event 上下文。

## 7. 内容生成 Workflow

内容生成 workflow 根据事件生成可发布内容。

输入：

- Event
- Evidence
- 目标平台
- 账号定位
- 品牌语气
- 风险规则
- 历史表现复盘

输出：

- 内容任务
- 候选标题
- 候选正文
- 视觉素材建议
- 发布平台
- 发布时间建议
- 风险提示

内容 workflow 可以拆成多个：

- 快速响应短文。
- 深度线程。
- 视频脚本。
- 社群转发文案。
- 多平台改写。

## 8. 推广效果监控 Workflow

推广效果监控分两层：

1. MCP Tool 获取指标。
2. Markdown Workflow 解释效果并生成复盘结论。

输入：

- PublishedContent
- 平台指标
- Event 上下文
- 发布时间
- 内容版本

输出：

- 效果评分
- 是否继续跟进
- 是否二次发布
- 是否调整角度
- 对未来 workflow 的优化建议

## 9. 后台业务接口层

V2 后端仍然需要业务接口，但接口不应该暴露平台细节。

### 9.1 数据源接口

```text
GET  /sources/connectors
POST /sources/fetch
GET  /sources/items
GET  /sources/signals
```

### 9.2 事件接口

```text
GET  /events
POST /events/form
GET  /events/:id
POST /events/:id/merge
POST /events/:id/context
POST /events/:id/trigger-content
```

### 9.3 内容接口

```text
GET  /content/tasks
POST /content/generate
POST /content/tasks/:id/approve
POST /content/tasks/:id/publish
GET  /content/published
```

### 9.4 效果接口

```text
GET  /promotion/metrics
POST /promotion/collect
POST /promotion/review
GET  /reviews
```

### 9.5 Workflow 管理接口

```text
GET  /workflows
POST /workflows/import
POST /workflows/:id/validate
POST /workflows/:id/dry-run
POST /workflows/:id/enable
GET  /workflows/:id/runs
```

### 9.6 MCP Tool 管理接口

```text
GET  /connectors
POST /connectors/install
POST /connectors/:id/test
GET  /connectors/:id/tools
POST /connectors/:id/secrets
```

## 10. Codex 辅助运营编写 Workflow

运营人员不应该直接面对复杂配置。系统应提供 Codex 可读上下文，让运营通过对话完成 workflow 编写。

### 10.1 暴露给 Codex 的上下文

```text
GET /codex/context
```

返回：

- 当前可用 MCP Tools。
- 标准数据模型。
- 已启用 workflow。
- 示例输入输出。
- 业务规则模板。
- 历史运行失败原因。
- 可用密钥名称，不返回密钥值。

### 10.2 Codex 工作方式

运营人员可以说：

```text
帮我新增一个 YouTube 视频热点事件形成规则：
当某个关键词下 6 小时内出现 5 条播放增长很快的视频，并且至少 2 个频道不是同一机构，就形成事件。
```

Codex 生成或修改 Markdown Workflow，调用后端 dry-run 接口验证输出格式，再让运营确认启用。

## 11. 数据库表设计方向

建议核心表：

| 表 | 用途 |
| --- | --- |
| `connector` | 已安装 MCP Connector |
| `connector_tool` | Connector 暴露的工具 |
| `connector_secret` | 工具所需密钥元数据 |
| `raw_source_item` | 原始平台数据 |
| `signal` | 标准化信号 |
| `event` | 事件 |
| `evidence` | 事件证据 |
| `event_relation` | 事件合并和关联 |
| `workflow_definition` | Markdown Workflow 定义 |
| `workflow_run` | Workflow 运行记录 |
| `tool_call` | MCP Tool 调用审计 |
| `content_task` | 内容任务 |
| `published_content` | 已发布内容 |
| `promotion_metric` | 推广指标 |
| `review` | 复盘结论 |

## 12. 废弃当前实现的迁移策略

当前后端代码可以保留为实验版本，但 V2 实现不应继续沿用以下抽象：

- `source skill`
- `x-trending` 作为数据源 workflow
- `MonitoringService` 直接绑定某个平台
- 平台排行榜采集服务

推荐迁移顺序：

1. 新建 V2 后端目录或清空当前实验实现。
2. 先实现 MCP Tool Registry 和 Connector 管理。
3. 实现标准数据模型：`RawSourceItem`、`Signal`。
4. 实现数据获取任务：调用 MCP Tool 并落库原始数据。
5. 实现事件生成 Markdown Workflow Runtime。
6. 实现内容生成 Workflow Runtime。
7. 实现推广效果监控 Workflow Runtime。
8. 实现 Codex 上下文导出接口。
9. 最后接前端页面。

## 13. 推荐技术选型

后端：

- TypeScript
- NestJS
- Prisma
- PostgreSQL
- LangChain
- LangGraph
- MCP SDK

Workflow Runtime：

- Markdown + YAML frontmatter 定义 workflow。
- Zod 校验输入输出。
- LangChain structured output 保证模型输出稳定。
- LangGraph 编排多步骤业务流程。

MCP Tool Runtime：

- 每个平台一个 connector 包。
- 每个 connector 暴露多个 tool。
- 密钥由后端统一管理。
- 工具调用必须审计。

前端：

- React
- 当前项目已有的页面结构可以参考，但 V2 API 应重新设计。

## 14. 第一阶段 MVP

第一阶段只做最小闭环：

```text
安装 X Connector
  -> 调用 x.getTrending 获取原始热搜
  -> 标准化为 Signal
  -> 运行 topic-hotlist-event Workflow
  -> 形成 Event
  -> 运行 x-post-response Workflow
  -> 生成 ContentTask
```

MVP 不要求真实发布内容，也不要求完整效果监控。先证明：

- 平台接入可以通过 MCP Tool 替换。
- 事件判断可以通过 Markdown Workflow 修改。
- 后端只负责运行、存储、审计和业务接口。
- Codex 能根据上下文帮助运营生成 workflow。
