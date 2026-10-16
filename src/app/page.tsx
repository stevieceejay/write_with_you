import { Dashboard } from "../features/dashboard/dashboard.tsx";
import { dashboardData } from "../server/frontend-data.ts";
export const dynamic = "force-dynamic";
export default async function Home() { return <Dashboard {...await dashboardData()}/>; }
