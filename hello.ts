import { authorized } from "./src/shared/bearer.ts";
import { textMetrics } from "./src/shared/text-metrics.ts";
import { readJSON } from "./src/server/http-input.ts";
import { object } from "./src/server/validation.ts";
import { errorStatus, publicError } from "./src/server/errors.ts";

export default async function hello(request: Request): Promise<Response> {
  if (!process.env.FUNCTION_API_KEY || process.env.FUNCTION_API_KEY.length < 32) return Response.json({ error: "Service unavailable" }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), process.env.FUNCTION_API_KEY)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: { Allow: "POST" } });
  try {
    const input = object(await readJSON(request, 250_000), ["text"]);
    if (typeof input.text !== "string" || input.text.length > 200_000 || input.text.includes("\u0000")) return Response.json({ error: "Invalid text" }, { status: 400 });
    return Response.json(textMetrics(input.text), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const safe = publicError(error);
    return Response.json({ error: safe }, { status: errorStatus[safe.code] });
  }
}
