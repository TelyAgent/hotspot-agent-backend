import { Body, Controller, Post } from '@nestjs/common';
import { AssistantService } from './assistant.service';
import { AssistantChatInput, AssistantToolExecutionInput } from './assistant.types';

@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Post('chat')
  async chat(@Body() body: AssistantChatInput) {
    return this.assistantService.chat(body);
  }

  @Post('tool-executions')
  async executeTool(@Body() body: AssistantToolExecutionInput) {
    return this.assistantService.executeTool(body);
  }
}
