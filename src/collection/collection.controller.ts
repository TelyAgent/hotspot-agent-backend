import { Body, Controller, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import { CollectionRepository } from './collection.repository';
import { COLLECTION_REPOSITORY } from './collection.tokens';
import { TwitterCollectionService } from './twitter-collection.service';

interface UpdatePlatformConfigBody {
  variables?: Record<string, unknown>;
  enabled?: boolean;
  defaultRegions?: string[];
}

interface RunJobBody {
  overrideVariables?: Record<string, unknown>;
}

@Controller('collection')
export class CollectionController {
  constructor(
    @Inject(COLLECTION_REPOSITORY)
    private readonly repository: CollectionRepository,
    private readonly twitterCollection: TwitterCollectionService,
  ) {}

  @Get('platforms/:platform/config')
  async getPlatformConfig(@Param('platform') platform: string) {
    const config = await this.repository.findPlatformConfig(platform);
    if (!config) {
      throw new Error(`Platform config not found: ${platform}`);
    }
    return config;
  }

  @Get('platforms/:platform/jobs')
  async getPlatformJobs(@Param('platform') platform: string) {
    return this.repository.listJobConfigs(platform);
  }

  @Patch('platforms/:platform/config')
  async updatePlatformConfig(
    @Param('platform') platform: string,
    @Body() body: UpdatePlatformConfigBody,
  ) {
    return this.repository.updatePlatformConfig(platform, body);
  }

  @Post('jobs/:jobId/run')
  async runJob(@Param('jobId') jobId: string, @Body() body: RunJobBody) {
    const jobConfig = await this.repository.findJobConfig(jobId);
    if (!jobConfig) {
      throw new Error(`Collection job not found: ${jobId}`);
    }
    const platformConfig = await this.repository.findPlatformConfig(jobConfig.platform);
    if (!platformConfig) {
      throw new Error(`Platform config not found: ${jobConfig.platform}`);
    }
    const result = await this.twitterCollection.runTrendingJob({
      platformConfig,
      jobConfig,
      now: new Date().toISOString(),
      overrideVariables: body.overrideVariables,
    });

    return {
      fetchRunId: result.fetchRun.id,
      status: result.fetchRun.status,
      itemCount: result.fetchRun.itemCount,
    };
  }
}
