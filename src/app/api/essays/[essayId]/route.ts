import { backend } from "../../../../server/app.ts";
import { respond } from "../../../../server/transport.ts";
import { readJSON, sameOrigin } from "../../../../server/http-input.ts";
import { object } from "../../../../server/validation.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ essayId: string }> };
export async function GET(_request: Request, context: Context) {
  return respond(async () => backend.getEssay(await context.params));
}
export async function PATCH(request: Request, context: Context) {
  return respond(async () => {
    sameOrigin(request);
    const input = object(await readJSON(request), ["title", "subjectId", "workflowStage"]);
    return backend.updateEssay({ ...input, ...await context.params });
  });
}
export async function DELETE(request: Request, context: Context) {
  return respond(async () => { sameOrigin(request); return backend.trashEssay(await context.params); });
}
