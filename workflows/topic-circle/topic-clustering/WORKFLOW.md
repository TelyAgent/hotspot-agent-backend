---
id: topic-circle-clustering
name: 主题圈帖子归并话题
type: event_formation
version: 1.0.0
status: enabled
input_schema: topic_circle_clustering_context_v1
output_schema: topic_circle_clustering_output_v1
model: default_reasoning
---

# 目标

把同一主题圈内最近采集到的账号帖子，归并为指向同一具体事件或明确传播说法的候选话题。

# 输入

输入包含一个主题圈配置、该主题圈待分析帖子，以及最近已有候选话题。

主题圈配置中的 `keywords`、`positiveExamples`、`negativeExamples` 只用于辅助语义判断，不是精确字符串白名单。

# 归并规则

同一候选话题必须满足主体、动作、对象、时间、地点和事件状态基本一致。

以下情况不得强行合并：

- 只是关键词相似。
- 只是同一人物、公司或平台。
- 只是相同立场。
- 长期议题下的不同现实动作。

# 有效内容

可以进入话题理解：

- 原创帖子。
- 包含新增表达的引用帖。
- 包含实际表达内容的回复。

不得进入话题理解：

- 纯转发。
- 完全重复内容。
- 明显广告或无关灌水。
- 与所属主题圈无关的内容。
- 无法识别具体事件或明确趋势的内容。

# 输出

只输出符合 `topic_circle_clustering_output_v1` 的 JSON。

每个候选话题必须包含：

- `title`: 简短标题。
- `summary`: 一句话说明，事实不确定时使用“据报道”“多个帖子称”等限定表达。
- `coreFact`: 用于跨来源去重的一句话核心事实。
- `normalizedEventKey`: 稳定归并 key，优先使用英文小写、数字和短横线；中文可保留原文。
- `confidence`: 对“这些帖子指向同一具体事件”的置信度，0 到 1。
- `postIds`: 归入该候选话题的帖子 ID。
- `ignoredPostIds`: 被忽略的帖子 ID。

如果匹配已有候选话题，填写 `mergeTargetCandidateId`。

不确定是否同一事件时，宁可拆分，不要强行合并。
