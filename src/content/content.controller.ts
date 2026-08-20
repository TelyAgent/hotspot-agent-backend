import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ContentService } from './content.service';

@Controller('content')
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Get('tasks')
  listTasks() {
    return this.contentService.listTasks();
  }

  @Get('tasks/:id')
  getTask(@Param('id') id: string) {
    return this.contentService.getTask(id);
  }

  @Post('tasks/:id/generate')
  generateCandidates(@Param('id') id: string, @Body() body: { generationKind?: 'initial' | 'regenerate_all' | 'revise_selected'; instruction?: string }) {
    return this.contentService.generateCandidates(id, body);
  }

  @Post('tasks/:id/publish')
  publishTask(@Param('id') id: string, @Body() body: { candidateId: string; url: string }) {
    return this.contentService.publishTask(id, body);
  }

  @Post('publications/:id/metrics')
  recordPublicationMetrics(
    @Param('id') id: string,
    @Body()
    body: {
      capturedAt?: string;
      likes: number;
      replies: number;
      reposts: number;
      quotes?: number;
      views?: number;
      raw?: unknown;
    },
  ) {
    return this.contentService.recordPublicationMetrics(id, body);
  }

  @Post('publications/:id/complete-tracking')
  completeTracking(@Param('id') id: string, @Body() body: { now?: string }) {
    return this.contentService.completeTracking(id, body);
  }
}
