import { TopicCircleClusteringWorkflowRunner } from '../../src/topic-circle/topic-circle-clustering.runner';

describe('TopicCircleClusteringWorkflowRunner', () => {
  it('loads the markdown workflow and returns validated clustered candidates', async () => {
    const loader = {
      load: jest.fn().mockResolvedValue({
        definition: {
          workflowId: 'topic-circle-clustering',
          version: '1.0.0',
        },
        markdown: '# clustering workflow',
        outputSchema: { title: 'TopicCircleClusteringOutputV1' },
      }),
    };
    const model = {
      generateStructuredOutput: jest.fn().mockResolvedValue({
        schemaVersion: 'topic_circle_clustering_output_v1',
        workflowId: 'topic-circle-clustering',
        workflowVersion: '1.0.0',
        runId: 'topic-circle-clustering-inline',
        candidates: [
          {
            title: 'AI 模型发布',
            summary: '多个帖子讨论 AI 模型发布。',
            coreFact: 'AI 账号正在讨论模型发布',
            normalizedEventKey: 'ai-model-release',
            confidence: 0.92,
            postIds: ['post_1'],
            mergeTargetCandidateId: null,
            ignoredPostIds: [],
            ignoreReason: null,
          },
        ],
        diagnostics: [],
      }),
    };
    const runner = new TopicCircleClusteringWorkflowRunner(loader as never, model as never);

    const result = await runner.runTopicCircleClustering({
      topicCircle: { id: 'topic-ai-tech', name: 'AI 与科技', keywords: ['AI'] },
      observedAt: '2026-08-19T11:00:00.000Z',
      posts: [
        {
          postId: 'post_1',
          text: 'OpenAI released a model',
          authorHandle: 'OpenAI',
          publishedAt: '2026-08-19T10:59:00.000Z',
        },
      ],
    });

    expect(loader.load).toHaveBeenCalledWith('topic-clustering', 'topic-circle');
    expect(model.generateStructuredOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: 'topic-circle-clustering',
        workflowVersion: '1.0.0',
        workflowMarkdown: '# clustering workflow',
        context: expect.objectContaining({
          schemaVersion: 'topic_circle_clustering_context_v1',
        }),
      }),
    );
    expect(result.candidates).toEqual([
      expect.objectContaining({
        title: 'AI 模型发布',
        normalizedEventKey: 'ai-model-release',
        confidence: 0.92,
        postIds: ['post_1'],
      }),
    ]);
  });
});
