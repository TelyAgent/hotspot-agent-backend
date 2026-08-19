import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowRepository } from './workflow.repository';
import {
  EventRecord,
  WorkflowCommandExecutionRecord,
  WorkflowCommandRecord,
  WorkflowDefinitionRecord,
  WorkflowRunRecord,
} from './workflow.types';

@Injectable()
export class PrismaWorkflowRepository implements WorkflowRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findEnabledWorkflowDefinition(workflowId: string) {
    const definition = await this.prisma.workflowDefinition.findFirst({
      where: { workflowId, status: 'enabled' },
      orderBy: { updatedAt: 'desc' },
    });
    return definition ? mapWorkflowDefinition(definition) : undefined;
  }

  async saveWorkflowDefinition(definition: WorkflowDefinitionRecord) {
    const saved = await this.prisma.workflowDefinition.upsert({
      where: {
        workflowId_version: {
          workflowId: definition.workflowId,
          version: definition.version,
        },
      },
      update: {
        name: definition.name,
        type: definition.type,
        status: definition.status,
        markdownPath: definition.markdownPath,
        outputSchemaPath: definition.outputSchemaPath,
        checksum: definition.checksum,
      },
      create: {
        ...definition,
        createdAt: new Date(definition.createdAt),
        updatedAt: new Date(definition.updatedAt),
      },
    });
    return mapWorkflowDefinition(saved);
  }

  async createWorkflowRun(run: WorkflowRunRecord) {
    const saved = await this.prisma.workflowRun.create({
      data: {
        id: run.id,
        workflowDefinitionId: run.workflowDefinitionId,
        status: run.status,
        startedAt: new Date(run.startedAt),
        finishedAt: run.finishedAt ? new Date(run.finishedAt) : undefined,
        model: run.model,
        input: run.input as object,
        output: run.output as object | undefined,
        error: run.error,
      },
    });
    return mapWorkflowRun(saved);
  }

  async finishWorkflowRun(id: string, patch: Partial<WorkflowRunRecord>) {
    const saved = await this.prisma.workflowRun.update({
      where: { id },
      data: {
        status: patch.status,
        finishedAt: patch.finishedAt ? new Date(patch.finishedAt) : undefined,
        model: patch.model,
        input: patch.input as object | undefined,
        output: patch.output as object | undefined,
        error: patch.error,
      },
    });
    return mapWorkflowRun(saved);
  }

  async saveWorkflowCommands(commands: WorkflowCommandRecord[]) {
    const saved = await Promise.all(
      commands.map((command) =>
        this.prisma.workflowCommand.upsert({
          where: { idempotencyKey: command.idempotencyKey },
          update: {},
          create: {
            id: command.id,
            workflowRunId: command.workflowRunId,
            type: command.type,
            idempotencyKey: command.idempotencyKey,
            payload: command.payload as object,
            createdAt: new Date(command.createdAt),
          },
        }),
      ),
    );
    return saved.map(mapWorkflowCommand);
  }

  async findCommandExecutionByIdempotencyKey(idempotencyKey: string) {
    const execution = await this.prisma.workflowCommandExecution.findFirst({
      where: { idempotencyKey, status: 'success' },
      orderBy: { createdAt: 'desc' },
    });
    return execution ? mapWorkflowCommandExecution(execution) : undefined;
  }

  async saveCommandExecution(execution: WorkflowCommandExecutionRecord) {
    const saved = await this.prisma.workflowCommandExecution.create({
      data: {
        id: execution.id,
        workflowCommandId: execution.workflowCommandId,
        workflowRunId: execution.workflowRunId,
        commandType: execution.commandType,
        idempotencyKey: execution.idempotencyKey,
        status: execution.status,
        targetEventId: execution.targetEventId,
        error: execution.error,
        createdAt: new Date(execution.createdAt),
      },
    });
    return mapWorkflowCommandExecution(saved);
  }

  async findEventByNormalizedKey(normalizedEventKey: string) {
    const event = await this.prisma.event.findUnique({ where: { normalizedEventKey } });
    return event ? mapEvent(event) : undefined;
  }

  async createEvent(input: Omit<EventRecord, 'updatedAt'>) {
    const saved = await this.prisma.event.create({
      data: {
        ...input,
        formedAt: new Date(input.formedAt),
      },
    });
    return mapEvent(saved);
  }

  async saveEventIntake(input: {
    id: string;
    eventId?: string;
    workflowRunId: string;
    entryMode: string;
    observedAt: string;
    t0?: string;
    title: string;
    oneLineSummary: string;
    confirmationLevel: string;
    expressionBoundary: string;
    payload: unknown;
    dedupeKey: string;
  }) {
    await this.prisma.eventIntake.create({
      data: {
        ...input,
        observedAt: new Date(input.observedAt),
        t0: input.t0 ? new Date(input.t0) : undefined,
        payload: input.payload as object,
      },
    });
  }

  async saveEventSourceContext(input: {
    id: string;
    eventId: string;
    workflowRunId: string;
    sourceType: string;
    payload: unknown;
  }) {
    await this.prisma.eventSourceContext.create({
      data: {
        ...input,
        payload: input.payload as object,
      },
    });
  }

  async saveEventEvidence(input: {
    id: string;
    eventId: string;
    workflowRunId: string;
    sourceType: string;
    url?: string;
    claim: string;
    payload: unknown;
  }) {
    await this.prisma.eventEvidence.create({
      data: {
        ...input,
        payload: input.payload as object,
      },
    });
  }

  async saveIgnoredSignal(input: {
    id: string;
    workflowRunId: string;
    reason: string;
    sourceRefs: unknown[];
    createdAt: string;
  }) {
    await this.prisma.ignoredSignal.create({
      data: {
        ...input,
        sourceRefs: input.sourceRefs as object,
        createdAt: new Date(input.createdAt),
      },
    });
  }
}

function mapWorkflowDefinition(definition: {
  id: string;
  workflowId: string;
  name: string;
  type: string;
  version: string;
  status: string;
  markdownPath: string;
  outputSchemaPath: string;
  checksum: string;
  createdAt: Date;
  updatedAt: Date;
}): WorkflowDefinitionRecord {
  return {
    ...definition,
    type: definition.type as WorkflowDefinitionRecord['type'],
    status: definition.status as WorkflowDefinitionRecord['status'],
    createdAt: definition.createdAt.toISOString(),
    updatedAt: definition.updatedAt.toISOString(),
  };
}

function mapWorkflowRun(run: {
  id: string;
  workflowDefinitionId: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  model: string | null;
  input: unknown;
  output: unknown;
  error: string | null;
}): WorkflowRunRecord {
  return {
    id: run.id,
    workflowDefinitionId: run.workflowDefinitionId,
    status: run.status as WorkflowRunRecord['status'],
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString(),
    model: run.model ?? undefined,
    input: run.input,
    output: run.output ?? undefined,
    error: run.error ?? undefined,
  };
}

function mapWorkflowCommand(command: {
  id: string;
  workflowRunId: string;
  type: string;
  idempotencyKey: string;
  payload: unknown;
  createdAt: Date;
}): WorkflowCommandRecord {
  return {
    id: command.id,
    workflowRunId: command.workflowRunId,
    type: command.type as WorkflowCommandRecord['type'],
    idempotencyKey: command.idempotencyKey,
    payload: command.payload as WorkflowCommandRecord['payload'],
    createdAt: command.createdAt.toISOString(),
  };
}

function mapWorkflowCommandExecution(execution: {
  id: string;
  workflowCommandId: string;
  workflowRunId: string;
  commandType: string;
  idempotencyKey: string;
  status: string;
  targetEventId: string | null;
  error: string | null;
  createdAt: Date;
}): WorkflowCommandExecutionRecord {
  return {
    id: execution.id,
    workflowCommandId: execution.workflowCommandId,
    workflowRunId: execution.workflowRunId,
    commandType: execution.commandType as WorkflowCommandExecutionRecord['commandType'],
    idempotencyKey: execution.idempotencyKey,
    status: execution.status as WorkflowCommandExecutionRecord['status'],
    targetEventId: execution.targetEventId ?? undefined,
    error: execution.error ?? undefined,
    createdAt: execution.createdAt.toISOString(),
  };
}

function mapEvent(event: {
  id: string;
  title: string;
  normalizedEventKey: string;
  status: string;
  confidence: string;
  formedAt: Date;
  updatedAt: Date;
}): EventRecord {
  return {
    id: event.id,
    title: event.title,
    normalizedEventKey: event.normalizedEventKey,
    status: event.status,
    confidence: event.confidence as EventRecord['confidence'],
    formedAt: event.formedAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}
