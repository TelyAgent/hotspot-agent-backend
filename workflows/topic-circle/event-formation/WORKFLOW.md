---
id: topic-circle-event-formation
name: 主题圈候选话题生成 Event
type: event_formation
version: 1.0.0
status: enabled
input_schema: topic_circle_event_formation_context_v1
output_schema: event_workflow_commands_v1
model: default_reasoning
---

# 目标

根据主题圈候选话题的讨论广度和流量强度，判断是否创建或更新统一 Event。

# 触发规则

以下任一规则命中，即形成主题圈关注度触发：

- TC-01：短期集中讨论，`B3h >= 3`。
- TC-02：24 小时持续热议，`B24h >= 6`。
- TC-03：单点流量爆发，`Tmax >= 3` 且该帖子进入账号近期表现前 5%。
- TC-04：讨论与流量混合上升，`B3h >= 2` 且 `Tmax >= 2`。

四条规则是“或”的关系。任一规则首次命中后，立即输出 `create_event` 并启动内容响应流水线；后续同一候选话题或同一 Event 再次命中，只输出 `update_event_context`。

如果四条规则都不命中，必须输出一个 `ignore` 命令，原因说明为“未达到主题圈关注度触发阈值”，不得创建或更新 Event。

# 输入上下文

运行上下文使用 `topic_circle_event_formation_context_v1`：

- `topicCircle`：主题圈配置，包含名称、关键词、正例和反例。
- `candidate`：候选话题，包含 `id`、`title`、`summary`、`coreFact`、`normalizedEventKey`、`confidence`、`b3h`、`b24h`、`tmax`、`tmaxTop5`、`triggeredAt`、`eventId`、`ruleVersion`。
- `previousTrigger`：该候选过去是否已经触发过。
- `existingEvent`：如果已有同 `normalizedEventKey` 的 Event，会放在这里。
- `posts`：本次候选关联的代表帖子。

必须在工作流中根据 `candidate.b3h`、`candidate.b24h`、`candidate.tmax`、`candidate.tmaxTop5` 自行判断命中的规则。服务端只负责提供指标，不在代码中硬编码触发规则。

# 事实边界

主题圈讨论广度和流量强度只表示圈内账号正在关注，不表示事实成立。

输出 Event Intake 时必须保留：

- 主题圈名称。
- 贡献账号。
- 关联帖子。
- B3h、B24h、Tmax、tmaxTop5。
- 命中的规则。
- ruleVersion。

# 去重

如果 `candidate.normalizedEventKey` 已有对应 Event，必须更新原 Event 上下文，不创建第二个 Event。

如果 `previousTrigger.eventId` 或 `existingEvent.id` 存在，输出 `update_event_context`，`targetEventId` 优先使用 `previousTrigger.eventId`，否则使用 `existingEvent.id`。

# 输出要求

只输出符合 `event_workflow_commands_v1` 的 JSON。不得输出解释性文本。

`idempotencyKey` 必须包含：

```text
<commandType>:topic_circle:<normalizedEventKey>:<candidateId>:<ruleIds>
```

不得使用 `unique-key`、`placeholder`、`test-key` 等占位 key。

`sourceContext` 或 `sourceContextPatch` 必须包含：

- `topicCircle`
- `candidate`
- `posts`
- `matchedRules`
