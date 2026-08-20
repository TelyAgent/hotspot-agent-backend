import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';

@Module({
  imports: [ContentModule],
  controllers: [InsightsController],
  providers: [InsightsService],
})
export class InsightsModule {}
