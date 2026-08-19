import { Inject, Injectable } from '@nestjs/common';
import { CollectionRepository } from '../collection/collection.repository';
import { COLLECTION_REPOSITORY } from '../collection/collection.tokens';
import { ASSISTANT_MODEL_ADAPTER } from './assistant.tokens';
import {
  AssistantChatInput,
  AssistantChatResult,
  AssistantModelAdapter,
  AssistantToolExecutionInput,
  AssistantToolExecutionResult,
} from './assistant.types';

@Injectable()
export class AssistantService {
  constructor(
    @Inject(ASSISTANT_MODEL_ADAPTER) private readonly model: AssistantModelAdapter,
    @Inject(COLLECTION_REPOSITORY) private readonly collectionRepository: CollectionRepository,
  ) {}

  async chat(input: AssistantChatInput): Promise<AssistantChatResult> {
    const directWriteProposal = await this.tryDirectWriteProposal(input);
    if (directWriteProposal) {
      return directWriteProposal;
    }

    const directToolResult = await this.tryDirectToolRead(input);
    if (directToolResult) {
      return { message: directToolResult.message };
    }

    const enriched = await this.enrichContext(input);
    const output = await this.model.chat(enriched);

    if (typeof output === 'string') {
      return this.parseModelText(output);
    }

    return output;
  }

  async executeTool(input: AssistantToolExecutionInput): Promise<AssistantToolExecutionResult> {
    switch (input.tool) {
      case 'get_twitter_config':
        return this.getTwitterConfig();
      case 'list_twitter_topics':
        return this.listTwitterTopics();
      case 'set_twitter_trend_schedule':
        return this.setTwitterTrendSchedule(input.arguments);
      case 'update_twitter_config':
        return this.updateTwitterConfig(input.arguments);
      case 'upsert_twitter_topic':
        return this.upsertTwitterTopic(input.arguments);
      case 'add_twitter_topic_account':
        return this.addTwitterTopicAccount(input.arguments);
      case 'remove_twitter_topic_account':
        return this.removeTwitterTopicAccount(input.arguments);
      default:
        throw new Error(`Unsupported assistant tool: ${input.tool}`);
    }
  }

  private async enrichContext(input: AssistantChatInput): Promise<AssistantChatInput> {
    const xConfig = await this.collectionRepository.findPlatformConfig('x');

    return {
      ...input,
      context: {
        ...input.context,
        platformConfig: xConfig
          ? {
              platform: xConfig.platform,
              regions: xConfig.variables.regions ?? xConfig.defaultRegions,
              trendCollectionCron: xConfig.variables.trendCollectionCron,
              trendEventWorkflowId: xConfig.variables.trendEventWorkflowId,
              topicCount: xConfig.variables.topicConfigs?.length ?? 0,
              topics: (xConfig.variables.topicConfigs ?? []).map((topic) => ({
                name: topic.name,
                enabled: topic.enabled,
                keywordCount: topic.keywords.length,
                accountCount: topic.accounts.length,
              })),
            }
          : undefined,
      },
    };
  }

  private parseModelText(text: string): AssistantChatResult {
    try {
      const parsed = JSON.parse(text) as AssistantChatResult;
      if (parsed && typeof parsed.message === 'string') {
        return parsed;
      }
    } catch {
      // Plain text model output is still a valid chat answer.
    }

    return { message: text };
  }

  private async getTwitterConfig(): Promise<AssistantToolExecutionResult> {
    const config = await this.requireTwitterConfig();
    return {
      message: '已读取 Twitter 配置。',
      result: config,
    };
  }

  private async listTwitterTopics(): Promise<AssistantToolExecutionResult> {
    const config = await this.requireTwitterConfig();
    const topics = config.variables.topicConfigs ?? [];
    return {
      message: this.formatTwitterTopics(topics),
      result: topics,
    };
  }

  private async tryDirectToolRead(input: AssistantChatInput): Promise<AssistantToolExecutionResult | null> {
    const message = input.message.replace(/\s+/g, '').toLowerCase();
    const asksTwitter = message.includes('twitter') || message.includes('x');
    const asksTopics = message.includes('主题') || message.includes('topic');
    const asksTracked = message.includes('追踪') || message.includes('监控') || message.includes('配置') || message.includes('哪些');

    if (asksTwitter && asksTopics && asksTracked) {
      return this.listTwitterTopics();
    }

    return null;
  }

  private async tryDirectWriteProposal(input: AssistantChatInput): Promise<AssistantChatResult | null> {
    const config = await this.collectionRepository.findPlatformConfig('x');
    const topics = config?.variables.topicConfigs ?? [];
    const topic = topics.find((item) => input.message.includes(item.name));
    if (!topic) return null;

    const compact = input.message.replace(/\s+/g, ' ').trim();
    const addMatch = compact.match(/(?:添加|新增|加入)(?:追踪|关注|监控)?账号\s*@?([A-Za-z0-9_]+)/);
    if (addMatch?.[1]) {
      const account = this.normalizeAccount(addMatch[1]);
      return {
        message: `我将为${topic.name}添加关注账号：${account}。`,
        proposedActions: [
          {
            id: this.createActionId('add-twitter-topic-account'),
            tool: 'add_twitter_topic_account',
            summary: `为${topic.name}添加关注账号 ${account}`,
            arguments: { topicName: topic.name, account },
            requiresConfirmation: true,
          },
        ],
      };
    }

    const removeMatch = compact.match(/(?:移除|删除|去掉)(?:追踪|关注|监控)?账号\s*@?([A-Za-z0-9_]+)/);
    if (removeMatch?.[1]) {
      const account = this.normalizeAccount(removeMatch[1]);
      return {
        message: `我将从${topic.name}移除关注账号：${account}。`,
        proposedActions: [
          {
            id: this.createActionId('remove-twitter-topic-account'),
            tool: 'remove_twitter_topic_account',
            summary: `从${topic.name}移除关注账号 ${account}`,
            arguments: { topicName: topic.name, account },
            requiresConfirmation: true,
          },
        ],
      };
    }

    return null;
  }

  private formatTwitterTopics(topics: Array<{ name: string; enabled: boolean; keywords: string[]; accounts: string[] }>) {
    if (!topics.length) {
      return '当前 Twitter 还没有配置重点主题。';
    }

    const lines = topics.map((topic, index) => {
      const status = topic.enabled ? '启用' : '停用';
      return `${index + 1}. ${topic.name}（${status}，${topic.keywords.length} 个关键词，${topic.accounts.length} 个关注账号）`;
    });

    return [`当前 Twitter 追踪 ${topics.length} 个重点主题：`, ...lines].join('\n');
  }

  private async setTwitterTrendSchedule(args: Record<string, unknown>): Promise<AssistantToolExecutionResult> {
    const cron = this.requireString(args.cron, 'cron');
    const config = await this.requireTwitterConfig();
    await this.collectionRepository.updatePlatformConfig('x', {
      variables: {
        ...config.variables,
        trendCollectionCron: cron,
      },
    });
    await this.collectionRepository.updateJobConfig('x-trending-default', {
      schedule: { type: 'cron', value: cron },
    });

    return { message: `已将 X 榜单采集频率更新为 ${cron}。` };
  }

  private async updateTwitterConfig(args: Record<string, unknown>): Promise<AssistantToolExecutionResult> {
    const config = await this.requireTwitterConfig();
    const variables = this.isRecord(args.variables) ? args.variables : args;
    const next = await this.collectionRepository.updatePlatformConfig('x', {
      defaultRegions: Array.isArray(variables.regions) ? variables.regions.map(String) : undefined,
      variables: {
        ...config.variables,
        ...variables,
      },
    });

    const cron = variables.trendCollectionCron;
    if (typeof cron === 'string' && cron.trim()) {
      await this.collectionRepository.updateJobConfig('x-trending-default', {
        schedule: { type: 'cron', value: cron.trim() },
      });
    }

    return {
      message: '已更新 Twitter 配置。',
      result: next,
    };
  }

  private async upsertTwitterTopic(args: Record<string, unknown>): Promise<AssistantToolExecutionResult> {
    const config = await this.requireTwitterConfig();
    const topic = this.isRecord(args.topic) ? args.topic : args;
    const name = this.requireString(topic.name, 'name');
    const existingTopics = config.variables.topicConfigs ?? [];
    const id = typeof topic.id === 'string' && topic.id.trim() ? topic.id.trim() : this.createTopicId(name);
    const nextTopic = {
      id,
      name,
      enabled: typeof topic.enabled === 'boolean' ? topic.enabled : true,
      keywords: this.toStringArray(topic.keywords),
      positiveExamples: this.toStringArray(topic.positiveExamples),
      negativeExamples: this.toStringArray(topic.negativeExamples),
      action: typeof topic.action === 'string' ? topic.action : '立即自动响应',
      accounts: this.toStringArray(topic.accounts),
      collectionFrequency: typeof topic.collectionFrequency === 'string' ? topic.collectionFrequency : '每 3 小时',
      workflowId: typeof topic.workflowId === 'string' ? topic.workflowId : 'x-topic-circle-event-formation',
      defaultPostLimit: typeof topic.defaultPostLimit === 'number' ? topic.defaultPostLimit : config.variables.defaultPostLimit ?? 3,
    };
    const topicConfigs = existingTopics.some((item) => item.id === id || item.name === name)
      ? existingTopics.map((item) => (item.id === id || item.name === name ? nextTopic : item))
      : [...existingTopics, nextTopic];

    const next = await this.collectionRepository.updatePlatformConfig('x', {
      variables: {
        ...config.variables,
        topicConfigs,
        topicKeywords: this.unique(topicConfigs.filter((item) => item.enabled).flatMap((item) => item.keywords)),
        topicNegativeKeywords: this.unique(topicConfigs.filter((item) => item.enabled).flatMap((item) => item.negativeExamples)),
        monitoredAccounts: this.unique(topicConfigs.filter((item) => item.enabled).flatMap((item) => item.accounts)),
      },
    });

    return {
      message: `已保存重点主题：${name}。`,
      result: next.variables.topicConfigs,
    };
  }

  private async addTwitterTopicAccount(args: Record<string, unknown>): Promise<AssistantToolExecutionResult> {
    const topicName = this.requireString(args.topicName, 'topicName');
    const account = this.normalizeAccount(this.requireString(args.account, 'account'));
    const config = await this.requireTwitterConfig();
    const topicConfigs = config.variables.topicConfigs ?? [];
    const topic = this.findTopicByName(topicConfigs, topicName);
    const nextAccounts = this.unique([...topic.accounts, account]);

    if (nextAccounts.length === topic.accounts.length) {
      return { message: `${topic.name} 已包含关注账号：${account}。` };
    }

    await this.saveTopicConfigs(config.variables, topicConfigs.map((item) =>
      item.id === topic.id ? { ...item, accounts: nextAccounts } : item,
    ));

    return { message: `已为${topic.name}添加关注账号：${account}。` };
  }

  private async removeTwitterTopicAccount(args: Record<string, unknown>): Promise<AssistantToolExecutionResult> {
    const topicName = this.requireString(args.topicName, 'topicName');
    const account = this.normalizeAccount(this.requireString(args.account, 'account'));
    const config = await this.requireTwitterConfig();
    const topicConfigs = config.variables.topicConfigs ?? [];
    const topic = this.findTopicByName(topicConfigs, topicName);
    const nextAccounts = topic.accounts.filter((item) => this.normalizeAccount(item).toLowerCase() !== account.toLowerCase());

    if (nextAccounts.length === topic.accounts.length) {
      return { message: `${topic.name} 未包含关注账号：${account}。` };
    }

    await this.saveTopicConfigs(config.variables, topicConfigs.map((item) =>
      item.id === topic.id ? { ...item, accounts: nextAccounts } : item,
    ));

    return { message: `已从${topic.name}移除关注账号：${account}。` };
  }

  private async requireTwitterConfig() {
    const config = await this.collectionRepository.findPlatformConfig('x');
    if (!config) {
      throw new Error('Twitter config not found');
    }
    return config;
  }

  private requireString(value: unknown, field: string) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`${field} is required`);
    }
    return value.trim();
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private toStringArray(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }

  private findTopicByName<T extends { id: string; name: string }>(topics: T[], name: string): T {
    const normalizedName = name.trim().toLowerCase();
    const topic = topics.find((item) => item.name.toLowerCase() === normalizedName);
    if (!topic) {
      throw new Error(`Twitter topic not found: ${name}`);
    }
    return topic;
  }

  private normalizeAccount(account: string) {
    return account.trim().replace(/^@+/, '');
  }

  private async saveTopicConfigs(
    variables: NonNullable<Awaited<ReturnType<AssistantService['requireTwitterConfig']>>['variables']>,
    topicConfigs: NonNullable<Awaited<ReturnType<AssistantService['requireTwitterConfig']>>['variables']['topicConfigs']>,
  ) {
    await this.collectionRepository.updatePlatformConfig('x', {
      variables: {
        ...variables,
        topicConfigs,
        topicKeywords: this.unique(topicConfigs.filter((item) => item.enabled).flatMap((item) => item.keywords)),
        topicNegativeKeywords: this.unique(topicConfigs.filter((item) => item.enabled).flatMap((item) => item.negativeExamples)),
        monitoredAccounts: this.unique(topicConfigs.filter((item) => item.enabled).flatMap((item) => item.accounts)),
      },
    });
  }

  private unique(values: string[]) {
    return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
  }

  private createTopicId(name: string) {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-|-$/g, '');
    return `topic-${slug || 'custom'}-${Date.now()}`;
  }

  private createActionId(prefix: string) {
    return `${prefix}-${Date.now()}`;
  }
}
