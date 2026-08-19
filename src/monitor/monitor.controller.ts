import { Controller, Get, Inject, Post, Query } from '@nestjs/common';
import { CollectionRepository } from '../collection/collection.repository';
import { COLLECTION_REPOSITORY } from '../collection/collection.tokens';
import { SourceSnapshotItem } from '../collection/collection.types';
import { TwitterCollectionService } from '../collection/twitter-collection.service';

interface TrendingItemResponse {
  rank: number;
  name: string;
  query: string;
  url: string;
  heat: string;
}

interface TrendingResponse {
  region: string;
  collectedAt: string;
  source: 'twitter' | 'mock';
  items: TrendingItemResponse[];
}

@Controller('monitor')
export class MonitorController {
  constructor(
    @Inject(COLLECTION_REPOSITORY)
    private readonly repository: CollectionRepository,
    private readonly twitterCollection: TwitterCollectionService,
  ) {}

  @Get('trending')
  async getTrending(@Query('region') region = 'global', @Query('limit') limit = '30'): Promise<TrendingResponse> {
    const parsedLimit = Number.parseInt(limit, 10);
    const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 30;
    const snapshotRegion = this.toSnapshotRegion(region);
    const snapshot = await this.repository.findLatestSourceSnapshot({
      platform: 'x',
      sourceType: 'trend',
      region: snapshotRegion,
    });

    if (!snapshot) {
      return {
        region,
        collectedAt: '',
        source: this.sourceLabel(),
        items: [],
      };
    }

    const items = await this.repository.findSourceSnapshotItems(snapshot.id);

    return {
      region,
      collectedAt: snapshot.collectedAt,
      source: this.sourceLabel(),
      items: items.slice(0, safeLimit).map((item) => this.mapItem(item)),
    };
  }

  @Post('refresh')
  async refresh() {
    const jobConfig = await this.repository.findJobConfig('x-trending-default');
    if (!jobConfig) {
      throw new Error('Collection job not found: x-trending-default');
    }
    const platformConfig = await this.repository.findPlatformConfig(jobConfig.platform);
    if (!platformConfig) {
      throw new Error(`Platform config not found: ${jobConfig.platform}`);
    }

    const result = await this.twitterCollection.runTrendingJob({
      platformConfig,
      jobConfig,
      now: this.sourceLabel() === 'mock' ? '2026-08-18T00:00:00.000Z' : new Date().toISOString(),
    });

    return {
      status: result.fetchRun.status,
      message: result.fetchRun.status === 'failed' ? '采集失败' : `已采集 ${result.fetchRun.itemCount} 条热搜排行榜数据`,
      fetchRunId: result.fetchRun.id,
      itemCount: result.fetchRun.itemCount,
      error: result.fetchRun.error,
      workflowRun: result.workflowRun,
    };
  }

  private mapItem(item: SourceSnapshotItem): TrendingItemResponse {
    return {
      rank: item.rank,
      name: item.title,
      query: item.title,
      url: `https://x.com/search?q=${encodeURIComponent(item.title)}`,
      heat: String(item.metrics?.volume ?? ''),
    };
  }

  private sourceLabel(): 'twitter' | 'mock' {
    return process.env.TWITTER_USE_MOCK === 'true' || !process.env.TWITTERAPI_IO_KEY ? 'mock' : 'twitter';
  }

  private toSnapshotRegion(region: string): string {
    return region === 'Worldwide' ? 'global' : region;
  }
}
