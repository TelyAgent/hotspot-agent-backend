# 运营总览真实数据接入架构文档

## 1. 背景

当前前端 `hotspot-master/src/pages/Overview/Overview.tsx` 的运营总览仍使用静态假数据，包括顶部运营指标、结果趋势、账号表现、人工处理事项、链路异常、任务组进度和当前榜单重点。

后端已经具备事件、账号任务、发布记录、发布指标、追踪异常和复盘聚合能力。下一步需要新增真实的运营总览接口，让 Overview 页面成为运营人员进入系统后的真实工作台。

本设计与以下能力衔接：

- 账号任务：`AccountResponseTask`
- 发布记录：`PublicationRecord`
- 发布指标：`PublicationMetric`
- 账号配置：`OperationAccount`
- 事件：`Event`
- 复盘聚合：`InsightsService`
- 前端页面：`Overview.tsx`

## 2. 目标

1. Overview 页面不再使用静态假数据。
2. 顶部指标展示真实发布效果和运营效率。
3. “平均首发用时”按“事件生成后到运营回填 URL”的耗时计算。
4. 人工处理事项来自真实任务状态。
5. 链路异常来自真实生成异常、预检阻断和追踪异常。
6. 任务组进度按 Event 聚合账号任务完成进度。
7. 账号表现复用发布效果数据和账号配置。
8. 数据缺失时如实展示，不用 0 冒充。

## 3. 非目标

首版不做以下事项：

1. 不新建总览快照表。
2. 不新建完整操作审计表。
3. 不做复杂趋势环比口径，只提供最近 7 天按天聚合趋势。
4. 不重做 Overview 页面视觉结构，只替换数据来源。
5. 当前榜单重点首版可以继续使用现有趋势数据源，后续监测接口稳定后再完全切换。

## 4. 数据表设计

### 4.1 是否需要新建表

首版不需要新建业务表。

原因：

- Overview 展示的是当前运营状态和近 7 天效果聚合，现有业务表可以支撑。
- 新建快照表会引入数据落盘时机、修正历史、补采和口径版本管理，首版没有必要。
- 操作审计流水虽然长期有价值，但当前用户需求是总览真实展示，不是完整审计。

### 4.2 PublicationRecord 字段扩展

为了支持“平均首发用时”，建议扩展 `PublicationRecord`。

新增字段：

```prisma
eventFormedAt          DateTime?
urlFilledAt            DateTime?
firstPublishLatencyMs  Int?
```

字段含义：

- `eventFormedAt`：回填 URL 时，把对应 Event 的 `formedAt` 固化保存。
- `urlFilledAt`：运营人员回填 URL 的时间。首版可以与 `publishedAt` 一致。
- `firstPublishLatencyMs`：`urlFilledAt - eventFormedAt`，单位毫秒。

为什么不每次查询实时计算：

1. 回填 URL 是一个明确业务动作，当时就可以确定首发耗时。
2. 固化字段便于 Overview 直接聚合，避免每次联表查 Event。
3. 即使后续 Event 的 formedAt 规则或数据被修正，已发布记录的当时口径仍可保留。
4. 历史缺字段的数据可以忽略，不会被当作 0 拉低平均值。

### 4.3 不新增字段的数据

以下数据直接复用现有表：

| 数据 | 来源 | 是否新增字段 |
|---|---|---|
| 48h 表现良好率 | `PublicationRecord.wellPerforming` | 不需要 |
| 总浏览量 | `PublicationMetric.views` 最新快照求和 | 不需要 |
| 互动总量 | `PublicationMetric.likes/replies/reposts/quotes` 最新快照求和 | 不需要 |
| 已发布内容 | `PublicationRecord.status = published` | 不需要 |
| 账号表现 | `PublicationRecord + PublicationMetric + OperationAccount` | 不需要 |
| 人工处理事项 | `AccountResponseTask.status/riskStatus` | 不需要 |
| 任务组进度 | `AccountResponseTask` 按 `eventId` 聚合 | 不需要 |
| 追踪异常 | `PublicationRecord.trackingStatus = tracking_error` | 不需要 |
| 生成异常 | `AccountResponseTask.status = generation_failed/precheck_blocked` | 不需要 |

## 5. 平均首发用时口径

### 5.1 定义

平均首发用时：

```text
firstPublishLatencyMs = urlFilledAt - eventFormedAt
```

其中：

- `eventFormedAt` 使用 Event 表的 `formedAt`。
- `urlFilledAt` 使用运营人员回填 URL 的时间。
- 如果 Event 不存在、`formedAt` 缺失或时间异常，则 `firstPublishLatencyMs = null`。

### 5.2 写入时机

在 `ContentService.publishTask` 中创建 `PublicationRecord` 时写入：

1. 根据 `task.eventId` 查询 Event。
2. 获取 `event.formedAt`。
3. 使用当前 `now` 作为 `urlFilledAt`。
4. 计算 `firstPublishLatencyMs`。
5. 与发布记录一起保存。

### 5.3 历史数据处理

历史发布记录如果没有 `firstPublishLatencyMs`：

- Overview 计算平均值时忽略。
- 页面展示平均值时，如果没有任何有效样本，显示 `—`。

不建议为了历史数据硬补，因为缺少当时回填动作的精确上下文时，补算可能产生误导。

## 6. Overview 接口设计

### 6.1 路由

新增：

```http
GET /overview?range=7d
```

首版支持：

- `7d`
- `30d`
- `1y`

默认 `7d`。

### 6.2 返回结构

```ts
interface OperationOverviewResponse {
  range: '7d' | '30d' | '1y';
  stats: {
    wellPerformingRate: number;
    wellPerformingCount: number;
    publishedCount: number;
    totalViews?: number;
    totalInteractions: number;
    publishedAccounts: number;
    avgFirstPublishLatencyMs?: number;
  };
  trend: Array<{
    date: string;
    views?: number;
    interactions: number;
    publishedCount: number;
  }>;
  accountPerformance: Array<{
    accountId: string;
    name: string;
    wellPerformingRate: number;
    avgViews?: number;
    publishedCount: number;
    score: number;
  }>;
  manualItems: Array<{
    severity: 'normal' | 'warning' | 'critical';
    title: string;
    description: string;
    taskId?: string;
    eventId?: string;
    actionPage: 'tasks' | 'events' | 'insights';
  }>;
  anomalies: Array<{
    severity: 'warning' | 'critical';
    type: string;
    count: number;
    description: string;
    actionPage: 'tasks' | 'insights';
  }>;
  taskGroups: Array<{
    eventId: string;
    eventTitle: string;
    taskCount: number;
    completedCount: number;
    progressPercent: number;
    statusLabel: string;
  }>;
}
```

## 7. 指标计算口径

### 7.1 时间范围

时间范围按 `PublicationRecord.publishedAt` 过滤发布效果指标。

任务状态类数据默认看当前状态，不严格按发布时间过滤，因为人工处理事项是“现在需要处理什么”。

### 7.2 顶部指标

`wellPerformingRate`：

```text
wellPerformingCount / publishedCount
```

`totalViews`：

每条发布记录取最新一条 `PublicationMetric.views` 后求和。

如果所有发布记录都没有 views，则返回 `undefined`。

`totalInteractions`：

每条发布记录取最新一条指标：

```text
likes + replies + reposts + quotes
```

引用缺失时按 0 参与互动总量，浏览缺失不影响互动总量。

`publishedCount`：

范围内 `PublicationRecord.status = published` 的数量。

`publishedAccounts`：

范围内有发布记录的去重账号数。

`avgFirstPublishLatencyMs`：

范围内有 `firstPublishLatencyMs` 的发布记录取平均值。

### 7.3 结果趋势

按天聚合最近范围内数据：

- `views`：当天发布记录最新 views 求和。
- `interactions`：当天发布记录最新互动数求和。
- `publishedCount`：当天发布数量。

如果当天没有发布，仍返回该日期，数值为 0 或缺失。

### 7.4 账号表现

按账号聚合：

- 发布数
- 表现良好率
- 平均浏览
- 账号表现分

首版账号表现分建议：

```text
score = min(100, round(wellPerformingRate * 70 + log10(avgViews + 1) * 10))
```

如果浏览缺失，则浏览项按 0 计算，但页面需要显示“浏览缺失”。

### 7.5 人工处理事项

来自 `AccountResponseTask` 当前状态。

首版映射：

| 状态 | 展示 |
|---|---|
| `generation_failed` | 候选生成失败 |
| `precheck_blocked` | 风险预检阻断 |
| `ready_for_generation` | 待生成候选 |
| `ready_for_publish` | 候选待运营发布 |
| `published` 且没有可追踪状态 | 已发布，等待追踪 |

排序：

1. 异常优先
2. 待发布
3. 待生成
4. 更新时间倒序

首版取前 5 条。

### 7.6 链路异常

首版聚合三类：

1. 内容生成异常：`generation_failed`
2. 风险预检阻断：`precheck_blocked`
3. 数据追踪异常：`PublicationRecord.trackingStatus = tracking_error`

每类返回数量和说明。

### 7.7 任务组进度

按 `AccountResponseTask.eventId` 聚合。

`completedCount` 包含：

- `published`
- `tracking`
- `completed`
- `abandoned`

`taskCount` 是该 Event 下全部账号任务数。

`progressPercent`：

```text
completedCount / taskCount * 100
```

`eventTitle` 优先使用 Event 标题；如果缺失，回退为 `eventId`。

首版取最近更新的前 5 个 Event。

## 8. 后端模块设计

### 8.1 新增模块

建议新增：

- `src/overview/overview.controller.ts`
- `src/overview/overview.service.ts`
- `src/overview/overview.module.ts`

`OverviewService` 依赖：

- `ContentRepository`
- `PrismaService` 或 Event 查询仓储

原因：

- ContentRepository 已能读取任务、发布记录、指标和账号。
- Event 的 `formedAt/title` 当前不在 ContentRepository 中完整暴露，首版可以在 OverviewService 里通过 Prisma 查询 Event。

### 8.2 ContentRepository 扩展

为了让 `ContentService.publishTask` 写入首发用时，需要扩展读取 Event 形成时间的方法。

建议在 `ContentRepository` 增加：

```ts
findEventTimingById(id: string): MaybePromise<{
  id: string;
  title: string;
  formedAt: string;
} | undefined>;
```

用于：

- 发布回填时计算 `firstPublishLatencyMs`
- Overview 聚合任务组标题

### 8.3 ContentService 发布回填改造

`publishTask` 增加：

1. 查询 Event timing。
2. 计算首发用时。
3. 创建发布记录时写入：
   - `eventFormedAt`
   - `urlFilledAt`
   - `firstPublishLatencyMs`

## 9. 前端设计

### 9.1 新增 API 和 Hook

新增：

- `hotspot-master/src/api/overview.ts`
- `hotspot-master/src/hooks/useOverview.ts`

### 9.2 Overview 页面改造

修改：

- `hotspot-master/src/pages/Overview/Overview.tsx`

改造点：

1. 移除静态 `manual/anomalies/taskGroups/accounts`。
2. 调用 `useOverview('7d')`。
3. 顶部指标来自接口。
4. 账号表现来自 `accountPerformance`。
5. 人工处理来自 `manualItems`。
6. 链路异常来自 `anomalies`。
7. 任务组进度来自 `taskGroups`。
8. 当前榜单重点首版可暂时保留 `TREND.Worldwide.slice(0, 3)`。

### 9.3 缺失展示

前端展示规则：

- `totalViews === undefined`：显示 `缺失`
- `avgViews === undefined`：显示 `缺失`
- `avgFirstPublishLatencyMs === undefined`：显示 `—`
- 列表为空：显示空状态文案，而不是保留假数据。

## 10. 测试计划

### 10.1 后端测试

新增：

- `test/unit/overview.service.spec.ts`

覆盖：

1. 汇总发布数量、账号数、表现良好率。
2. 汇总最新浏览量和互动量。
3. 浏览量全部缺失时返回 `undefined`。
4. 平均首发用时只统计有 `firstPublishLatencyMs` 的记录。
5. 人工处理事项按异常优先排序。
6. 链路异常按三类聚合。
7. 任务组按 Event 聚合进度。

修改：

- `test/unit/content.service.spec.ts`

覆盖：

1. 回填 URL 时写入 `eventFormedAt`。
2. 回填 URL 时写入 `urlFilledAt`。
3. 回填 URL 时写入 `firstPublishLatencyMs`。

### 10.2 前端验证

前端首版执行：

```bash
npm run build
```

必要时本地打开 Overview 页面确认：

- loading 状态正常。
- 接口失败时展示错误。
- 空数据不会显示假内容。
- 首发用时缺失时展示 `—`。

## 11. 实施顺序

1. 扩展 `PublicationRecord` Prisma 字段。
2. 扩展 TypeScript 类型和 Prisma/内存仓储映射。
3. 扩展 `ContentRepository.findEventTimingById`。
4. 修改 `ContentService.publishTask` 写入首发用时字段。
5. 新增 `OverviewService` 单测。
6. 实现 `OverviewService` 聚合逻辑。
7. 新增 `OverviewController` 和 `OverviewModule`。
8. 挂载到 `AppModule`。
9. 新增前端 `overview.ts` 和 `useOverview.ts`。
10. 改造 `Overview.tsx` 接口数据。
11. 跑后端单测、类型检查、lint、Prisma validate、前端 build。

## 12. 风险与注意事项

1. 现有历史发布记录没有首发用时字段，不能用 0 代替。
2. 如果 Event 不存在或 formedAt 缺失，首发用时显示缺失。
3. 当前榜单重点仍可能来自前端静态趋势数据，这一块建议放到监测接口稳定后再完全替换。
4. 账号表现分只是运营总览的排序辅助，不应作为业务奖惩依据。
5. 如果未来需要对 Overview 做历史趋势环比，应该再建快照表，不能倒推当前聚合结果。

## 13. 首版验收标准

1. Overview 顶部指标来自后端 `/overview`。
2. 已发布内容、总浏览量、互动总量、表现良好率使用真实发布记录和最新指标。
3. 平均首发用时使用 URL 回填时固化的 `firstPublishLatencyMs`。
4. 人工处理事项来自真实账号任务状态。
5. 链路异常来自真实任务和追踪异常。
6. 任务组进度来自真实 Event 下账号任务完成比例。
7. 前端无数据时展示空状态，不再展示假数据。
