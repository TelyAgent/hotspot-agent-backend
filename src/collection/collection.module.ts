import { Module, forwardRef } from '@nestjs/common';
import { ToolRegistry } from '../connectors/tool-registry';
import { createMockTwitterTools } from '../connectors/x/mock-twitter.tools';
import { createTwitterApiIoTools } from '../connectors/x/twitterapi-io.tools';
import { CollectionController } from './collection.controller';
import { CollectionSchedulerService } from './collection-scheduler.service';
import { COLLECTION_REPOSITORY } from './collection.tokens';
import { PrismaCollectionRepository } from './prisma-collection.repository';
import { TwitterCollectionService } from './twitter-collection.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MonitorController } from '../monitor/monitor.controller';
import { WorkflowModule } from '../workflow/workflow.module';

@Module({
  imports: [PrismaModule, forwardRef(() => WorkflowModule)],
  controllers: [CollectionController, MonitorController],
  providers: [
    PrismaCollectionRepository,
    {
      provide: COLLECTION_REPOSITORY,
      useExisting: PrismaCollectionRepository,
    },
    {
      provide: ToolRegistry,
      useFactory: () => {
        const registry = new ToolRegistry();
        const useMock = process.env.TWITTER_USE_MOCK === 'true' || !process.env.TWITTERAPI_IO_KEY;
        const tools = useMock ? createMockTwitterTools() : createTwitterApiIoTools();

        tools.forEach((tool) => registry.register(tool));
        return registry;
      },
    },
    TwitterCollectionService,
    CollectionSchedulerService,
  ],
  exports: [COLLECTION_REPOSITORY, TwitterCollectionService],
})
export class CollectionModule {}
