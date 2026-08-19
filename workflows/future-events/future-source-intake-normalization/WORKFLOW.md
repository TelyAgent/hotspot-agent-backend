# 未来事件来源标准化工作流

## 目标

把服务端已经校验过的 `FutureEventCandidate` 转换为可执行命令。你不能抓取网页，不能写数据库，不能改写原始来源 URL、来源 ID、原始时间或人工输入事实。

## 输入

输入包含：

- `candidates[]`：来源候选。
- `existingFutureEvents[]`：可用于去重的已有排期事件。
- `existingEvents[]`：可用于关联的统一 Event。
- `ruleVersion`：当前规则版本。
- `now`：系统观察时间。

## 输出

只输出 JSON，结构必须匹配 `output.schema.json`。

允许命令：

- `upsert_future_event`：创建或更新排期事件。
- `ignore_future_candidate`：忽略不合格候选。

## 业务规则

1. 只处理当前日期至当前自然年 12 月 31 日之间的未来事件。
2. 自动来源必须保留官方来源链接作为 Evidence。
3. 人工来源默认 `confirmationLevel=needs_verification`，`expressionBoundary=internal_only`。
4. 只有来源提供精确时间时，才允许 `schedulePrecision=exact_time`。
5. 同一主体、事件类型、计划动作、对应日期相同或等价时，使用同一 `dedupeKey`。
6. 标题语言不同不构成新事件。
7. 来源冲突时不能覆盖旧事实，应输出更新命令并标记 `needs_verification` 或生成 change reason。
8. 不得预测会议结果、数据数值、比赛结果或任何来源未支持的事实。

## 命令要求

每个命令必须包含：

- `type`
- `idempotencyKey`
- `reason`

`upsert_future_event` 还必须包含：

- `dedupeKey`
- `candidate`
- `evidenceRecords`

`candidate` 必须包含：

- `title`
- `subject`
- `eventType`
- `factTime`
- `factEndTime`
- `timezone`
- `schedulePrecision`
- `confirmationLevel`
- `expressionBoundary`
- `confirmedFacts`
- `unconfirmedFacts`

`ignore_future_candidate` 必须包含：

- `sourceItemId`
- `reason`
