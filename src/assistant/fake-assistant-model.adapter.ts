import { AssistantChatInput, AssistantModelAdapter } from './assistant.types';

export class FakeAssistantModelAdapter implements AssistantModelAdapter {
  async chat(input: AssistantChatInput): Promise<string> {
    return `已收到：${input.message}`;
  }
}
