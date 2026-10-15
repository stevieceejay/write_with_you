import { backend } from "../../../server/app.ts";
import { respond } from "../../../server/transport.ts";
import { readJSON, sameOrigin } from "../../../server/http-input.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return respond(async () => {
    const input: Record<string, unknown> = Object.fromEntries(new URL(request.url).searchParams);
    for (const key of ["page", "limit"]) if (input[key] !== undefined) input[key] = Number(input[key]);
    return backend.listEssays(input);
  });
}
export async function POST(request: Request) {
  return respond(async () => { sameOrigin(request); return backend.createEssay(await readJSON(request)); }, 201);
}
