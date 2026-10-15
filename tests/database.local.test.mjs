import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { after } from 'node:test';
import { registerDatabaseContract } from './helpers/database-contract.mjs';

// A fresh in-memory PostgreSQL WASM engine: no Neon or persistent data is touched.
const database = new PGlite();
for (const migration of ['20261015000000_initial', '20261015000100_integrity']) {
  const sql = await readFile(new URL(`../prisma/migrations/${migration}/migration.sql`, import.meta.url), 'utf8');
  await database.exec(sql);
}
after(async () => database.close());
registerDatabaseContract(async () => ({
  async connect() {},
  async end() {},
  async query(sql, parameters) {
    const result = await database.query(sql, parameters);
    return { ...result, rowCount: result.affectedRows };
  },
}));
