import { AppError } from "./errors.ts";
import type { EssaySummary, Subject } from "../features/writing/types.ts";

type Input = { query?: string; folder?: string };
type Dependencies = {
  signedIn: () => Promise<boolean>;
  listEssays: (input: Input & { limit: number }) => Promise<{ items: unknown[]; total: number }>;
  listSubjects: () => Promise<Subject[]>;
  reportError?: (error: unknown) => void;
};
type DashboardData = { initialEssays: EssaySummary[]; subjects: Subject[]; total: number; authenticated: boolean; loadError?: string };
const empty = (): DashboardData => ({ initialEssays: [], subjects: [], total: 0, authenticated: false });

export async function loadDashboard(input: Input, dependencies: Dependencies): Promise<DashboardData> {
  let signedIn: boolean;
  try { signedIn = await dependencies.signedIn(); }
  catch (error) {
    dependencies.reportError?.(error);
    return { ...empty(), loadError: "We couldn’t check your sign-in session. Please reload and try again." };
  }
  if (!signedIn) return empty();
  try {
    const [essays, subjects] = await Promise.all([dependencies.listEssays({ ...input, limit: 12 }), dependencies.listSubjects()]);
    return { initialEssays: JSON.parse(JSON.stringify(essays.items)) as EssaySummary[], subjects: subjects.map(({ id, name }) => ({ id, name })), total: essays.total, authenticated: true };
  } catch (error) {
    dependencies.reportError?.(error);
    if (error instanceof AppError && error.code === "UNAUTHENTICATED") return { ...empty(), loadError: "Your session ended. Please sign in again." };
    return { ...empty(), authenticated: true,
      loadError: error instanceof AppError && error.code === "FORBIDDEN" ? error.message : "You are signed in, but we couldn’t load your essays. Please try again shortly." };
  }
}
