import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, organizationsTable } from "@workspace/db";
import {
  CreateOrganizationBody,
  GetOrganizationParams,
} from "@workspace/api-zod";
import { getCurrentUser } from "../lib/auth";

const router: IRouter = Router();

router.get("/organizations", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req.headers.cookie);
  let orgs = await db.select().from(organizationsTable).orderBy(organizationsTable.createdAt);
  
  if (!user || user.role !== "super_admin") {
    orgs = orgs.filter(o => o.isActive !== false);
  }
  
  res.json(orgs);
});

router.post("/organizations", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req.headers.cookie);
  if (!user || user.role !== "super_admin") {
    res.status(403).json({ error: "Super Admin access required to create organizations" });
    return;
  }
  const parsed = CreateOrganizationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [org] = await db.insert(organizationsTable).values(parsed.data).returning();
  res.status(201).json(org);
});

router.patch("/organizations/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req.headers.cookie);
  const id = Number(req.params.id);
  if (!user || (user.role !== "super_admin" && user.organizationId !== id)) {
    res.status(403).json({ error: "Forbidden: You can only update your own organization's profile" });
    return;
  }
  const data = {
    name: req.body.name,
    description: req.body.description ?? null,
    contactEmail: req.body.contactEmail ?? null,
    contactPhone: req.body.contactPhone ?? null,
    address: req.body.address ?? null,
    isActive: typeof req.body.isActive === "boolean" ? req.body.isActive : undefined,
  };
  const [org] = await db.update(organizationsTable).set(data).where(eq(organizationsTable.id, id)).returning();
  if (!org) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }
  res.json(org);
});

router.get("/organizations/:id", async (req, res): Promise<void> => {
  const params = GetOrganizationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, params.data.id));
  if (!org) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }
  res.json(org);
});

export default router;
