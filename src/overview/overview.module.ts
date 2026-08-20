import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { OverviewController } from './overview.controller';
import { OverviewService } from './overview.service';

@Module({
  imports: [ContentModule],
  controllers: [OverviewController],
  providers: [OverviewService],
})
export class OverviewModule {}
