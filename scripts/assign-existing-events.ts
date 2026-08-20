import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ContentAssignmentService } from '../src/content/content-assignment.service';
import { loadLocalEnv } from '../src/config/load-local-env';
import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  loadLocalEnv();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const prisma = app.get(PrismaService);
    await prisma.ensureReady();
    const assignment = app.get(ContentAssignmentService);
    const [events, accounts] = await Promise.all([
      prisma.event.findMany({
      orderBy: { formedAt: 'desc' },
      select: { id: true, title: true },
      }),
      prisma.operationAccount.findMany({
        where: { enabled: true },
        select: { id: true },
      }),
    ]);
    const workflowRunId = 'manual_existing_event_assignment';
    const workflowDefinition = await prisma.workflowDefinition.upsert({
      where: {
        workflowId_version: {
          workflowId: 'manual-existing-event-assignment',
          version: '1.0.0',
        },
      },
      update: {
        status: 'enabled',
        updatedAt: new Date(),
      },
      create: {
        id: 'wdef_manual_existing_event_assignment',
        workflowId: 'manual-existing-event-assignment',
        name: '手动补跑现有 Event 账号任务分配',
        type: 'content_generation',
        version: '1.0.0',
        status: 'enabled',
        markdownPath: 'scripts/assign-existing-events.ts',
        outputSchemaPath: 'scripts/assign-existing-events.ts',
        checksum: 'manual',
      },
    });
    await prisma.workflowRun.upsert({
      where: { id: workflowRunId },
      update: {
        status: 'running',
        input: { source: 'scripts/assign-existing-events.ts' },
        error: null,
      },
      create: {
        id: workflowRunId,
        workflowDefinitionId: workflowDefinition.id,
        status: 'running',
        startedAt: new Date(),
        input: { source: 'scripts/assign-existing-events.ts' },
      },
    });

    let taskCount = 0;
    let skippedCount = 0;
    for (const event of events) {
      const workflowCommandId = `manual_assign_existing_event:${event.id}`;
      await Promise.all(
        accounts.map((account) =>
          prisma.workflowCommand.upsert({
            where: {
              idempotencyKey: `${workflowCommandId}:${account.id}`,
            },
            update: {},
            create: {
              id: `${workflowCommandId}:${account.id}`,
              workflowRunId,
              type: 'create_content_task',
              idempotencyKey: `${workflowCommandId}:${account.id}`,
              payload: {
                type: 'create_content_task',
                eventId: event.id,
                accountId: account.id,
                source: 'manual_existing_event_assignment',
              },
            },
          }),
        ),
      );
      const result = await assignment.startForEvent({
        eventId: event.id,
        workflowRunId,
        workflowCommandId,
        triggerReason: '手动对现有 Event 补跑账号任务分配。',
        now: new Date().toISOString(),
      });
      taskCount += result.createdOrReused;
      skippedCount += result.skippedAccounts.length;
      console.log(
        `${event.id} ${event.title}: tasks=${result.createdOrReused}, skipped=${result.skippedAccounts.length}`,
      );
    }

    console.log(`Assigned ${events.length} event(s), created_or_reused_tasks=${taskCount}, skipped_accounts=${skippedCount}`);
    await prisma.workflowRun.update({
      where: { id: workflowRunId },
      data: {
        status: 'success',
        finishedAt: new Date(),
        output: {
          eventCount: events.length,
          createdOrReusedTasks: taskCount,
          skippedAccounts: skippedCount,
        },
      },
    });
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
