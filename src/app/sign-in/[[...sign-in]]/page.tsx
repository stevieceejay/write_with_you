import { SignIn } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthScreen } from "../../../components/auth-screen.tsx";
export const dynamic = "force-dynamic";
export default async function SignInPage() {
  if (process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && (await auth()).userId) redirect("/essays");
  return <AuthScreen>{process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? <SignIn /> : <div className="auth-unavailable"><h2>Your writing space is taking shape.</h2><p role="status">Sign-in is temporarily unavailable. Please try again later.</p><Link href="/" className="button button-dark">Back to the studio</Link></div>}</AuthScreen>;
}
