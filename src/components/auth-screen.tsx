import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./icon.tsx";
export function AuthScreen({ children }: { children: ReactNode }) { return <main className="auth-page"><section className="auth-intro"><Link className="brand" href="/"><span className="brand-mark"><Icon name="pen" size={23}/></span><span>write<span className="brand-light">with</span>you.</span></Link><p className="eyebrow">YOUR IDEAS DESERVE A LITTLE ROOM</p><h1>Every great essay<br/>starts with you.</h1><p>A place to think out loud, connect the dots, and find the words that sound like your own.</p></section><section className="auth-content">{children}</section></main>; }
