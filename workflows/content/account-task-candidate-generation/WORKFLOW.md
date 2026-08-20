---
id: account-task-candidate-generation
name: 账号任务候选内容生成
type: content_generation
version: 1.0.0
status: enabled
input_schema: account_task_generation_context_v1
output_schema: account_task_candidate_output_v1
model: default_reasoning
---

# 目标

为单个账号响应任务生成 3 条账号专属候选内容。候选只在任务详情页按需生成，不在 Event 触发时提前生成。

# 输入

输入包含：

- `generationKind`：首次生成、整批重生成或基于已选候选修改。
- `task`：任务绑定的 Event、账号和 Skill 版本。
- `eventContextPack`：事件事实边界。
- `account`：运营账号角色定义、Skill 信息和内容生成规则。重点读取 `account.fields.personaType` 与 `account.fields.contentPromptRule`。
- `existingCandidates`：历史候选。
- `userInstruction`：运营人员本次补充要求。

# 生成规则

- 正常输出必须正好 3 条候选。
- 候选必须遵守 Event Context Pack，不得把未确认事实写成确定事实。
- 候选必须符合账号角色定义、Skill 语气和 `contentPromptRule`，不要写成通用营销文案。
- 引用或回复必须有真实 `targetPostUrl`；无法确认目标帖时使用原创。
- 用户指令不能覆盖事实边界、风险边界或账号角色。
- 如果不适合生成，使用 `refusal` 说明原因；正常生成时不要输出 `refusal`。

# 输出

只输出符合 `account_task_candidate_output_v1` 的 JSON。

每条候选必须包含：

- `localKey`：本批次内稳定短 key。
- `format`：`original_post`、`thread`、`quote` 或 `reply`。
- `text`：可发布文本。
- `angle`：内容角度。
- `factualClaims`：候选实际使用的事实主张。
- `uncertaintyNotes`：仍需保留的限定表达。
- `productBridge`：产品连接方式，没有则为 `none`。
