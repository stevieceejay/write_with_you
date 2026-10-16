import Link from "next/link";
import { Workspace } from "../../../features/writing/workspace.tsx";
import { Shell } from "../../../components/shell.tsx";
import type { AIRequest, Essay, Mode, Planning, Subject, VersionSummary } from "../../../features/writing/types.ts";
import { redirect, notFound } from "next/navigation";
import { backend } from "../../../server/app.ts";
import { AppError, publicError } from "../../../server/errors.ts";

export const dynamic = "force-dynamic";
export default async function EssayPage({ params, searchParams }: { params: Promise<{ essayId: string }>; searchParams: Promise<{ mode?: string }> }) {
  const coordinates = await params;
  let data;
  try {
    const [essay, planning, subjects, versions, requests] = await Promise.all([backend.getEssay(coordinates), backend.getPlanning(coordinates), backend.listSubjects(), backend.listVersions(coordinates), backend.listAI(coordinates)]);
    data = JSON.parse(JSON.stringify({ essay, planning, subjects, versions, requests })) as { essay: Essay; planning: Planning; subjects: Subject[]; versions: VersionSummary[]; requests: AIRequest[] };
  }
  catch (error) {
    if (error instanceof AppError && error.code === "UNAUTHENTICATED") redirect("/sign-in");
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    return <Shell><div className="error-state"><h1>Your writing space needs a moment.</h1><p role="status">{publicError(error).message}</p><Link className="button button-dark" href="/essays">Back to your essays</Link></div></Shell>;
  }
  if (!data.essay.versions[0]) notFound();
  const requested = (await searchParams).mode;
  const initialMode: Mode = requested && ["plan", "draft", "revise", "review", "explain"].includes(requested) ? requested as Mode : "plan";
  return <Workspace key={data.essay.id} {...data} initialMode={initialMode}/>;
}
