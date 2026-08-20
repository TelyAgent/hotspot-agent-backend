import { SettingsService } from '../../src/settings/settings.service';

describe('SettingsService', () => {
  it('seeds the 12 content operation account types', async () => {
    const prisma = {
      operationAccount: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new SettingsService(prisma as never);

    await service.onModuleInit();

    expect(prisma.operationAccount.create).toHaveBeenCalledTimes(12);
    expect(prisma.operationAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: '快讯型',
          fields: expect.objectContaining({
            xAccountId: '@nikalatekickoff',
            personaType: '值班新闻编辑型账号：反应快、表述克制、只把已确认的核心事实讲清楚，不做情绪化延展。',
            contentPromptRule: expect.stringContaining('先给结论'),
            skill: 'respond-with-breaking-brief',
          }),
        }),
      }),
    );
    expect(prisma.operationAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Domer',
          fields: expect.objectContaining({
            xAccountId: '@EliasMightBeWrong',
            personaType: '预测市场规则、结算、资金流、异常与复盘',
            contentPromptRule: expect.any(String),
          }),
        }),
      }),
    );
  });

  it('adds missing content prompt rules and upgrades legacy base account personas without overwriting custom values', async () => {
    const prisma = {
      operationAccount: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'operation_account_respond-with-breaking-brief',
            fields: {
              xAccountId: '@nikalatekickoff',
              personaType: '把热点压缩为可快速扫描的单一事实更新',
              skill: 'respond-with-breaking-brief',
            },
          })
          .mockResolvedValueOnce({
            id: 'operation_account_develop-hotspot-deep-dive',
            fields: {
              xAccountId: '@custom_deep',
              personaType: '用户自己写的深度账号人设',
              skill: 'develop-hotspot-deep-dive',
            },
          })
          .mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new SettingsService(prisma as never);

    await service.onModuleInit();

    expect(prisma.operationAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'operation_account_respond-with-breaking-brief' },
        data: {
          fields: expect.objectContaining({
            personaType: '值班新闻编辑型账号：反应快、表述克制、只把已确认的核心事实讲清楚，不做情绪化延展。',
            contentPromptRule: expect.stringContaining('先给结论'),
          }),
        },
      }),
    );
    expect(prisma.operationAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'operation_account_develop-hotspot-deep-dive' },
        data: {
          fields: expect.objectContaining({
            personaType: '用户自己写的深度账号人设',
            contentPromptRule: expect.stringContaining('背景'),
          }),
        },
      }),
    );
  });

  it('keeps existing account configuration in the database', async () => {
    const prisma = {
      operationAccount: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'operation_account_respond-with-breaking-brief',
          fields: {
            xAccountId: '@custom',
            personaType: '用户自己修改的人设说明',
            contentPromptRule: '用户自己修改的内容生成规则',
            skill: 'custom-skill',
            type: '自定义分组',
            scenario: '自定义场景',
            frequency: '自定义频率',
            onFailure: '自定义处理',
          },
        }),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new SettingsService(prisma as never);

    await service.onModuleInit();

    expect(prisma.operationAccount.create).not.toHaveBeenCalled();
    expect(prisma.operationAccount.update).not.toHaveBeenCalled();
  });
});
