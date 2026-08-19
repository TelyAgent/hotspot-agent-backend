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

  async clearTopicCircleMockData() {
    await this.$executeRawUnsafe(`
      CREATE TEMP TABLE IF NOT EXISTS _topic_circle_mock_cleanup_runs AS
      SELECT DISTINCT "fetchRunId", "accountRunId", "authorHandle"
      FROM "x_topic_circle_post"
      WHERE "postId" LIKE 'mock\\_%' ESCAPE '\\'
    `);
    await this.$executeRawUnsafe(`
      DELETE FROM "topic_circle_candidate_post"
      WHERE "postId" LIKE 'mock\\_%' ESCAPE '\\'
    `);
    await this.$executeRawUnsafe(`
      DELETE FROM "topic_circle_candidate" candidate
      WHERE candidate."eventId" IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM "topic_circle_candidate_post" candidate_post
          WHERE candidate_post."candidateId" = candidate.id
        )
    `);
    await this.$executeRawUnsafe(`
      DELETE FROM "x_topic_circle_post"
      WHERE "postId" LIKE 'mock\\_%' ESCAPE '\\'
    `);
    await this.$executeRawUnsafe(`
      DELETE FROM "topic_circle_account_fetch_run"
      WHERE id IN (SELECT "accountRunId" FROM _topic_circle_mock_cleanup_runs WHERE "accountRunId" IS NOT NULL)
    `);
    await this.$executeRawUnsafe(`
      DELETE FROM "topic_circle_fetch_run" fetch_run
      WHERE fetch_run.id IN (SELECT "fetchRunId" FROM _topic_circle_mock_cleanup_runs WHERE "fetchRunId" IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1
          FROM "topic_circle_account_fetch_run" account_run
          WHERE account_run."fetchRunId" = fetch_run.id
        )
    `);
    await this.$executeRawUnsafe(`
      DELETE FROM "topic_circle_account_sync_state"
      WHERE handle IN (
        SELECT "authorHandle"
        FROM _topic_circle_mock_cleanup_runs
        WHERE "authorHandle" IS NOT NULL
      )
    `);
  }
}
