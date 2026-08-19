export interface DefaultTopicCircleConfig {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  positiveExamples: string[];
  negativeExamples: string[];
  accounts: string[];
}

export const TOPIC_CIRCLE_RULE_VERSION = 'topic-circle-radar-v1.2';
export const TOPIC_CIRCLE_WORKFLOW_ID = 'topic-circle-event-formation';

export const DEFAULT_TOPIC_CIRCLES: DefaultTopicCircleConfig[] = [
  {
    id: 'topic-politics-election',
    name: '政治与选举',
    description: '英语世界政治、美国选举与全球重大政治事件。',
    keywords: [
      'election',
      'primary',
      'poll',
      'campaign',
      'candidate',
      'debate',
      'ballot',
      'vote',
      'voter',
      'turnout',
      'polling',
      'congress',
      'senate',
      'house',
      'parliament',
      'president',
      'prime minister',
      'administration',
      'policy',
      'bill',
      'law',
      'court ruling',
      'sanction',
      'diplomacy',
      'war',
      'ceasefire',
      'protest',
      'impeachment',
      'indictment',
      'referendum',
      '民主党',
      '共和党',
      '选举',
      '民调',
      '投票',
      '国会',
      '总统',
      '内阁',
      '制裁',
      '外交',
    ],
    positiveExamples: ['候选人宣布参选或退选', '关键州民调大幅变化', '国会通过或阻止重大法案', '最高法院或选举机构作出影响选举/政策的裁决', '政府宣布制裁、停火、外交协议或重大政治任命'],
    negativeExamples: ['政客个人娱乐八卦', '无政策或选举含义的名人争议', '历史政治讨论或纪念日', '泛泛的党派口水仗但没有新动作、新结果或新事实'],
    accounts: ['@Reuters', '@AP', '@CNNPolitics', '@POLITICO', '@axios', '@thehill', '@nprpolitics', '@BBCWorld', '@DecisionDeskHQ', '@NateSilver538'],
  },
  {
    id: 'topic-crypto-web3',
    name: 'Crypto 与 Web3',
    description: '主流加密资产、交易所、稳定币、DeFi、监管和链上安全事件。',
    keywords: ['Bitcoin', 'BTC', 'Ethereum', 'ETH', 'Solana', 'stablecoin', 'USDT', 'USDC', 'DeFi', 'DEX', 'CEX', 'ETF', 'token', 'airdrop', 'staking', 'restaking', 'L2', 'rollup', 'wallet', 'bridge', 'hack', 'exploit', 'rug pull', 'liquidation', 'mining', 'halving', 'SEC', 'CFTC', 'MiCA', 'Binance', 'Coinbase', 'Tether', 'Circle', '加密货币', '稳定币', '链上', '交易所', '黑客', '清算', '代币', '空投'],
    positiveExamples: ['BTC/ETH 或主流资产因监管、ETF、宏观或链上事件大幅波动', '交易所、稳定币发行方或大型协议发生监管、融资、上线、宕机、攻击或清算事件', '重要链上地址、协议收入、TVL、桥或钱包安全事件引发讨论'],
    negativeExamples: ['单个小币种无外部影响的价格喊单', 'NFT/游戏社区日常营销', '没有事实来源的暴富叙事', '普通金融市场新闻中仅顺带提到 crypto'],
    accounts: ['@CoinDesk', '@Cointelegraph', '@crypto', '@WuBlockchain', '@tier10k', '@WatcherGuru', '@lookonchain', '@BitcoinMagazine', '@DecryptMedia', '@DefiLlama'],
  },
  {
    id: 'topic-ai-tech',
    name: 'AI 与科技',
    description: 'AI 模型、科技平台、芯片算力、监管、安全和产品事件。',
    keywords: ['AI', 'artificial intelligence', 'LLM', 'model', 'GPT', 'Claude', 'Gemini', 'Llama', 'DeepMind', 'OpenAI', 'Anthropic', 'Meta AI', 'Hugging Face', 'NVIDIA', 'GPU', 'chip', 'semiconductor', 'robotics', 'agent', 'AGI', 'safety', 'alignment', 'benchmark', 'release', 'API', 'lawsuit', 'antitrust', 'privacy', 'cybersecurity', 'AI regulation', '人工智能', '大模型', '芯片', '算力', '机器人', '智能体', '安全', '对齐', '开源模型'],
    positiveExamples: ['模型发布、能力升级、价格或 API 改动', 'AI 公司融资、并购、诉讼、监管或安全事件', '芯片供应、出口管制、数据中心或算力瓶颈', '大型平台推出 AI 产品或撤回 AI 功能'],
    negativeExamples: ['普通消费电子促销', '泛科技公司股价波动但无 AI/科技产品事实', '科幻、游戏或影视里的 AI 话题', '个人使用 AI 的技巧帖但没有行业事件'],
    accounts: ['@OpenAI', '@AnthropicAI', '@GoogleDeepMind', '@AIatMeta', '@huggingface', '@AndrewYNg', '@karpathy', '@TechCrunch', '@verge', '@WIRED'],
  },
  {
    id: 'topic-macro-finance',
    name: '宏观经济与金融',
    description: '宏观数据、央行政策、市场价格、贸易和系统性金融风险。',
    keywords: ['CPI', 'PCE', 'inflation', 'jobs report', 'nonfarm payrolls', 'unemployment', 'GDP', 'PMI', 'retail sales', 'Fed', 'FOMC', 'rate cut', 'rate hike', 'yield', 'Treasury', 'bond', 'dollar', 'oil', 'gold', 'stocks', 'market crash', 'recession', 'tariff', 'trade', 'central bank', 'ECB', 'BOJ', 'BOE', 'earnings', 'banking crisis', '通胀', '非农', '失业率', '降息', '加息', '美联储', '央行', '国债', '收益率', '美元', '黄金', '油价', '衰退', '关税'],
    positiveExamples: ['CPI、非农、GDP、PMI 等关键数据公布并影响市场预期', '央行利率决议、官员讲话或政策路径变化', '债券收益率、美元、油价、黄金或股指因宏观事件大幅波动', '银行、主权债务或贸易政策出现系统性风险信号'],
    negativeExamples: ['单家公司产品发布或普通财报解读', '个人理财建议', '没有宏观传导的个股波动', '体育、娱乐或地缘新闻中没有市场/政策影响的信息'],
    accounts: ['@business', '@ReutersBiz', '@CNBC', '@FinancialTimes', '@WSJ', '@TheEconomist', '@federalreserve', '@BLS_gov', '@KobeissiLetter', '@DeItaone'],
  },
  {
    id: 'topic-prediction-market',
    name: '预测市场行业',
    description: '预测市场平台、产品、监管、结算、流动性、概率异动和行业竞争。',
    keywords: ['prediction market', 'forecasting market', 'Polymarket', 'Kalshi', 'PredictIt', 'Manifold', 'Metaculus', 'odds', 'probability', 'market resolution', 'settlement', 'oracle', 'dispute', 'CFTC', 'regulation', 'election market', 'sports market', 'volume', 'open interest', 'liquidity', 'trader', 'forecast', 'probability shift', '预测市场', '概率', '赔率', '结算', '争议', '预言机', '监管', '交易量', '流动性', '概率异动'],
    positiveExamples: ['预测市场平台融资、上线新产品、监管许可或执法', '重大市场结算、争议、操纵或诚信问题', '某类市场交易量、流动性或概率出现行业级异动', '平台之间竞争、合作、收购或政策变化'],
    negativeExamples: ['平台账号发布的普通体育、政治、Crypto 或宏观预测题本身', '单个市场的日常概率小幅变化', '用户晒单或营销活动', '与预测市场机制、平台、监管或行业无关的普通新闻'],
    accounts: ['@Polymarket', '@Kalshi', '@PolymarketIntel', '@OpinionLabsXYZ', '@MyriadMarkets', '@PredictIt', '@ZeitgeistPM', '@PredictInsights', '@ManifoldMarkets', '@metaculus'],
  },
];
