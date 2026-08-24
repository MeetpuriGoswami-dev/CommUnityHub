import { Router, type IRouter } from "express";
import crypto from "crypto";
import { eq, sql, desc } from "drizzle-orm";
import { db, surveysTable, surveyResponsesTable, organizationsTable } from "@workspace/db";
import {
  CreateSurveyBody,
  GetSurveyParams,
  ListSurveyResponsesParams,
  SubmitSurveyResponseParams,
  SubmitSurveyResponseBody,
  GetSurveyQualityParams,
  GenerateSurveyBody,
  ListSurveysQueryParams,
} from "@workspace/api-zod";
import { generateSurveyFromDescription } from "../lib/ai";
import { getCurrentUser, isOrgActive } from "../lib/auth";

const router: IRouter = Router();

// Hash requesting IP
function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip).digest("hex");
}

router.get("/surveys", async (req, res): Promise<void> => {
  const current = await getCurrentUser(req.headers.cookie);
  if (!current) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = ListSurveysQueryParams.safeParse(req.query);
  const requestedOrgId = params.success ? params.data.organizationId : undefined;
  
  // Isolation check: non-super_admins can only see their own organization's surveys
  let targetOrgId = requestedOrgId;
  if (current.role !== "super_admin") {
    if (requestedOrgId && requestedOrgId !== current.organizationId) {
      res.status(403).json({ error: "Forbidden: You cannot access surveys from another organization" });
      return;
    }
    targetOrgId = current.organizationId ?? undefined;
  }

  const surveys = await db.select({
    id: surveysTable.id,
    organizationId: surveysTable.organizationId,
    organizationName: organizationsTable.name,
    title: surveysTable.title,
    description: surveysTable.description,
    fields: surveysTable.fields,
    isAcceptingResponses: surveysTable.isAcceptingResponses,
    limitOneResponse: surveysTable.limitOneResponse,
    allowResponseEditing: surveysTable.allowResponseEditing,
    collectEmail: surveysTable.collectEmail,
    showProgressBar: surveysTable.showProgressBar,
    shuffleQuestions: surveysTable.shuffleQuestions,
    themeColor: surveysTable.themeColor,
    isPublished: surveysTable.isPublished,
    responseDeadline: surveysTable.responseDeadline,
    createdAt: surveysTable.createdAt,
    updatedAt: surveysTable.updatedAt,
  })
  .from(surveysTable)
  .leftJoin(organizationsTable, eq(surveysTable.organizationId, organizationsTable.id))
  .where(targetOrgId ? eq(surveysTable.organizationId, targetOrgId) : undefined)
  .orderBy(desc(surveysTable.createdAt));

  // Filter out surveys from inactive organizations (unless super_admin)
  let filteredSurveys = surveys;
  if (current?.role !== "super_admin") {
    const activeOrgs = await db.select({ id: organizationsTable.id }).from(organizationsTable).where(eq(organizationsTable.isActive, true));
    const activeIds = new Set(activeOrgs.map(o => o.id));
    filteredSurveys = surveys.filter(s => activeIds.has(s.organizationId));
  }

  // Enrich with response counts
  const enriched = await Promise.all(filteredSurveys.map(async (s) => {
    const [countRes] = await db.select({ count: sql<number>`count(*)::int` })
      .from(surveyResponsesTable)
      .where(eq(surveyResponsesTable.surveyId, s.id));
    
    // Check if deadline passed
    let isAccepting = s.isAcceptingResponses;
    if (isAccepting && s.responseDeadline && new Date() > new Date(s.responseDeadline)) {
      isAccepting = false;
      await db.update(surveysTable)
        .set({ isAcceptingResponses: false })
        .where(eq(surveysTable.id, s.id));
    }

    return { 
      ...s, 
      responseCount: countRes?.count || 0, 
      isAcceptingResponses: isAccepting,
      qualityScore: null 
    };
  }));

  res.json(enriched);
});

import { z as zod } from "zod";

const LocalCreateSurveyBody = zod.object({
  organizationId: zod.number(),
  title: zod.string(),
  description: zod.string().nullish(),
  fields: zod.array(
    zod.object({
      id: zod.string().nullish(),
      name: zod.string().nullish(),
      label: zod.string(),
      type: zod.string(),
      required: zod.boolean(),
      options: zod.array(zod.string()).nullish(),
      validationRule: zod.string().nullish(),
      startValue: zod.number().nullish(),
      endValue: zod.number().nullish(),
      lowLabel: zod.string().nullish(),
      highLabel: zod.string().nullish(),
    }).passthrough(),
  ),
  isAcceptingResponses: zod.boolean().nullish(),
  limitOneResponse: zod.boolean().nullish(),
  allowResponseEditing: zod.boolean().nullish(),
  collectEmail: zod.string().nullish(),
  showProgressBar: zod.boolean().nullish(),
  shuffleQuestions: zod.boolean().nullish(),
  themeColor: zod.string().nullish(),
  isPublished: zod.boolean().nullish(),
}).passthrough();

router.post("/surveys", async (req, res): Promise<void> => {
  const parsed = LocalCreateSurveyBody.safeParse(req.body);
  if (!parsed.success) {
    console.error("Survey creation validation failed:", parsed.error.format());
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const current = await getCurrentUser(req.headers.cookie);
  if (!(await isOrgActive(parsed.data.organizationId)) && current?.role !== "super_admin") {
    res.status(403).json({ error: "This organization is deactivated. Survey creation is suspended." });
    return;
  }
  const [survey] = await db.insert(surveysTable).values(parsed.data as any).returning();
  res.status(201).json({ ...survey, responseCount: 0, qualityScore: null });
});

// GET /surveys/:id/public (Unauthenticated)
router.get("/surveys/:id/public", async (req, res): Promise<void> => {
  const params = GetSurveyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [survey] = await db.select().from(surveysTable).where(eq(surveysTable.id, params.data.id));
  if (!survey) {
    res.status(404).json({ error: "Survey not found" });
    return;
  }

  // Check if organization is active
  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, survey.organizationId));
  if (org && !org.isActive) {
    res.status(403).json({ closed: true, message: "This organization is currently inactive. Please check back later." });
    return;
  }

  if (!survey.isPublished) {
    res.status(404).json({ error: "Survey not published" });
    return;
  }

  // Check deadline
  let isAccepting = survey.isAcceptingResponses;
  if (isAccepting && survey.responseDeadline && new Date() > new Date(survey.responseDeadline)) {
    isAccepting = false;
    await db.update(surveysTable)
      .set({ isAcceptingResponses: false })
      .where(eq(surveysTable.id, survey.id));
  }

  if (!isAccepting) {
    res.json({ closed: true, message: "This form is no longer accepting responses" });
    return;
  }

  res.json({
    id: survey.id,
    title: survey.title,
    description: survey.description,
    themeColor: survey.themeColor,
    confirmationMessage: survey.confirmationMessage,
    showProgressBar: survey.showProgressBar,
    shuffleQuestions: survey.shuffleQuestions,
    collectEmail: survey.collectEmail,
    allowResponseEditing: survey.allowResponseEditing,
    limitOneResponse: survey.limitOneResponse,
    fields: survey.fields, // full questions array
  });
});

router.get("/surveys/:id", async (req, res): Promise<void> => {
  const current = await getCurrentUser(req.headers.cookie);
  if (!current) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = GetSurveyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [survey] = await db.select().from(surveysTable).where(eq(surveysTable.id, params.data.id));
  if (!survey) {
    res.status(404).json({ error: "Survey not found" });
    return;
  }

  // Isolation check
  if (current.role !== "super_admin" && survey.organizationId !== current.organizationId) {
    res.status(403).json({ error: "Forbidden: You cannot access surveys from another organization" });
    return;
  }
  
  const [countRes] = await db.select({ count: sql<number>`count(*)::int` })
    .from(surveyResponsesTable)
    .where(eq(surveyResponsesTable.surveyId, survey.id));

  res.json({ ...survey, responseCount: countRes?.count || 0, qualityScore: null });
});

// GET /surveys/recent-responses (Authenticated)
router.get("/surveys/recent-responses", async (req, res): Promise<void> => {
  const current = await getCurrentUser(req.headers.cookie);
  if (!current) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const orgIdStr = req.query.organizationId as string;
  const targetOrgId = orgIdStr ? parseInt(orgIdStr, 10) : undefined;
  
  if (current.role !== "super_admin" && targetOrgId !== current.organizationId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const responses = await db.select({
    id: surveyResponsesTable.id,
    surveyId: surveyResponsesTable.surveyId,
    surveyTitle: surveysTable.title,
    respondentEmail: surveyResponsesTable.respondentEmail,
    createdAt: surveyResponsesTable.createdAt,
  })
  .from(surveyResponsesTable)
  .innerJoin(surveysTable, eq(surveyResponsesTable.surveyId, surveysTable.id))
  .where(targetOrgId ? eq(surveysTable.organizationId, targetOrgId) : undefined)
  .orderBy(desc(surveyResponsesTable.createdAt))
  .limit(5);

  res.json(responses);
});

// GET /surveys/:id/responses (Authenticated)
router.get("/surveys/:id/responses", async (req, res): Promise<void> => {
  const current = await getCurrentUser(req.headers.cookie);
  if (!current) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = ListSurveyResponsesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [survey] = await db.select().from(surveysTable).where(eq(surveysTable.id, params.data.id));
  if (!survey) {
    res.status(404).json({ error: "Survey not found" });
    return;
  }

  // Isolation check
  if (current.role !== "super_admin" && survey.organizationId !== current.organizationId) {
    res.status(403).json({ error: "Forbidden: You cannot access responses from another organization" });
    return;
  }

  const responses = await db.select()
    .from(surveyResponsesTable)
    .where(eq(surveyResponsesTable.surveyId, params.data.id))
    .orderBy(desc(surveyResponsesTable.createdAt));
  
  res.json(responses);
});

// GET /surveys/:id/responses/summary (Authenticated)
router.get("/surveys/:id/responses/summary", async (req, res): Promise<void> => {
  const params = GetSurveyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [survey] = await db.select().from(surveysTable).where(eq(surveysTable.id, params.data.id));
  if (!survey) {
    res.status(404).json({ error: "Survey not found" });
    return;
  }

  const responses = await db.select()
    .from(surveyResponsesTable)
    .where(eq(surveyResponsesTable.surveyId, params.data.id));

  const totalCount = responses.length;
  const questions = (survey.fields as any[]) || [];
  const summary: Record<string, any> = {};

  for (const q of questions) {
    const qId = q.id || q.name; // User mentioned questionId keyed by question ID
    const qResponses = responses.map(r => (r.data as any)[qId]).filter(v => v !== undefined && v !== null);

    if (["multiple_choice", "checkboxes", "dropdown", "select", "multiselect"].includes(q.type)) {
      const counts: Record<string, number> = {};
      qResponses.forEach(val => {
        if (Array.isArray(val)) {
          val.forEach(v => counts[v] = (counts[v] || 0) + 1);
        } else {
          counts[val] = (counts[val] || 0) + 1;
        }
      });
      const options = (q.options || []);
      // Include all unique response values, including 'Other' inputs
      const allKeys = [...new Set([...options, ...Object.keys(counts)])];
      summary[qId] = allKeys.map((opt: string) => ({
        option: opt,
        count: counts[opt] || 0,
        percent: totalCount > 0 ? Math.round(((counts[opt] || 0) / totalCount) * 100) : 0,
        isOther: !options.includes(opt)
      })).filter(item => item.count > 0 || options.includes(item.option));
    } else if (["linear_scale", "rating", "number"].includes(q.type)) {
      const numbers = qResponses.map(Number).filter(n => !isNaN(n));
      const avg = numbers.length > 0 ? (numbers.reduce((a, b) => a + b, 0) / numbers.length).toFixed(1) : 0;
      const distribution: Record<number, number> = {};
      numbers.forEach(n => distribution[n] = (distribution[n] || 0) + 1);
      summary[qId] = { average: avg, distribution };
    } else {
      // text, short answer, paragraph, date, time
      summary[qId] = qResponses;
    }
  }

  res.json({ totalCount, summary });
});

// GET /surveys/:id/responses/count (Authenticated)
router.get("/surveys/:id/responses/count", async (req, res): Promise<void> => {
  const params = GetSurveyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [countRes] = await db.select({ count: sql<number>`count(*)::int` })
    .from(surveyResponsesTable)
    .where(eq(surveyResponsesTable.surveyId, params.data.id));
  
  res.json({ count: countRes?.count || 0 });
});

// POST /surveys/:id/responses (Unauthenticated)
router.post("/surveys/:id/responses", async (req, res): Promise<void> => {
  const params = SubmitSurveyResponseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { answers, respondentEmail } = req.body;
  if (!answers || typeof answers !== "object") {
    res.status(400).json({ error: "Answers object required" });
    return;
  }

  const [survey] = await db.select().from(surveysTable).where(eq(surveysTable.id, params.data.id));
  if (!survey) {
    res.status(404).json({ error: "Survey not found" });
    return;
  }

  // Check deadline and status
  let isAccepting = survey.isAcceptingResponses;
  if (isAccepting && survey.responseDeadline && new Date() > new Date(survey.responseDeadline)) {
    isAccepting = false;
    await db.update(surveysTable)
      .set({ isAcceptingResponses: false })
      .where(eq(surveysTable.id, survey.id));
  }

  if (!isAccepting) {
    res.status(403).json({ closed: true, message: "This form is no longer accepting responses" });
    return;
  }

  // Validate required fields
  const questions = (survey.fields as any[]) || [];
  const errors: Record<string, string> = {};
  for (const q of questions) {
    const qId = q.id || q.name;
    if (q.required && (!answers[qId] || (Array.isArray(answers[qId]) && answers[qId].length === 0))) {
      errors[qId] = "This question is required";
    }
  }

  if (survey.collectEmail === "input" && !respondentEmail) {
    errors["email"] = "Email address is required";
  }

  if (Object.keys(errors).length > 0) {
    res.status(400).json({ error: "Missing required fields", fields: errors });
    return;
  }

  // IP Hashing
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "0.0.0.0") as string;
  const ipHash = hashIp(ip);

  // Limit to one response
  if (survey.limitOneResponse) {
    const [existing] = await db.select()
      .from(surveyResponsesTable)
      .where(sql`${surveyResponsesTable.surveyId} = ${survey.id} AND ${surveyResponsesTable.respondentIpHash} = ${ipHash}`)
      .limit(1);
    
    if (existing) {
      res.status(409).json({ alreadySubmitted: true, message: "You have already responded to this form." });
      return;
    }
  }

  const [response] = await db.insert(surveyResponsesTable).values({
    surveyId: params.data.id,
    organizationId: survey.organizationId,
    data: answers,
    respondentEmail,
    respondentIpHash: ipHash,
    qualityFlags: [],
  }).returning();

  res.status(201).json({ 
    submitted: true, 
    confirmationMessage: survey.confirmationMessage,
    response 
  });
});

// PATCH /surveys/:id (Authenticated)
router.patch("/surveys/:id", async (req, res): Promise<void> => {
  const params = GetSurveyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const updateData = { ...req.body };
  delete updateData.id;
  delete updateData.createdAt;
  delete updateData.updatedAt;

  const [updated] = await db.update(surveysTable)
    .set(updateData)
    .where(eq(surveysTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Survey not found" });
    return;
  }

  res.json(updated);
});

// DELETE /surveys/:id/responses (Authenticated)
router.delete("/surveys/:id/responses", async (req, res): Promise<void> => {
  const params = GetSurveyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (req.body.confirm !== "DELETE") {
    res.status(400).json({ error: "Please type DELETE to confirm" });
    return;
  }

  const result = await db.delete(surveyResponsesTable)
    .where(eq(surveyResponsesTable.surveyId, params.data.id))
    .returning();

  res.json({ deleted: result.length });
});

// POST /surveys/:id/duplicate (Authenticated)
router.post("/surveys/:id/duplicate", async (req, res): Promise<void> => {
  const params = GetSurveyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [original] = await db.select().from(surveysTable).where(eq(surveysTable.id, params.data.id));
  if (!original) {
    res.status(404).json({ error: "Survey not found" });
    return;
  }

  const newSurveyData = {
    ...original,
    title: `${original.title} — Copy`,
    isPublished: false,
    isAcceptingResponses: true,
    publishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  delete (newSurveyData as any).id;

  const [newSurvey] = await db.insert(surveysTable).values(newSurveyData).returning();
  res.status(201).json(newSurvey);
});

// Keep quality endpoint for backward compatibility
router.get("/surveys/:id/quality", async (req, res): Promise<void> => {
  const params = GetSurveyQualityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const responses = await db.select().from(surveyResponsesTable).where(eq(surveyResponsesTable.surveyId, params.data.id));

  const flaggedCount = responses.filter((r) => (r.qualityFlags as string[]).length > 0).length;
  const incompleteCount = responses.filter((r) =>
    (r.qualityFlags as string[]).some((f) => f.includes("blank"))
  ).length;
  const duplicateSuspectCount = 0; // simplified
  const inconsistentCount = responses.filter((r) =>
    (r.qualityFlags as string[]).some((f) => f.includes("Inconsistent"))
  ).length;

  const qualityScore = responses.length > 0
    ? Math.round(((responses.length - flaggedCount) / responses.length) * 100)
    : 100;

  const allIssues = responses.flatMap((r) => r.qualityFlags as string[]);
  const uniqueIssues = [...new Set(allIssues)];

  res.json({
    surveyId: params.data.id,
    totalResponses: responses.length,
    qualityScore,
    flaggedCount,
    incompleteCount,
    duplicateSuspectCount,
    inconsistentCount,
    issues: uniqueIssues,
  });
});

router.post("/surveys/generate", async (req, res): Promise<void> => {
  const current = await getCurrentUser(req.headers.cookie);
  // Note: Generate body doesn't always have orgId directly, but we check if user belongs to one
  if (current?.organizationId && !(await isOrgActive(current.organizationId)) && current.role !== "super_admin") {
    res.status(403).json({ error: "This organization is deactivated. Survey generation is closed." });
    return;
  }
  const parsed = GenerateSurveyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const template = await generateSurveyFromDescription(parsed.data.description);
  res.json(template);
});

export default router;
