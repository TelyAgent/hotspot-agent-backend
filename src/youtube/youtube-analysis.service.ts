import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { WORKFLOW_LOADER, WORKFLOW_MODEL_ADAPTER } from '../workflow/workflow.tokens';
import { WorkflowLoader } from '../workflow/workflow-loader';
import { WorkflowModelAdapter } from '../workflow/workflow-model.adapter';

const youtubeAnalysisOutputSchema = z
  .object({
    main_reason: z
      .object({
        topic: z.string().min(1),
        why_attractive: z.string().min(1),
        traffic_judgment: z.string().min(1),
      })
      .strict(),
    execution: z
      .object({
        key_technique: z.string().min(1),
        effect: z.string().min(1),
      })
      .strict(),
    replication: z
      .object({
        reusable_mechanism: z.string().min(1),
        product_remix_topic: z.string().min(1),
        product_entry: z.string().min(1),
      })
      .strict(),
    limitations: z.array(z.string()),
  })
  .strict()
  .refine((output) => isChineseAnalysisOutput(output), {
    message: 'YouTube 字幕拆解输出必须使用中文',
  });

export type YoutubeAnalysisOutput = z.infer<typeof youtubeAnalysisOutputSchema>;

export function validateYoutubeAnalysisOutput(output: unknown) {
  return youtubeAnalysisOutputSchema.safeParse(output);
}

function isChineseAnalysisOutput(output: {
  main_reason: { topic: string; why_attractive: string; traffic_judgment: string };
  execution: { key_technique: string; effect: string };
  replication: { reusable_mechanism: string; product_remix_topic: string; product_entry: string };
  limitations: string[];
}) {
  const text = [
    output.main_reason.topic,
    output.main_reason.why_attractive,
    output.main_reason.traffic_judgment,
    output.execution.key_technique,
    output.execution.effect,
    output.replication.reusable_mechanism,
    output.replication.product_remix_topic,
    output.replication.product_entry,
    ...output.limitations,
  ].join('');
  const chineseCharCount = [...text].filter((char) => /[\u4e00-\u9fff]/.test(char)).length;
  return chineseCharCount >= 12;
}

@Injectable()
export class YoutubeAnalysisService {
  constructor(
    @Inject(WORKFLOW_LOADER)
    private readonly workflowLoader: WorkflowLoader,
    @Inject(WORKFLOW_MODEL_ADAPTER)
    private readonly modelAdapter: WorkflowModelAdapter,
  ) {}

  validate(output: unknown): YoutubeAnalysisOutput {
    const result = validateYoutubeAnalysisOutput(output);
    if (!result.success) {
      throw new Error(`YouTube 字幕拆解输出格式不合法：${result.error.message}`);
    }
    return result.data;
  }

  async analyzeTranscript(context: Record<string, unknown>): Promise<YoutubeAnalysisOutput> {
    const workflow = await this.workflowLoader.loadSystem('video-transcript-analysis', 'youtube');
    const output = await this.modelAdapter.generateStructuredOutput({
      workflowId: workflow.definition.workflowId,
      workflowVersion: workflow.definition.version,
      workflowMarkdown: workflow.markdown,
      outputSchema: workflow.outputSchema,
      context,
    });
    return this.validate(output);
  }
}
