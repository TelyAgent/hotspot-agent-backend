import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface EventListQuery {
  page?: string | number;
  pageSize?: string | number;
  status?: string;
  q?: string;
}

interface TriggerView {
  ruleId: string;
  reason: string;
}

interface EvidenceView {
  sourceType: string;
  claim: string;
  url?: string;
}

@Injectable()
export class EventListService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: EventListQuery = {}) {
    const page = this.positiveInt(query.page, 1);
    const pageSize = Math.min(this.positiveInt(query.pageSize, 20), 100);
    const status = this.toStoredStatus(query.status);
    const keyword = typeof query.q === 'string' ? query.q.trim() : '';
    const where = {
      ...(status ? { status } : {}),
      ...(keyword
        ? {
            OR: [
              { title: { contains: keyword, mode: 'insensitive' as const } },
              { normalizedEventKey: { contains: keyword, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [total, events] = await Promise.all([
      this.prisma.event.count({ where }),
      this.prisma.event.findMany({
        where,
        orderBy: [{ formedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          intakes: { orderBy: { observedAt: 'desc' }, take: 1 },
          sourceContexts: { orderBy: { createdAt: 'desc' }, take: 3 },
          evidence: { orderBy: { createdAt: 'desc' }, take: 10 },
        },
      }),
    ]);

    return {
      items: events.map((event) => {
        const latestIntake = event.intakes[0];
        const latestContext = event.sourceContexts[0];
        const intakePayload = this.asRecord(latestIntake?.payload);
        const contextPayload = this.asRecord(latestContext?.payload);
        const trigger = this.asTrigger(intakePayload.trigger) ?? this.asTriggers(contextPayload.matchedRules)[0];
        const matchedRules = this.asTriggers(contextPayload.matchedRules);
        const regions = this.asRegions(contextPayload.regions);
        const evidence = this.buildEvidence(
          event.evidence.map((item) => ({
            sourceType: item.sourceType,
            claim: item.claim,
            url: item.url ?? undefined,
          })),
          contextPayload,
        );

        return {
          id: event.id,
          title: event.title,
          summary: latestIntake?.oneLineSummary ?? '',
          status: this.toDisplayStatus(event.status),
          verify: this.toDisplayVerify(latestIntake?.confirmationLevel),
          regions: regions.join('、'),
          trigger: trigger ? `${trigger.ruleId}：${trigger.reason}` : '',
          urls: evidence.map((item) => item.url).filter((url): url is string => Boolean(url)),
          evidence,
          related: [],
          confidence: event.confidence,
          normalizedEventKey: event.normalizedEventKey,
          formedAt: event.formedAt.toISOString(),
          updatedAt: event.updatedAt.toISOString(),
          matchedRules,
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  private positiveInt(value: string | number | undefined, fallback: number): number {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private toStoredStatus(status?: string): string | undefined {
    const map: Record<string, string> = {
      内容生成中: 'responding',
      待发布: 'active',
      处理异常: 'failed',
      已完成: 'completed',
    };
    return status ? (map[status] ?? status) : undefined;
  }

  private toDisplayStatus(status: string): string {
    const map: Record<string, string> = {
      responding: '内容生成中',
      active: '待发布',
      failed: '处理异常',
      error: '处理异常',
      completed: '已完成',
      closed: '已完成',
    };
    return map[status] ?? status;
  }

  private toDisplayVerify(level?: string): string {
    const map: Record<string, string> = {
      confirmed: '信息一致',
      partially_supported: '待核验',
      unconfirmed: '待核验',
      conflicting: '存在冲突',
    };
    return level ? (map[level] ?? '待核验') : '待核验';
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }

  private asTrigger(value: unknown): TriggerView | undefined {
    const record = this.asRecord(value);
    return typeof record.ruleId === 'string' && typeof record.reason === 'string'
      ? { ruleId: record.ruleId, reason: record.reason }
      : undefined;
  }

  private asTriggers(value: unknown): TriggerView[] {
    return Array.isArray(value) ? value.map((item) => this.asTrigger(item)).filter((item): item is TriggerView => Boolean(item)) : [];
  }

  private asRegions(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return [
      ...new Set(
        value
          .map((item) => this.asRecord(item).region)
          .filter((region): region is string => typeof region === 'string' && region.length > 0),
      ),
    ];
  }

  private buildEvidence(records: EvidenceView[], contextPayload: Record<string, unknown>): EvidenceView[] {
    if (records.length > 0) {
      return records;
    }
    return this.asTrendRegionEvidence(contextPayload.regions);
  }

  private asTrendRegionEvidence(value: unknown): EvidenceView[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) => {
        const record = this.asRecord(item);
        const region = record.region;
        const rank = record.rank;
        const previousRank = record.previousRank;
        const snapshotId = record.snapshotId;
        if (typeof region !== 'string' || typeof rank !== 'number') {
          return undefined;
        }
        const rankDelta = typeof previousRank === 'number' ? previousRank - rank : undefined;
        const deltaText = typeof rankDelta === 'number' && rankDelta > 0 ? `，较上次成功快照上升 ${rankDelta} 位` : '';
        const snapshotText = typeof snapshotId === 'string' && snapshotId.length > 0 ? `（${snapshotId}）` : '';
        return {
          sourceType: 'x_trend',
          claim: `${region} 热搜榜排名 #${rank}${deltaText}${snapshotText}`,
        };
      })
      .filter((item): item is EvidenceView => Boolean(item));
  }
}
