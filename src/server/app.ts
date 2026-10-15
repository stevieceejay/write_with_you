import "server-only";
import { createBackend } from "./backend.ts";
import { requireUser } from "./auth.ts";
import { getDatabase } from "./database.ts";
import { openai } from "./openai.ts";

// No user identity is cached here. Every service method authenticates its request.
export const backend = createBackend({ authenticate: requireUser, database: getDatabase, ai: openai });
