import { YoutubeController } from '../../src/youtube/youtube.controller';

describe('YoutubeController', () => {
  it('returns board videos and latest run', async () => {
    const service = {
      runDailyCollection: jest.fn(),
      getLatestRun: jest.fn().mockResolvedValue({ status: 'success', newVideoCount: 0 }),
      getBoard: jest.fn().mockResolvedValue({ videos: [] }),
    };
    const controller = new YoutubeController(service as any);

    expect(await controller.getLatestRun()).toEqual({ status: 'success', newVideoCount: 0 });
    expect(await controller.getBoard()).toEqual({ videos: [] });
  });

  it('starts a manual run', async () => {
    const service = {
      runDailyCollection: jest.fn().mockResolvedValue({ status: 'failed', errorMessage: '缺少 YOUTUBE_API_KEY' }),
      getLatestRun: jest.fn(),
      getBoard: jest.fn(),
    };
    const controller = new YoutubeController(service as any);

    expect(await controller.run()).toEqual({ status: 'failed', errorMessage: '缺少 YOUTUBE_API_KEY' });
    expect(service.runDailyCollection).toHaveBeenCalledWith(expect.any(Date));
  });
});
