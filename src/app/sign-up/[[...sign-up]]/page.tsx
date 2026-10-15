import { SignUp } from "@clerk/nextjs";
export const dynamic = "force-dynamic";
export default function SignUpPage() {
  return <main className="flex min-h-screen items-center justify-center p-6">{process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" /> : <p>Account creation is temporarily unavailable. Please try again later.</p>}</main>;
}
