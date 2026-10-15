import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { fail } from "./errors.ts";

const globalDatabase = globalThis as unknown as { essayDatabase?: PrismaClient };
export function getDatabase(): PrismaClient {
  if (globalDatabase.essayDatabase) return globalDatabase.essayDatabase;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || connectionString.includes("YOUR_")) fail("UNAVAILABLE", "Database connection is not configured.");
  const adapter = new PrismaPg({ connectionString, max: 5, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000 });
  const client = new PrismaClient({ adapter });
  globalDatabase.essayDatabase = client;
  return client;
}
