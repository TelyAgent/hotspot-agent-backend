import { InMemoryCollectionRepository } from '../../src/collection/in-memory-collection.repository';
import { XTrendContextBuilder } from '../../src/workflow/x-trend-context.builder';

describe('XTrendContextBuilder', () => {
  it('builds model context from latest snapshots, previous snapshots, and diffs without applying rules', async () => {
    const repository = new InMemoryCollectionRepository();
    const builder = new XTrendContextBuilder(repository);

    await repository.saveSourceSnapshot({
      id: 'snapshot_us_old',
      platform: 'x',
      platformSnapshotId: 'x_us_old',
      sourceType: 'trend',
      region: 'United States',
      collectedAt: '2026-08-18T00:00:00.000Z',
      fetchRunId: 'fetch_old',
      itemCount: 1,
    });
    await repository.saveSourceSnapshot({
      id: 'snapshot_us_new',
      platform: 'x',
      platformSnapshotId: 'x_us_new',
      sourceType: 'trend',
      region: 'United States',
      collectedAt: '2026-08-18T02:00:00.000Z',
      fetchRunId: 'fetch_new',
      itemCount: 1,
    });
    await repository.saveSourceSnapshotItems([
      {
        id: 'item_us_old_ai',
        sourceSnapshotId: 'snapshot_us_old',
        platform: 'x',
        platformItemId: 'old_ai',
        sourceType: 'trend',
        region: 'United States',
        rank: 15,
        title: 'AI',
        normalizedKey: 'ai',
      },
      {
        id: 'item_us_new_ai',
        sourceSnapshotId: 'snapshot_us_new',
        platform: 'x',
        platformItemId: 'new_ai',
        sourceType: 'trend',
        region: 'United States',
        rank: 4,
        title: 'AI',
        normalizedKey: 'ai',
      },
    ]);
    await repository.saveSourceSnapshotDiff({
      id: 'diff_us_new',
      platform: 'x',
      region: 'United States',
      currentSnapshotId: 'snapshot_us_new',
      previousSnapshotId: 'snapshot_us_old',
      entered: [],
      exited: [],
      rankUp: [{ normalizedKey: 'ai', name: 'AI', previousRank: 15, currentRank: 4, rankDelta: 11 }],
      rankDown: [],
      unchanged: [],
    });

    const context = await builder.build({
      workflowRunId: 'wrun_test',
      observedAt: '2026-08-18T02:05:00.000Z',
      platform: 'x',
      sourceType: 'trend',
      regions: ['United States', 'Japan'],
    });

    expect(context).toMatchObject({
      schemaVersion: 'x_trend_event_context_v1',
      workflowRunId: 'wrun_test',
      currentBatch: {
        batchId: 'x:trend:2026-08-18T02:05:00.000Z',
        collectedAt: '2026-08-18T02:00:00.000Z',
        successfulRegions: [
          {
            region: 'United States',
            snapshotId: 'snapshot_us_new',
            items: [{ rank: 4, title: 'AI', normalizedKey: 'ai' }],
          },
        ],
        failedRegions: [{ region: 'Japan', error: 'latest_snapshot_not_found' }],
      },
      previousSuccessfulSnapshots: {
        byRegion: {
          'United States': {
            snapshotId: 'snapshot_us_old',
            items: [{ rank: 15, title: 'AI', normalizedKey: 'ai' }],
          },
        },
      },
      configuredTopics: [],
      eventCandidates: [],
      recentEventHistory: [],
    });
    expect(context.snapshotDiffs).toEqual([expect.objectContaining({ id: 'diff_us_new' })]);
  });

  it('includes enabled topic configs for semantic trend event rules', async () => {
    const repository = new InMemoryCollectionRepository({
      platformConfigs: [
        {
          id: 'x-default',
          platform: 'x',
          connectorId: 'x-twitterapi-io',
          displayName: 'X',
          enabled: true,
          defaultTimezone: 'Asia/Shanghai',
          defaultRegions: ['global'],
          variables: {
            topicConfigs: [
              {
                id: 'topic-ai',
                name: 'AI 与科技',
                enabled: true,
                keywords: ['OpenAI', 'GPT'],
                positiveExamples: ['模型发布、能力升级、价格或 API 改动'],
                negativeExamples: ['个人使用 AI 的技巧帖但没有行业事件'],
                action: '立即自动响应',
                accounts: ['OpenAI'],
                collectionFrequency: '每 3 小时',
                workflowId: 'x-topic-circle-event-formation',
                defaultPostLimit: 30,
              },
              {
                id: 'topic-disabled',
                name: '停用主题',
                enabled: false,
                keywords: ['skip-me'],
                positiveExamples: [],
                negativeExamples: [],
                action: '立即自动响应',
                accounts: [],
                collectionFrequency: '每 3 小时',
                workflowId: 'x-topic-circle-event-formation',
                defaultPostLimit: 30,
              },
            ],
          },
        },
      ],
      jobConfigs: [],
    });
    const builder = new XTrendContextBuilder(repository);

    const context = await builder.build({
      workflowRunId: 'wrun_test',
      observedAt: '2026-08-18T02:05:00.000Z',
      platform: 'x',
      sourceType: 'trend',
      regions: ['global'],
    });

    expect(context.configuredTopics).toEqual([
      {
        id: 'topic-ai',
        name: 'AI 与科技',
        enabled: true,
        semanticKeywords: ['OpenAI', 'GPT'],
        positiveExamples: ['模型发布、能力升级、价格或 API 改动'],
        negativeExamples: ['个人使用 AI 的技巧帖但没有行业事件'],
      },
    ]);
  });
});
