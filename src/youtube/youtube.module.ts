import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { YoutubeAnalysisService } from './youtube-analysis.service';
import { YoutubeCandidateService } from './youtube-candidate.service';
import { YoutubeController } from './youtube.controller';
import { YoutubeHistoryService } from './youtube-history.service';
import { YoutubeScheduler } from './youtube.scheduler';
import { YoutubeService } from './youtube.service';
import { YoutubeTranscriptExtractor } from './transcript/youtube-transcript.extractor';

@Module({
  imports: [PrismaModule, WorkflowModule],
  controllers: [YoutubeController],
  providers: [
    YoutubeService,
    YoutubeCandidateService,
    YoutubeHistoryService,
    YoutubeAnalysisService,
    YoutubeTranscriptExtractor,
    YoutubeScheduler,
  ],
  exports: [YoutubeService],
})
export class YoutubeModule {}
