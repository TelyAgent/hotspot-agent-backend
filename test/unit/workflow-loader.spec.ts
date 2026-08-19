import { WorkflowLoader } from '../../src/workflow/workflow-loader';

describe('WorkflowLoader', () => {
  it('loads workflow markdown, frontmatter, schema, and checksum', async () => {
    const loader = new WorkflowLoader(process.cwd());

    const workflow = await loader.load('x-trend-event-formation');

    expect(workflow.definition.workflowId).toBe('x-trend-event-formation');
    expect(workflow.definition.type).toBe('event_formation');
    expect(workflow.definition.version).toBe('1.0.0');
    expect(workflow.definition.status).toBe('enabled');
    expect(workflow.markdown).toContain('TR-01');
    expect(workflow.outputSchema).toEqual(expect.objectContaining({ title: 'EventWorkflowCommandsV1' }));
    expect(workflow.definition.checksum).toMatch(/^[a-f0-9]{64}$/);
  });
});
