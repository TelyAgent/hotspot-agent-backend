import { CollectionJobConfig, PlatformCollectionConfig } from './collection.types';

export interface CollectionRuntimeVariables {
  now: string;
  lastSuccessAt?: string;
}

export class CollectionVariableResolver {
  resolve(input: {
    platformConfig: PlatformCollectionConfig;
    jobConfig: CollectionJobConfig;
    runtime: CollectionRuntimeVariables;
    overrideVariables?: Record<string, unknown>;
  }): Record<string, unknown> {
    const resolved = this.resolveValue(input.jobConfig.inputTemplate, input);
    return {
      ...(resolved as Record<string, unknown>),
      ...(input.overrideVariables ?? {}),
    };
  }

  private resolveValue(value: unknown, input: {
    platformConfig: PlatformCollectionConfig;
    jobConfig: CollectionJobConfig;
    runtime: CollectionRuntimeVariables;
    overrideVariables?: Record<string, unknown>;
  }): unknown {
    if (typeof value === 'string') {
      const match = value.match(/^{{\s*([^}]+)\s*}}$/);
      return match ? this.readPath(match[1].trim(), input) : value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.resolveValue(item, input));
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, this.resolveValue(item, input)]),
      );
    }

    return value;
  }

  private readPath(path: string, input: {
    platformConfig: PlatformCollectionConfig;
    jobConfig: CollectionJobConfig;
    runtime: CollectionRuntimeVariables;
  }) {
    const roots = {
      platform: input.platformConfig,
      job: input.jobConfig,
      runtime: input.runtime,
    } as const;
    const [rootKey, ...parts] = path.split('.');
    let cursor: unknown = roots[rootKey as keyof typeof roots];

    for (const part of parts) {
      if (!cursor || typeof cursor !== 'object') {
        return undefined;
      }
      cursor = (cursor as Record<string, unknown>)[part];
    }

    return cursor;
  }
}
