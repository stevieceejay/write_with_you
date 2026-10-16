import "server-only";
import { backend } from "./app.ts";
import { AppError } from "./errors.ts";
import type { EssaySummary, Subject } from "../features/writing/types.ts";
export async function dashboardData(input: { query?: string; folder?: string } = {}) {
  try {
    const [essays, subjects] = await Promise.all([backend.listEssays({ ...input, limit: 12 }), backend.listSubjects()]);
    return { initialEssays: JSON.parse(JSON.stringify(essays.items)) as EssaySummary[], subjects: subjects.map(({ id, name }) => ({ id, name })) as Subject[], total: essays.total, authenticated: true };
  } catch (error) {
    const unavailable = !(error instanceof AppError) || !["UNAUTHENTICATED", "UNAVAILABLE"].includes(error.code);
    return { initialEssays: [] as EssaySummary[], subjects: [] as Subject[], total: 0, authenticated: false,
      ...(unavailable ? { loadError: "We couldn’t load your writing space. Please try again shortly." } : {}) };
  }
}
