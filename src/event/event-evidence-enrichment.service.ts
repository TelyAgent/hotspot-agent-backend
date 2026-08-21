import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { XSearchPostsToolOutput } from '../collection/collection.types';
import { ToolRegistry } from '../connectors/tool-registry';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EventEvidenceEnrichmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tools: ToolRegistry,
  ) {}

  async enrichTrendEvents(limit = 20, now = new Date()) {
    const events = await this.prisma.event.findMany({
      where: {
        sourceContexts: { some: { sourceType: 'x_trend' } },
        evidence: { none: { sourceType: 'x_post' } },
      },
      orderBy: { formedAt: 'desc' },
      take: limit,
      include: {
        sourceContexts: {
          where: { sourceType: 'x_trend' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    let enriched = 0;
    let failed = 0;

    for (const event of events) {
      const sourceContext = event.sourceContexts[0];
      if (!sourceContext) continue;
      const query = this.resolveQuery(sourceContext.payload, event.title);
      try {
        const output = await this.tools.invoke<XSearchPostsToolOutput>('x.searchPosts', {
          query,
          queryType: 'Top',
          limit: 3,
          now: now.toISOString(),
        });
        await Promise.all(
          output.posts.map((post) =>
            this.prisma.eventEvidence.create({
              data: {
                id: `event_evidence_${randomUUID()}`,
                eventId: event.id,
                workflowRunId: sourceContext.workflowRunId,
                sourceType: 'x_post',
                url: post.url,
                claim: `${post.authorHandle} 发布了与「${query}」相关的代表帖。`,
                payload: {
                  query,
                  postId: post.postId,
                  authorHandle: post.authorHandle,
                  authorName: post.authorName,
                  text: post.text,
                  postType: post.postType,
                  publishedAt: post.publishedAt,
                  metrics: post.metrics,
                },
              },
            }),
          ),
        );
        enriched++;
      } catch (error) {
        failed++;
        await this.prisma.eventEvidence.create({
          data: {
            id: `event_evidence_${randomUUID()}`,
            eventId: event.id,
            workflowRunId: sourceContext.workflowRunId,
            sourceType: 'x_trend',
            claim: `代表帖追溯失败：${error instanceof Error ? error.message : String(error)}`,
            payload: {
              query,
              error: error instanceof Error ? error.message : String(error),
            },
          },
        });
      }
    }

    return {
      scanned: events.length,
      enriched,
      failed,
    };
  }

  private resolveQuery(payload: unknown, fallback: string) {
    return this.findStringField(payload, 'query') ?? this.findStringField(payload, 'title') ?? fallback;
  }

  private findStringField(value: unknown, field: string): string | undefined {
    if (!value || typeof value !== 'object') return undefined;
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findStringField(item, field);
        if (found) return found;
      }
      return undefined;
    }
    const record = value as Record<string, unknown>;
    const direct = record[field];
    if (typeof direct === 'string' && direct.trim().length > 0) return direct.trim();
    for (const item of Object.values(record)) {
      const found = this.findStringField(item, field);
      if (found) return found;
    }
    return undefined;
  }
}
