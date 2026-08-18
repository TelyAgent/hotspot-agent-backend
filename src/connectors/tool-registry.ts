export interface RuntimeTool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  invoke(input: TInput): Promise<TOutput>;
}

export class ToolRegistry {
  private readonly tools = new Map<string, RuntimeTool>();

  register(tool: RuntimeTool): void {
    this.tools.set(tool.name, tool);
  }

  async invoke<TOutput = unknown>(name: string, input: unknown): Promise<TOutput> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not registered: ${name}`);
    }

    return tool.invoke(input) as Promise<TOutput>;
  }
}
