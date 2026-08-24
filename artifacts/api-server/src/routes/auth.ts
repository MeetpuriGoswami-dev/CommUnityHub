import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, usersTable, volunteersTable, organizationsTable } from "@workspace/db";
import { clearSessionCookie, getCurrentUser, hashPassword, publicUser, setSessionCookie, verifyPassword } from "../lib/auth.ts";

const router: IRouter = Router();
const bootstrapAdminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

if (!bootstrapAdminPassword || bootstrapAdminPassword.length < 12) {
  throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be configured with at least 12 characters.");
}

async function ensureBootstrapAdmin() {
  const existingOrg = await db.select().from(organizationsTable).where(eq(organizationsTable.id, 1));
  if (existingOrg.length === 0) {
    await db.insert(organizationsTable).values({
      id: 1,
      name: "CommUnity Hub Central",
      contactEmail: "admin@communityhub.local",
      isActive: true,
    });
  }
  // Ensure sequence is synced even if org 1 already existed
  await db.execute(sql`SELECT setval('organizations_id_seq', (SELECT MAX(id) FROM organizations))`);

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, "admin@communityhub.local")).limit(1);
  if (!existing) {
    await db.insert(usersTable).values({
      organizationId: 1,
      name: "Super Admin",
      email: "admin@communityhub.local",
      role: "super_admin",
      passwordHash: await hashPassword(bootstrapAdminPassword),
      mustChangePassword: false,
      isActive: true,
    });
  } else if (existing.role !== "super_admin" || existing.email === "admin@communityhub.local") {
    // Force upgrade to super_admin AND reset password to ensure access
    await db.update(usersTable).set({
      role: "super_admin",
      passwordHash: await hashPassword(bootstrapAdminPassword)
    }).where(eq(usersTable.id, existing.id));
  }
}

router.get("/auth/me", async (req, res): Promise<void> => {
  await ensureBootstrapAdmin();
  const user = await getCurrentUser(req.headers.cookie);
  res.json({ user: user ? publicUser(user) : null });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  await ensureBootstrapAdmin();
  const email = String(req.body.email ?? "").trim().toLowerCase();
  const password = String(req.body.password ?? "");
  const expectedRole = req.body.role ? String(req.body.role) : null;
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Check if organization is active
  if (user.organizationId) {
    const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, user.organizationId));
    if (org && !org.isActive) {
      res.status(403).json({ error: "Organization account is deactivated. Please contact your coordinator." });
      return;
    }
  }
  if (expectedRole === "volunteer" && user.role !== "volunteer") {
    res.status(403).json({ error: "Use the admin login for this account" });
    return;
  }
  if (expectedRole === "admin" && user.role === "volunteer") {
    res.status(403).json({ error: "Use the volunteer login for this account" });
    return;
  }
  setSessionCookie(res, user.id);
  res.json({ user: publicUser(user) });
});

router.post("/auth/logout", async (_req, res): Promise<void> => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.post("/auth/change-password", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req.headers.cookie);
  if (!user) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  const currentPassword = String(req.body.currentPassword ?? "");
  const newPassword = String(req.body.newPassword ?? "");
  if (newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters" });
    return;
  }
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }
  const [updated] = await db.update(usersTable).set({
    passwordHash: await hashPassword(newPassword),
    mustChangePassword: false,
  }).where(eq(usersTable.id, user.id)).returning();
  res.json({ user: publicUser(updated) });
});

router.post("/auth/volunteers/:id/reset-password", async (req, res): Promise<void> => {
  const current = await getCurrentUser(req.headers.cookie);
  if (!current || !["admin", "coordinator", "super_admin"].includes(current.role)) {

    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const volunteerId = Number(req.params.id);
  const temporaryPassword = String(req.body.temporaryPassword ?? "");
  if (!volunteerId || temporaryPassword.length < 8) {
    res.status(400).json({ error: "A volunteer and temporary password are required" });
    return;
  }
  const [user] = await db.update(usersTable).set({
    passwordHash: await hashPassword(temporaryPassword),
    mustChangePassword: true,
    isActive: true,
  }).where(eq(usersTable.volunteerId, volunteerId)).returning();
  if (!user) {
    const [volunteer] = await db.select().from(volunteersTable).where(eq(volunteersTable.id, volunteerId));
    if (!volunteer?.email) {
      res.status(404).json({ error: "Volunteer account not found and volunteer has no email" });
      return;
    }
    const [created] = await db.insert(usersTable).values({
      organizationId: volunteer.organizationId,
      volunteerId,
      name: volunteer.name,
      email: volunteer.email.toLowerCase(),
      role: "volunteer",
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      isActive: true,
    }).returning();
    res.json({ user: publicUser(created), temporaryPassword });
    return;
  }
  res.json({ user: publicUser(user), temporaryPassword });
});

export default router;