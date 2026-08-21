---
id: video-transcript-analysis
name: YouTube 爆款视频字幕拆解
type: content_generation
version: 1.0.0
status: enabled
---

# YouTube 爆款视频字幕拆解工作流

## 目的

本工作流用于分析第三方 YouTube 公开视频。系统只向模型提供视频标题、链接、入选来源、公开视频指标、频道公开信息、完整字幕文本和当前产品配置。模型需要基于这些可见信息，输出面向运营人员的三段式拆解：

1. 主要原因
2. 具体表现
3. 复刻建议

所有输出必须使用简体中文。即使视频标题、频道名称或字幕文本是英文、俄文或其他语言，也必须先理解原文含义，再用简体中文完成拆解。除产品名、人名、平台名、专有名词和必要 URL 外，不得整段输出外语。

## 输入

```json
{
  "video": {
    "video_id": "VIDEO_ID",
    "video_url": "https://www.youtube.com/watch?v=VIDEO_ID",
    "title": "视频标题",
    "published_at": "2026-08-21T00:00:00Z",
    "duration": "PT1M2S"
  },
  "discovery": {
    "selection_sources": [],
    "matched_keywords": [],
    "keyword_hit_count": 0,
    "discovery_labels": []
  },
  "video_metrics": {
    "view_count": 1200000,
    "like_count": 68000,
    "comment_count": 3200
  },
  "channel": {
    "channel_id": "CHANNEL_ID",
    "channel_title": "频道名称",
    "subscriber_count": null
  },
  "transcript": {
    "language": "en",
    "plain_text": "完整字幕文本",
    "segments": []
  },
  "product_profile": {
    "product_profile_id": "product_default",
    "product_profile_version": "1",
    "content": {}
  }
}
```

## 分析边界

- 只分析第三方公开视频。
- 只使用输入中的字幕、标题、公开指标、频道公开信息和产品配置。
- 不下载视频，不提取画面帧，不分析缩略图细节，不分析音乐、音效、语速、语气或剪辑节奏。
- 不写确定性完播率、留存曲线、分享率、推荐流、搜索流、订阅流、转化率等后台指标结论。
- 如果需要描述留存或传播，只能写成“从字幕结构看，可能帮助……”。
- 必须区分可观察事实、合理解释和待验证假设。
- 不输出中间推理、逐帧表格、完整时间轴或候选因素评分。

## 输出要求

输出必须是严格 JSON，字段如下：

语言要求：

- 所有字符串字段必须使用简体中文。
- 不要沿用字幕原语言输出分析。
- 可以保留必要的英文专有名词，例如 YouTube、Polymarket、OpenAI。
- 如果必须引用外语词，请在同一句中用中文解释其含义。
- `limitations` 也必须使用中文。

```json
{
  "main_reason": {
    "topic": "视频具体讲了什么",
    "why_attractive": "为什么这个话题吸引用户",
    "traffic_judgment": "唯一第一流量驱动力，以及账号因素是否足以解释播放量"
  },
  "execution": {
    "key_technique": "最关键的一到两个字幕可见手法",
    "effect": "这些手法如何放大选题、帮助理解、维持注意力或促进讨论"
  },
  "replication": {
    "reusable_mechanism": "可迁移的底层机制",
    "product_remix_topic": "结合产品的具体二创选题",
    "product_entry": "产品从哪个问题、冲突或真实场景自然进入"
  },
  "limitations": [
    "仅基于字幕和公开指标，未使用画面、音频、留存或流量来源数据"
  ]
}
```

## 质量规则

- “主要原因”只能有一个主因，不能把所有因素都写成主因。
- “具体表现”最多保留一到两个真正关键的内容手法。
- “复刻建议”必须是可直接执行的选题，不写“结合产品做内容”这类空话。
- 当前没有产品配置时，保留可复刻机制，将产品二创选题和产品进入方式写成“待补充产品配置”。
- 字幕内容不足时必须降低置信度，并在 `limitations` 中说明。
