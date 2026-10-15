import Link from "next/link";
import { redirect } from "next/navigation";
import { backend } from "../../server/app.ts";
import { AppError, publicError } from "../../server/errors.ts";
import { createEssay } from "../actions/essays.ts";

export const dynamic = "force-dynamic";
export default async function EssaysPage() {
  let result;
  try { result = await backend.listEssays({}); }
  catch (error) {
    if (error instanceof AppError && error.code === "UNAUTHENTICATED") redirect("/sign-in");
    return <main className="mx-auto max-w-3xl p-8"><h1 className="text-3xl">Your essays</h1><p className="my-6" role="status">{publicError(error).message}</p><Link href="/">Home</Link></main>;
  }
  async function create(form: FormData) {
    "use server";
    const result = await createEssay({ title: String(form.get("title") || "Untitled essay") });
    if (result.ok) redirect(`/essays/${result.data.id}`);
    redirect(`/essays?error=${encodeURIComponent(result.error.message)}`);
  }
  return <main className="mx-auto max-w-3xl p-8"><Link href="/">Write With You</Link><h1 className="my-8 text-4xl">Your essays</h1>
    <form action={create} className="mb-8 flex gap-3"><label className="flex-1">Essay title<input name="title" maxLength={300} className="mt-2 block w-full rounded border border-stone-300 bg-white p-3" /></label><button className="self-end rounded bg-emerald-900 p-3 text-white">New essay</button></form>
    <ul className="space-y-4">{result.items.map(essay => <li key={essay.id} className="rounded border border-stone-300 bg-white p-4"><Link href={`/essays/${essay.id}`}>{essay.title}</Link><p className="mt-2 text-sm">{essay.subject?.name ?? "Miscellaneous"} · {essay.updatedAt.toISOString().slice(0, 10)}</p></li>)}</ul>
    {!result.items.length && <p>Your next essay starts here.</p>}
  </main>;
}
