import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { WorkflowDefinitionRecord, WorkflowStatus, WorkflowType } from './workflow.types';

export interface LoadedWorkflow {
  definition: WorkflowDefinitionRecord;
  markdown: string;
  outputSchema: unknown;
}

export class WorkflowLoader {
  constructor(private readonly rootDir = process.cwd()) {}

  async load(workflowId: string, groupPath = 'event-formation'): Promise<LoadedWorkflow> {
    const basePath = join(this.rootDir, 'workflows', groupPath, workflowId);
    const markdownPath = join(basePath, 'WORKFLOW.md');
    const outputSchemaPath = join(basePath, 'output.schema.json');
    const markdown = await readFile(markdownPath, 'utf8');
    const outputSchema = JSON.parse(await readFile(outputSchemaPath, 'utf8')) as unknown;
    const frontmatter = this.parseFrontmatter(markdown);
    const checksum = createHash('sha256').update(markdown).update(JSON.stringify(outputSchema)).digest('hex');
    const now = new Date().toISOString();

    return {
      definition: {
        id: `wdef_${randomUUID()}`,
        workflowId: String(frontmatter.id),
        name: String(frontmatter.name),
        type: frontmatter.type as WorkflowType,
        version: String(frontmatter.version),
        status: frontmatter.status as WorkflowStatus,
        markdownPath: `workflows/${groupPath}/${workflowId}/WORKFLOW.md`,
        outputSchemaPath: `workflows/${groupPath}/${workflowId}/output.schema.json`,
        checksum,
        createdAt: now,
        updatedAt: now,
      },
      markdown,
      outputSchema,
    };
  }

  private parseFrontmatter(markdown: string): Record<string, string> {
    const match = markdown.match(/^---\n([\s\S]*?)\n---/);
    if (!match) {
      throw new Error('Workflow markdown must include frontmatter');
    }

    return Object.fromEntries(
      match[1]
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const index = line.indexOf(':');
          if (index === -1) {
            throw new Error(`Invalid frontmatter line: ${line}`);
          }
          return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
        }),
    );
  }
}
