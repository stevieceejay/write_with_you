import { backend } from "../../../../../server/app.ts";
import { respond } from "../../../../../server/transport.ts";
import { readJSON, sameOrigin } from "../../../../../server/http-input.ts";
import { fail } from "../../../../../server/errors.ts";
import { storeEssayExport } from "../../../../../server/storage.ts";
import { analyzeText } from "../../../../../server/neon-functions.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Context = { params: Promise<{ essayId: string; operation: string }> };
const writes: Record<string, (input: unknown) => Promise<unknown>> = {
  draft: backend.saveDraft, formatting: backend.saveFormatting, settings: backend.saveSettings,
  outline: backend.saveOutline, planning: backend.answerPlanning, snapshot: backend.createSnapshot,
  "restore-snapshot": backend.restoreSnapshot, restore: backend.restoreEssay,
  annotations: backend.updateAnnotation, sources: backend.saveSource, evidence: backend.citeSource,
  ai: backend.requestAI, proposal: backend.resolveProposal,
};

export async function GET(request: Request, context: Context) {
  return respond(async () => {
    const { essayId, operation } = await context.params;
    if (operation === "planning") return backend.getPlanning({ essayId });
    if (operation === "ai") return backend.listAI({ essayId });
    if (operation === "versions") {
      const versionId = new URL(request.url).searchParams.get("versionId");
      return versionId ? backend.getVersion({ essayId, versionId }) : backend.listVersions({ essayId });
    }
    fail("NOT_FOUND", "Endpoint not found.");
  });
}
export async function POST(request: Request, context: Context) {
  return respond(async () => {
    sameOrigin(request);
    const { essayId, operation } = await context.params;
    const raw = await readJSON(request);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("VALIDATION_ERROR", "Expected an object.");
    const input = { ...raw, essayId };
    if (operation === "export") return storeEssayExport(await backend.exportData(input));
    if (operation === "analyze") return analyzeText((await backend.exportData(input)).text);
    if (!Object.hasOwn(writes, operation)) fail("NOT_FOUND", "Endpoint not found.");
    return writes[operation](input);
  });
}
