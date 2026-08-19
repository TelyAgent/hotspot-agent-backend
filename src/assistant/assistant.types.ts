export interface AssistantChatContext {
  page: string;
  setting?: string;
  region?: string;
  event?: string;
  platformConfig?: {
    platform: string;
    regions: string[];
    trendCollectionCron?: string;
    trendEventWorkflowId?: string;
    topicCount: number;
    topics?: {
      name: string;
      enabled: boolean;
      keywordCount: number;
      accountCount: number;
    }[];
  };
}

export interface AssistantChatInput {
  message: string;
  context: AssistantChatContext;
}

export interface AssistantChatResult {
  message: string;
  proposedActions?: AssistantProposedAction[];
}

export interface AssistantModelAdapter {
  chat(input: AssistantChatInput): Promise<string | AssistantChatResult>;
}

export type AssistantToolName =
  | 'get_twitter_config'
  | 'update_twitter_config'
  | 'list_twitter_topics'
  | 'upsert_twitter_topic'
  | 'add_twitter_topic_account'
  | 'remove_twitter_topic_account'
  | 'set_twitter_trend_schedule';

export interface AssistantProposedAction {
  id: string;
  tool: AssistantToolName;
  summary: string;
  arguments: Record<string, unknown>;
  requiresConfirmation: true;
}

export interface AssistantToolExecutionInput {
  tool: AssistantToolName;
  arguments: Record<string, unknown>;
}

export interface AssistantToolExecutionResult {
  message: string;
  result?: unknown;
}
