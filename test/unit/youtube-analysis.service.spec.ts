import { validateYoutubeAnalysisOutput } from '../../src/youtube/youtube-analysis.service';

describe('YoutubeAnalysisService output validation', () => {
  it('accepts only the three public analysis sections plus limitations', () => {
    const output = {
      main_reason: {
        topic: '视频讲述预测市场如何影响选举叙事',
        why_attractive: '它把用户熟悉的政治焦虑转成可下注、可讨论的信息差',
        traffic_judgment: '选题是主因，标题承诺和账号基本盘是放大因素',
      },
      execution: {
        key_technique: '开场直接给出冲突问题，并用字幕持续推进因果链',
        effect: '降低理解门槛，让观众快速知道为什么要继续看',
      },
      replication: {
        reusable_mechanism: '把复杂趋势包装成一个可验证的问题',
        product_remix_topic: '用产品监测预测市场变化，解释一个热点事件如何提前升温',
        product_entry: '从“人工很难持续盯盘”这个问题自然进入产品能力',
      },
      limitations: ['仅基于字幕和公开指标，未使用画面、音频、留存或流量来源数据'],
    };

    expect(validateYoutubeAnalysisOutput(output).success).toBe(true);
  });

  it('rejects hidden intermediate reasoning fields', () => {
    const output = {
      main_reason: {
        topic: 'A',
        why_attractive: 'B',
        traffic_judgment: 'C',
      },
      execution: {
        key_technique: 'D',
        effect: 'E',
      },
      replication: {
        reusable_mechanism: 'F',
        product_remix_topic: 'G',
        product_entry: 'H',
      },
      limitations: [],
      chain_of_thought: '不应该保存',
    };

    expect(validateYoutubeAnalysisOutput(output).success).toBe(false);
  });

  it('rejects analysis output that is not written in Chinese', () => {
    const output = {
      main_reason: {
        topic: 'The video explains a market trend.',
        why_attractive: 'It is timely and surprising.',
        traffic_judgment: 'Topic is the main driver.',
      },
      execution: {
        key_technique: 'Clear opening hook.',
        effect: 'It helps retention.',
      },
      replication: {
        reusable_mechanism: 'Frame a complex trend as a simple question.',
        product_remix_topic: 'Use the product to monitor market changes.',
        product_entry: 'Introduce the product through manual monitoring pain.',
      },
      limitations: ['Transcript-only analysis.'],
    };

    expect(validateYoutubeAnalysisOutput(output).success).toBe(false);
  });
});
