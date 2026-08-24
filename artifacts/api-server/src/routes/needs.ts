import { Router, type IRouter } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, needsTable, volunteersTable, auditTrailTable, activityLogTable, volunteerAssignmentsTable, volunteerNotificationsTable, organizationsTable } from "@workspace/db";
import {
  CreateNeedBody,
  UpdateNeedBody,
  UpdateNeedStatusBody,
  GetNeedParams,
  UpdateNeedParams,
  UpdateNeedStatusParams,
  AssignVolunteerToNeedParams,
  AssignVolunteerToNeedBody,
  GetMatchedVolunteersParams,
  GetNeedAuditTrailParams,
  BulkCreateNeedsBody,
  ListNeedsQueryParams,
  UpdateNeedVolunteerNoteParams,
  UpdateNeedVolunteerNoteBody,
  UpdateNeedTaskStatusParams,
  UpdateNeedTaskStatusBody,
  AssignVolunteersBulkParams,
  AssignVolunteersBulkBody,
  ListNeedAssignmentsParams,
  GeocodeNeedParams,
  UpdateAssignmentProgressParams,
  UpdateAssignmentProgressBody,
} from "@workspace/api-zod";
import { getCurrentUser, isOrgActive } from "../lib/auth";
import { calculateUrgencyScore, calculateMatchScore, daysUnresolved } from "../lib/urgency";
import { geocode } from "../lib/geocode";

const router: IRouter = Router();

function enrichNeed(need: any, volunteer?: any) {
  const score = calculateUrgencyScore(need);
  const days = daysUnresolved(need.reportDate);
  return {
    ...need,
    urgencyScore: score,
    daysUnresolved: days,
    assignedVolunteerName: volunteer?.name ?? null,
  };
}

router.get("/needs", async (req, res): Promise<void> => {
  const current = await getCurrentUser(req.headers.cookie);
  if (!current) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = ListNeedsQueryParams.safeParse(req.query);
  const requestedOrgId = params.success ? params.data.organizationId : undefined;

  // Isolation check: users can only see their own org data (unless super_admin)
  let targetOrgId = requestedOrgId;

  if (current.role !== "super_admin") {
    if (requestedOrgId && requestedOrgId !== current.organizationId) {
      res.status(403).json({ error: "Forbidden: You cannot access data from another organization" });
      return;
    }
    targetOrgId = current.organizationId ?? undefined;
  }

  const query: any[] = [];
  if (params.success && params.data.category) query.push(eq(needsTable.category, params.data.category));
  if (params.success && params.data.severity) query.push(eq(needsTable.severity, params.data.severity));
  if (params.success && params.data.status) query.push(eq(needsTable.status, params.data.status));
  if (params.success && params.data.area) query.push(eq(needsTable.area, params.data.area));
  
  if (targetOrgId) {
    query.push(eq(needsTable.organizationId, targetOrgId));
  }

  const needs = await db.select({
    id: needsTable.id,
    organizationId: needsTable.organizationId,
    organizationName: organizationsTable.name,
    title: needsTable.title,
    description: needsTable.description,
    category: needsTable.category,
    area: needsTable.area,
    urgencyScore: needsTable.urgencyScore,
    severity: needsTable.severity,
    status: needsTable.status,
    reportDate: needsTable.reportDate,
    affectedCount: needsTable.affectedCount,
    latitude: needsTable.latitude,
    longitude: needsTable.longitude,
    createdAt: needsTable.createdAt,
    updatedAt: needsTable.updatedAt,
  })
  .from(needsTable)
  .leftJoin(organizationsTable, eq(needsTable.organizationId, organizationsTable.id))
  .where(query.length > 0 ? and(...query) : undefined)
  .orderBy(desc(needsTable.createdAt));

  // Filter out needs from inactive organizations (unless super_admin)
  let filteredNeeds = needs;
  if (current.role !== "super_admin") {
    const activeOrgs = await db.select({ id: organizationsTable.id }).from(organizationsTable).where(eq(organizationsTable.isActive, true));
    const activeIds = new Set(activeOrgs.map(o => o.id));
    filteredNeeds = needs.filter(n => !n.organizationId || activeIds.has(n.organizationId));
  }

  const enriched = filteredNeeds.map((n) => enrichNeed(n));
  enriched.sort((a, b) => (b.urgencyScore ?? 0) - (a.urgencyScore ?? 0));
  res.json(enriched);
});

router.post("/needs", async (req, res): Promise<void> => {
  const parsed = CreateNeedBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const current = await getCurrentUser(req.headers.cookie);
  if (!(await isOrgActive(parsed.data.organizationId ?? null)) && current?.role !== "super_admin") {
    res.status(403).json({ error: "This organization is deactivated. Service requests are closed." });
    return;
  }
  const urgencyScore = calculateUrgencyScore({ ...parsed.data, status: "reported" });
  const requestBody = req.body as { requiredSkills?: unknown };
  const requiredSkills = Array.isArray(requestBody.requiredSkills) ? requestBody.requiredSkills.map(String) : [];
  const needData = { 
    ...parsed.data, 
    requiredSkills, 
    urgencyScore,
    needDate: parsed.data.needDate ? (parsed.data.needDate instanceof Date ? parsed.data.needDate.toISOString().split('T')[0] : String(parsed.data.needDate)) : null
  };
  const [need] = await db.insert(needsTable).values(needData).returning();

  // Log activity
  await db.insert(activityLogTable).values({
    organizationId: need.organizationId,
    type: "need_created",
    message: `New ${need.severity} ${need.category} need reported in ${need.area}: "${need.title}"`,
    entityId: need.id,
    entityType: "need",
  });

  res.status(201).json(enrichNeed(need));
});

router.get("/needs/urgent", async (_req, res): Promise<void> => {
  const needs = await db.select().from(needsTable)
    .where(sql`${needsTable.status} NOT IN ('resolved', 'closed')`)
    .orderBy(desc(needsTable.urgencyScore));
  const enriched = needs.map((n) => enrichNeed(n));
  enriched.sort((a, b) => (b.urgencyScore ?? 0) - (a.urgencyScore ?? 0));
  res.json(enriched.slice(0, 20));
});

router.get("/needs/map", async (_req, res): Promise<void> => {
  const needs = await db.select().from(needsTable)
    .where(sql`${needsTable.latitude} IS NOT NULL AND ${needsTable.longitude} IS NOT NULL`);
  const enriched = needs.map((n) => ({
    id: n.id,
    title: n.title,
    category: n.category,
    severity: n.severity,
    status: n.status,
    affectedCount: n.affectedCount,
    latitude: n.latitude!,
    longitude: n.longitude!,
    urgencyScore: calculateUrgencyScore(n),
    daysUnresolved: daysUnresolved(n.reportDate),
    area: n.area,
    requiredSkills: n.requiredSkills,
  }));
  res.json(enriched);
});

router.get("/needs/heatmap", async (_req, res): Promise<void> => {
  const needs = await db.select().from(needsTable)
    .where(sql`${needsTable.status} NOT IN ('resolved', 'closed') AND ${needsTable.zone} IS NOT NULL`);

  const zoneMap: Record<string, { lat: number; lng: number; score: number; count: number; critical: number }> = {};

  for (const need of needs) {
    const zone = need.zone!;
    if (!zoneMap[zone]) {
      zoneMap[zone] = {
        lat: need.latitude ?? 20.5937,
        lng: need.longitude ?? 78.9629,
        score: 0,
        count: 0,
        critical: 0,
      };
    }
    zoneMap[zone].score += calculateUrgencyScore(need);
    zoneMap[zone].count++;
    if (need.severity === "critical") zoneMap[zone].critical++;
  }

  const result = Object.entries(zoneMap).map(([zone, data]) => ({
    zone,
    latitude: data.lat,
    longitude: data.lng,
    totalUrgencyScore: Math.round(data.score),
    needsCount: data.count,
    criticalCount: data.critical,
  }));

  res.json(result);
});

router.get("/needs/:id", async (req, res): Promise<void> => {
  const params = GetNeedParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [need] = await db.select().from(needsTable).where(eq(needsTable.id, params.data.id));
  if (!need) {
    res.status(404).json({ error: "Need not found" });
    return;
  }
  let volunteer = null;
  if (need.assignedVolunteerId) {
    [volunteer] = await db.select().from(volunteersTable).where(eq(volunteersTable.id, need.assignedVolunteerId));
  }
  res.json(enrichNeed(need, volunteer));
});

router.patch("/needs/:id", async (req, res): Promise<void> => {
  const params = UpdateNeedParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateNeedBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updateData = {
    ...parsed.data,
    needDate: parsed.data.needDate ? (parsed.data.needDate instanceof Date ? parsed.data.needDate.toISOString().split('T')[0] : String(parsed.data.needDate)) : undefined
  };
  const [need] = await db.update(needsTable).set(updateData).where(eq(needsTable.id, params.data.id)).returning();
  if (!need) {
    res.status(404).json({ error: "Need not found" });
    return;
  }
  res.json(enrichNeed(need));
});

router.patch("/needs/:id/status", async (req, res): Promise<void> => {
  const params = UpdateNeedStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateNeedStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(needsTable).where(eq(needsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Need not found" });
    return;
  }

  const urgencyScore = calculateUrgencyScore({ ...existing, status: parsed.data.status });
  const [need] = await db.update(needsTable)
    .set({ 
      status: parsed.data.status, 
      resolutionNote: parsed.data.resolutionNote ?? null, 
      urgencyScore,
      updatedAt: new Date()
    })
    .where(eq(needsTable.id, params.data.id))
    .returning();

  // Audit trail
  await db.insert(auditTrailTable).values({
    needId: params.data.id,
    action: "status_change",
    oldValue: existing.status,
    newValue: parsed.data.status,
  });

  // Activity log
  await db.insert(activityLogTable).values({
    organizationId: need.organizationId,
    type: "status_updated",
    message: `Need "${need.title}" status changed from ${existing.status} to ${parsed.data.status}`,
    entityId: need.id,
    entityType: "need",
  });

  res.json(enrichNeed(need));
});

router.post("/needs/:id/assign", async (req, res): Promise<void> => {
  const params = AssignVolunteerToNeedParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = AssignVolunteerToNeedBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [volunteer] = await db.select().from(volunteersTable).where(eq(volunteersTable.id, parsed.data.volunteerId));
  if (!volunteer) {
    res.status(404).json({ error: "Volunteer not found" });
    return;
  }

  const [need] = await db.update(needsTable)
    .set({ assignedVolunteerId: parsed.data.volunteerId, status: "assigned" })
    .where(eq(needsTable.id, params.data.id))
    .returning();

  if (!need) {
    res.status(404).json({ error: "Need not found" });
    return;
  }

  // Update volunteer stats
  await db.update(volunteersTable)
    .set({ tasksAssigned: volunteer.tasksAssigned + 1, availabilityStatus: "on_task" })
    .where(eq(volunteersTable.id, volunteer.id));

  await db.insert(volunteerAssignmentsTable).values({
    needId: need.id,
    volunteerId: volunteer.id,
    status: "assigned",
    notes: typeof req.body.notes === "string" ? req.body.notes : null,
  });

  await db.insert(volunteerNotificationsTable).values({
    volunteerId: volunteer.id,
    title: "New assignment",
    message: `You have been assigned to "${need.title}" in ${need.area}.`,
  });

  await db.insert(auditTrailTable).values({
    needId: params.data.id,
    action: "volunteer_assigned",
    newValue: `${volunteer.name} (id: ${volunteer.id})`,
  });

  await db.insert(activityLogTable).values({
    organizationId: need.organizationId,
    type: "volunteer_assigned",
    message: `${volunteer.name} assigned to "${need.title}"`,
    entityId: need.id,
    entityType: "need",
  });

  res.json(enrichNeed(need, volunteer));
});

router.get("/needs/:id/volunteers", async (req, res): Promise<void> => {
  const params = GetMatchedVolunteersParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [need] = await db.select().from(needsTable).where(eq(needsTable.id, params.data.id));
  if (!need) {
    res.status(404).json({ error: "Need not found" });
    return;
  }

  const allVolunteers = await db.select().from(volunteersTable)
    .where(need.organizationId ? eq(volunteersTable.organizationId, need.organizationId) : undefined);

  // Filter to only currently-available volunteers
  const todayIso = new Date().toISOString().slice(0, 10);
  const needDateIso = need.needDate ? new Date(need.needDate as any).toISOString().slice(0, 10) : null;
  const volunteers = allVolunteers.filter((v: any) => {
    if (v.isActive === false) return false;
    if (v.availabilityStatus === "unavailable") return false;
    // Daily override applies only to today (or to the need's specific date if set)
    const overrideDateIso = v.dailyOverrideDate ? new Date(v.dailyOverrideDate).toISOString().slice(0, 10) : null;
    const targetDate = needDateIso ?? todayIso;
    if (v.dailyOverride === "unavailable" && overrideDateIso === targetDate) return false;
    return true;
  });

  const matches = volunteers.map((v) => {
    const scores = calculateMatchScore(v, need as any);
    return {
      volunteerId: v.id,
      name: v.name,
      matchScore: scores.total,
      locationScore: scores.locationScore,
      locationMatchStatus: scores.locationMatchStatus,
      matchedKeywords: scores.matchedKeywords,
      skillScore: scores.skillScore,
      availabilityScore: scores.availabilityScore,
      completionRateScore: scores.completionRateScore,
      skills: v.skills,
      availabilityStatus: v.availabilityStatus,
      availabilityDays: (v as any).availabilityDays ?? [],
      dayOverlap: scores.dayOverlap,
      missingDays: scores.missingDays,
      area: v.area,
      tasksCompleted: v.tasksCompleted,
    };
  });

  matches.sort((a, b) => b.matchScore - a.matchScore);
  res.json(matches);
});

router.get("/needs/:id/audit", async (req, res): Promise<void> => {
  const params = GetNeedAuditTrailParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const entries = await db.select().from(auditTrailTable)
    .where(eq(auditTrailTable.needId, params.data.id))
    .orderBy(desc(auditTrailTable.createdAt));
  res.json(entries);
});

router.post("/needs/bulk", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req.headers.cookie);
  if (!user || !["admin", "coordinator", "super_admin"].includes(user.role)) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const parsed = BulkCreateNeedsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Isolation check
  if (user.role !== "super_admin" && parsed.data.organizationId !== user.organizationId) {
    res.status(403).json({ error: "Forbidden: You can only import needs to your own organization" });
    return;
  }

  let created = 0;
  const errors: string[] = [];

  for (const row of parsed.data.rows) {
    try {
      const urgencyScore = calculateUrgencyScore({ ...row, status: "reported" });
      const rowData = {
        ...row,
        organizationId: parsed.data.organizationId, // Ensure it's set to the target org
        urgencyScore,
        needDate: row.needDate ? (row.needDate instanceof Date ? row.needDate.toISOString().split('T')[0] : String(row.needDate)) : null
      };
      await db.insert(needsTable).values(rowData);
      created++;
    } catch (err) {
      errors.push(`Row failed: ${(err as Error).message}`);
    }
  }

  if (created > 0) {
    await db.insert(activityLogTable).values({
      organizationId: parsed.data.organizationId,
      type: "bulk_import",
      message: `Bulk import: ${created} needs created${errors.length > 0 ? `, ${errors.length} failed` : ""}`,
      entityType: "need",
    });
  }

  res.status(201).json({ created, failed: errors.length, errors });
});

// PATCH volunteer note on a need
router.patch("/needs/:id/volunteer-note", async (req, res): Promise<void> => {
  const params = UpdateNeedVolunteerNoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateNeedVolunteerNoteBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const current = await getCurrentUser(req.headers.cookie);
  if (!current) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const [need] = await db.update(needsTable)
    .set({ volunteerNote: body.data.completionNote })
    .where(eq(needsTable.id, params.data.id))
    .returning();
  if (!need) {
    res.status(404).json({ error: "Need not found" });
    return;
  }
  await db.insert(auditTrailTable).values({
    needId: need.id,
    action: "volunteer_note_updated",
    oldValue: null,
    newValue: body.data.completionNote ?? null,
    performedBy: current.name,
  });
  res.json({ ...need, urgencyScore: need.urgencyScore ?? 0, daysUnresolved: daysUnresolved(need.reportDate), assignedVolunteerName: null });
});

// PATCH volunteer task status (start / complete)
router.patch("/needs/:id/task-status", async (req, res): Promise<void> => {
  const params = UpdateNeedTaskStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateNeedTaskStatusBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const requestBody = req.body as { volunteerNote?: string };
  const current = await getCurrentUser(req.headers.cookie);
  if (!current) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const [existingNeed] = await db.select().from(needsTable).where(eq(needsTable.id, params.data.id));
  if (!existingNeed) {
    res.status(404).json({ error: "Need not found" });
    return;
  }
  if (current.role === "volunteer" && existingNeed.assignedVolunteerId !== current.volunteerId) {
    res.status(403).json({ error: "You can only update status of your own assigned tasks" });
    return;
  }

  const updateData: any = { status: body.data.status };
  if (body.data.completionNote) updateData.completionNote = body.data.completionNote;
  if (requestBody.volunteerNote) updateData.volunteerNote = requestBody.volunteerNote;

  const [need] = await db.update(needsTable).set(updateData).where(eq(needsTable.id, params.data.id)).returning();

  // Update volunteer counts on completion
  if (body.data.status === "completed" && existingNeed.assignedVolunteerId) {
    const [vol] = await db.select().from(volunteersTable).where(eq(volunteersTable.id, existingNeed.assignedVolunteerId));
    if (vol) {
      await db.update(volunteersTable).set({
        tasksCompleted: vol.tasksCompleted + 1,
        availabilityStatus: "available",
      }).where(eq(volunteersTable.id, vol.id));
    }
    // Notify volunteer
    await db.insert(volunteerNotificationsTable).values({
      volunteerId: existingNeed.assignedVolunteerId,
      title: "Task completed",
      message: `You've marked "${need.title}" as resolved. Well done!`,
      type: "task_completed",
      relatedNeedId: need.id,
    });
  } else if (body.data.status === "in_progress" && existingNeed.assignedVolunteerId) {
    await db.insert(volunteerNotificationsTable).values({
      volunteerId: existingNeed.assignedVolunteerId,
      title: "Task started",
      message: `You've started working on "${need.title}".`,
      type: "task_started",
      relatedNeedId: need.id,
    });
  }

  await db.insert(auditTrailTable).values({
    needId: need.id,
    action: `task_status_${body.data.status}`,
    oldValue: existingNeed.status,
    newValue: body.data.status,
    performedBy: current.name,
  });

  res.json({ ...need, urgencyScore: need.urgencyScore ?? 0, daysUnresolved: daysUnresolved(need.reportDate), assignedVolunteerName: null });
});

// CHANGE 2: Bulk-assign multiple volunteers to a need
router.post("/needs/:id/assign-bulk", async (req, res): Promise<void> => {
  const params = AssignVolunteersBulkParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = AssignVolunteersBulkBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [need] = await db.select().from(needsTable).where(eq(needsTable.id, params.data.id));
  if (!need) {
    res.status(404).json({ error: "Need not found" });
    return;
  }

  let assignedCount = 0;
  for (const vid of body.data.volunteerIds) {
    const [vol] = await db.select().from(volunteersTable).where(eq(volunteersTable.id, vid));
    if (!vol) continue;
    // Skip duplicates
    const existing = await db.select().from(volunteerAssignmentsTable)
      .where(and(eq(volunteerAssignmentsTable.needId, need.id), eq(volunteerAssignmentsTable.volunteerId, vid)));
    if (existing.length > 0) continue;

    await db.insert(volunteerAssignmentsTable).values({
      needId: need.id,
      volunteerId: vid,
      status: "assigned",
    });
    await db.update(volunteersTable)
      .set({ tasksAssigned: vol.tasksAssigned + 1 })
      .where(eq(volunteersTable.id, vid));
    await db.insert(volunteerNotificationsTable).values({
      volunteerId: vid,
      title: "New assignment",
      message: `You have been assigned to "${need.title}" in ${need.area}.`,
      relatedNeedId: need.id,
    });
    await db.insert(auditTrailTable).values({
      needId: need.id,
      action: "volunteer_assigned",
      newValue: `${vol.name} (id: ${vol.id})`,
    });
    assignedCount++;
  }

  // First assigned volunteer becomes the primary one for legacy single-volunteer fields
  const allAssignments = await db.select().from(volunteerAssignmentsTable)
    .where(eq(volunteerAssignmentsTable.needId, need.id));
  let updatedNeed = need;
  if (allAssignments.length > 0 && need.status === "reported") {
    const primary = allAssignments[0];
    [updatedNeed] = await db.update(needsTable)
      .set({ status: "assigned", assignedVolunteerId: primary.volunteerId, dateAssigned: new Date() })
      .where(eq(needsTable.id, need.id))
      .returning();
  }

  res.json({ need: enrichNeed(updatedNeed), assignedCount });
});

// CHANGE 2: List all volunteers assigned to a need
router.get("/needs/:id/assignments", async (req, res): Promise<void> => {
  const params = ListNeedAssignmentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db
    .select({
      id: volunteerAssignmentsTable.id,
      assignmentId: volunteerAssignmentsTable.id,
      needId: volunteerAssignmentsTable.needId,
      volunteerId: volunteerAssignmentsTable.volunteerId,
      volunteerName: volunteersTable.name,
      status: volunteerAssignmentsTable.status,
      progress: volunteerAssignmentsTable.progress,
      progressNotes: volunteerAssignmentsTable.progressNotes,
      notes: volunteerAssignmentsTable.notes,
    })
    .from(volunteerAssignmentsTable)
    .leftJoin(volunteersTable, eq(volunteersTable.id, volunteerAssignmentsTable.volunteerId))
    .where(eq(volunteerAssignmentsTable.needId, params.data.id));
  res.json(rows.map((r) => ({ ...r, volunteerName: r.volunteerName ?? "Unknown" })));
});

// CHANGE 4: Re-run Nominatim geocoding for a need
router.post("/needs/:id/geocode", async (req, res): Promise<void> => {
  const params = GeocodeNeedParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [need] = await db.select().from(needsTable).where(eq(needsTable.id, params.data.id));
  if (!need) {
    res.status(404).json({ error: "Need not found" });
    return;
  }
  if (need.coordinatesLocked) {
    res.json({ latitude: need.latitude, longitude: need.longitude, found: need.latitude != null });
    return;
  }
  const query = [need.area, need.zone].filter(Boolean).join(", ");
  const result = await geocode(query);
  if (!result) {
    await db.update(needsTable)
      .set({ geocodingFailed: true })
      .where(eq(needsTable.id, need.id));
    res.json({ latitude: null, longitude: null, found: false });
    return;
  }
  await db.update(needsTable)
    .set({ latitude: result.lat, longitude: result.lon, geocodingFailed: false })
    .where(eq(needsTable.id, need.id));
  res.json({ latitude: result.lat, longitude: result.lon, found: true });
});

// CHANGE 3: Update progress on an assignment
router.patch("/assignments/:id/progress", async (req, res): Promise<void> => {
  const params = UpdateAssignmentProgressParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateAssignmentProgressBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [existing] = await db.select().from(volunteerAssignmentsTable).where(eq(volunteerAssignmentsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }

  const newNotes = body.data.note
    ? [...((existing.progressNotes as Array<{ at: string; note: string; progress: number }>) ?? []), { at: new Date().toISOString(), note: body.data.note, progress: body.data.progress }]
    : (existing.progressNotes as unknown[]);

  const [updated] = await db.update(volunteerAssignmentsTable)
    .set({ progress: body.data.progress, progressNotes: newNotes as never, status: body.data.progress >= 100 ? "completed" : (body.data.progress > 0 ? "in_progress" : existing.status) })
    .where(eq(volunteerAssignmentsTable.id, params.data.id))
    .returning();

  // Roll up per-need progress = avg of all assignments
  const allForNeed = await db.select().from(volunteerAssignmentsTable).where(eq(volunteerAssignmentsTable.needId, existing.needId));
  const needProgress = Math.round(allForNeed.reduce((s, a) => s + (a.progress ?? 0), 0) / allForNeed.length);
  await db.update(needsTable)
    .set({ volunteerProgress: needProgress, status: needProgress >= 100 ? "resolved" : (needProgress > 0 ? "in_progress" : "assigned") })
    .where(eq(needsTable.id, existing.needId));

  res.json({ id: updated.id, assignmentId: updated.id, progress: updated.progress, needProgress });
});

export default router;
