import { fail } from "./errors.ts";

export async function readJSON(request: Request, limit = 1_000_000): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") fail("VALIDATION_ERROR", "Content-Type must be application/json.");
  const length = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(length) || length < 0 || length > limit) fail("VALIDATION_ERROR", "Request body is too large.");
  const reader = request.body?.getReader();
  if (!reader) fail("VALIDATION_ERROR", "A JSON body is required.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); fail("VALIDATION_ERROR", "Request body is too large."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail("VALIDATION_ERROR", "Request contains invalid JSON."); }
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = process.env.APP_URL ? new URL(process.env.APP_URL).origin : new URL(request.url).origin;
  if ((origin && origin !== expected) || request.headers.get("sec-fetch-site") === "cross-site") fail("FORBIDDEN", "Cross-site writes are not allowed.");
}
