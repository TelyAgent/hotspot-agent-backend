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

根据 X 热搜榜成功快照判断是否创建或更新 Event。

# 当前规则

首期每小时采集 Worldwide、United States、United Kingdom、Japan、Korea 五个榜单，每榜 Top 30。只有成功采集形成快照；失败采集不参与排名变化。

以下任一规则独立触发完整响应：

- TR-01：具体 Event 首次进入任一目标榜单第 1-5 位。
- TR-02：同一 Event 在相邻两次成功小时快照间上升至少 10 位。
- TR-03：具体 Event 语义命中已配置重点主题。
- TR-04：同一具体 Event 同时出现在至少两个目标地区榜单。

四条路径均不等待人工是否参与。T0 只记录系统首次成功发现合格触发的时间；当前不规定 T0 到自动校验完成的最长 SLA。

# 具体 Event 判断

热搜词本身不是 Event。只有能表达具体事实、动作、结果、状态、口径变化或明确传播说法时，才可以创建 Event。泛主题、人物名、公司名、赛事名或没有明确发展的关键词，应输出 ignore 或 update_event_context。

# 证据边界

每个出现地区使用 X 默认热门排序，获取实际可取得的最多 3 条代表帖子；不足时按实际数量继续。帖子证明的是 X 上正在传播的说法，不当然证明现实事实为真。

# 输出要求

只输出符合 event_workflow_commands_v1 的 JSON。不得输出解释性文本。
