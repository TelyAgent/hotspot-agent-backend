import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { ensureDatabaseExists, getDatabaseUrl, pushDatabaseSchema } from './database-bootstrap';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private ready = false;

  constructor() {
    const connectionString = getDatabaseUrl();
    super({
      adapter: new PrismaPg({ connectionString }),
    });
  }

  async onModuleInit() {
    await this.ensureReady();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async ensureReady() {
    if (this.ready) {
      return;
    }

    await ensureDatabaseExists();
    await pushDatabaseSchema();
    await this.$connect();
    this.ready = true;
  }

  async clearCollectionData() {
    await this.$transaction([
      this.signal.deleteMany(),
      this.sourceSnapshotDiff.deleteMany(),
      this.sourceSnapshotItem.deleteMany(),
      this.sourceSnapshot.deleteMany(),
      this.xTrendSnapshotItem.deleteMany(),
      this.xTrendSnapshot.deleteMany(),
      this.xPostMetric.deleteMany(),
      this.xPost.deleteMany(),
      this.sourceFetchRun.deleteMany(),
      this.collectionJobConfig.deleteMany(),
      this.platformCollectionConfig.deleteMany(),
    ]);
  }
}
