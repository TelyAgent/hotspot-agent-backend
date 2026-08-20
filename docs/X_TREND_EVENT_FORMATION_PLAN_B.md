# X 热搜事件形成方案 B 说明

## 结论

热搜榜形成 Event 采用方案 B：事件形成阶段只消费当前热搜榜、快照 diff、重点主题配置和已有 Event 摘要，不消费代表帖子，也不消费代表帖子文本。

每个目标地区只采集 Top 30 热搜。调用 `x.getTrending` 时传入的 `limit` 为 30，数据库保存的热搜快照也以 30 条为准。

## 职责边界

### 热搜采集阶段

- 调用 X 热搜接口获取每个目标地区 Top 30。
- 保存 `x_trend_snapshot`、`x_trend_snapshot_item`。
- 同步 `source_snapshot`、`source_snapshot_item`。
- 计算 `source_snapshot_diff`。
- 保存热搜榜自身的 `signal`。
- 不为每个热搜项批量调用 `x.searchPosts`。

### 事件形成阶段

Workflow 输入包含：

- 当前批次各地区 Top 30 榜单。
- 当前快照相对上一成功快照的 diff。
- 已配置重点主题。
- 近期已有 Event 摘要。

Workflow 不包含：

- 代表帖子。
- 代表帖子文本。
- 每条热搜的热门帖子指标。
- 上一轮完整榜单。排名变化以 `snapshotDiffs` 为准。

### 事件形成后

事件创建或更新后，再进入证据增强链路：

- 根据 Event 标题、normalized key、query 或关联热搜项检索代表帖子。
- 保存 `event_evidence` 和 `event_source_context` 的增强证据。
- 代表帖子抓取失败时如实记录，不回滚已形成的 Event。

## 为什么不用方案 C

方案 C 会在代码里先生成候选项，再把候选项交给 Workflow 判断。它输入更小，但会让“第一轮筛选”变成一层代码/配置规则。当前业务规则还在演进，先采用方案 B 可以让规则主要留在 Markdown Workflow 中，减少漏信号风险。

后续如果方案 B 成本仍高，再增加宽松候选层升级到方案 C。
