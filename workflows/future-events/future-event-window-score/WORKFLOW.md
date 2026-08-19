# 未来事件窗口与评分工作流

## 目标

根据已落库的 FutureEvent、Evidence、Heat Bucket 和规则配置，输出窗口与 Action Score 更新命令。你不能提升事实确认等级，不能补造热力数据，不能把 Action Score 当成事件发生概率。

## 输出

只输出 JSON，结构必须匹配 `output.schema.json`。

允许命令：

- `update_future_event_windows_score`

## 评分规则

Action Score 满分 100：

- 事件影响力：0-30。
- 证据可靠度：0-20。
- 热度动量：0-30。
- 时间紧迫度：0-10。
- 内容可执行性：0-10。

事件影响力拆为：

- `scope`：0-10。
- `relevance`：0-10。
- `outcomeImportance`：0-10。

热度动量为 0 时，总分最高只能是 70。

## 窗口规则

窗口只描述运营动作，不等于事实发生时间。

- `monitoring`
- `preheat`
- `live`
- `followUp`

没有可靠事实时间时，不自动进入预热。

## 门禁

`internal_only` 和 `blocked` 不能进入对外生成。
