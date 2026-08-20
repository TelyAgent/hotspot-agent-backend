import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_CONTENT_ACCOUNT_SETTINGS } from './content-account-defaults';

interface SettingPayload {
  name?: string;
  description?: string | null;
  enabled?: boolean;
  fields?: Record<string, unknown>;
}

@Injectable()
export class SettingsService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedDefaultAccounts();
  }

  async list(category: string) {
    if (category === 'accounts') {
      const items = await this.prisma.operationAccount.findMany({
        orderBy: { createdAt: 'asc' },
      });
      return items.map((item) => this.toDto(item));
    }

    return [];
  }

  async create(category: string, body: SettingPayload & { name: string }) {
    const key = this.slug(body.name);
    if (category === 'accounts') {
      const saved = await this.prisma.operationAccount.create({
        data: {
          id: `operation_account_${key}`,
          key,
          name: body.name,
          description: body.description ?? null,
          enabled: body.enabled ?? true,
          fields: (body.fields ?? {}) as Prisma.InputJsonValue,
        },
      });
      return this.toDto(saved);
    }

    throw new NotFoundException(`配置分类暂未接入数据库：${category}`);
  }

  async update(category: string, id: string, body: SettingPayload) {
    if (category === 'accounts') {
      const existing = await this.prisma.operationAccount.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException(`运营账号配置不存在：${id}`);
      }
      const saved = await this.prisma.operationAccount.update({
        where: { id },
        data: {
          name: body.name,
          description: body.description,
          enabled: body.enabled,
          fields: body.fields ? ({ ...(existing.fields as Record<string, unknown>), ...body.fields } as Prisma.InputJsonValue) : undefined,
        },
      });
      return this.toDto(saved);
    }

    throw new NotFoundException(`配置分类暂未接入数据库：${category}`);
  }

  async remove(category: string, id: string) {
    if (category === 'accounts') {
      const existing = await this.prisma.operationAccount.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException(`运营账号配置不存在：${id}`);
      }
      const saved = await this.prisma.operationAccount.delete({ where: { id } });
      return this.toDto(saved);
    }

    throw new NotFoundException(`配置分类暂未接入数据库：${category}`);
  }

  async audit() {
    return [];
  }

  private async seedDefaultAccounts() {
    for (const account of DEFAULT_CONTENT_ACCOUNT_SETTINGS) {
      const existing = await this.prisma.operationAccount.findUnique({ where: { key: account.key } });
      const defaultFields = this.fieldsFor(account);

      if (!existing) {
        await this.prisma.operationAccount.create({
          data: {
            id: `operation_account_${account.key}`,
            key: account.key,
            name: account.name,
            description: account.description,
            enabled: true,
            fields: defaultFields,
          },
        });
        continue;
      }

      const existingFields = this.objectFields(existing.fields);
      const mergedFields = this.mergeDefaultFields(defaultFields, existingFields, account);
      const description = this.shouldUpgradeDefaultText(existing.description, this.legacyPersonaType(account))
        ? account.description
        : undefined;

      if (description !== undefined || this.hasFieldChanges(existingFields, mergedFields)) {
        await this.prisma.operationAccount.update({
          where: { id: existing.id },
          data: {
            description,
            fields: mergedFields as Prisma.InputJsonValue,
          },
        });
      }
    }
  }

  private fieldsFor(account: (typeof DEFAULT_CONTENT_ACCOUNT_SETTINGS)[number]) {
    return {
      xAccountId: account.xAccountId,
      type: account.type,
      personaType: account.personaType,
      contentPromptRule: account.contentPromptRule,
      skill: account.skill,
      scenario: account.description,
      frequency: '按 Event 路由与账号容量控制',
      onFailure: '保留任务并上报异常',
    };
  }

  private objectFields(fields: unknown) {
    return fields && typeof fields === 'object' && !Array.isArray(fields) ? (fields as Record<string, unknown>) : {};
  }

  private mergeDefaultFields(
    defaultFields: Record<string, unknown>,
    existingFields: Record<string, unknown>,
    account: (typeof DEFAULT_CONTENT_ACCOUNT_SETTINGS)[number],
  ) {
    const mergedFields = { ...defaultFields, ...existingFields };
    const legacyPersonaType = this.legacyPersonaType(account);
    if (this.shouldUpgradeDefaultText(existingFields.personaType, legacyPersonaType)) {
      mergedFields.personaType = account.personaType;
    }
    if (this.shouldUpgradeDefaultText(existingFields.scenario, legacyPersonaType)) {
      mergedFields.scenario = account.description;
    }
    return mergedFields;
  }

  private legacyPersonaType(account: (typeof DEFAULT_CONTENT_ACCOUNT_SETTINGS)[number]) {
    return 'legacyPersonaType' in account ? account.legacyPersonaType : undefined;
  }

  private shouldUpgradeDefaultText(value: unknown, legacyValue: string | undefined) {
    return Boolean(legacyValue && value === legacyValue);
  }

  private hasFieldChanges(existingFields: Record<string, unknown>, mergedFields: Record<string, unknown>) {
    return Object.keys(mergedFields).some((key) => existingFields[key] !== mergedFields[key]);
  }

  private toDto(item: {
    id: string;
    name: string;
    description: string | null;
    enabled: boolean;
    fields: unknown;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const fields = item.fields && typeof item.fields === 'object' && !Array.isArray(item.fields) ? (item.fields as Record<string, unknown>) : {};
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      enabled: item.enabled,
      fields,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      ...fields,
    };
  }

  private slug(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
