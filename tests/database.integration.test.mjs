import pg from 'pg';
import { registerDatabaseContract } from './helpers/database-contract.mjs';

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('YOUR_')) {
  throw new Error('Set a real development DATABASE_URL before running integration tests.');
}

registerDatabaseContract(async () => new pg.Client({
  connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
  connectionTimeoutMillis: 10_000,
}));
