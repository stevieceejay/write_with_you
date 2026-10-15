import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = { title: "Write With You", description: "A student workspace for planning, drafting, and understanding essays." };
export default function RootLayout({ children }: { children: ReactNode }) {
  const ready = Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  return <html lang="en"><body>{ready ? <ClerkProvider>{children}</ClerkProvider> : children}</body></html>;
}
