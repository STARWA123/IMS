import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "../../db/client";
import type { AuthUser } from "./auth-types";

export const sessionCookieName = "offertrack_session";
const sessionLifetimeSeconds = 14 * 24 * 60 * 60;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}
function useSecureCookies(): boolean {
  if (process.env.OFFERTRACK_SECURE_COOKIES === "true") {
    return true;
  }
  if (process.env.OFFERTRACK_SECURE_COOKIES === "false") {
    return false;
  }
  return process.env.NODE_ENV === "production";
}

function safeUser(user: {
  id: string;
  username: string;
  displayName: string;
  role: AuthUser["role"];
  isActive: boolean;
  mustChangePassword: boolean;
}): AuthUser {
  return { ...user };
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionLifetimeSeconds * 1000);
  await db.$transaction([
    db.session.deleteMany({ where: { expiresAt: { lte: new Date() } } }),
    db.session.create({
      data: { id: hashToken(token), userId, expiresAt },
    }),
  ]);
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    secure: useSecureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: sessionLifetimeSeconds,
    priority: "high",
  });
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(sessionCookieName)?.value;
  if (!token) {
    return null;
  }
  const session = await db.session.findUnique({
    where: { id: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt <= new Date() || !session.user.isActive) {
    return null;
  }
  return safeUser(session.user);
}

export async function deleteCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (token) {
    await db.session.deleteMany({ where: { id: hashToken(token) } });
  }
  cookieStore.delete(sessionCookieName);
}
