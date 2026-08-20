# 发布效果追踪与复盘优化架构文档

## 1. 背景

当前平台已经具备账号任务、候选内容生成、人工发布 URL 回填、发布记录和基础指标采集能力。下一阶段需要把“发布后效果追踪”和“复盘优化”补完整，使系统能够持续追踪已回填的 X/Twitter 帖子，沉淀效果数据，并在前端 `复盘优化` 页面展示账号表现、帖子效果和追踪异常。

本设计依据：

- `hotspot-monitor-doc/_bmad-output/specs/spec-platform-rules/SPEC.md` 第 8 章“效果追踪”
- 旧后端 `/Users/qmk/work/hotspot-monitor-v1/hotspot-monitor-server` 中 `TrackingService` 的实现经验
- 当前新后端 `hotspot-agent-backend/src/content/*` 的发布记录、指标采集和调度雏形
- 当前前端 `hotspot-master/src/pages/Insights/Insights.tsx` 的页面结构

## 2. 目标

1. 发布回填后，系统自动追踪回填的帖子。
2. 发布后前 24 小时每 2 小时抓取一次指标。
3. 发布 24 小时后每 5 小时抓取一次指标。
4. 默认至少追踪 7 天。
5. 展示点赞、回复、转发；接口支持时记录引用和浏览量。
6. 发布后 48 小时内浏览量达到 1000 时，标记“表现良好”，并将追踪期限延长到 14 天。
7. 阈值、观察窗口、追踪期限和抓取间隔要有规则版本。
8. 数据缺失或接口失败必须如实显示，不能伪造成 0，也不能改写发布状态。
9. `Insights` 页面展示真实复盘数据，而不是静态示例数据。

## 3. 非目标

首版不实现以下能力：

1. 不做自动发帖。
2. 不自动修改线上内容规则、风险规则或账号 Skill。
3. 不建立完整异常历史表，只在发布记录上保存当前追踪异常状态和最近错误。后续如需完整审计流水，可再新增 `PublicationTrackingLog`。
4. 不做复杂归因模型，只按发布记录、账号和指标快照聚合基础复盘数据。

## 4. 当前现状

### 4.1 新后端已有能力

当前 `content` 模块已有：

- `PublicationRecord`：保存发布任务、候选、事件、账号、URL、发布时间、追踪状态和追踪结束时间。
- `PublicationMetric`：保存单次采集到的点赞、回复、转发、引用、浏览量和原始返回。
- `ContentTrackingSchedulerService`：定时扫描追踪中的发布记录并调用指标采集器。
- `ToolRegistryPublicationMetricsCollector`：通过工具调用获取 X 账号帖子并匹配目标 URL。
- `ContentService.recordPublicationMetrics`：保存指标，并将任务状态更新为 `tracking`。

### 4.2 当前缺口

当前实现还缺：

- 抓取间隔仍是固定 1 小时，不符合 2h/5h 规则。
- 发布记录没有 `wellPerforming` 字段。
- 发布记录没有保存追踪规则版本。
- 发布记录没有保存最近接口错误和失败次数。
- 接口失败只打日志，前端看不到真实异常。
- 浏览量达到阈值后不会延长追踪到 14 天。
- 没有 `/insights` 后端接口。
- 前端 `Insights.tsx` 仍有静态风险与异常线索。

### 4.3 旧后端参考

旧后端 `TrackingService` 的核心规则：

- `age < 24h` 时使用 2 小时间隔。
- `age >= 24h` 时使用 5 小时间隔。
- 默认追踪 7 天。
- 48 小时内浏览量达到 1000，设置 `wellPerforming = true`，并延长到 14 天。
- 抓取失败时将追踪状态标记为异常，不改变发布完成状态。

新后端应吸收这些规则，但字段命名、状态值和仓储模式需要沿用新后端当前 `content` 模块的英文枚举风格。

## 5. 规则设计

### 5.1 默认规则

首版内置一个默认规则对象：

```ts
export const DEFAULT_PUBLICATION_TRACKING_RULE = {
  version: 'publication-tracking-v1',
  earlyWindowHours: 24,
  earlyIntervalHours: 2,
  normalIntervalHours: 5,
  minimumTrackingDays: 7,
  wellPerformingWindowHours: 48,
  wellPerformingViewsThreshold: 1000,
  extendedTrackingDays: 14,
};
```

### 5.2 是否需要抓取

对每条 `trackingStatus = tracking` 或 `trackingStatus = tracking_error` 的发布记录：

1. 如果当前时间已经超过 `trackingEndsAt`，结束追踪。
2. 如果没有任何指标记录，立即抓取一次。
3. 如果发布时间距当前小于 24 小时，最近一次指标距当前达到 2 小时后可再次抓取。
4. 如果发布时间距当前大于等于 24 小时，最近一次指标距当前达到 5 小时后可再次抓取。

### 5.3 追踪结束

默认 `trackingEndsAt = publishedAt + 7 天`。

当满足表现良好条件时：

- `views >= 1000`
- 指标采集时间仍在 `publishedAt + 48 小时` 内
- 发布记录尚未标记 `wellPerforming`

则更新：

- `wellPerforming = true`
- `trackingEndsAt = publishedAt + 14 天`

### 5.4 数据缺失

点赞、回复、转发是基础指标，采集器无法提供时记为 0。

引用和浏览量属于接口可选能力：

- 接口返回时保存数值。
- 接口未返回时保存 `null`。
- 前端展示为“缺失”，不能显示为 0。

### 5.5 接口失败

指标接口失败时：

- 不改变 `PublicationRecord.status`。
- 不改变 `AccountResponseTask.status`。
- `trackingStatus` 更新为 `tracking_error`。
- `lastTrackingError` 保存错误信息。
- `lastTrackingErrorAt` 保存失败时间。
- `trackingFailureCount += 1`。

后续抓取成功时：

- `trackingStatus` 恢复为 `tracking`。
- 清空或保留最近错误均可。首版建议保留最近错误和时间，前端通过当前状态判断是否仍异常。

## 6. 数据模型设计

### 6.1 PublicationRecord 扩展

在 `PublicationRecord` 增加字段：

```prisma
wellPerforming       Boolean  @default(false)
trackingRuleVersion  String   @default("publication-tracking-v1")
lastTrackingError    String?
lastTrackingErrorAt  DateTime?
trackingFailureCount Int      @default(0)
```

对应 TypeScript 类型 `PublicationRecord` 增加：

```ts
wellPerforming: boolean;
trackingRuleVersion: string;
lastTrackingError?: string;
lastTrackingErrorAt?: string;
trackingFailureCount: number;
```

### 6.2 PublicationMetric 保持不变

当前字段已经覆盖首版需要：

- `likes`
- `replies`
- `reposts`
- `quotes`
- `views`
- `raw`
- `capturedAt`

首版不需要新增指标表字段。

## 7. 后端服务设计

### 7.1 追踪规则模块

新增文件：

`src/content/publication-tracking-rule.ts`

职责：

- 导出默认规则。
- 提供时间计算函数。
- 判断当前发布记录是否到期。
- 判断当前发布记录是否应该抓取。
- 判断指标是否满足表现良好。

建议函数：

```ts
export function resolveTrackingIntervalMs(publication: PublicationRecord, now: string): number;
export function isPublicationTrackingExpired(publication: PublicationRecord, now: string): boolean;
export function isPublicationMetricDue(publication: PublicationRecord, latestMetric: PublicationMetricRecord | undefined, now: string): boolean;
export function isWellPerformingMetric(publication: PublicationRecord, metric: PublicationMetricRecord | CollectedPublicationMetrics): boolean;
export function extendedTrackingEndsAt(publication: PublicationRecord): string;
```

### 7.2 ContentTrackingSchedulerService 改造

当前调度服务继续每分钟 tick，但不代表每分钟抓取。每次 tick 只筛出“到期应抓”的发布记录。

改造点：

1. 用 `publication-tracking-rule.ts` 替代固定 1 小时判断。
2. 支持 `tracking_error` 状态继续重试。
3. 抓取失败时调用仓储更新错误字段。
4. 抓取成功后，保存指标，并检查是否表现良好。
5. 表现良好时延长追踪期到 14 天。

### 7.3 ContentService 改造

`publishTask` 创建发布记录时：

- `trackingStatus = tracking`
- `trackingEndsAt = now + 7 天`
- `trackingRuleVersion = publication-tracking-v1`
- `wellPerforming = false`
- `trackingFailureCount = 0`

`recordPublicationMetrics` 保存指标后：

- 如果当前发布记录是 `tracking_error`，恢复到 `tracking`。
- 如果指标满足表现良好，更新发布记录：
  - `wellPerforming = true`
  - `trackingEndsAt = publishedAt + 14 天`

新增方法：

```ts
async recordPublicationTrackingFailure(publicationRecordId: string, error: unknown, now?: string)
```

职责：

- 更新 `trackingStatus = tracking_error`
- 写入最近错误和失败次数
- 不改变发布状态

### 7.4 ContentRepository 改造

`updatePublicationRecord` 支持更新：

- `trackingStatus`
- `trackingEndsAt`
- `wellPerforming`
- `lastTrackingError`
- `lastTrackingErrorAt`
- `trackingFailureCount`

新增聚合读取能力：

```ts
listPublicationMetrics(publicationRecordId?: string): MaybePromise<PublicationMetricRecord[]>;
```

用于 Insights 计算。

## 8. Insights 接口设计

### 8.1 新增模块

建议新增：

- `src/insights/insights.controller.ts`
- `src/insights/insights.service.ts`
- `src/insights/insights.module.ts`

也可以先放在 `content` 模块下，但长期看 `复盘优化` 会聚合风险、异常、规则建议，不只属于内容发布，所以建议独立 `insights` 模块。

### 8.2 接口

```http
GET /insights?range=7d|30d|1y
```

### 8.3 返回结构

```ts
interface InsightsResponse {
  range: '7d' | '30d' | '1y';
  stats: {
    trackingPosts: number;
    wellPerformingRate: number;
    avgInteractionRate: number;
    totalLikes: number;
    totalReplies: number;
    totalReposts: number;
    totalQuotes?: number;
    totalViews?: number;
    trackingErrorPosts: number;
  };
  accounts: Array<{
    accountId: string;
    name: string;
    publishedPosts: number;
    avgViews?: number;
    avgLikes: number;
    avgReplies: number;
    avgReposts: number;
    wellPerformingRate: number;
  }>;
  trackingIssues: Array<{
    publicationRecordId: string;
    taskId: string;
    eventId: string;
    accountId: string;
    accountName: string;
    url: string;
    trackingStatus: string;
    lastTrackingError: string;
    lastTrackingErrorAt: string;
    trackingFailureCount: number;
  }>;
}
```

### 8.4 聚合口径

时间范围按 `PublicationRecord.publishedAt` 过滤。

每条发布记录取最新一条 `PublicationMetric` 作为当前效果。

`trackingPosts`：

- `trackingStatus = tracking` 或 `tracking_error` 的发布记录数。

`wellPerformingRate`：

- `wellPerforming = true` 的发布记录数 / 有效发布记录数。

`avgInteractionRate`：

- 如果有浏览量：`(likes + replies + reposts + quotes) / views`
- 如果没有浏览量：不纳入互动率分母。
- 全部缺失浏览量时返回 0，并由前端显示缺失提示。

`trackingIssues`：

- 只返回 `trackingStatus = tracking_error` 的发布记录。

## 9. 前端设计

### 9.1 API 类型

修改：

`hotspot-master/src/api/insights.ts`

增加：

- 总点赞、回复、转发、引用、浏览量
- 追踪异常数
- 账号发布数和平均基础指标
- 追踪异常列表

### 9.2 Insights 页面展示

修改：

`hotspot-master/src/pages/Insights/Insights.tsx`

顶部指标：

1. 追踪中帖子
2. 48h 表现良好率
3. 平均互动率
4. 追踪异常数

账号表现：

- 账号名
- 发布数
- 平均浏览
- 平均点赞 / 回复 / 转发
- 表现良好率

风险与异常线索：

- 移除静态 `RISKS`
- 展示 `trackingIssues`
- 每条展示账号、URL、错误信息、失败次数、最近失败时间
- 无异常时展示“暂无追踪异常”

### 9.3 数据缺失展示

前端规则：

- `views === undefined/null` 展示“缺失”
- `quotes === undefined/null` 展示“缺失”
- 点赞、回复、转发可展示 0

## 10. 测试计划

### 10.1 后端单测

新增或修改：

- `test/unit/publication-tracking-rule.spec.ts`
- `test/unit/content-tracking-scheduler.service.spec.ts`
- `test/unit/content.service.spec.ts`
- `test/unit/insights.service.spec.ts`

覆盖场景：

1. 发布后 24 小时内，距离上次采集不足 2 小时不抓。
2. 发布后 24 小时内，距离上次采集达到 2 小时才抓。
3. 发布 24 小时后，距离上次采集不足 5 小时不抓。
4. 发布 24 小时后，距离上次采集达到 5 小时才抓。
5. 没有任何指标时立即抓取。
6. 48 小时内浏览量达到 1000，标记表现良好并延长到 14 天。
7. 48 小时外浏览量达到 1000，不再标记表现良好。
8. 指标接口失败时记录追踪异常，不改变发布状态。
9. 指标接口恢复成功后继续保存指标。
10. Insights 聚合追踪中帖子、表现良好率、平均互动率、账号表现和追踪异常。

### 10.2 前端验证

前端首版无测试框架，至少执行：

```bash
npm run build
```

必要时用浏览器打开 `复盘优化` 页面手动验证：

- 有数据时展示真实统计。
- 无数据时展示空状态。
- 有追踪异常时展示错误详情。
- 浏览量或引用缺失时显示“缺失”，不是 0。

## 11. 实施顺序

1. 扩展 Prisma 模型和类型。
2. 补充仓储映射和内存仓储字段。
3. 新增追踪规则模块和单测。
4. 改造 `ContentService` 发布、指标记录、失败记录逻辑。
5. 改造 `ContentTrackingSchedulerService` 动态调度与异常记录。
6. 新增 Insights 后端模块和聚合单测。
7. 扩展前端 Insights API 类型。
8. 改造 `Insights.tsx` 展示真实复盘数据。
9. 跑后端目标单测、类型检查和前端构建。

## 12. 风险与注意事项

1. 当前发布接口必须关联 `candidateId`，前端现在使用当前任务第一条可用候选作为关联候选。后续如果运营需要明确记录“实际采用哪条候选”，需要增加候选选择或独立 adopted candidate 字段。
2. 指标接口可能找不到目标帖子，此时应视为数据缺失或追踪异常，需要清晰区分：
   - 工具调用失败：追踪异常。
   - 工具调用成功但目标帖子未找到：首版建议记录追踪异常，错误为“目标帖子未找到”。
3. 浏览量和引用不是所有接口都稳定支持，前端必须支持缺失状态。
4. 追踪规则版本首版先写死为默认规则版本；未来接入系统设置时，再把规则从配置表读取并保留历史版本。
5. 表现良好只延长一次，避免每次指标采集重复更新。

## 13. 首版验收标准

1. 回填有效 X URL 后，创建发布记录并开始追踪。
2. 调度按 2h/5h 规则判断是否抓取。
3. 指标保存点赞、回复、转发，并在存在时保存引用、浏览量。
4. 48h 内浏览量达到 1000 时，发布记录标记 `wellPerforming = true`，追踪结束时间延长到 14 天。
5. 接口失败时 Insights 能看到追踪异常，任务发布状态不被回滚。
6. `Insights` 页面展示真实后端聚合数据，不再使用静态风险与异常数据。
