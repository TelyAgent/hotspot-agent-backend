import { WorkflowController } from '../../src/workflow/workflow.controller';

describe('WorkflowController', () => {
  it('returns the X trend event formation workflow document', async () => {
    const workflowRunner = {};
    const workflowLoader = {
      load: jest.fn().mockResolvedValue({
        definition: {
          workflowId: 'x-trend-event-formation',
          version: '1.0.0',
        },
        markdown: '# X trend workflow',
      }),
    };
    const collectionRepository = {};
    const controller = new WorkflowController(
      workflowRunner as never,
      workflowLoader as never,
      collectionRepository as never,
    );

    await expect(controller.getXTrendEventFormationDocument()).resolves.toEqual({
      definition: {
        workflowId: 'x-trend-event-formation',
        version: '1.0.0',
      },
      markdown: '# X trend workflow',
    });
    expect(workflowLoader.load).toHaveBeenCalledWith('x-trend-event-formation', 'event-formation');
  });
});
