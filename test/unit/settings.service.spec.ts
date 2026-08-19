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
            personaType: '把热点压缩为可快速扫描的单一事实更新',
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
          }),
        }),
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
