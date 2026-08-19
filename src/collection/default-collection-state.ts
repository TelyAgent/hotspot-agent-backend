import { CollectionState, PlatformCollectionConfig } from './collection.types';

const DEFAULT_TOPIC_CONFIGS = [
  {
    id: 'topic-politics-election',
    name: '政治与选举',
    enabled: true,
    keywords: [
      'election',
      'primary',
      'poll',
      'campaign',
      'candidate',
      'debate',
      'vote',
      'congress',
      'president',
      'sanction',
      'diplomacy',
      '选举',
      '民调',
      '投票',
      '国会',
      '总统',
    ],
    positiveExamples: ['候选人宣布参选或退选', '关键州民调大幅变化', '政府宣布制裁、停火、外交协议或重大政治任命'],
    negativeExamples: ['政客个人娱乐八卦', '历史政治讨论或纪念日', '没有新动作、新结果或新事实的党派口水仗'],
    action: '立即自动响应',
    accounts: ['Reuters', 'AP', 'CNNPolitics', 'POLITICO', 'axios'],
    collectionFrequency: '每 3 小时',
    workflowId: 'x-topic-circle-event-formation',
    defaultPostLimit: 3,
  },
  {
    id: 'topic-crypto-web3',
    name: 'Crypto 与 Web3',
    enabled: true,
    keywords: ['Bitcoin', 'BTC', 'Ethereum', 'ETH', 'Solana', 'stablecoin', 'DeFi', 'ETF', 'Binance', 'Coinbase', '加密货币', '稳定币', '链上'],
    positiveExamples: ['BTC/ETH 或主流资产因监管、ETF、宏观或链上事件大幅波动', '交易所、稳定币发行方或大型协议发生监管、攻击或清算事件'],
    negativeExamples: ['单个小币种无外部影响的价格喊单', 'NFT/游戏社区日常营销', '没有事实来源的暴富叙事'],
    action: '立即自动响应',
    accounts: ['CoinDesk', 'Cointelegraph', 'crypto', 'WuBlockchain', 'tier10k', 'WatcherGuru', 'lookonchain'],
    collectionFrequency: '每 3 小时',
    workflowId: 'x-topic-circle-event-formation',
    defaultPostLimit: 3,
  },
  {
    id: 'topic-ai-tech',
    name: 'AI 与科技',
    enabled: true,
    keywords: ['AI', 'LLM', 'GPT', 'Claude', 'Gemini', 'Llama', 'OpenAI', 'Anthropic', 'NVIDIA', 'GPU', 'agent', 'AGI', '人工智能', '大模型', '芯片'],
    positiveExamples: ['模型发布、能力升级、价格或 API 改动', 'AI 公司融资、并购、诉讼、监管或安全事件', '芯片供应、出口管制、数据中心或算力瓶颈'],
    negativeExamples: ['普通消费电子促销', '科幻、游戏或影视里的 AI 话题', '个人使用 AI 的技巧帖但没有行业事件'],
    action: '立即自动响应',
    accounts: ['OpenAI', 'AnthropicAI', 'GoogleDeepMind', 'MetaAI', 'huggingface', 'nvidia'],
    collectionFrequency: '每 3 小时',
    workflowId: 'x-topic-circle-event-formation',
    defaultPostLimit: 3,
  },
  {
    id: 'topic-macro-finance',
    name: '宏观经济与金融',
    enabled: true,
    keywords: ['CPI', 'PCE', 'inflation', 'jobs report', 'GDP', 'PMI', 'Fed', 'FOMC', 'rate cut', 'yield', 'Treasury', 'oil', 'gold', '通胀', '非农', '降息', '美联储'],
    positiveExamples: ['CPI、非农、GDP、PMI 等关键数据公布并影响市场预期', '央行利率决议、官员讲话或政策路径变化', '债券收益率、美元、油价、黄金或股指因宏观事件大幅波动'],
    negativeExamples: ['单家公司产品发布或普通财报解读', '个人理财建议', '没有宏观传导的个股波动'],
    action: '立即自动响应',
    accounts: ['business', 'WSJmarkets', 'markets', 'financialtimes', 'zerohedge'],
    collectionFrequency: '每 3 小时',
    workflowId: 'x-topic-circle-event-formation',
    defaultPostLimit: 3,
  },
  {
    id: 'topic-prediction-market',
    name: '预测市场行业',
    enabled: true,
    keywords: ['prediction market', 'forecasting market', 'Polymarket', 'Kalshi', 'PredictIt', 'Manifold', 'Metaculus', 'odds', 'probability', 'CFTC', '预测市场', '概率', '赔率'],
    positiveExamples: ['预测市场平台融资、上线新产品、监管许可或执法', '重大市场结算、争议、操纵或诚信问题', '某类市场交易量、流动性或概率出现行业级异动'],
    negativeExamples: ['平台账号发布的普通体育、政治、Crypto 或宏观预测题本身', '单个市场的日常概率小幅变化', '用户晒单或营销活动'],
    action: '立即自动响应',
    accounts: ['Polymarket', 'Kalshi', 'PredictIt', 'ManifoldMarkets', 'metaculus'],
    collectionFrequency: '每 3 小时',
    workflowId: 'x-topic-circle-event-formation',
    defaultPostLimit: 3,
  },
];

export function createDefaultCollectionState(): CollectionState {
  return {
    platformConfigs: [
      {
        id: 'x-default',
        platform: 'x',
        connectorId: 'x-twitterapi-io',
        displayName: 'X / twitterapi.io',
        enabled: true,
        defaultTimezone: 'Asia/Shanghai',
        defaultRegions: ['global', 'United States', 'United Kingdom', 'Japan', 'Korea'],
        variables: {
          regions: ['global', 'United States', 'United Kingdom', 'Japan', 'Korea'],
          regionWoeids: {
            global: 1,
            'United States': 23424977,
            'United Kingdom': 23424975,
            Japan: 23424856,
            Korea: 23424868,
          },
          monitoredAccounts: ['tier10k', 'WatcherGuru', 'lookonchain'],
          topicKeywords: ['OpenAI', 'Bitcoin'],
          topicNegativeKeywords: ['scam'],
          topicConfigs: DEFAULT_TOPIC_CONFIGS,
          trendCollectionCron: '0 */2 * * *',
          trendEventWorkflowId: 'x-trend-event-formation',
          defaultTrendLimit: 50,
          defaultPostLimit: 3,
        },
      },
    ],
    jobConfigs: [
      {
        id: 'x-trending-default',
        platform: 'x',
        name: 'X 目标地区热搜榜',
        toolName: 'x.getTrending',
        sourceType: 'trend',
        enabled: true,
        schedule: { type: 'cron', value: '0 */2 * * *' },
        inputTemplate: {
          regions: '{{platform.variables.regions}}',
          regionWoeids: '{{platform.variables.regionWoeids}}',
          limit: '{{platform.variables.defaultTrendLimit}}',
        },
        variableRefs: [
          'platform.variables.regions',
          'platform.variables.regionWoeids',
          'platform.variables.defaultTrendLimit',
        ],
        outputTarget: {
          platformTables: ['x_trend_snapshot', 'x_trend_snapshot_item'],
          emitSignal: true,
          emitSnapshot: true,
          emitSnapshotDiff: true,
        },
      },
    ],
  };
}

export function mergePlatformCollectionConfigDefaults(
  existing: PlatformCollectionConfig,
  defaults: PlatformCollectionConfig,
): PlatformCollectionConfig {
  const defaultRegions = mergeUnique(existing.defaultRegions, defaults.defaultRegions);
  const variableRegions = mergeUnique(existing.variables.regions ?? [], defaults.variables.regions ?? []);

  return {
    ...existing,
    defaultRegions,
    variables: {
      ...defaults.variables,
      ...existing.variables,
      regions: variableRegions,
      regionWoeids: {
        ...(defaults.variables.regionWoeids ?? {}),
        ...(existing.variables.regionWoeids ?? {}),
      },
    },
  };
}

function mergeUnique(left: string[], right: string[]) {
  return Array.from(new Set([...left, ...right]));
}
