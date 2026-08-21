import { Inject, Injectable } from '@nestjs/common';
import { XGetAccountPostsToolOutput } from '../collection/collection.types';
import { ToolRegistry } from '../connectors/tool-registry';
import { PublicationRecord } from './content.types';

export interface CollectedPublicationMetrics {
  capturedAt: string;
  likes: number;
  replies: number;
  reposts: number;
  quotes?: number;
  views?: number;
  raw?: unknown;
}

export interface PublicationMetricsCollector {
  collect(publication: PublicationRecord, now: string): Promise<CollectedPublicationMetrics | undefined>;
}

const TRACKING_POST_LOOKBACK_DAYS = 14;
const TRACKING_POST_MAX_PAGES = 10;

@Injectable()
export class ToolRegistryPublicationMetricsCollector implements PublicationMetricsCollector {
  constructor(@Inject(ToolRegistry) private readonly tools: ToolRegistry) {}

  async collect(publication: PublicationRecord, now: string): Promise<CollectedPublicationMetrics | undefined> {
    const parsed = parseXPostUrl(publication.url);
    if (!parsed) {
      return undefined;
    }
    const output = await this.tools.invoke<XGetAccountPostsToolOutput>('x.getAccountPosts', {
      handle: parsed.handle,
      since: trackingPostLookbackSince(publication.publishedAt),
      until: now,
      maxPages: TRACKING_POST_MAX_PAGES,
      includeReplies: true,
      includeQuotes: true,
      includeReposts: true,
      now,
    });
    const post = output.posts.find((candidate) => {
      const candidateUrl = candidate.url ? parseXPostUrl(candidate.url) : undefined;
      return candidate.postId === parsed.statusId || candidateUrl?.statusId === parsed.statusId;
    });
    if (!post) {
      throw new Error(`未在账号 ${parsed.handle} 最近 ${TRACKING_POST_LOOKBACK_DAYS} 天时间线中找到回填帖子 ${parsed.statusId}`);
    }
    return {
      capturedAt: output.collectedAt,
      likes: numberOrZero(post.metrics?.likes),
      replies: numberOrZero(post.metrics?.replies),
      reposts: numberOrZero(post.metrics?.reposts),
      quotes: optionalNumber(post.metrics?.quotes),
      views: optionalNumber(post.metrics?.views),
      raw: post.raw,
    };
  }
}

function trackingPostLookbackSince(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return value;
  return new Date(timestamp - TRACKING_POST_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function parseXPostUrl(url: string) {
  const match = url.match(/^https?:\/\/(?:x\.com|twitter\.com)\/([^/]+)\/status\/([^/?#]+)/i);
  if (!match) {
    return undefined;
  }
  return {
    handle: match[1],
    statusId: match[2],
  };
}

function numberOrZero(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
}

function optionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : undefined;
}
