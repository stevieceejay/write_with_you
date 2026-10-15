import './load-env.mjs';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString || connectionString.includes('YOUR_')) {
  throw new Error('Set a real development DATABASE_URL in .env first.');
}

const url = new URL(connectionString);
if (!['postgresql:', 'postgres:'].includes(url.protocol)) {
  throw new Error('DATABASE_URL must be a PostgreSQL connection string.');
}
const schema = url.searchParams.get('schema') ?? 'public';
if (schema !== 'public') {
  throw new Error('This initial migration targets the public schema. Use a dedicated empty database.');
}
const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10_000 });
try {
  await client.connect();
  const { rows: tables } = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
  );
  const { rows: [{ initialized }] } = await client.query(
    `SELECT to_regclass('public."_prisma_migrations"') IS NOT NULL AS initialized`
  );
  const applicationTables = tables.filter(t => t.table_name !== '_prisma_migrations');
  if (applicationTables.length && !initialized) {
    throw new Error('Refusing to initialize a non-empty, unmanaged database. Select a new empty development database.');
  }
  if (initialized) {
    const { rows: history } = await client.query(
      `SELECT migration_name FROM public."_prisma_migrations"
       WHERE migration_name = $1 AND rolled_back_at IS NULL`,
      ['20261015000000_initial']
    );
    if (!history.length) {
      throw new Error('This database has unrelated Prisma migration history. Select a dedicated database.');
    }
  }
  const { rows: [{ database }] } = await client.query('SELECT current_database() AS database');
  console.log(`Database preflight passed: ${database}; ${applicationTables.length} application tables. Credentials omitted.`);
} catch (error) {
  const codes = new Set();
  function collectCodes(failure) {
    if (failure?.code) codes.add(String(failure.code));
    if (Array.isArray(failure?.errors)) failure.errors.forEach(collectCodes);
  }
  collectCodes(error);
  let message = String(error.message || 'Connection could not be established.').replaceAll(connectionString, '[DATABASE_URL]');
  for (const password of [url.password, decodeURIComponent(url.password)]) {
    if (password) message = message.replaceAll(password, '[REDACTED]');
  }
  console.error(`Database preflight failed${codes.size ? ` (${[...codes].join(', ')})` : ''}: ${message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
