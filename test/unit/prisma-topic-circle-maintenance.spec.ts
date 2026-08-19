import { PrismaService } from '../../src/prisma/prisma.service';

describe('PrismaService topic circle maintenance', () => {
  it('clears only mock topic circle rows in dependency order', async () => {
    const prisma = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };

    await PrismaService.prototype.clearTopicCircleMockData.call(prisma);

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(7);
    expect(prisma.$executeRawUnsafe.mock.calls[0][0]).toContain('"postId" LIKE \'mock\\_%\'');
    expect(prisma.$executeRawUnsafe.mock.calls[1][0]).toContain('topic_circle_candidate_post');
    expect(prisma.$executeRawUnsafe.mock.calls[2][0]).toContain('topic_circle_candidate');
    expect(prisma.$executeRawUnsafe.mock.calls[3][0]).toContain('x_topic_circle_post');
    expect(prisma.$executeRawUnsafe.mock.calls[4][0]).toContain('topic_circle_account_fetch_run');
    expect(prisma.$executeRawUnsafe.mock.calls[5][0]).toContain('topic_circle_fetch_run');
    expect(prisma.$executeRawUnsafe.mock.calls[6][0]).toContain('topic_circle_account_sync_state');
    expect(prisma.$executeRawUnsafe.mock.calls.map(([sql]) => sql).join('\n')).not.toContain('TRUNCATE');
  });
});
