import "server-only";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { errorStatus, publicError } from "./errors.ts";

export async function action<T>(operation: () => Promise<T>) {
  try {
    const data = await operation();
    revalidatePath("/essays", "layout");
    return { ok: true as const, data };
  } catch (error) { return { ok: false as const, error: { ...publicError(error), requestId: randomUUID() } }; }
}

export async function respond(operation: () => Promise<unknown>, status = 200) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" };
  try { return Response.json({ ok: true, data: await operation() }, { status, headers }); }
  catch (error) {
    const safe = publicError(error), requestId = randomUUID();
    if (safe.code === "INTERNAL_ERROR") console.error("backend_error", { requestId, code: safe.code });
    return Response.json({ ok: false, error: { ...safe, requestId } }, { status: errorStatus[safe.code], headers });
  }
}
