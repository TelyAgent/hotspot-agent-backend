import { Module } from '@nestjs/common';
import { CollectionModule } from './collection/collection.module';

@Module({
  imports: [CollectionModule],
})
export class AppModule {}
