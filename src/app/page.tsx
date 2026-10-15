import Link from "next/link";

export default function Home() {
  return <main className="mx-auto max-w-4xl px-6 py-20">
    <p className="mb-6 text-sm font-semibold uppercase tracking-widest">Write With You</p>
    <h1 className="max-w-2xl font-serif text-5xl leading-tight">Your ideas deserve room to grow.</h1>
    <p className="my-6 max-w-xl text-lg leading-relaxed">A writing workspace for turning a question into an outline, a draft, and an essay you understand.</p>
    <div className="my-10 flex gap-6"><Link href="/essays">Open your essays</Link><Link href="/sign-in">Sign in</Link><Link href="/sign-up">Create an account</Link></div>
    <ol className="grid gap-4 sm:grid-cols-3">{["Plan", "Draft", "Revise", "Review", "Explain", "Folder"].map((mode, index) => <li key={mode} className="rounded-xl border border-stone-300 bg-white p-5"><span className="mr-3 text-sm text-stone-500">0{index + 1}</span>{mode}</li>)}</ol>
  </main>;
}
