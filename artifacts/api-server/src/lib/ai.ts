/**
 * Local Intelligence Engine.
 * STRICTLY LOCAL: No Gemini, No APIs, No External Models.
 * Processes dashboard queries entirely on the local server.
 */
import { and, desc, eq, gte, lte, sql, inArray, notInArray, count, countDistinct } from "drizzle-orm";
import {
  db,
  needsTable,
  volunteersTable,
  volunteerAssignmentsTable,
} from "@workspace/db";

export function generateInsightCards(data: {
  needsByZone: { zone: string; count: number; criticalCount: number }[];
  totalCritical: number;
  availableVolunteers: number;
  unresolvedAvgDays: number;
}) {
  const insights = [];
  
  if (data.totalCritical > 0) {
    insights.push({
      id: "critical-needs",
      title: "Critical Needs Require Attention",
      description: `There are ${data.totalCritical} critical needs that require immediate attention. prioritize assigning volunteers.`,
      severity: "critical",
    });
  }

  const zonesWithHighCritical = data.needsByZone.filter(z => z.criticalCount > 3);
  for (const zone of zonesWithHighCritical) {
    insights.push({
      id: `zone-${zone.zone}`,
      title: `High Critical Volume in ${zone.zone}`,
      description: `${zone.zone} has ${zone.criticalCount} critical needs. Consider reassigning resources to this area.`,
      severity: "critical",
      zone: zone.zone,
    });
  }

  if (data.availableVolunteers < data.totalCritical) {
    insights.push({
      id: "volunteer-shortage",
      title: "Volunteer Shortage",
      description: `There are only ${data.availableVolunteers} available volunteers for ${data.totalCritical} critical needs.`,
      severity: "warning",
    });
  }

  if (data.unresolvedAvgDays > 14) {
    insights.push({
      id: "aging-needs",
      title: "Aging Open Needs",
      description: `The average resolution time is ${Math.round(data.unresolvedAvgDays)} days. Review older tasks.`,
      severity: "warning",
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: "all-clear",
      title: "Operations Normal",
      description: "Everything is running smoothly. No critical anomalies detected.",
      severity: "info",
    });
  }

  return insights;
}

export type Intent =
  | "CRITICAL_NEEDS"
  | "UNRESOLVED_NEEDS"
  | "NEEDS_BY_ZONE"
  | "NEEDS_BY_CATEGORY"
  | "NEEDS_THIS_WEEK"
  | "VOLUNTEERS_AVAILABLE"
  | "VOLUNTEERS_BY_SKILL"
  | "TOP_VOLUNTEERS"
  | "UNASSIGNED_NEEDS"
  | "PROGRESS_STALLED"
  | "SKILL_GAP"
  | "RESOLUTION_RATE"
  | "COUNT_NEEDS"
  | "COUNT_VOLUNTEERS"
  | "UNKNOWN";

const INTENT_MAPPINGS: { intent: Intent; keywords: string[] }[] = [
  { intent: "CRITICAL_NEEDS", keywords: ["critical", "urgent", "emergency", "most urgent", "highest priority"] },
  { intent: "UNRESOLVED_NEEDS", keywords: ["unresolved", "open", "pending", "not resolved", "still open", "active need"] },
  { intent: "NEEDS_BY_ZONE", keywords: ["zone", "area", "region", "sector", "locality"] },
  { intent: "NEEDS_BY_CATEGORY", keywords: ["food", "medical", "shelter", "water", "education", "sanitation", "clothing"] },
  { intent: "NEEDS_THIS_WEEK", keywords: ["this week", "last 7 days", "recent", "today", "this month"] },
  { intent: "VOLUNTEERS_AVAILABLE", keywords: ["available volunteer", "who is available", "free volunteer", "on duty"] },
  { intent: "VOLUNTEERS_BY_SKILL", keywords: ["medical volunteer", "volunteer with", "who can", "skilled in"] },
  { intent: "TOP_VOLUNTEERS", keywords: ["top volunteer", "best volunteer", "most active", "most completed", "highest performing"] },
  { intent: "UNASSIGNED_NEEDS", keywords: ["unassigned", "no volunteer", "needs volunteer", "not assigned"] },
  { intent: "PROGRESS_STALLED", keywords: ["stalled", "no progress", "stuck", "not progressing", "inactive task"] },
  { intent: "SKILL_GAP", keywords: ["skill gap", "missing skill", "need more volunteer", "shortage"] },
  { intent: "RESOLUTION_RATE", keywords: ["resolved rate", "success rate", "completion rate", "how many resolved"] },
  { intent: "COUNT_NEEDS", keywords: ["how many need", "total need", "count of need", "number of need"] },
  { intent: "COUNT_VOLUNTEERS", keywords: ["how many volunteer", "total volunteer", "count volunteer"] },
];

export function detectIntents(message: string): Intent[] {
  const m = message.toLowerCase();
  const matched = INTENT_MAPPINGS
    .filter(map => map.keywords.some(kw => m.includes(kw)))
    .map(map => map.intent);
  
  if (matched.length === 0) return ["UNKNOWN"];
  return matched;
}

export async function executeIntents(intents: Intent[], organizationId: number, rawMessage: string): Promise<{ message: string; isOutOfScope: boolean }> {
  // LOCAL ONLY: NO GEMINI API FOR CHAT ASSISTANT
  if (intents.length === 1 && intents[0] === "UNKNOWN") {
    return {
      message: "I am your Local Operations Assistant. I can help you analyze dashboard data, manage volunteers, and track community needs. Try asking about 'critical needs', 'available volunteers', or 'resolution rates'.",
      isOutOfScope: true
    };
  }

  const contextData: any[] = [];

  for (const intent of intents) {
    switch (intent) {
      case "CRITICAL_NEEDS": {
        const critical = await db.select().from(needsTable)
          .where(and(eq(needsTable.organizationId, organizationId), eq(needsTable.severity, "critical"), notInArray(needsTable.status, ["resolved", "closed"])))
          .orderBy(desc(needsTable.urgencyScore));
        contextData.push({ intent, count: critical.length, data: critical.slice(0, 3) });
        break;
      }
      case "VOLUNTEERS_AVAILABLE": {
        const available = await db.select().from(volunteersTable)
          .where(and(eq(volunteersTable.organizationId, organizationId), eq(volunteersTable.availabilityStatus, "available"), eq(volunteersTable.isActive, true)));
        contextData.push({ intent, count: available.length, data: available.slice(0, 5).map(v => ({ name: v.name, skills: v.skills, area: v.area })) });
        break;
      }
      case "UNASSIGNED_NEEDS": {
        const unassigned = await db.select().from(needsTable)
          .where(and(eq(needsTable.organizationId, organizationId), notInArray(needsTable.status, ["resolved", "closed"]), sql`${needsTable.assignedVolunteerId} IS NULL`))
          .orderBy(desc(needsTable.urgencyScore));
        contextData.push({ intent, count: unassigned.length, data: unassigned.slice(0, 3) });
        break;
      }
      case "RESOLUTION_RATE": {
        const allNeeds = await db.select().from(needsTable).where(eq(needsTable.organizationId, organizationId));
        const resolved = allNeeds.filter(n => ["resolved", "closed"].includes(n.status)).length;
        contextData.push({ intent, total: allNeeds.length, resolved, percent: allNeeds.length > 0 ? Math.round((resolved / allNeeds.length) * 100) : 0 });
        break;
      }
      case "COUNT_NEEDS": {
        const counts = await db.select({
          total: count(),
          active: sql<number>`count(*) filter (where ${needsTable.status} not in ('resolved', 'closed'))`,
          resolved: sql<number>`count(*) filter (where ${needsTable.status} in ('resolved', 'closed'))`,
          critical: sql<number>`count(*) filter (where ${needsTable.severity} = 'critical')`
        }).from(needsTable).where(eq(needsTable.organizationId, organizationId));
        contextData.push({ intent, ...counts[0] });
        break;
      }
      case "COUNT_VOLUNTEERS": {
        const vcounts = await db.select({
          total: count(),
          available: sql<number>`count(*) filter (where ${volunteersTable.availabilityStatus} = 'available')`,
          busy: sql<number>`count(*) filter (where ${volunteersTable.availabilityStatus} = 'busy' or ${volunteersTable.availabilityStatus} = 'on_task')`,
        }).from(volunteersTable).where(eq(volunteersTable.organizationId, organizationId));
        contextData.push({ intent, ...vcounts[0] });
        break;
      }
    }
  }

  // LOCAL SYNTHESIS: Purely template based for privacy and speed
  let synthesizedMessage = "### Dashboard Intelligence Summary\n\n";
  
  for (const ctx of contextData) {
    switch (ctx.intent) {
      case "CRITICAL_NEEDS":
        synthesizedMessage += `🚨 **Critical Alert**: Found ${ctx.count} critical needs. Prioritize these for immediate attention.\n`;
        break;
      case "VOLUNTEERS_AVAILABLE":
        synthesizedMessage += `✅ **Volunteer Availability**: ${ctx.count} volunteers are currently available to assist.\n`;
        break;
      case "RESOLUTION_RATE":
        synthesizedMessage += `📈 **Performance**: Current resolution rate is **${ctx.percent}%** (${ctx.resolved}/${ctx.total} needs).\n`;
        break;
      case "COUNT_NEEDS":
        synthesizedMessage += `📊 **Inventory**: Managing ${ctx.total} total needs, with ${ctx.active} currently active.\n`;
        break;
      case "COUNT_VOLUNTEERS":
        synthesizedMessage += `👥 **Force Multiplier**: ${ctx.total} total volunteers registered, with ${ctx.available} standing by.\n`;
        break;
    }
  }

  if (contextData.length === 0) {
    synthesizedMessage = "I've analyzed the dashboard data based on your query, but couldn't find specific matches. Try asking about 'critical needs' or 'volunteer counts'.";
  } else {
    synthesizedMessage += "\n*Intelligence provided by local operations engine.*";
  }

  return {
    message: synthesizedMessage,
    isOutOfScope: false
  };
}

export async function getQuickPrompts(organizationId: number): Promise<string[]> {
  const prompts: string[] = [
    "How many critical needs are open?",
    "Who is available right now?"
  ];

  // Dynamic checks
  const unassignedCritical = await db.select().from(needsTable)
    .where(and(eq(needsTable.organizationId, organizationId), eq(needsTable.severity, "critical"), sql`${needsTable.assignedVolunteerId} IS NULL`, notInArray(needsTable.status, ["resolved", "closed"])))
    .limit(1);
  if (unassignedCritical.length > 0) prompts.push("Which critical needs have no volunteer?");

  // Skill gap check (simplified)
  const openNeeds = await db.select().from(needsTable).where(and(eq(needsTable.organizationId, organizationId), notInArray(needsTable.status, ["resolved", "closed"]))).limit(50);
  const skillCounts: Record<string, number> = {};
  openNeeds.forEach(n => n.requiredSkills.forEach(s => skillCounts[s] = (skillCounts[s] ?? 0) + 1));
  if (Object.values(skillCounts).some(c => c > 3)) prompts.push("What are the current skill gaps?");

  // Stalled check
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const stalled = await db.select().from(volunteerAssignmentsTable).where(and(eq(volunteerAssignmentsTable.status, "in_progress"), lte(volunteerAssignmentsTable.progress, 25), lte(volunteerAssignmentsTable.createdAt, threeDaysAgo))).limit(1);
  if (stalled.length > 0) prompts.push("Which tasks are stalled?");

  // Weekend check
  const day = new Date().getDay();
  if (day === 0 || day === 5 || day === 6) prompts.push("What did we resolve this week?");

  // Fallbacks
  const fallbacks = [
    "How many volunteers are available?",
    "What are the top unresolved needs?",
    "Who are the top performing volunteers?"
  ];
  while (prompts.length < 6 && fallbacks.length > 0) {
    const next = fallbacks.shift()!;
    if (!prompts.includes(next)) prompts.push(next);
  }

  return prompts.slice(0, 6);
}

export function generateSurveyFromDescription(description: string): {
  title: string;
  description: string;
  fields: {
    name: string;
    label: string;
    type: string;
    required: boolean;
    options?: string[] | null;
    validationRule?: string | null;
  }[];
} {
  const d = description.toLowerCase();
  const isMedical = d.includes("medical") || d.includes("health") || d.includes("clinic");
  const isFood = d.includes("food") || d.includes("ration") || d.includes("meal");
  const isShelter = d.includes("shelter") || d.includes("housing") || d.includes("displace");

  const baseFields = [
    { name: "area", label: "Area / Location", type: "text", required: true, options: null, validationRule: null },
    { name: "category", label: "Category of Need", type: "select", required: true, options: ["food", "medical", "shelter", "education", "water", "sanitation", "clothing", "livelihood", "other"], validationRule: null },
    { name: "severity", label: "Severity", type: "select", required: true, options: ["critical", "high", "medium", "low"], validationRule: null },
    { name: "affected_count", label: "People Affected", type: "number", required: true, options: null, validationRule: "Must be greater than 0" },
    { name: "description", label: "Description", type: "text", required: false, options: null, validationRule: null },
    { name: "reporter_name", label: "Reporter Name", type: "text", required: false, options: null, validationRule: null },
    { name: "reporter_phone", label: "Reporter Phone", type: "text", required: false, options: null, validationRule: null },
  ];

  if (isMedical) baseFields.push({ name: "condition_type", label: "Type of Medical Condition", type: "select", required: true, options: ["chronic", "acute", "infectious", "preventive", "mental_health", "other"], validationRule: null });
  if (isFood) baseFields.push({ name: "meal_type", label: "Meal Type Needed", type: "select", required: false, options: ["dry_ration", "cooked_meal", "infant_formula", "special_diet"], validationRule: null });
  if (isShelter) baseFields.push({ name: "household_size", label: "Household Size", type: "number", required: false, options: null, validationRule: null });

  return { title: description.length > 60 ? description.slice(0, 60) + "…" : description, description, fields: baseFields };
}
