import { Router, type IRouter } from "express";
import { eq, sql, desc } from "drizzle-orm";
import { db, needsTable, volunteersTable, activityLogTable } from "@workspace/db";
import { getCurrentUser } from "../lib/auth.ts";
import {
  GetDashboardStatsQueryParams,
  GetRecentActivityQueryParams,
  GetZoneBreakdownQueryParams,
  GetDashboardInsightsQueryParams,
} from "@workspace/api-zod";
import { calculateUrgencyScore, daysUnresolved } from "../lib/urgency.ts";
import { generateInsightCards } from "../lib/ai.ts";

const router: IRouter = Router();

router.get("/dashboard/stats", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req.headers.cookie);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = GetDashboardStatsQueryParams.safeParse(req.query);
  const requestedOrgId = params.success ? params.data.organizationId : undefined;

  let targetOrgId = requestedOrgId;
  if (user.role !== "super_admin") {
    if (requestedOrgId && requestedOrgId !== user.organizationId) {
      res.status(403).json({ error: "Forbidden: You can only access your own organization's dashboard" });
      return;
    }
    targetOrgId = user.organizationId ?? undefined;
  }

  const allNeeds = await db.select().from(needsTable)
    .where(targetOrgId ? eq(needsTable.organizationId, targetOrgId) : undefined);

  const activeNeeds = allNeeds.filter((n) => !["resolved", "closed"].includes(n.status));
  const criticalNeeds = activeNeeds.filter((n) => n.severity === "critical");

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const resolvedThisWeek = allNeeds.filter(
    (n) => ["resolved", "closed"].includes(n.status) && new Date(n.updatedAt) >= oneWeekAgo
  ).length;
  const resolvedLastWeek = allNeeds.filter(
    (n) => ["resolved", "closed"].includes(n.status) &&
      new Date(n.updatedAt) >= twoWeeksAgo && new Date(n.updatedAt) < oneWeekAgo
  ).length;

  const allVols = await db.select().from(volunteersTable)
    .where(targetOrgId ? eq(volunteersTable.organizationId, targetOrgId) : undefined);
  const availableVols = allVols.filter((v) => v.availabilityStatus === "available");
  const busyVols = allVols.filter((v) => v.availabilityStatus !== "available");
  const utilizationRate = allVols.length > 0 ? busyVols.length / allVols.length : 0;

  // By category
  const categoryMap: Record<string, number> = {};
  for (const n of activeNeeds) {
    categoryMap[n.category] = (categoryMap[n.category] ?? 0) + 1;
  }
  const needsByCategory = Object.entries(categoryMap).map(([category, count]) => ({ category, count }));

  // By severity
  const severityMap: Record<string, number> = {};
  for (const n of activeNeeds) {
    severityMap[n.severity] = (severityMap[n.severity] ?? 0) + 1;
  }
  const needsBySeverity = Object.entries(severityMap).map(([severity, count]) => ({ severity, count }));

  // Avg days unresolved
  const unresolvedDays = activeNeeds.map((n) => daysUnresolved(n.reportDate));
  const unresolvedAvgDays = unresolvedDays.length > 0
    ? unresolvedDays.reduce((a, b) => a + b, 0) / unresolvedDays.length
    : 0;

  res.json({
    totalActiveNeeds: activeNeeds.length,
    criticalNeeds: criticalNeeds.length,
    resolvedThisWeek,
    resolvedLastWeek,
    totalVolunteers: allVols.length,
    availableVolunteers: availableVols.length,
    volunteerUtilizationRate: Math.round(utilizationRate * 100) / 100,
    needsByCategory,
    needsBySeverity,
    unresolvedAvgDays: Math.round(unresolvedAvgDays * 10) / 10,
  });
});

router.get("/dashboard/activity", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req.headers.cookie);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = GetRecentActivityQueryParams.safeParse(req.query);
  const requestedOrgId = params.success ? params.data.organizationId : undefined;
  const limit = (params.success && params.data.limit) ? params.data.limit : 20;

  let targetOrgId = requestedOrgId;
  if (user.role !== "super_admin") {
    if (requestedOrgId && requestedOrgId !== user.organizationId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    targetOrgId = user.organizationId ?? undefined;
  }

  const activity = await db.select().from(activityLogTable)
    .where(targetOrgId ? eq(activityLogTable.organizationId, targetOrgId) : undefined)
    .orderBy(desc(activityLogTable.createdAt))
    .limit(limit);

  res.json(activity);
});

router.get("/dashboard/zones", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req.headers.cookie);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = GetZoneBreakdownQueryParams.safeParse(req.query);
  const requestedOrgId = params.success ? params.data.organizationId : undefined;

  let targetOrgId = requestedOrgId;
  if (user.role !== "super_admin") {
    if (requestedOrgId && requestedOrgId !== user.organizationId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    targetOrgId = user.organizationId ?? undefined;
  }

  const needs = await db.select().from(needsTable)
    .where(targetOrgId ? eq(needsTable.organizationId, targetOrgId) : undefined);

  const zoneMap: Record<string, { total: number; critical: number; resolved: number; urgency: number; categories: string[] }> = {};

  for (const n of needs) {
    const zone = n.zone ?? n.area;
    if (!zoneMap[zone]) zoneMap[zone] = { total: 0, critical: 0, resolved: 0, urgency: 0, categories: [] };
    zoneMap[zone].total++;
    if (n.severity === "critical") zoneMap[zone].critical++;
    if (["resolved", "closed"].includes(n.status)) zoneMap[zone].resolved++;
    if (!["resolved", "closed"].includes(n.status)) {
      zoneMap[zone].urgency += calculateUrgencyScore(n);
    }
    zoneMap[zone].categories.push(n.category);
  }

  const result = Object.entries(zoneMap).map(([zone, data]) => {
    const catCounts: Record<string, number> = {};
    for (const c of data.categories) catCounts[c] = (catCounts[c] ?? 0) + 1;
    const topCategory = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return {
      zone,
      totalNeeds: data.total,
      criticalNeeds: data.critical,
      resolvedNeeds: data.resolved,
      urgencyScore: Math.round(data.urgency),
      topCategory,
    };
  });

  result.sort((a, b) => b.urgencyScore - a.urgencyScore);
  res.json(result);
});

router.get("/dashboard/insights", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req.headers.cookie);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = GetDashboardInsightsQueryParams.safeParse(req.query);
  const requestedOrgId = params.success ? params.data.organizationId : undefined;

  let targetOrgId = requestedOrgId;
  if (user.role !== "super_admin") {
    if (requestedOrgId && requestedOrgId !== user.organizationId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    targetOrgId = user.organizationId ?? undefined;
  }

  const needs = await db.select().from(needsTable)
    .where(targetOrgId ? eq(needsTable.organizationId, targetOrgId) : undefined);
  const volunteers = await db.select().from(volunteersTable)
    .where(targetOrgId ? eq(volunteersTable.organizationId, targetOrgId) : undefined);

  const activeNeeds = needs.filter((n) => !["resolved", "closed"].includes(n.status));
  const zoneMap: Record<string, { count: number; criticalCount: number }> = {};
  for (const n of activeNeeds) {
    const zone = n.zone ?? n.area;
    if (!zoneMap[zone]) zoneMap[zone] = { count: 0, criticalCount: 0 };
    zoneMap[zone].count++;
    if (n.severity === "critical") zoneMap[zone].criticalCount++;
  }

  const needsByZone = Object.entries(zoneMap).map(([zone, data]) => ({
    zone,
    count: data.count,
    criticalCount: data.criticalCount,
  }));

  const availableVols = volunteers.filter((v) => v.availabilityStatus === "available");
  const unresolvedDays = activeNeeds.map((n) => daysUnresolved(n.reportDate));
  const avgDays = unresolvedDays.length > 0 ? unresolvedDays.reduce((a, b) => a + b, 0) / unresolvedDays.length : 0;

  const insights = generateInsightCards({
    needsByZone,
    totalCritical: activeNeeds.filter((n) => n.severity === "critical").length,
    availableVolunteers: availableVols.length,
    unresolvedAvgDays: avgDays,
  });

  res.json(insights);
});

export default router;
