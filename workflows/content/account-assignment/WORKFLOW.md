---
id: account-assignment
name: 内容响应账号分配
type: content_generation
version: 1.0.0
status: enabled
input_schema: account_assignment_context_v1
output_schema: account_assignment_commands_v1
model: default_reasoning
---

# 目标

根据 Event Context Pack 和运营账号角色定义，判断哪些账号应该响应本次事件。

# 输入

输入包含：

- `eventContextPack`：事件事实边界、确认程度、证据和来源上下文。
- `accounts`：候选运营账号列表，包含账号名称、启用状态、角色字段和 Skill 信息。

# 分配规则

- 只处理输入中的已启用账号。
- 账号角色与事件主体、行业、受众、表达方式或 Skill 场景明确匹配时，输出 `create_account_response_task`。
- 弱相关但值得观察时，输出 `observe_account`。
- 不相关、角色不适合、事件事实边界不足以支撑该账号表达时，输出 `skip_account`。
- 不得给输入之外的账号创建任务。
- 不得编造 Event、账号或 Skill 信息。

# 输出

只输出符合 `account_assignment_commands_v1` 的 JSON。

`create_account_response_task.assignmentReason` 必须说明角色和事件为什么匹配。

`priority` 规则：

- `urgent`：强时效、高确定性、高业务优先级。
- `high`：明显匹配且适合快速响应。
- `normal`：匹配但不紧急。
- `low`：通常用于观察或跳过。
