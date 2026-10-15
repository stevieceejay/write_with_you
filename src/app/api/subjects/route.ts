import { backend } from "../../../server/app.ts";
import { respond } from "../../../server/transport.ts";
import { readJSON, sameOrigin } from "../../../server/http-input.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() { return respond(() => backend.listSubjects()); }
export async function POST(request: Request) {
  return respond(async () => { sameOrigin(request); return backend.createSubject(await readJSON(request)); }, 201);
}
export async function DELETE(request: Request) {
  return respond(async () => { sameOrigin(request); return backend.deleteSubject(await readJSON(request)); });
}
