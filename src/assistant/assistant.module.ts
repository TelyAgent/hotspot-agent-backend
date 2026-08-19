import { Module } from '@nestjs/common';
import { CollectionModule } from '../collection/collection.module';
import { AssistantController } from './assistant.controller';
import { createAssistantModelAdapter } from './assistant-model-adapter.factory';
import { AssistantService } from './assistant.service';
import { ASSISTANT_MODEL_ADAPTER } from './assistant.tokens';

@Module({
  imports: [CollectionModule],
  controllers: [AssistantController],
  providers: [
    AssistantService,
    {
      provide: ASSISTANT_MODEL_ADAPTER,
      useFactory: () => createAssistantModelAdapter(),
    },
  ],
})
export class AssistantModule {}
