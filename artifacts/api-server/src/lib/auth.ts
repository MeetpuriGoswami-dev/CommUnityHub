import crypto from "node:crypto";
import type { Response } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, organizationsTable } from "@workspace/db";

const cookieName = "community_hub_session";
const configuredSecret = process.env.SESSION_SECRET || "a_very_secure_random_session_secret_for_community_hub_32chars";

if (configuredSecret.length < 32) {
  throw new Error("SESSION_SECRET must be configured with at least 32 characters.");
}

const secret: string = configuredSecret;

export type PublicUser = {
  id: number;
  organizationId: number | null;
  volunteerId: number | null;
  name: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
  isActive: boolean;
};

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => err ? reject(err) : resolve(key));
  });
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => err ? reject(err) : resolve(key));
  });
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), derived);
}

function sign(payload: string) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function setSessionCookie(res: Response, userId: number) {
  const payload = `${userId}.${Date.now()}`;
  res.cookie(cookieName, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(cookieName);
}

export function getSessionUserId(cookieHeader?: string) {
  const cookie = cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`));
  if (!cookie) return null;
  const token = decodeURIComponent(cookie.slice(cookieName.length + 1));
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const payload = `${parts[0]}.${parts[1]}`;
  if (sign(payload) !== parts[2]) return null;
  const id = Number(parts[0]);
  return Number.isFinite(id) ? id : null;
}

export function publicUser(user: typeof usersTable.$inferSelect): PublicUser {
  return {
    id: user.id,
    organizationId: user.organizationId,
    volunteerId: user.volunteerId,
    name: user.name,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    isActive: user.isActive,
  };
}

export async function getCurrentUser(cookieHeader?: string) {
  const userId = getSessionUserId(cookieHeader);
  if (!userId) return null;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || !user.isActive) return null;

  // Verify organization is active (exempt super_admin from lockout)
  if (user.role !== "super_admin" && user.organizationId) {
    const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, user.organizationId));
    if (org && !org.isActive) return null;
  }

  return user;
}

export async function isOrgActive(orgId: number | null): Promise<boolean> {
  if (!orgId) return true; // System-wide or unassigned
  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, orgId));
  return org?.isActive !== false;
}