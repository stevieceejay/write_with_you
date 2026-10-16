import { Dashboard } from '../../features/dashboard/dashboard.tsx';
import { dashboardData } from '../../server/frontend-data.ts';
export const dynamic = 'force-dynamic';
export default async function EssaysPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = typeof params.query === 'string' ? params.query.slice(0, 200) : '';
  const folder = typeof params.folder === 'string' && ['all', 'organized', 'miscellaneous', 'trash'].includes(params.folder) ? params.folder : 'all';
  return <Dashboard key={`${folder}:${params.view}:${params.new}`} {...await dashboardData({ query, folder })} initialQuery={query} initialFolder={folder} folderView={params.view === 'folders'} initialNew={params.new === '1'}/>;
}
