import { SignIn } from "@clerk/nextjs";
export const dynamic = "force-dynamic";
export default function SignInPage() {
  return <main className="flex min-h-screen items-center justify-center p-6">{process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" /> : <p>Sign-in is temporarily unavailable. Please try again later.</p>}</main>;
}
