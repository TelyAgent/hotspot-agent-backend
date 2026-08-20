import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const schema = JSON.parse(
  readFileSync(join(process.cwd(), 'workflows/topic-circle/event-formation/output.schema.json'), 'utf8'),
) as unknown;

describe('Topic circle event formation output schema', () => {
  it('declares object types for every object schema node', () => {
    const missingTypePaths = [
      ...collectObjectSchemasWithoutType(schema),
      ...collectEmptyPropertySchemas(schema),
      ...collectObjectSchemasWithMissingRequiredProperties(schema),
    ];

    expect(missingTypePaths).toEqual([]);
  });
});

function collectObjectSchemasWithoutType(value: unknown, path = '$'): string[] {
  if (!value || typeof value !== 'object') {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectObjectSchemasWithoutType(item, `${path}[${index}]`));
  }

  const record = value as Record<string, unknown>;
  const isObjectSchema =
    'properties' in record ||
    'additionalProperties' in record ||
    record.type === 'object';
  const current = isObjectSchema && record.type !== 'object' ? [path] : [];
  return [
    ...current,
    ...Object.entries(record).flatMap(([key, item]) => collectObjectSchemasWithoutType(item, `${path}.${key}`)),
  ];
}

function collectObjectSchemasWithMissingRequiredProperties(value: unknown, path = '$'): string[] {
  if (!value || typeof value !== 'object') {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectObjectSchemasWithMissingRequiredProperties(item, `${path}[${index}]`));
  }

  const record = value as Record<string, unknown>;
  const properties = record.properties as Record<string, unknown> | undefined;
  const required = record.required;
  const current = properties && record.type === 'object'
    ? Object.keys(properties)
        .filter((key) => !Array.isArray(required) || !required.includes(key))
        .map((key) => `${path}.required missing ${key}`)
    : [];

  return [
    ...current,
    ...Object.entries(record).flatMap(([key, item]) => collectObjectSchemasWithMissingRequiredProperties(item, `${path}.${key}`)),
  ];
}

function collectEmptyPropertySchemas(value: unknown, path = '$'): string[] {
  if (!value || typeof value !== 'object') {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectEmptyPropertySchemas(item, `${path}[${index}]`));
  }

  const record = value as Record<string, unknown>;
  const emptyProperties = Object.entries((record.properties as Record<string, unknown> | undefined) ?? {})
    .filter(([, item]) => isPlainObject(item) && Object.keys(item).length === 0)
    .map(([key]) => `${path}.properties.${key}`);

  return [
    ...emptyProperties,
    ...Object.entries(record).flatMap(([key, item]) => collectEmptyPropertySchemas(item, `${path}.${key}`)),
  ];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
