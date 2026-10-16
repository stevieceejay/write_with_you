import "server-only";
import { auth } from "@clerk/nextjs/server";
import { backend } from "./app.ts";
import { loadDashboard } from "./dashboard-loader.ts";
import { dashboardDiagnostic } from "./error-diagnostics.ts";
export async function dashboardData(input: { query?: string; folder?: string } = {}) {
  return loadDashboard(input, {
    signedIn: async () => Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && (await auth()).userId),
    listEssays: input => backend.listEssays(input),
    listSubjects: () => backend.listSubjects(),
    // A string survives the Next.js development logger, which was recording the object as {}.
    reportError: (error, stage) => console.error(dashboardDiagnostic(error, stage)),
  });
}
