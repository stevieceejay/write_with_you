import "server-only";
import { auth } from "@clerk/nextjs/server";
import { backend } from "./app.ts";
import { loadDashboard } from "./dashboard-loader.ts";
export async function dashboardData(input: { query?: string; folder?: string } = {}) {
  return loadDashboard(input, {
    signedIn: async () => Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && (await auth()).userId),
    listEssays: input => backend.listEssays(input),
    listSubjects: () => backend.listSubjects(),
    reportError: error => {
      const candidate = error && typeof error === "object" && "code" in error ? String(error.code) : "UNKNOWN";
      console.error("dashboard_load_failed", { code: /^[A-Z0-9_]{1,40}$/.test(candidate) ? candidate : "UNKNOWN" });
    },
  });
}
