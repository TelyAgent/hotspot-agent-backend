const { existsSync, readFileSync } = require('fs');
const { join } = require('path');
const { randomUUID } = require('crypto');
const { Client } = require('pg');

loadDotenv();

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/hotspot_agent_v2';
const client = new Client({ connectionString });

function loadDotenv() {
  const envPath = join(process.cwd(), '.env');
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function id(prefix) {
  return `${prefix}_${randomUUID()}`;
}

async function uniquePastCollectedAt(region, currentCollectedAt) {
  const d = new Date(currentCollectedAt);
  d.setHours(d.getHours() - 2);
  d.setSeconds(d.getSeconds() - 17);

  for (let i = 0; i < 120; i += 1) {
    const candidate = new Date(d.getTime() - i * 1000);
    const exists = await client.query(
      'select 1 from x_trend_snapshot where region = $1 and "collectedAt" = $2 limit 1',
      [region, candidate],
    );
    if (exists.rowCount === 0) return candidate;
  }

  throw new Error(`Cannot find a unique synthetic collectedAt for ${region}`);
}

async function main() {
  await client.connect();
  await client.query('begin');

  const latestResult = await client.query(`
    select distinct on (region) id, region, "collectedAt"
    from source_snapshot
    where platform = 'x' and "sourceType" = 'trend'
    order by region, "collectedAt" desc
  `);

  if (latestResult.rows.length === 0) {
    throw new Error('没有找到任何 X 热搜榜当前快照，无法生成过去快照。请先至少成功采集一次。');
  }

  const summary = [];

  for (const current of latestResult.rows) {
    const itemsResult = await client.query(`
      select id, rank, title, "normalizedKey", metrics
      from source_snapshot_item
      where "sourceSnapshotId" = $1
      order by rank asc
    `, [current.id]);
    const items = itemsResult.rows;
    if (items.length === 0) continue;

    const pastCollectedAt = await uniquePastCollectedAt(current.region, current.collectedAt);
    const fetchRunId = id('run_synthetic_past');
    const xSnapshotId = id('xtrend_synthetic_past');
    const sourceSnapshotId = id('snap_synthetic_past');

    await client.query(`
      insert into source_fetch_run
        (id, platform, "connectorId", "toolName", "sourceType", status, input, "startedAt", "finishedAt", "itemCount", error)
      values
        ($1, 'x', 'synthetic-test-data', 'x.getTrending', 'trend', 'success', $2, $3, $3, $4, null)
    `, [
      fetchRunId,
      JSON.stringify({ synthetic: true, basedOnSnapshotId: current.id, purpose: 'workflow rank-up test' }),
      pastCollectedAt,
      items.length,
    ]);

    await client.query(`
      insert into x_trend_snapshot
        (id, "fetchRunId", region, "collectedAt", "itemCount", checksum, raw)
      values
        ($1, $2, $3, $4, $5, $6, $7)
    `, [
      xSnapshotId,
      fetchRunId,
      current.region,
      pastCollectedAt,
      items.length,
      `synthetic:${current.id}`,
      JSON.stringify({ synthetic: true, basedOnSnapshotId: current.id }),
    ]);

    await client.query(`
      insert into source_snapshot
        (id, platform, "platformSnapshotId", "sourceType", region, "collectedAt", "fetchRunId", "itemCount")
      values
        ($1, 'x', $2, 'trend', $3, $4, $5, $6)
    `, [
      sourceSnapshotId,
      xSnapshotId,
      current.region,
      pastCollectedAt,
      fetchRunId,
      items.length,
    ]);

    const rankUp = [];

    for (const item of items) {
      const previousRank = item.rank + 12;
      const xItemId = id('xtrend_item_synthetic_past');
      const sourceItemId = id('snap_item_synthetic_past');
      const raw = { synthetic: true, basedOnSourceSnapshotItemId: item.id };
      const metrics = item.metrics || {};

      await client.query(`
        insert into x_trend_snapshot_item
          (id, "xTrendSnapshotId", rank, name, query, url, volume, category, "normalizedKey", raw)
        values
          ($1, $2, $3, $4, $4, $5, $6, null, $7, $8)
      `, [
        xItemId,
        xSnapshotId,
        previousRank,
        item.title,
        `https://x.com/search?q=${encodeURIComponent(item.title)}`,
        metrics.volume || null,
        item.normalizedKey,
        JSON.stringify(raw),
      ]);

      await client.query(`
        insert into source_snapshot_item
          (id, "sourceSnapshotId", platform, "platformItemId", "sourceType", region, rank, title, "normalizedKey", metrics)
        values
          ($1, $2, 'x', $3, 'trend', $4, $5, $6, $7, $8)
      `, [
        sourceItemId,
        sourceSnapshotId,
        xItemId,
        current.region,
        previousRank,
        item.title,
        item.normalizedKey,
        JSON.stringify(metrics),
      ]);

      rankUp.push({
        normalizedKey: item.normalizedKey,
        name: item.title,
        previousRank,
        currentRank: item.rank,
        rankDelta: previousRank - item.rank,
      });
    }

    await client.query(`
      insert into source_snapshot_diff
        (id, platform, region, "currentSnapshotId", "previousSnapshotId", entered, exited, "rankUp", "rankDown", unchanged)
      values
        ($1, 'x', $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      id('diff_synthetic_past'),
      current.region,
      current.id,
      sourceSnapshotId,
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify(rankUp),
      JSON.stringify([]),
      JSON.stringify([]),
    ]);

    summary.push({
      region: current.region,
      currentSnapshotId: current.id,
      currentCollectedAt: current.collectedAt,
      syntheticPreviousSnapshotId: sourceSnapshotId,
      syntheticPreviousCollectedAt: pastCollectedAt.toISOString(),
      itemCount: items.length,
      rankUpCount: rankUp.length,
    });
  }

  await client.query('commit');
  console.log(JSON.stringify({ created: summary.length, snapshots: summary }, null, 2));
}

main()
  .catch(async (error) => {
    try {
      await client.query('rollback');
    } catch {
      // Ignore rollback errors.
    }
    console.error(error && (error.stack || error.message || error));
    process.exit(1);
  })
  .finally(async () => {
    try {
      await client.end();
    } catch {
      // Ignore close errors.
    }
  });
