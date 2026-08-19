import { GenerateWorkflowCommandsInput, WorkflowModelAdapter } from './workflow-model.adapter';
import { EventWorkflowCommandsV1 } from './workflow.types';

type Fetcher = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<ResponseLike>;

interface ResponseLike {
  ok: boolean;
  status?: number;
  statusText?: string;
  json(): Promise<unknown>;
}

export interface OpenAIWorkflowModelAdapterOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetcher?: Fetcher;
}

interface ResponsesApiBody {
  output_text?: string;
  output?: {
    content?: {
      type?: string;
      text?: string;
    }[];
  }[];
  error?: {
    message?: string;
  };
}

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';

export class OpenAIWorkflowModelAdapter implements WorkflowModelAdapter {
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetcher: Fetcher;

  constructor(options: OpenAIWorkflowModelAdapterOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    this.model = options.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
    this.baseUrl = (options.baseUrl ?? process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.fetcher = options.fetcher ?? globalThis.fetch;
  }

  async generateCommands(input: GenerateWorkflowCommandsInput): Promise<EventWorkflowCommandsV1> {
    return (await this.generateStructuredOutput(input)) as EventWorkflowCommandsV1;
  }

  async generateStructuredOutput(input: GenerateWorkflowCommandsInput): Promise<unknown> {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is required for OpenAIWorkflowModelAdapter');
    }
    if (!this.fetcher) {
      throw new Error('fetch is not available in this runtime');
    }

    const response = await this.fetcher(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(this.buildRequestBody(input)),
    });
    const body = (await response.json()) as ResponsesApiBody;

    if (!response.ok) {
      throw new Error(
        `OpenAI workflow model request failed: ${body.error?.message ?? response.statusText ?? response.status ?? 'unknown error'}`,
      );
    }

    const text = this.extractOutputText(body);
    return JSON.parse(text) as unknown;
  }

  private buildRequestBody(input: GenerateWorkflowCommandsInput) {
    return {
      model: this.model,
      store: false,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: [
                '你是热点事件工作流执行代理。',
                '你只能根据用户提供的 Workflow Markdown、输出 JSON Schema、运行上下文生成 JSON 命令。',
                '不要输出 Markdown，不要解释，不要编造上下文外事实。',
              ].join('\n'),
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: [
                '请执行以下事件形成工作流，并严格返回符合 JSON Schema 的命令对象。',
                '',
                '## Workflow Markdown',
                input.workflowMarkdown,
                '',
                '## Runtime Context JSON',
                JSON.stringify(input.context, null, 2),
              ].join('\n'),
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: this.resolveSchemaName(input.outputSchema),
          strict: true,
          schema: input.outputSchema,
        },
      },
    };
  }

  private resolveSchemaName(schema: unknown) {
    if (schema && typeof schema === 'object' && 'title' in schema && typeof schema.title === 'string') {
      return schema.title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'WorkflowCommands';
    }
    return 'WorkflowCommands';
  }

  private extractOutputText(body: ResponsesApiBody) {
    if (body.output_text) {
      return body.output_text;
    }

    for (const output of body.output ?? []) {
      for (const content of output.content ?? []) {
        if (content.type === 'output_text' && content.text) {
          return content.text;
        }
      }
    }

    throw new Error('OpenAI workflow model response did not include output text');
  }
}
