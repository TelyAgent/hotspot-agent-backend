import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Client } from 'pg';

const execFileAsync = promisify(execFile);

export function getDatabaseUrl() {
  return process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/hotspot_agent_v2';
}

export function getDatabaseName(connectionString: string) {
  const url = new URL(connectionString);
  const name = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!name) {
    throw new Error('DATABASE_URL must include a database name');
  }
  return name;
}

export function getMaintenanceConnectionString(connectionString: string) {
  const url = new URL(connectionString);
  url.pathname = '/postgres';
  return url.toString();
}

export function quotePostgresIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export async function ensureDatabaseExists(connectionString = getDatabaseUrl()) {
  const databaseName = getDatabaseName(connectionString);
  const client = new Client({ connectionString: getMaintenanceConnectionString(connectionString) });
  await client.connect();

  try {
    const result = await client.query<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS "exists"',
      [databaseName],
    );
    if (result.rows[0]?.exists) {
      return { created: false, databaseName };
    }
    await client.query(`CREATE DATABASE ${quotePostgresIdentifier(databaseName)}`);
    return { created: true, databaseName };
  } finally {
    await client.end();
  }
}

export async function pushDatabaseSchema() {
  const prismaBin = resolve(process.cwd(), 'node_modules/.bin/prisma');
  await execFileAsync(prismaBin, ['db', 'push'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: getDatabaseUrl(),
    },
  });
}
