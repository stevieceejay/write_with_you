import "server-only";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getDatabase } from "./database.ts";
import { fail } from "./errors.ts";
import type { Actor } from "./backend.ts";

export async function requireUser(): Promise<Actor> {
  if (!process.env.CLERK_SECRET_KEY || !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) fail("UNAVAILABLE", "Authentication is not configured.");
  const identity = await auth();
  if (!identity.userId) fail("UNAUTHENTICATED", "Sign in to continue.");
  const db = getDatabase();
  const existing = await db.user.findUnique({ where: { authProvider_authSubject: { authProvider: "clerk", authSubject: identity.userId } } });
  if (existing) {
    if (existing.deletionRequestedAt || !existing.emailVerifiedAt) fail("FORBIDDEN", "This account cannot access essays.");
    return { id: existing.id };
  }
  // User details come from Clerk's authenticated backend API, never a request body.
  const profile = await (await clerkClient()).users.getUser(identity.userId);
  const email = profile.emailAddresses.find(address => address.id === profile.primaryEmailAddressId);
  if (!email || email.verification?.status !== "verified") fail("FORBIDDEN", "Verify your email address before saving essays.");
  const normalized = email.emailAddress.trim().toLowerCase();
  // Never merge identities merely because an email address matches.
  try {
    const user = await db.user.upsert({
      where: { authProvider_authSubject: { authProvider: "clerk", authSubject: identity.userId } }, update: {},
      create: { authProvider: "clerk", authSubject: identity.userId, email: normalized,
        emailVerifiedAt: new Date(), displayName: [profile.firstName, profile.lastName].filter(Boolean).join(" ").slice(0, 120) || null },
    });
    if (user.deletionRequestedAt || !user.emailVerifiedAt) fail("FORBIDDEN", "This account cannot access essays.");
    return { id: user.id };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") fail("CONFLICT", "This identity needs account support before it can be linked.");
    throw error;
  }
}
