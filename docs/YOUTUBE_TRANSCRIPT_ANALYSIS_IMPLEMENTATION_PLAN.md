# YouTube 爆款视频字幕拆解 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每天采集美国 YouTube 候选爆款视频，按 `video_id` 维护七日看板，只对当天首次入选的新视频提取字幕，并生成“主要原因、具体表现、复刻建议”三段式拆解。

**Architecture:** 后端新增独立 `youtube` 模块，负责 YouTube Data API 采集、候选合并、历史去重、字幕提取、模型拆解和结果查询；字幕提取做成可插拔适配器，第一版只分析字幕、标题、频道和公开指标，不做画面帧、音频、完播率或流量来源推断。前端复用现有 `/monitor/youtube` 页面，接入真实看板、运行状态和手动运行入口。

**Tech Stack:** NestJS、Prisma、PostgreSQL、Jest、YouTube Data API v3、`youtube-transcript` 或 `yt-dlp` 字幕适配器、React、Ant Design。

**Spec:** `hotspot-monitor-doc/YouTube爆款视频拆解spec.md`

## Global Constraints

- 文档、接口展示文案和错误信息使用中文。
- `YOUTUBE_API_KEY` 只允许放在服务端环境变量，不进入前端代码、数据库明文展示、公开日志或 Git 仓库。
- 每天最多处理 10 个新视频：官方热门最多 5 个，关键词搜索最多 5 个。
- 官方热门固定使用美国地区 `regionCode=US`，分类为人物与博客 `22`、新闻与政治 `25`、科技 `28`。
- 关键词固定为 `Polymarket`、`web3`、`politics`、`prediction market`，只取近 7 天发布的视频。
- 候选视频必须排除 `snippet.liveBroadcastContent` 为 `live` 或 `upcoming` 的结果。
- 跨日唯一键为 `video_id`；历史视频只更新持续火热、再次上榜和最新指标，不重复拆解、不重复推送。
- 看板采用七日滚动展示，`board_visible_until = last_seen_date + 6 天`。
- 同一天命中两个或更多关键词时展示“多关键词命中”，但持续火热天数仍只按一天计算。
- 只做字幕分析：不下载视频、不提取画面帧、不分析音乐音效、不推断语速语气、不生成逐帧表格或完整时间轴。
- 字幕缺失时任务标记为 `transcript_unavailable`；链接不可访问或视频内容不可获取时标记为 `content_unavailable`。
- YouTube Data API 不提供公开完播率、留存曲线、分享数和流量来源；最终归因必须区分可观察事实、合理解释和待验证假设。
- 最终用户只看到“主要原因、具体表现、复刻建议”，不展示模型中间推理。

---

## 字幕工具调研结论

### 可选方案

1. **`youtube-transcript` npm 包，推荐作为 MVP 默认适配器**
   - 优点：Node/Nest 项目可直接接入；包自带 TypeScript 声明；不需要 OAuth；调用方式是 `fetchTranscript(videoId or URL)`。
   - 风险：该包说明自己使用非官方 YouTube API，YouTube 内部结构变化时可能失效。
   - 来源：https://www.npmjs.com/package/youtube-transcript?activeTab=versions

2. **`yt-dlp` 命令行，推荐作为可选兜底适配器**
   - 优点：支持写入人工字幕和自动字幕，常用参数包括 `--write-subs`、`--write-auto-subs`、`--sub-langs`、`--sub-format`。
   - 风险：需要部署环境安装可执行程序；Node 服务要通过 `child_process` 调用；临时文件清理和超时控制要做好。
   - 来源：https://github.com/yt-dlp/yt-dlp/blob/master/README.md

3. **YouTube 官方 Captions API，不作为 MVP 字幕正文方案**
   - 原因：`captions.list` 需要 OAuth 2.0 授权，且返回不包含字幕正文；实际下载字幕要走 `captions.download`。这更适合管理授权频道的字幕，不适合只靠 API Key 分析公开热门视频。
   - 来源：https://developers.google.com/youtube/v3/docs/captions/list?authuser=2
   - 来源：https://developers.google.com/youtube/v3/guides/implementation/captions?hl=en

### MVP 决策

- 默认实现 `YoutubeTranscriptExtractor`，基于 `youtube-transcript`。
- 同时定义 `TranscriptExtractor` 接口，让后续可切换到 `yt-dlp` 或付费字幕服务。
- 字幕只保存标准化后的片段、纯文本摘要和来源状态，不保存视频文件。

---

## File Structure

### 后端新增

- `hotspot-agent-backend/src/youtube/youtube.module.ts`：YouTube 模块装配。
- `hotspot-agent-backend/src/youtube/youtube.controller.ts`：看板查询、最新运行查询、手动运行接口。
- `hotspot-agent-backend/src/youtube/youtube.scheduler.ts`：每日定时任务。
- `hotspot-agent-backend/src/youtube/youtube.service.ts`：编排采集、历史更新、入队、字幕分析。
- `hotspot-agent-backend/src/youtube/youtube-api.client.ts`：封装 YouTube Data API。
- `hotspot-agent-backend/src/youtube/youtube-candidate.service.ts`：合并官方热门和关键词搜索候选。
- `hotspot-agent-backend/src/youtube/youtube-history.service.ts`：跨日去重、连续火热、再次上榜、七日看板。
- `hotspot-agent-backend/src/youtube/youtube-analysis.service.ts`：字幕驱动的三段式拆解。
- `hotspot-agent-backend/src/youtube/youtube.mapper.ts`：Prisma 记录到 API DTO 的转换。
- `hotspot-agent-backend/src/youtube/youtube.types.ts`：领域类型、DTO、状态枚举。
- `hotspot-agent-backend/src/youtube/transcript/transcript-extractor.ts`：字幕提取接口。
- `hotspot-agent-backend/src/youtube/transcript/youtube-transcript.extractor.ts`：`youtube-transcript` 适配器。
- `hotspot-agent-backend/src/youtube/transcript/vtt.parser.ts`：给 `yt-dlp` 兜底预留的 VTT 字幕解析工具。
- `hotspot-agent-backend/src/youtube/youtube.constants.ts`：分类、关键词、地区、每日数量、看板窗口。
- `hotspot-agent-backend/workflows/youtube/video-transcript-analysis/WORKFLOW.md`：字幕拆解工作流文档。
- `hotspot-agent-backend/workflows/youtube/video-transcript-analysis/output.schema.json`：模型输出 JSON Schema。

### 后端修改

- `hotspot-agent-backend/prisma/schema.prisma`：新增 `youtube_*` 数据表。
- `hotspot-agent-backend/src/app.module.ts`：引入 `YoutubeModule`。
- `hotspot-agent-backend/package.json`：增加 `youtube-transcript` 依赖。
- `hotspot-agent-backend/src/config/load-local-env.ts`：确认本地 `.env` 加载对 `YOUTUBE_API_KEY` 生效。

### 后端测试新增

- `hotspot-agent-backend/test/unit/youtube-api.client.spec.ts`
- `hotspot-agent-backend/test/unit/youtube-candidate.service.spec.ts`
- `hotspot-agent-backend/test/unit/youtube-history.service.spec.ts`
- `hotspot-agent-backend/test/unit/youtube-transcript.extractor.spec.ts`
- `hotspot-agent-backend/test/unit/youtube-analysis.service.spec.ts`
- `hotspot-agent-backend/test/unit/youtube.controller.spec.ts`
- `hotspot-agent-backend/test/integration/youtube.prisma.spec.ts`

### 前端新增与修改

- `hotspot-master/src/api/youtube.ts`：YouTube 接口请求封装。
- `hotspot-master/src/pages/Monitor/YouTubeMonitor.tsx`：从占位页改为真实看板页。
- `hotspot-master/src/pages/Monitor/Monitor.module.css`：补充 YouTube 看板布局样式。

---

## 数据模型草案

```prisma
model YoutubeVideo {
  id                      String    @id
  videoId                 String    @unique
  videoUrl                String
  title                   String
  thumbnailUrl            String?
  publishedAt             DateTime?
  duration                String?
  channelId               String?
  channelTitle            String?
  firstSeenDate           DateTime
  lastSeenDate            DateTime
  consecutiveHotDays      Int       @default(1)
  boardStatus             String
  boardVisibleUntil       DateTime
  reappearanceCount       Int       @default(0)
  lastReappearanceGapDays Int?
  lastVideoMetrics        Json?
  selectionSources        Json
  matchedKeywords         Json
  keywordHitCount         Int       @default(0)
  discoveryLabels         Json
  pushedAt                DateTime?
  createdAt               DateTime  @default(now())
  updatedAt               DateTime  @updatedAt

  observations YoutubeVideoObservation[]
  jobs         YoutubeAnalysisJob[]

  @@index([boardStatus, boardVisibleUntil])
  @@index([lastSeenDate])
  @@map("youtube_video")
}

model YoutubeVideoObservation {
  id               String   @id
  youtubeVideoId   String
  observedDate     DateTime
  selectionSources Json
  matchedKeywords  Json
  keywordHitCount  Int
  discoveryLabels  Json
  videoMetrics     Json?
  raw              Json?
  createdAt        DateTime @default(now())

  video YoutubeVideo @relation(fields: [youtubeVideoId], references: [id], onDelete: Cascade)

  @@unique([youtubeVideoId, observedDate])
  @@index([observedDate])
  @@map("youtube_video_observation")
}

model YoutubeAnalysisJob {
  id                 String    @id
  youtubeVideoId      String
  jobKey             String    @unique
  status             String
  transcriptStatus   String?
  transcriptProvider String?
  errorMessage       String?
  productProfileId   String?
  productProfileVersion String?
  createdAt          DateTime  @default(now())
  startedAt          DateTime?
  finishedAt         DateTime?

  video      YoutubeVideo            @relation(fields: [youtubeVideoId], references: [id], onDelete: Cascade)
  transcript YoutubeVideoTranscript?
  result     YoutubeAnalysisResult?

  @@index([status, createdAt])
  @@map("youtube_analysis_job")
}

model YoutubeVideoTranscript {
  id            String   @id
  jobId         String   @unique
  provider      String
  language      String?
  segments      Json
  plainText     String
  fetchedAt     DateTime @default(now())

  job YoutubeAnalysisJob @relation(fields: [jobId], references: [id], onDelete: Cascade)

  @@map("youtube_video_transcript")
}

model YoutubeAnalysisResult {
  id          String   @id
  jobId       String   @unique
  mainReason  Json
  execution   Json
  replication Json
  limitations Json
  rawOutput   Json?
  createdAt   DateTime @default(now())

  job YoutubeAnalysisJob @relation(fields: [jobId], references: [id], onDelete: Cascade)

  @@map("youtube_analysis_result")
}

model YoutubeRun {
  id              String    @id
  runDate         DateTime
  status          String
  officialCount   Int       @default(0)
  keywordCount    Int       @default(0)
  newVideoCount   Int       @default(0)
  historicalCount Int       @default(0)
  errorMessage    String?
  startedAt       DateTime
  finishedAt      DateTime?

  @@index([runDate, status])
  @@map("youtube_run")
}
```

---

## Task 1: 新增 YouTube 领域类型与常量

**Files:**
- Create: `hotspot-agent-backend/src/youtube/youtube.types.ts`
- Create: `hotspot-agent-backend/src/youtube/youtube.constants.ts`
- Test: `hotspot-agent-backend/test/unit/youtube-types.spec.ts`

**Interfaces:**
- Produces:
  - `YoutubeSelectionSource`
  - `YoutubeCandidate`
  - `YoutubeAnalysisJobInput`
  - `YOUTUBE_TRENDING_CATEGORIES`
  - `YOUTUBE_KEYWORDS`
  - `buildYoutubeVideoUrl(videoId: string): string`
  - `isValidYoutubeWatchUrl(url: string, videoId: string): boolean`

- [ ] **Step 1: Write the failing test**

```ts
import {
  YOUTUBE_KEYWORDS,
  YOUTUBE_TRENDING_CATEGORIES,
  buildYoutubeVideoUrl,
  isValidYoutubeWatchUrl,
} from '../../src/youtube/youtube.constants';

describe('youtube constants', () => {
  it('uses the PRD categories and keywords', () => {
    expect(YOUTUBE_TRENDING_CATEGORIES).toEqual([
      { id: '22', label: 'YouTube官方热门-人物与博客' },
      { id: '25', label: 'YouTube官方热门-新闻与政治' },
      { id: '28', label: 'YouTube官方热门-科技' },
    ]);
    expect(YOUTUBE_KEYWORDS).toEqual(['Polymarket', 'web3', 'politics', 'prediction market']);
  });

  it('builds and validates canonical watch urls', () => {
    const url = buildYoutubeVideoUrl('abc123');
    expect(url).toBe('https://www.youtube.com/watch?v=abc123');
    expect(isValidYoutubeWatchUrl(url, 'abc123')).toBe(true);
    expect(isValidYoutubeWatchUrl('https://youtu.be/abc123', 'abc123')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd hotspot-agent-backend && npm test -- youtube-types.spec.ts`

Expected: FAIL because files do not exist.

- [ ] **Step 3: Implement constants and types**

```ts
export const YOUTUBE_REGION_CODE = 'US';
export const YOUTUBE_DAILY_OFFICIAL_LIMIT = 5;
export const YOUTUBE_DAILY_KEYWORD_LIMIT = 5;
export const YOUTUBE_BOARD_WINDOW_DAYS = 7;

export const YOUTUBE_TRENDING_CATEGORIES = [
  { id: '22', label: 'YouTube官方热门-人物与博客' },
  { id: '25', label: 'YouTube官方热门-新闻与政治' },
  { id: '28', label: 'YouTube官方热门-科技' },
] as const;

export const YOUTUBE_KEYWORDS = ['Polymarket', 'web3', 'politics', 'prediction market'] as const;

export function buildYoutubeVideoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function isValidYoutubeWatchUrl(url: string, videoId: string): boolean {
  return url === buildYoutubeVideoUrl(videoId);
}
```

```ts
export type YoutubeSelectionType = 'youtube_trending' | 'keyword_search';

export interface YoutubeSelectionSource {
  type: YoutubeSelectionType;
  label: string;
  rank: number;
  keyword?: string;
  categoryId?: string;
}

export interface YoutubeCandidate {
  videoId: string;
  videoUrl: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  duration: string | null;
  channelId: string | null;
  channelTitle: string | null;
  liveBroadcastContent: string | null;
  selectionSources: YoutubeSelectionSource[];
  matchedKeywords: string[];
  keywordHitCount: number;
  discoveryLabels: string[];
  videoMetrics: {
    viewCount: number | null;
    likeCount: number | null;
    commentCount: number | null;
  };
  raw: unknown;
}

export interface YoutubeTranscriptSegment {
  startMs: number;
  durationMs: number | null;
  text: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd hotspot-agent-backend && npm test -- youtube-types.spec.ts`

Expected: PASS.

---

## Task 2: 数据表与 Prisma 映射

**Files:**
- Modify: `hotspot-agent-backend/prisma/schema.prisma`
- Test: `hotspot-agent-backend/test/integration/youtube.prisma.spec.ts`

**Interfaces:**
- Consumes: Task 1 naming.
- Produces: Prisma models `YoutubeVideo`、`YoutubeVideoObservation`、`YoutubeAnalysisJob`、`YoutubeVideoTranscript`、`YoutubeAnalysisResult`、`YoutubeRun`。

- [ ] **Step 1: Write integration test**

```ts
import { PrismaService } from '../../src/prisma/prisma.service';

describe('youtube prisma models', () => {
  const prisma = new PrismaService();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.youtubeAnalysisResult.deleteMany();
    await prisma.youtubeVideoTranscript.deleteMany();
    await prisma.youtubeAnalysisJob.deleteMany();
    await prisma.youtubeVideoObservation.deleteMany();
    await prisma.youtubeVideo.deleteMany();
    await prisma.youtubeRun.deleteMany();
    await prisma.$disconnect();
  });

  it('stores one video, one observation, one job, one transcript and one result', async () => {
    const video = await prisma.youtubeVideo.create({
      data: {
        id: 'yv_test',
        videoId: 'abc123',
        videoUrl: 'https://www.youtube.com/watch?v=abc123',
        title: '测试视频',
        firstSeenDate: new Date('2026-08-21T00:00:00Z'),
        lastSeenDate: new Date('2026-08-21T00:00:00Z'),
        boardStatus: 'active',
        boardVisibleUntil: new Date('2026-08-27T00:00:00Z'),
        selectionSources: [],
        matchedKeywords: [],
        discoveryLabels: [],
      },
    });

    await prisma.youtubeVideoObservation.create({
      data: {
        id: 'yvo_test',
        youtubeVideoId: video.id,
        observedDate: new Date('2026-08-21T00:00:00Z'),
        selectionSources: [],
        matchedKeywords: [],
        keywordHitCount: 0,
        discoveryLabels: [],
      },
    });

    const job = await prisma.youtubeAnalysisJob.create({
      data: {
        id: 'yaj_test',
        youtubeVideoId: video.id,
        jobKey: 'youtube:abc123:2026-08-21',
        status: 'pending',
      },
    });

    await prisma.youtubeVideoTranscript.create({
      data: {
        id: 'yvt_test',
        jobId: job.id,
        provider: 'youtube-transcript',
        language: 'en',
        segments: [{ startMs: 0, durationMs: 1000, text: 'hello' }],
        plainText: 'hello',
      },
    });

    await prisma.youtubeAnalysisResult.create({
      data: {
        id: 'yar_test',
        jobId: job.id,
        mainReason: { topic: '测试', why_attractive: '清晰', traffic_judgment: '选题主导' },
        execution: { key_technique: '开场承诺', effect: '降低理解成本' },
        replication: { reusable_mechanism: '问题先行', product_remix_topic: '产品选题', product_entry: '自然进入' },
        limitations: ['仅基于字幕'],
      },
    });

    const saved = await prisma.youtubeVideo.findUnique({
      where: { videoId: 'abc123' },
      include: { observations: true, jobs: { include: { transcript: true, result: true } } },
    });

    expect(saved?.jobs[0].result?.mainReason).toMatchObject({ topic: '测试' });
  });
});
```

- [ ] **Step 2: Run validation to verify it fails**

Run: `cd hotspot-agent-backend && npm run db:validate`

Expected: FAIL until schema models are added.

- [ ] **Step 3: Add the Prisma models from the “数据模型草案” section**

Use the exact model and table names from this plan: `youtube_video`、`youtube_video_observation`、`youtube_analysis_job`、`youtube_video_transcript`、`youtube_analysis_result`、`youtube_run`。

- [ ] **Step 4: Generate client and run tests**

Run:

```bash
cd hotspot-agent-backend
npm run db:generate
npm run db:validate
npm test -- youtube.prisma.spec.ts
```

Expected: validation PASS and integration test PASS.

---

## Task 3: YouTube Data API Client

**Files:**
- Create: `hotspot-agent-backend/src/youtube/youtube-api.client.ts`
- Test: `hotspot-agent-backend/test/unit/youtube-api.client.spec.ts`

**Interfaces:**
- Produces:
  - `listMostPopularByCategory(categoryId: string): Promise<YoutubeApiVideoItem[]>`
  - `searchRecentVideosByKeyword(keyword: string, publishedAfter: string): Promise<YoutubeApiSearchItem[]>`
  - `listVideosByIds(videoIds: string[]): Promise<YoutubeApiVideoItem[]>`
  - `listChannelsByIds(channelIds: string[]): Promise<YoutubeApiChannelItem[]>`

- [ ] **Step 1: Write failing tests with mocked fetch**

```ts
import { YoutubeApiClient } from '../../src/youtube/youtube-api.client';

describe('YoutubeApiClient', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ id: 'abc123', snippet: { title: 'A' }, statistics: {} }] }),
    } as Response);
  });

  it('calls videos.list for US mostPopular category without leaking key in errors', async () => {
    const client = new YoutubeApiClient('secret-key');
    await client.listMostPopularByCategory('28');

    const url = String((global.fetch as jest.Mock).mock.calls[0][0]);
    expect(url).toContain('/youtube/v3/videos');
    expect(url).toContain('chart=mostPopular');
    expect(url).toContain('regionCode=US');
    expect(url).toContain('videoCategoryId=28');
    expect(url).toContain('maxResults=10');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd hotspot-agent-backend && npm test -- youtube-api.client.spec.ts`

Expected: FAIL because client does not exist.

- [ ] **Step 3: Implement the client**

Implement with `URLSearchParams`; throw Chinese errors such as `YouTube API 请求失败：videos.list` without including the API key.

- [ ] **Step 4: Run the test**

Run: `cd hotspot-agent-backend && npm test -- youtube-api.client.spec.ts`

Expected: PASS.

---

## Task 4: 候选合并、去重与每日入选规则

**Files:**
- Create: `hotspot-agent-backend/src/youtube/youtube-candidate.service.ts`
- Test: `hotspot-agent-backend/test/unit/youtube-candidate.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 types, Task 3 API return items.
- Produces:
  - `buildCandidates(input: BuildYoutubeCandidatesInput): YoutubeCandidate[]`
  - `selectDailyNewCandidates(candidates: YoutubeCandidate[], pushedVideoIds: Set<string>): YoutubeCandidate[]`

- [ ] **Step 1: Write failing tests**

```ts
import { YoutubeCandidateService } from '../../src/youtube/youtube-candidate.service';

describe('YoutubeCandidateService', () => {
  it('dedupes by video id and preserves multiple selection sources', () => {
    const service = new YoutubeCandidateService();
    const candidates = service.buildCandidates({
      trendingItemsByCategory: {
        '28': [{ id: 'v1', snippet: { title: 'A', liveBroadcastContent: 'none' }, statistics: {} }],
      },
      searchItemsByKeyword: {
        web3: [{ id: { videoId: 'v1' }, snippet: { title: 'A', liveBroadcastContent: 'none', publishedAt: '2026-08-20T00:00:00Z' } }],
      },
      videoDetailsById: {
        v1: { id: 'v1', snippet: { title: 'A', channelId: 'c1', channelTitle: 'C' }, statistics: { viewCount: '100' }, contentDetails: { duration: 'PT1M' } },
      },
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].selectionSources).toHaveLength(2);
    expect(candidates[0].matchedKeywords).toEqual(['web3']);
  });

  it('skips live videos and already pushed videos', () => {
    const service = new YoutubeCandidateService();
    const selected = service.selectDailyNewCandidates(
      [
        { videoId: 'old', selectionSources: [{ type: 'youtube_trending', label: 'YouTube官方热门-科技', rank: 1 }] } as any,
        { videoId: 'new', selectionSources: [{ type: 'youtube_trending', label: 'YouTube官方热门-科技', rank: 2 }] } as any,
      ],
      new Set(['old']),
    );
    expect(selected.map((item) => item.videoId)).toEqual(['new']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd hotspot-agent-backend && npm test -- youtube-candidate.service.spec.ts`

Expected: FAIL.

- [ ] **Step 3: Implement merging rules**

Official group selection must cap at 5, keyword group selection must cap at 5, final merge must dedupe again by `videoId`; live/upcoming videos are excluded before selection.

- [ ] **Step 4: Run test**

Run: `cd hotspot-agent-backend && npm test -- youtube-candidate.service.spec.ts`

Expected: PASS.

---

## Task 5: 历史库、持续火热、再次上榜和七日看板

**Files:**
- Create: `hotspot-agent-backend/src/youtube/youtube-history.service.ts`
- Test: `hotspot-agent-backend/test/unit/youtube-history.service.spec.ts`

**Interfaces:**
- Consumes: `YoutubeCandidate[]`
- Produces:
  - `applyDailyObservations(date: Date, candidates: YoutubeCandidate[]): Promise<YoutubeHistoryUpdateResult>`
  - result fields: `{ newCandidates, historicalCandidates, createdJobs, expiredCount }`

- [ ] **Step 1: Write failing tests with mocked repository or PrismaService**

```ts
describe('YoutubeHistoryService date rules', () => {
  it('increments consecutive days only on next natural day', () => {
    expect(computeConsecutiveHotDays({
      previousLastSeen: new Date('2026-08-20T00:00:00Z'),
      currentDate: new Date('2026-08-21T00:00:00Z'),
      previousValue: 2,
    })).toBe(3);

    expect(computeConsecutiveHotDays({
      previousLastSeen: new Date('2026-08-18T00:00:00Z'),
      currentDate: new Date('2026-08-21T00:00:00Z'),
      previousValue: 2,
    })).toBe(1);
  });

  it('computes board visible until as current date plus six days', () => {
    expect(computeBoardVisibleUntil(new Date('2026-08-21T00:00:00Z')).toISOString()).toBe('2026-08-27T00:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd hotspot-agent-backend && npm test -- youtube-history.service.spec.ts`

Expected: FAIL.

- [ ] **Step 3: Implement pure date helpers first**

```ts
export function computeConsecutiveHotDays(input: {
  previousLastSeen: Date;
  currentDate: Date;
  previousValue: number;
}): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const gap = Math.round((input.currentDate.getTime() - input.previousLastSeen.getTime()) / msPerDay);
  return gap === 1 ? input.previousValue + 1 : 1;
}

export function computeBoardVisibleUntil(currentDate: Date): Date {
  return new Date(currentDate.getTime() + 6 * 24 * 60 * 60 * 1000);
}
```

- [ ] **Step 4: Implement Prisma update flow**

For each candidate:
- If `video_id` does not exist, create `YoutubeVideo`, create `YoutubeVideoObservation`, create `YoutubeAnalysisJob` with `jobKey = youtube:${videoId}:${yyyy-mm-dd}`.
- If `video_id` exists, update `lastSeenDate`、`consecutiveHotDays`、`boardStatus`、`boardVisibleUntil`、`selectionSources`、`matchedKeywords`、`keywordHitCount`、`discoveryLabels`、`lastVideoMetrics`；do not create a new job.
- If gap days are greater than 1, set `lastReappearanceGapDays` and append `N天后再次上榜`.
- After all observations, expire videos whose `boardVisibleUntil` is before current date end.

- [ ] **Step 5: Run tests**

Run: `cd hotspot-agent-backend && npm test -- youtube-history.service.spec.ts youtube.prisma.spec.ts`

Expected: PASS.

---

## Task 6: 字幕提取适配器

**Files:**
- Create: `hotspot-agent-backend/src/youtube/transcript/transcript-extractor.ts`
- Create: `hotspot-agent-backend/src/youtube/transcript/youtube-transcript.extractor.ts`
- Create: `hotspot-agent-backend/src/youtube/transcript/vtt.parser.ts`
- Modify: `hotspot-agent-backend/package.json`
- Test: `hotspot-agent-backend/test/unit/youtube-transcript.extractor.spec.ts`

**Interfaces:**
- Produces:
  - `TranscriptExtractor.extract(input: { videoId: string; videoUrl: string }): Promise<YoutubeTranscriptResult>`
  - `YoutubeTranscriptResult = { provider: string; language: string | null; segments: YoutubeTranscriptSegment[]; plainText: string }`

- [ ] **Step 1: Write failing normalizer test**

```ts
import { normalizeYoutubeTranscriptRows } from '../../src/youtube/transcript/youtube-transcript.extractor';

describe('normalizeYoutubeTranscriptRows', () => {
  it('converts transcript rows to milliseconds and plain text', () => {
    const result = normalizeYoutubeTranscriptRows([
      { offset: 1.5, duration: 2, text: 'Hello' },
      { offset: 3.5, duration: 1, text: 'world' },
    ]);

    expect(result.segments).toEqual([
      { startMs: 1500, durationMs: 2000, text: 'Hello' },
      { startMs: 3500, durationMs: 1000, text: 'world' },
    ]);
    expect(result.plainText).toBe('Hello\nworld');
  });
});
```

- [ ] **Step 2: Install dependency and verify failure**

Run:

```bash
cd hotspot-agent-backend
npm install youtube-transcript
npm test -- youtube-transcript.extractor.spec.ts
```

Expected: FAIL until normalizer exists.

- [ ] **Step 3: Implement extractor**

The extractor catches known empty transcript errors and returns a typed failure that the analysis job stores as `transcript_unavailable`; it must not fabricate transcript text.

- [ ] **Step 4: Run test**

Run: `cd hotspot-agent-backend && npm test -- youtube-transcript.extractor.spec.ts`

Expected: PASS.

---

## Task 7: 字幕拆解工作流与输出校验

**Files:**
- Create: `hotspot-agent-backend/workflows/youtube/video-transcript-analysis/WORKFLOW.md`
- Create: `hotspot-agent-backend/workflows/youtube/video-transcript-analysis/output.schema.json`
- Create: `hotspot-agent-backend/src/youtube/youtube-analysis.service.ts`
- Test: `hotspot-agent-backend/test/unit/youtube-analysis.service.spec.ts`

**Interfaces:**
- Consumes: `YoutubeAnalysisJob` + transcript result + product profile.
- Produces:
  - `runTranscriptAnalysis(jobId: string): Promise<YoutubeAnalysisResultDto>`

- [ ] **Step 1: Write failing schema validation test**

```ts
describe('YoutubeAnalysisService output validation', () => {
  it('accepts only the three public analysis sections plus limitations', () => {
    const output = {
      main_reason: {
        topic: '视频讲述预测市场如何影响选举叙事',
        why_attractive: '它把用户熟悉的政治焦虑转成可下注、可讨论的信息差',
        traffic_judgment: '选题是主因，标题承诺和账号基本盘是放大因素',
      },
      execution: {
        key_technique: '开场直接给出冲突问题，并用字幕持续推进因果链',
        effect: '降低理解门槛，让观众快速知道为什么要继续看',
      },
      replication: {
        reusable_mechanism: '把复杂趋势包装成一个可验证的问题',
        product_remix_topic: '用产品监测预测市场变化，解释一个热点事件如何提前升温',
        product_entry: '从“人工很难持续盯盘”这个问题自然进入产品能力',
      },
      limitations: ['仅基于字幕和公开指标，未使用画面、音频、留存或流量来源数据'],
    };

    expect(validateYoutubeAnalysisOutput(output).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd hotspot-agent-backend && npm test -- youtube-analysis.service.spec.ts`

Expected: FAIL.

- [ ] **Step 3: Write workflow document**

Workflow purpose:
- 输入：视频标题、链接、入选来源、关键词标签、公开指标、频道公开信息、完整字幕文本、产品配置。
- 输出：`main_reason`、`execution`、`replication`、`limitations`。
- Explicitly state: do not infer music, sound effects, tone, editing rhythm, frame content, retention, share rate, recommendation source, or conversion from unavailable data.

- [ ] **Step 4: Implement service and validator**

Use existing workflow/model adapter style where possible. If current workflow runner is tightly bound to event workflows, call the shared model adapter directly and store the raw output plus validated JSON.

- [ ] **Step 5: Run test**

Run: `cd hotspot-agent-backend && npm test -- youtube-analysis.service.spec.ts`

Expected: PASS.

---

## Task 8: 每日编排、定时任务和 API

**Files:**
- Create: `hotspot-agent-backend/src/youtube/youtube.module.ts`
- Create: `hotspot-agent-backend/src/youtube/youtube.service.ts`
- Create: `hotspot-agent-backend/src/youtube/youtube.scheduler.ts`
- Create: `hotspot-agent-backend/src/youtube/youtube.controller.ts`
- Create: `hotspot-agent-backend/src/youtube/youtube.mapper.ts`
- Modify: `hotspot-agent-backend/src/app.module.ts`
- Test: `hotspot-agent-backend/test/unit/youtube.controller.spec.ts`

**Interfaces:**
- Produces:
  - `POST /youtube/run`
  - `GET /youtube/runs/latest`
  - `GET /youtube/videos/board`

- [ ] **Step 1: Write failing controller test**

```ts
describe('YoutubeController', () => {
  it('returns board videos and latest run', async () => {
    const service = {
      runDailyCollection: jest.fn(),
      getLatestRun: jest.fn().mockResolvedValue({ status: 'success', newVideoCount: 0 }),
      getBoard: jest.fn().mockResolvedValue({ videos: [] }),
    };
    const controller = new YoutubeController(service as any);

    expect(await controller.getLatestRun()).toEqual({ status: 'success', newVideoCount: 0 });
    expect(await controller.getBoard()).toEqual({ videos: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd hotspot-agent-backend && npm test -- youtube.controller.spec.ts`

Expected: FAIL.

- [ ] **Step 3: Implement orchestration**

Daily flow:
1. Load `YOUTUBE_API_KEY`; if missing, create failed `YoutubeRun` with `errorMessage = '缺少 YOUTUBE_API_KEY'`.
2. Fetch 3 official category lists.
3. Fetch 4 keyword search lists with dynamic `publishedAfter`.
4. Batch call `videos.list` to supplement all candidate video details.
5. Build and select candidates.
6. Apply history updates and create analysis jobs only for new videos.
7. For each new job, extract transcript and run analysis.
8. Save run summary.

- [ ] **Step 4: Add scheduler**

Use Nest Schedule with one daily cron. The exact hour should be configurable by env, with a default such as `0 8 * * *` in Asia/Shanghai. Manual `POST /youtube/run` uses the same service method.

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
cd hotspot-agent-backend
npm test -- youtube.controller.spec.ts youtube-candidate.service.spec.ts youtube-history.service.spec.ts youtube-analysis.service.spec.ts
npm run typecheck
```

Expected: PASS.

---

## Task 9: 前端 YouTube 监测页接入真实数据

**Files:**
- Create: `hotspot-master/src/api/youtube.ts`
- Modify: `hotspot-master/src/pages/Monitor/YouTubeMonitor.tsx`
- Modify: `hotspot-master/src/pages/Monitor/Monitor.module.css`

**Interfaces:**
- Consumes:
  - `GET /api/youtube/videos/board`
  - `GET /api/youtube/runs/latest`
  - `POST /api/youtube/run`

- [ ] **Step 1: Define API client**

```ts
export async function fetchYoutubeBoard() {
  const response = await fetch('/api/youtube/videos/board');
  if (!response.ok) throw new Error('获取 YouTube 看板失败');
  return response.json();
}

export async function fetchLatestYoutubeRun() {
  const response = await fetch('/api/youtube/runs/latest');
  if (!response.ok) throw new Error('获取 YouTube 运行状态失败');
  return response.json();
}

export async function runYoutubeCollection() {
  const response = await fetch('/api/youtube/run', { method: 'POST' });
  if (!response.ok) throw new Error('启动 YouTube 采集失败');
  return response.json();
}
```

- [ ] **Step 2: Replace placeholder UI**

Page sections:
- 顶部：标题、最近运行状态、手动运行按钮。
- 看板：视频卡片列表，显示标题、链接、入选来源、关键词标签、持续火热天数、再次上榜标签、播放/点赞/评论。
- 分析：展示“主要原因、具体表现、复刻建议”；字幕缺失显示 `字幕不可用，未生成拆解`。
- 空状态：`暂无 YouTube 看板数据`。

- [ ] **Step 3: Run frontend build**

Run: `cd hotspot-master && npm run build`

Expected: PASS.

---

## Task 10: 验收与运行手册

**Files:**
- Create: `hotspot-agent-backend/docs/YOUTUBE_TRANSCRIPT_ANALYSIS_RUNTIME.md`
- Modify: `hotspot-monitor-doc/YouTube爆款视频拆解spec.md` if the product decision “只做字幕分析” needs to be recorded in PRD.

**Verification Commands:**

```bash
cd hotspot-agent-backend
npm run db:validate
npm run typecheck
npm test -- youtube
```

```bash
cd hotspot-master
npm run build
```

**Manual Verification:**
- Set `YOUTUBE_API_KEY` in backend `.env`.
- Start backend and frontend.
- Call `POST /api/youtube/run`.
- Confirm `youtube_run` has one record.
- Confirm new videos create `youtube_video` and `youtube_analysis_job`.
- Confirm historical videos do not create duplicate jobs.
- Confirm missing subtitle jobs are shown as `transcript_unavailable`.
- Confirm `/monitor/youtube` displays real board data.

---

## Self-Review

- Spec coverage: plan covers API key, official category collection, keyword search, merge and dedupe, video URL generation, unified job object, cross-day history, seven-day board, multi-keyword labels, transcript-only analysis, product profile version tracking, daily output, scheduler, frontend board, and acceptance verification.
- Intentional PRD adjustment: downstream Agent no longer extracts frames, downloads video, analyzes audio, or investigates retention; it only uses subtitles plus title, metadata, channel public fields and public metrics. Any unavailable evidence is recorded in `limitations` and must not be converted into deterministic claims.
- Tooling risk: `youtube-transcript` is unofficial and may break; the adapter boundary lets us swap to `yt-dlp` or another provider without changing candidate selection, history, analysis result, or frontend APIs.
