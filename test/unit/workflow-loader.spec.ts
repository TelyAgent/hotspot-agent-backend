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

  it('can load the system workflow without consulting governance versions', async () => {
    const loader = new WorkflowLoader(process.cwd());

    const workflow = await loader.loadSystem('x-trend-event-formation', 'event-formation');

    expect(workflow.definition.workflowId).toBe('x-trend-event-formation');
    expect(workflow.markdown).toContain('TR-01');
  });

  it('keeps X trend event formation focused on purpose, input, rules, and output', async () => {
    const loader = new WorkflowLoader(process.cwd());

    const workflow = await loader.loadSystem('x-trend-event-formation', 'event-formation');

    expect(workflow.markdown).toContain('# 目标');
    expect(workflow.markdown).toContain('# 输入');
    expect(workflow.markdown).toContain('# 判断规则');
    expect(workflow.markdown).toContain('# 输出');
    expect(workflow.markdown).not.toContain('本工作流不定义采集频率');
    expect(workflow.markdown).not.toContain('首期每小时采集');
    expect(workflow.markdown).not.toContain('每榜 Top 30');
    expect(workflow.markdown).not.toContain('Worldwide、United States、United Kingdom、Japan、Korea');
  });
});
