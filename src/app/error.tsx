"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="error-state"><p className="eyebrow">LET’S TRY THAT AGAIN</p><h1>Your writing space needs a moment.</h1><p>We couldn’t load this page. Try again or return to your essays.</p><div className="workspace-actions"><button className="button button-dark" onClick={reset}>Try again</button><Link href="/essays" className="button button-quiet">Your essays</Link></div></main>; }
