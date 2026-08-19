import { AssistantChatInput, AssistantModelAdapter } from './assistant.types';

type Fetcher = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<ResponseLike>;

interface ResponseLike {
  ok: boolean;
  status?: number;
  statusText?: string;
  json(): Promise<unknown>;
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

export interface OpenAIAssistantModelAdapterOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetcher?: Fetcher;
}

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';

export class OpenAIAssistantModelAdapter implements AssistantModelAdapter {
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetcher: Fetcher;

  constructor(options: OpenAIAssistantModelAdapterOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    this.model = options.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
    this.baseUrl = (options.baseUrl ?? process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.fetcher = options.fetcher ?? globalThis.fetch;
  }

  async chat(input: AssistantChatInput): Promise<string> {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is required for assistant chat');
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
      throw new Error(`OpenAI assistant request failed: ${body.error?.message ?? response.statusText ?? response.status ?? 'unknown error'}`);
    }

    return this.extractOutputText(body);
  }

  private buildRequestBody(input: AssistantChatInput) {
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
                '你是热点运营 Agent 系统内的对话助手。',
                '你帮助运营人员理解当前页面、平台采集配置、工作流配置和后续操作。',
                '回答必须简洁、具体，不要编造系统没有提供的事实。',
                '你可以使用以下工具能力：get_twitter_config、update_twitter_config、list_twitter_topics、upsert_twitter_topic、add_twitter_topic_account、remove_twitter_topic_account、set_twitter_trend_schedule。',
                '添加或移除主题追踪账号时，优先使用 add_twitter_topic_account 或 remove_twitter_topic_account，不要用 upsert_twitter_topic 重写整个主题。',
                '除非上下文中明确提供 maxAccounts，否则不要假设主题账号数量上限。',
                '读取类请求可以直接基于上下文回答；修改类请求必须返回 JSON 对象，包含 message 和 proposedActions，不要声称已经执行。',
                'proposedActions 每项必须包含 id、tool、summary、arguments、requiresConfirmation:true。',
                '用户确认前，任何配置修改都只是提案。',
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
                '## 用户问题',
                input.message,
                '',
                '## 当前系统上下文 JSON',
                JSON.stringify(input.context, null, 2),
              ].join('\n'),
            },
          ],
        },
      ],
    };
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

    throw new Error('OpenAI assistant response did not include output text');
  }
}
