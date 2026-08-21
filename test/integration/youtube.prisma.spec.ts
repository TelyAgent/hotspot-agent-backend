import { PrismaService } from '../../src/prisma/prisma.service';

describe('youtube prisma models', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.ensureReady();
  });

  beforeEach(async () => {
    await clearYoutubeData(prisma);
  });

  afterEach(async () => {
    await clearYoutubeData(prisma);
  });

  afterAll(async () => {
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
        replication: {
          reusable_mechanism: '问题先行',
          product_remix_topic: '产品选题',
          product_entry: '自然进入',
        },
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

async function clearYoutubeData(prisma: PrismaService) {
  await prisma.youtubeAnalysisResult.deleteMany({ where: { id: 'yar_test' } });
  await prisma.youtubeVideoTranscript.deleteMany({ where: { id: 'yvt_test' } });
  await prisma.youtubeAnalysisJob.deleteMany({ where: { id: 'yaj_test' } });
  await prisma.youtubeVideoObservation.deleteMany({ where: { id: 'yvo_test' } });
  await prisma.youtubeVideo.deleteMany({ where: { videoId: 'abc123' } });
  await prisma.youtubeRun.deleteMany({ where: { id: 'yrun_test' } });
}
