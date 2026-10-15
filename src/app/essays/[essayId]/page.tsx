import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { backend } from "../../../server/app.ts";
import { AppError, publicError } from "../../../server/errors.ts";

export const dynamic = "force-dynamic";
export default async function EssayPage({ params }: { params: Promise<{ essayId: string }> }) {
  let essay;
  try { essay = await backend.getEssay(await params); }
  catch (error) {
    if (error instanceof AppError && error.code === "UNAUTHENTICATED") redirect("/sign-in");
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    return <main className="p-8"><p role="status">{publicError(error).message}</p><Link href="/essays">Your essays</Link></main>;
  }
  const version = essay.versions[0];
  return <main className="mx-auto max-w-3xl p-8"><Link href="/essays">Your essays</Link><h1 className="my-8 text-4xl">{essay.title}</h1>
    <p>{version?.topic ?? "Start by choosing a topic for your essay."}</p>
    {version?.plainText && <article className="mt-8 whitespace-pre-wrap rounded bg-white p-8 leading-relaxed">{version.plainText}</article>}
  </main>;
}
