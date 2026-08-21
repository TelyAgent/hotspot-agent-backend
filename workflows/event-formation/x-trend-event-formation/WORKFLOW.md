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

把 X 热搜榜快照中的趋势项判断为统一 Event 命令。

本工作流只负责事件形成判断：

- 识别哪些趋势项已经表达具体事实、动作、结果、状态、口径变化或明确传播说法。
- 判断趋势项命中了哪些事件形成规则。
- 对同一具体 Event 合并地区、排名变化和规则命中上下文。
- 输出 `create_event`、`update_event_context` 或 `ignore`。

# 输入

运行上下文使用 `x_trend_event_context_v1`。

必须读取：

- `currentBatch.successfulRegions[].items[]`：本次成功快照中的当前榜单条目。
- `snapshotDiffs[].rankUp[]`：相邻两次成功快照之间的上升条目。
- `configuredTopics[]`：已配置重点主题。
- `eventCandidates[]` 和 `recentEventHistory[]`：用于判断是否复用已有 Event。

不得根据缺失地区、失败采集或不存在的快照推断排名、排名变化或触发原因。

# 判断规则

以下任一规则命中，即形成事件响应：

- TR-01：具体 Event 首次进入任一输入榜单第 1-5 位。
- TR-02：同一具体 Event 在相邻两次成功快照间上升至少 10 位。
- TR-03：具体 Event 语义命中已配置重点主题。
- TR-04：同一具体 Event 同时出现在至少两个输入地区榜单。

四条规则是“或”的关系。任一规则命中后，应输出 `create_event` 或 `update_event_context`；如果同一具体 Event 同时命中多条规则，`matchedRules[]` 必须列出全部命中规则。

判断 TR-02 时，以 `snapshotDiffs[].rankUp[]` 为准。任一 `rankUp` 条目的 `rankDelta >= 10`，即表示该趋势项上升至少 10 位。

如果同一具体 Event 同时满足 TR-01 和 TR-02，不得只输出 TR-01；`matchedRules[]` 必须同时包含 `TR-01` 和 `TR-02`。

# 遍历范围

必须覆盖以下输入：

- `currentBatch.successfulRegions[].items[]` 中所有当前榜单条目。
- `snapshotDiffs[].rankUp[]` 中所有 `rankDelta >= 10` 的条目。
- 同时出现在至少两个输入地区的条目。

不得只处理最显眼、最热门或第一个命中的条目。

同一具体 Event 在多个地区或多条规则中命中时，只输出一条命令；`sourceContext.regions[]` 合并所有出现地区，`matchedRules[]` 合并所有命中规则。

# 具体 Event 判断

热搜词本身不是 Event。

只有趋势项能表达具体事实、动作、结果、状态、口径变化或明确传播说法时，才可以创建 Event。

以下类型通常不直接创建 Event，应输出 `ignore`，并说明原因：

- 泛主题；
- 单独的人物名、公司名、赛事名；
- 话题标签；
- 缺少明确发展的关键词；
- 不能从当前输入中得到具体事实边界的说法。

如果输入中已有同一 `normalizedEventKey` 的 Event，或可从 `eventCandidates[]` 判断为同一具体发展线，应输出 `update_event_context`，不得创建重复 Event。

# 证据边界

事件形成阶段只消费热搜榜快照和快照 diff，不消费代表帖子，也不得编造代表帖子。

热搜榜只能证明某个词、话题或说法在输入地区 X 热搜榜中出现、排名靠前、排名变化或跨地区同时出现；它不能单独证明现实事实为真。

事件创建或更新后，证据增强链路再根据 Event 标题、`normalizedEventKey`、query 或关联热搜项追溯代表帖子、官方来源或外部证据。代表帖子抓取失败不得反向阻止 Event 形成。

# 输出

只输出符合 `event_workflow_commands_v1` 的 JSON。不得输出解释性文本。

命令规则：

- 命中规则且没有可复用 Event 时，输出 `create_event`。
- 命中规则且已有可复用 Event 时，输出 `update_event_context`。
- 进入判断但不构成具体 Event 时，输出 `ignore`。

`sourceContext` 或 `sourceContextPatch` 必须包含：

- `regions`
- `matchedRules`

`eventIntake.trendContext` 必须与命令级 `sourceContext` 保持一致。

`idempotencyKey` 必须由命令类型、具体 Event 的 `normalizedEventKey`、主要 `snapshotId`、主要触发规则组成，例如：

```text
create_event:<normalizedEventKey>:<snapshotId>:TR-01-TR-02
```

不得输出 `unique-key`、`test-key`、`placeholder`、`id-1` 等泛化占位 key。若同一 Event 的同一快照同时命中多条规则，key 中应包含全部主要规则。
