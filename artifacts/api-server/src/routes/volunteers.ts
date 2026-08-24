import { Router, type IRouter } from "express";
import { eq, and, sql, inArray, desc } from "drizzle-orm";
import {
  db, volunteersTable, needsTable, activityLogTable, usersTable,
  volunteerAssignmentsTable, volunteerNotificationsTable, auditTrailTable, credentialEmailLogTable, organizationsTable
} from "@workspace/db";
import {
  CreateVolunteerBody,
  UpdateVolunteerBody,
  GetVolunteerParams,
  UpdateVolunteerParams,
  GetVolunteerTasksParams,
  GetVolunteerImpactParams,
  GetVolunteerNearbyTasksParams,
  ListVolunteersQueryParams,
  GetVolunteerNotificationsParams,
  MarkNotificationsReadParams,
  VolunteerSelfAssignParams,
  VolunteerSelfAssignBody,
  UpdateVolunteerStatusParams,
  UpdateVolunteerStatusBody,
  AdminResetVolunteerPasswordParams,
  AdminResetVolunteerPasswordBody,
  DeactivateVolunteerParams,
  DeactivateVolunteerBody,
  UpdateVolunteerProfileBody,
  GetPendingAssignmentsQueryParams,
  ApproveAssignmentParams,
  DeclineAssignmentParams,
  DeclineAssignmentBody,
} from "@workspace/api-zod";
import { calculateMatchScore, daysUnresolved } from "../lib/urgency";
import { getCurrentUser, hashPassword, isOrgActive } from "../lib/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// GET pending requests for volunteer
router.get("/volunteers/:id/pending-requests", async (req, res): Promise<void> => {
  const params = GetVolunteerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const current = await getCurrentUser(req.headers.cookie);
  if (current?.role === "volunteer" && current.volunteerId !== params.data.id) {
    res.status(403).json({ error: "You can only view your own requests" });
    return;
  }
  const pending = await db.select().from(volunteerAssignmentsTable)
    .where(and(
      eq(volunteerAssignmentsTable.volunteerId, params.data.id),
      eq(volunteerAssignmentsTable.approvalStatus, "pending_approval")
    ));
  res.json(pending);
});

// GET pending assignments (admin/coordinator)
router.get("/volunteers/pending-assignments", async (req, res): Promise<void> => {
  const params = GetPendingAssignmentsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const organizationId = params.data.organizationId;

  const pending = await db.select({
    id: volunteerAssignmentsTable.id,
    volunteerName: volunteersTable.name,
    volunteerSkills: volunteersTable.skills,
    needTitle: needsTable.title,
    needCategory: needsTable.category,
    needSeverity: needsTable.severity,
    needArea: needsTable.area,
    createdAt: volunteerAssignmentsTable.createdAt,
    volunteerId: volunteersTable.id,
    needId: needsTable.id
  })
    .from(volunteerAssignmentsTable)
    .innerJoin(volunteersTable, eq(volunteerAssignmentsTable.volunteerId, volunteersTable.id))
    .innerJoin(needsTable, eq(volunteerAssignmentsTable.needId, needsTable.id))
    .where(and(
      eq(needsTable.organizationId, organizationId),
      eq(volunteerAssignmentsTable.approvalStatus, "pending_approval")
    ))
    .orderBy(desc(volunteerAssignmentsTable.createdAt));

  res.json(pending);
});

// POST approve assignment
router.post("/volunteers/assignments/:id/approve", async (req, res): Promise<void> => {
  const params = ApproveAssignmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const assignmentId = params.data.id;
  const current = await getCurrentUser(req.headers.cookie);
  console.log(`[AUTH DEBUG] User ID: ${current?.id}, Role: ${current?.role}`);
  if (!current || !["admin", "coordinator", "super_admin"].includes(current.role)) {


    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const [assignment] = await db.select().from(volunteerAssignmentsTable).where(eq(volunteerAssignmentsTable.id, assignmentId));
  if (!assignment || assignment.approvalStatus !== "pending_approval") {
    res.status(400).json({ error: "Request not found or already processed" });
    return;
  }

  const [need] = await db.select().from(needsTable).where(eq(needsTable.id, assignment.needId));
  if (need.assignedVolunteerId) {
    // Already assigned to someone else
    await db.update(volunteerAssignmentsTable)
      .set({ approvalStatus: "declined", declineReason: "Task assigned to someone else", approvedBy: current.id, approvedAt: new Date() } as any)
      .where(eq(volunteerAssignmentsTable.id, assignmentId));
    res.status(400).json({ error: "Task is already assigned to someone else" });
    return;
  }

  // Approve
  await db.transaction(async (tx) => {
    await tx.update(volunteerAssignmentsTable)
      .set({ approvalStatus: "assigned", approvedBy: current.id, approvedAt: new Date() } as any)
      .where(eq(volunteerAssignmentsTable.id, assignmentId));

    await tx.update(needsTable)
      .set({ assignedVolunteerId: assignment.volunteerId, status: "assigned", dateAssigned: new Date() })
      .where(eq(needsTable.id, assignment.needId));

    const [volunteer] = await tx.select().from(volunteersTable).where(eq(volunteersTable.id, assignment.volunteerId));
    await tx.update(volunteersTable)
      .set({ tasksAssigned: (volunteer?.tasksAssigned || 0) + 1, availabilityStatus: "on_task" })
      .where(eq(volunteersTable.id, assignment.volunteerId));

    // Notify volunteer
    await tx.insert(volunteerNotificationsTable).values({
      volunteerId: assignment.volunteerId,
      title: "Request Approved",
      message: `Your request to join '${need.title}' has been approved. The task is now assigned to you.`,
      type: "task_assigned",
      relatedNeedId: need.id,
    });

    // Audit trail
    await tx.insert(auditTrailTable).values({
      needId: need.id,
      action: "self_assign_approved",
      oldValue: "pending_approval",
      newValue: `assigned:${assignment.volunteerId}`,
      performedBy: current.name,
    });
  });

  res.json({ message: "Task assigned successfully" });
});

// POST decline assignment
router.post("/volunteers/assignments/:id/decline", async (req, res): Promise<void> => {
  const params = DeclineAssignmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = DeclineAssignmentBody.safeParse(req.body);
  const reason = body.success ? body.data.reason : undefined;

  const assignmentId = params.data.id;
  const current = await getCurrentUser(req.headers.cookie);
  if (!current || !["admin", "coordinator", "super_admin"].includes(current.role)) {

    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const [assignment] = await db.select().from(volunteerAssignmentsTable).where(eq(volunteerAssignmentsTable.id, assignmentId));
  if (!assignment || assignment.approvalStatus !== "pending_approval") {
    res.status(400).json({ error: "Request not found or already processed" });
    return;
  }

  const [need] = await db.select().from(needsTable).where(eq(needsTable.id, assignment.needId));

  // Decline
  await db.update(volunteerAssignmentsTable)
    .set({ approvalStatus: "declined", declineReason: reason || null, approvedBy: current.id, approvedAt: new Date() } as any)
    .where(eq(volunteerAssignmentsTable.id, assignmentId));

  // Notify volunteer
  await db.insert(volunteerNotificationsTable).values({
    volunteerId: assignment.volunteerId,
    title: "Request Declined",
    message: `Your request to join '${need.title}' was declined by ${current.name}.${reason ? ` Reason: ${reason}` : ""}`,
    type: "info",
    relatedNeedId: need.id,
  });

  res.json({ message: "Request declined" });
});


function generateTempPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let pw = "";
  for (let i = 0; i < 10; i++) {
    pw += chars[Math.floor(Math.random() * chars.length)];
  }
  // Ensure at least one number
  pw = pw.slice(0, 8) + Math.floor(Math.random() * 10) + pw.slice(9);
  return pw;
}

router.get("/volunteers", async (req, res): Promise<void> => {
  const params = ListVolunteersQueryParams.safeParse(req.query);
  const conditions: any[] = [];

  if (params.success && params.data.organizationId) {
    conditions.push(eq(volunteersTable.organizationId, params.data.organizationId));
  }
  if (params.success && params.data.available) {
    conditions.push(eq(volunteersTable.availabilityStatus, "available"));
  }

  const current = await getCurrentUser(req.headers.cookie);
  const volunteers = await db.select({
    id: volunteersTable.id,
    organizationId: volunteersTable.organizationId,
    organizationName: organizationsTable.name,
    name: volunteersTable.name,
    email: volunteersTable.email,
    phone: volunteersTable.phone,
    area: volunteersTable.area,
    skills: volunteersTable.skills,
    availabilityStatus: volunteersTable.availabilityStatus,
    tasksAssigned: volunteersTable.tasksAssigned,
    tasksCompleted: volunteersTable.tasksCompleted,
    latitude: volunteersTable.latitude,
    longitude: volunteersTable.longitude,
    createdAt: volunteersTable.createdAt,
    updatedAt: volunteersTable.updatedAt,
  })
    .from(volunteersTable)
    .leftJoin(organizationsTable, eq(volunteersTable.organizationId, organizationsTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(volunteersTable.name);

  // Filter out volunteers from inactive organizations (unless super_admin)
  let filteredVolunteers = volunteers;
  if (current?.role !== "super_admin") {
    const activeOrgs = await db.select({ id: organizationsTable.id }).from(organizationsTable).where(eq(organizationsTable.isActive, true));
    const activeIds = new Set(activeOrgs.map(o => o.id));
    filteredVolunteers = volunteers.filter(v => !v.organizationId || activeIds.has(v.organizationId));
  }

  const enriched = filteredVolunteers.map((v) => ({
    ...v,
    completionRate: v.tasksAssigned > 0 ? v.tasksCompleted / v.tasksAssigned : 0,
  }));

  if (params.success && params.data.skill) {
    const skill = params.data.skill.toLowerCase();
    res.json(enriched.filter((v) => v.skills.some((s) => s.toLowerCase().includes(skill))));
    return;
  }

  res.json(enriched);
});

router.post("/volunteers", async (req, res): Promise<void> => {
  const parsed = CreateVolunteerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [volunteer] = await db.insert(volunteersTable).values(parsed.data).returning();
  const loginEmail = String(req.body.loginEmail ?? volunteer.email ?? "").trim().toLowerCase();
  const temporaryPassword = String(req.body.temporaryPassword ?? "");
  const current = await getCurrentUser(req.headers.cookie);
  // Registration check
  if (!(await isOrgActive(parsed.data.organizationId ?? null)) && current?.role !== "super_admin") {
    res.status(403).json({ error: "This organization is deactivated. Volunteer registration is closed." });
    return;
  }

  if (loginEmail && temporaryPassword.length >= 8) {
    await db.insert(usersTable).values({
      organizationId: volunteer.organizationId,
      volunteerId: volunteer.id,
      name: volunteer.name,
      email: loginEmail,
      role: "volunteer",
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      isActive: true,
    });

    // Log the credential creation for audit trail
    await db.insert(credentialEmailLogTable).values({
      volunteerId: volunteer.id,
      email: loginEmail,
      type: "credential",
      status: "not_sent",
      errorMessage: "Email delivery not configured — credentials shown to admin only",
      performedBy: current?.name ?? null,
    });
  }

  await db.insert(activityLogTable).values({
    organizationId: volunteer.organizationId ?? null,
    type: "volunteer_registered",
    message: `New volunteer registered: ${volunteer.name} (${volunteer.area})`,
    entityId: volunteer.id,
    entityType: "volunteer",
  });

  res.status(201).json({ ...volunteer, completionRate: 0, loginEmail: loginEmail || null, temporaryPassword: temporaryPassword || null });
});

router.get("/volunteers/:id", async (req, res): Promise<void> => {
  const params = GetVolunteerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [volunteer] = await db.select().from(volunteersTable).where(eq(volunteersTable.id, params.data.id));
  if (!volunteer) {
    res.status(404).json({ error: "Volunteer not found" });
    return;
  }
  res.json({ ...volunteer, completionRate: volunteer.tasksAssigned > 0 ? volunteer.tasksCompleted / volunteer.tasksAssigned : 0 });
});

router.patch("/volunteers/:id", async (req, res): Promise<void> => {
  const params = UpdateVolunteerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateVolunteerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [volunteer] = await db.update(volunteersTable).set(parsed.data).where(eq(volunteersTable.id, params.data.id)).returning();
  if (!volunteer) {
    res.status(404).json({ error: "Volunteer not found" });
    return;
  }
  res.json({ ...volunteer, completionRate: volunteer.tasksAssigned > 0 ? volunteer.tasksCompleted / volunteer.tasksAssigned : 0 });
});

router.get("/volunteers/:id/tasks", async (req, res): Promise<void> => {
  const params = GetVolunteerTasksParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const current = await getCurrentUser(req.headers.cookie);
  if (current?.role === "volunteer" && current.volunteerId !== params.data.id) {
    res.status(403).json({ error: "You can only view your own tasks" });
    return;
  }
  const needs = await db.select().from(needsTable).where(eq(needsTable.assignedVolunteerId, params.data.id));
  res.json(needs.map((n) => ({ ...n, urgencyScore: 0, daysUnresolved: daysUnresolved(n.reportDate), assignedVolunteerName: null })));
});

router.get("/volunteers/:id/impact", async (req, res): Promise<void> => {
  const params = GetVolunteerImpactParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const current = await getCurrentUser(req.headers.cookie);
  if (current?.role === "volunteer" && current.volunteerId !== params.data.id) {
    res.status(403).json({ error: "You can only view your own impact" });
    return;
  }
  const [volunteer] = await db.select().from(volunteersTable).where(eq(volunteersTable.id, params.data.id));
  if (!volunteer) {
    res.status(404).json({ error: "Volunteer not found" });
    return;
  }

  const tasks = await db.select().from(needsTable)
    .where(and(eq(needsTable.assignedVolunteerId, params.data.id), eq(needsTable.status, "resolved")));

  const allAssigned = await db.select().from(needsTable).where(eq(needsTable.assignedVolunteerId, params.data.id));
  const inProgress = allAssigned.filter((t) => t.status === "in_progress").length;
  const assigned = allAssigned.filter((t) => t.status === "assigned").length;

  const peopleHelped = tasks.reduce((sum, t) => sum + t.affectedCount, 0);
  const topCategories = [...new Set(tasks.map((t) => t.category))].slice(0, 3);
  const hoursContributed = volunteer.tasksCompleted * 3;

  const categoryBreakdown = tasks.reduce((acc: Record<string, number>, t) => {
    acc[t.category] = (acc[t.category] ?? 0) + 1;
    return acc;
  }, {});

  const mostActiveZone = allAssigned.reduce((acc: Record<string, number>, t) => {
    if (t.zone) acc[t.zone] = (acc[t.zone] ?? 0) + 1;
    return acc;
  }, {});
  const topZone = Object.entries(mostActiveZone).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const impactStatement = `${volunteer.name} has helped approximately ${peopleHelped} people by completing ${volunteer.tasksCompleted} tasks across ${topCategories.join(", ") || "various"} categories. An estimated ${hoursContributed} hours of service contributed.`;

  res.json({
    volunteerId: volunteer.id,
    name: volunteer.name,
    tasksCompleted: volunteer.tasksCompleted,
    tasksAssigned: assigned,
    tasksInProgress: inProgress,
    peopleHelped,
    hoursContributed,
    topCategories,
    categoryBreakdown,
    mostActiveZone: topZone,
    availabilityStatus: volunteer.availabilityStatus,
    impactStatement,
  });
});

router.get("/volunteers/:id/nearby-tasks", async (req, res): Promise<void> => {
  const params = GetVolunteerNearbyTasksParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [volunteer] = await db.select().from(volunteersTable).where(eq(volunteersTable.id, params.data.id));
  if (!volunteer) {
    res.status(404).json({ error: "Volunteer not found" });
    return;
  }

  const needs = await db.select().from(needsTable)
    .where(and(
      sql`${needsTable.status} NOT IN ('resolved', 'closed')`,
      sql`${needsTable.assignedVolunteerId} IS NULL`,
      eq(needsTable.organizationId, volunteer.organizationId ?? 0)
    ));

  const matches = needs.map((need) => {
    const scores = calculateMatchScore(volunteer, need);
    return {
      id: need.id,
      title: need.title,
      category: need.category,
      severity: need.severity,
      area: need.area,
      affectedCount: need.affectedCount,
      matchScore: scores.total,
    };
  });

  matches.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
  res.json(matches.slice(0, 10));
});

// GET pending requests for volunteer



// GET notifications
router.get("/volunteers/:id/notifications", async (req, res): Promise<void> => {
  const params = GetVolunteerNotificationsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const current = await getCurrentUser(req.headers.cookie);
  if (current?.role === "volunteer" && current.volunteerId !== params.data.id) {
    res.status(403).json({ error: "You can only view your own notifications" });
    return;
  }
  const notifications = await db.select().from(volunteerNotificationsTable)
    .where(eq(volunteerNotificationsTable.volunteerId, params.data.id))
    .orderBy(desc(volunteerNotificationsTable.createdAt));
  res.json(notifications);
});

// POST mark notifications as read
router.post("/volunteers/:id/notifications/mark-read", async (req, res): Promise<void> => {
  const params = MarkNotificationsReadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.update(volunteerNotificationsTable)
    .set({ isRead: true })
    .where(eq(volunteerNotificationsTable.volunteerId, params.data.id));
  res.json({ ok: true });
});

// POST self-assign
router.post("/volunteers/:id/self-assign", async (req, res): Promise<void> => {
  const params = VolunteerSelfAssignParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = VolunteerSelfAssignBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const volunteerId = params.data.id;
  const needId = body.data.needId;

  const current = await getCurrentUser(req.headers.cookie);
  if (!current || current.role !== "volunteer" || current.volunteerId !== volunteerId) {
    res.status(403).json({ error: "Volunteer access required" });
    return;
  }
  const [volunteer] = await db.select().from(volunteersTable).where(eq(volunteersTable.id, volunteerId));
  const [existingNeed] = await db.select().from(needsTable).where(eq(needsTable.id, needId));

  if (!volunteer || !existingNeed || existingNeed.assignedVolunteerId) {
    res.status(400).json({ error: "Task is no longer available" });
    return;
  }

  // Check if already requested
  const [existingRequest] = await db.select().from(volunteerAssignmentsTable)
    .where(and(
      eq(volunteerAssignmentsTable.needId, needId),
      eq(volunteerAssignmentsTable.volunteerId, volunteerId),
      eq(volunteerAssignmentsTable.approvalStatus, "pending_approval")
    ));

  if (existingRequest) {
    res.status(400).json({ error: "Request already pending" });
    return;
  }

  // Create pending assignment
  await db.insert(volunteerAssignmentsTable).values({
    needId,
    volunteerId,
    status: "assigned",
    approvalStatus: "pending_approval"
  } as any);

  // Notify admins/coordinators
  const admins = await db.select().from(usersTable)
    .where(and(
      eq(usersTable.organizationId, existingNeed.organizationId),
      inArray(usersTable.role, ["admin", "coordinator", "super_admin"]),

      eq(usersTable.isActive, true)
    ));

  for (const admin of admins) {
    await db.insert(volunteerNotificationsTable).values({
      volunteerId: admin.volunteerId || 0, // 0 if super admin without volunteer profile
      title: "New Self-Assignment Request",
      message: `${volunteer.name} has requested to self-assign to '${existingNeed.title}' in ${existingNeed.area}. Review and approve or decline.`,
      type: "admin_notification",
      relatedNeedId: needId,
    } as any);
  }

  // Notify volunteer
  await db.insert(volunteerNotificationsTable).values({
    volunteerId,
    title: "Request Sent",
    message: `Your self-assignment request for '${existingNeed.title}' has been sent. Waiting for coordinator approval.`,
    type: "info",
    relatedNeedId: needId,
  });

  res.json({ message: "Request submitted for approval" });
});

// GET pending assignments


// PATCH volunteer availability status
router.patch("/volunteers/:id/status", async (req, res): Promise<void> => {
  const params = UpdateVolunteerStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateVolunteerStatusBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const current = await getCurrentUser(req.headers.cookie);
  const [vol] = await db.update(volunteersTable)
    .set({ availabilityStatus: body.data.availabilityStatus })
    .where(eq(volunteersTable.id, params.data.id))
    .returning();
  if (!vol) {
    res.status(404).json({ error: "Volunteer not found" });
    return;
  }

  // Notify if changed by admin
  if (current && current.role !== "volunteer") {
    await db.insert(volunteerNotificationsTable).values({
      volunteerId: params.data.id,
      title: "Status updated",
      message: `Your availability status was changed to ${body.data.availabilityStatus} by ${current.name}.`,
      type: "status_changed",
    });
  }

  res.json({ ...vol, completionRate: vol.tasksAssigned > 0 ? vol.tasksCompleted / vol.tasksAssigned : 0 });
});

// POST admin reset volunteer password
router.post("/volunteers/:id/reset-password", async (req, res): Promise<void> => {
  const params = AdminResetVolunteerPasswordParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const current = await getCurrentUser(req.headers.cookie);
  if (!current || !["admin", "coordinator", "super_admin"].includes(current.role)) {

    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const [volunteer] = await db.select().from(volunteersTable).where(eq(volunteersTable.id, params.data.id));
  if (!volunteer) {
    res.status(404).json({ error: "Volunteer not found" });
    return;
  }

  const temporaryPassword = generateTempPassword();

  const [user] = await db.update(usersTable).set({
    passwordHash: await hashPassword(temporaryPassword),
    mustChangePassword: true,
    isActive: true,
  }).where(eq(usersTable.volunteerId, params.data.id)).returning();

  if (!user && !volunteer.email) {
    res.status(404).json({ error: "Volunteer account not found" });
    return;
  }

  // Log the reset in credential audit trail
  const emailTarget = user?.email ?? volunteer.email ?? "";
  if (emailTarget) {
    await db.insert(credentialEmailLogTable).values({
      volunteerId: params.data.id,
      email: emailTarget,
      type: "reset",
      status: "not_sent",
      errorMessage: "Email delivery not configured — credentials shown to admin only",
      performedBy: current.name,
    });
  }

  // Notify volunteer
  await db.insert(volunteerNotificationsTable).values({
    volunteerId: params.data.id,
    title: "Password reset",
    message: `Your password was reset by ${current.name}. Please ask them for your new temporary password.`,
    type: "password_reset",
  });

  // Always return temp password to admin for manual sharing
  res.json({
    ok: true,
    temporaryPassword,
    message: "Password reset. Share this temporary password with the volunteer securely. They must change it on first login.",
  });
});

// POST deactivate volunteer with guard
router.post("/volunteers/:id/deactivate", async (req, res): Promise<void> => {
  const params = DeactivateVolunteerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = DeactivateVolunteerBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const current = await getCurrentUser(req.headers.cookie);
  if (!current || !["admin", "coordinator", "super_admin"].includes(current.role)) {

    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const activeTasks = await db.select().from(needsTable).where(
    and(
      eq(needsTable.assignedVolunteerId, params.data.id),
      sql`${needsTable.status} IN ('assigned', 'in_progress')`
    )
  );

  if (!body.data.forceUnassign && activeTasks.length > 0) {
    res.json({
      ok: false,
      tasksUnassigned: 0,
      activeTasks: activeTasks.map((t) => ({ id: t.id, title: t.title, status: t.status })),
    });
    return;
  }

  if (activeTasks.length > 0) {
    // Revert tasks to verified
    for (const task of activeTasks) {
      await db.update(needsTable).set({
        assignedVolunteerId: null,
        status: "verified",
        dateAssigned: null,
      }).where(eq(needsTable.id, task.id));

      await db.insert(auditTrailTable).values({
        needId: task.id,
        action: "unassigned_on_volunteer_deactivation",
        oldValue: `assigned:${params.data.id}`,
        newValue: "verified",
        performedBy: current.name,
      });
    }
  }

  // Deactivate volunteer and user account
  await db.update(volunteersTable).set({ isActive: false }).where(eq(volunteersTable.id, params.data.id));
  await db.update(usersTable).set({ isActive: false }).where(eq(usersTable.volunteerId, params.data.id));

  const [vol] = await db.select().from(volunteersTable).where(eq(volunteersTable.id, params.data.id));

  // Notify coordinators (we send a system notification to coordinator users in the org)
  const coordinators = await db.select().from(usersTable).where(
    and(eq(usersTable.organizationId, vol?.organizationId ?? 0), sql`${usersTable.role} IN ('admin', 'coordinator', 'super_admin')`)

  );
  // Log activity
  await db.insert(activityLogTable).values({
    organizationId: vol?.organizationId ?? null,
    type: "volunteer_deactivated",
    message: `${vol?.name ?? "Volunteer"} was deactivated — ${activeTasks.length} tasks returned to unassigned queue.`,
    entityId: params.data.id,
    entityType: "volunteer",
  });

  res.json({
    ok: true,
    tasksUnassigned: activeTasks.length,
    activeTasks: [],
  });
});

// GET credential audit log
router.get("/volunteers/:id/credential-log", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid volunteer ID" });
    return;
  }
  const current = await getCurrentUser(req.headers.cookie);
  if (!current || !["admin", "coordinator", "super_admin"].includes(current.role)) {

    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const logs = await db.select().from(credentialEmailLogTable)
    .where(eq(credentialEmailLogTable.volunteerId, id))
    .orderBy(desc(credentialEmailLogTable.createdAt));
  res.json(logs);
});

// PATCH volunteer profile (self-edit by volunteer)
router.patch("/volunteers/:id/profile", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid volunteer ID" });
    return;
  }
  const current = await getCurrentUser(req.headers.cookie);
  if (!current || (current.role === "volunteer" && current.volunteerId !== id)) {
    res.status(403).json({ error: "You can only update your own profile" });
    return;
  }
  const body = UpdateVolunteerProfileBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const updateData: any = {};
  if (body.data.displayName !== undefined) updateData.displayName = body.data.displayName;
  if (body.data.phone !== undefined) updateData.phone = body.data.phone;
  if (body.data.languages !== undefined) updateData.languages = body.data.languages;
  if (body.data.availabilitySchedule !== undefined) updateData.availabilitySchedule = body.data.availabilitySchedule;
  if (body.data.profilePhoto !== undefined) updateData.profilePhoto = body.data.profilePhoto;
  if ((body.data as any).availabilityDays !== undefined) updateData.availabilityDays = (body.data as any).availabilityDays;
  if ((body.data as any).availabilityStatus !== undefined) updateData.availabilityStatus = (body.data as any).availabilityStatus;
  if ((body.data as any).dailyOverride !== undefined) updateData.dailyOverride = (body.data as any).dailyOverride;
  if ((body.data as any).dailyOverrideDate !== undefined) updateData.dailyOverrideDate = (body.data as any).dailyOverrideDate;

  const [vol] = await db.update(volunteersTable).set(updateData).where(eq(volunteersTable.id, id)).returning();
  if (!vol) {
    res.status(404).json({ error: "Volunteer not found" });
    return;
  }
  res.json({ ...vol, completionRate: vol.tasksAssigned > 0 ? vol.tasksCompleted / vol.tasksAssigned : 0 });
});

export default router;
