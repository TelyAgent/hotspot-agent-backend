# 未来事件响应门禁工作流

## 目标

根据 FutureEvent、最新 Action Score、表达边界和历史响应记录，判断是否创建待响应卡、是否创建统一 Event Intake，或仅更新上下文。

## 输出

只输出 JSON，结构必须匹配 `output.schema.json`。

允许命令：

- `create_pending_response`
- `create_event_intake`
- `update_event_context`
- `ignore_future_event_signal`

## 规则

1. 75-89 分首次或重新达到时，只创建或更新待响应卡，不自动生成内容。
2. 90-100 分首次或重新达到，且表达边界允许时，创建或复用 `scheduled_auto_response` Event。
3. 人工点击生成时，创建或复用 `scheduled_manual_response` Event。
4. `internal_only` 与 `blocked` 不允许进入对外内容或营销生成。
5. 分数回落不撤销已启动流程。
6. 热搜上下文只能补充讨论信号，不能提高 Confirmation Level。
7. 同一排期事件同一 entry mode 只能链接一个统一 Event。
