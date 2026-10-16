import Link from "next/link";
import { Shell } from "../components/shell.tsx";
export default function NotFound() { return <Shell><div className="error-state"><p className="eyebrow">A DIFFERENT PAGE AWAITS</p><h1>We couldn’t find that essay.</h1><p>It may have moved or been deleted. Find your writing in your library.</p><Link className="button button-dark" href="/essays">Back to your essays</Link></div></Shell>; }
