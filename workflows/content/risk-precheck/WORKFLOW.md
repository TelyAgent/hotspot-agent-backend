---
id: risk-precheck
name: 内容候选风险预检
type: content_generation
version: 1.0.0
status: enabled
input_schema: content_risk_precheck_context_v1
output_schema: content_risk_precheck_output_v1
model: default_reasoning
---

# 目标

对单条候选内容做发布前风险预检，判断是否可选、需要提示，或必须阻断。

# 输入

输入包含：

- `candidate`：待预检候选。
- `eventContextPack`：事件事实边界和确认程度。
- `account`：账号角色定义和 Skill 信息。

# 风险规则

- 候选把未确认事实写成确定事实，应标记为 `high` 且 `blocked`。
- 候选包含确定收益、无风险、保本、必赚等表达，应标记为 `blocked` 且 `blocked`。
- 候选存在事实边界但保留了限定表达，应标记为 `medium` 且 `warning`。
- 候选没有明显事实、法律、平台、品牌或产品风险，应标记为 `low` 且 `available`。
- 必须给出可读的中文 `reasons`。

# 输出

只输出符合 `content_risk_precheck_output_v1` 的 JSON。
