import type { Need } from "@workspace/db";

/**
 * Calculate urgency score for a community need.
 * Score 0–100 based on: severity, affected count, days unresolved, frequency.
 */
export function calculateUrgencyScore(need: {
  severity: string;
  affectedCount: number;
  reportDate: Date | string;
  status: string;
}): number {
  const severityWeights: Record<string, number> = {
    critical: 40,
    high: 30,
    medium: 20,
    low: 10,
  };

  const severityScore = severityWeights[need.severity] ?? 10;

  // Affected count score: up to 30 points (log scale)
  const affectedScore = Math.min(30, Math.log10(Math.max(1, need.affectedCount)) * 10);

  // Days unresolved score: up to 20 points
  const daysUnresolved = Math.floor(
    (Date.now() - new Date(need.reportDate).getTime()) / (1000 * 60 * 60 * 24)
  );
  const daysScore = Math.min(20, daysUnresolved * 2);

  // Resolved needs get 0 score
  if (need.status === "resolved" || need.status === "closed") return 0;

  return Math.round(severityScore + affectedScore + daysScore);
}

/**
 * Calculate match score between a volunteer and a need.
 * Returns breakdown and total out of 100.
 */
export function calculateMatchScore(
  volunteer: {
    area: string;
    skills: string[];
    availabilityStatus: string;
    tasksCompleted: number;
    tasksAssigned: number;
    latitude?: number | null;
    longitude?: number | null;
  },
  need: {
    category: string;
    area: string;
    requiredSkills?: string[] | null;
    latitude?: number | null;
    longitude?: number | null;
    daysRequired?: string[] | null;
  }
): {
  total: number;
  locationScore: number;
  locationMatchStatus: "full" | "partial" | "none";
  matchedKeywords: string[];
  skillScore: number;
  availabilityScore: number;
  completionRateScore: number;
  dayOverlap: "full" | "partial" | "none" | "n/a";
  missingDays: string[];
} {
  const requiredDays = (need.daysRequired ?? []).map((d) => d.toLowerCase());
  const volunteerDays = (((volunteer as any).availabilityDays as string[] | null | undefined) ?? []).map((d) => d.toLowerCase());
  let dayOverlap: "full" | "partial" | "none" | "n/a" = "n/a";
  let missingDays: string[] = [];
  if (requiredDays.length > 0) {
    missingDays = (need.daysRequired ?? []).filter((d) => !volunteerDays.includes(d.toLowerCase()));
    const matched = requiredDays.length - missingDays.length;
    if (volunteerDays.length === 0 || matched === 0) dayOverlap = "none";
    else if (matched === requiredDays.length) dayOverlap = "full";
    else dayOverlap = "partial";
  }
  
  const requiredSkills = need.requiredSkills ?? [];
  
  // Keyword-based location match
  const locMatch = getKeywordMatch(volunteer.area, need.area);
  let locationScore = 0;
  if (locMatch.status === "full") {
    locationScore = 30;
  } else if (locMatch.status === "partial") {
    locationScore = 15;
  } else {
    // No keyword overlap, fallback to very low score
    locationScore = 0;
  }

  const categorySkillMap: Record<string, string[]> = {
    medical: ["medical", "first-aid", "nursing", "doctor", "health"],
    education: ["teaching", "education", "tutoring", "literacy"],
    food: ["cooking", "food", "nutrition", "distribution"],
    shelter: ["construction", "shelter", "housing", "carpentry"],
    water: ["water", "sanitation", "plumbing", "hygiene"],
    sanitation: ["sanitation", "hygiene", "cleaning", "waste"],
    clothing: ["tailoring", "clothing", "distribution"],
    livelihood: ["livelihood", "employment", "skills", "training"],
    other: ["coordination", "logistics"],
  };

  const relevantSkills = categorySkillMap[need.category] ?? [];
  const volunteerSkillsLower = volunteer.skills.map((s) => s.toLowerCase());
  const requiredSkillsLower = requiredSkills.map((s) => s.toLowerCase());
  const skillPool = requiredSkillsLower.length > 0 ? requiredSkillsLower : relevantSkills;
  const matchCount = skillPool.filter((s) => volunteerSkillsLower.some((vs) => vs.includes(s) || s.includes(vs))).length;
  const skillScore = skillPool.length > 0 ? Math.round((matchCount / skillPool.length) * 40) : volunteerSkillsLower.length > 0 ? 20 : 0;

  const statusAvailable = volunteer.availabilityStatus === "available";
  const statusBusy = volunteer.availabilityStatus === "busy";
  let availabilityScore: number;
  if (dayOverlap === "n/a") {
    const baseScores: Record<string, number> = { available: 20, busy: 8, on_task: 3 };
    availabilityScore = baseScores[volunteer.availabilityStatus] ?? 8;
  } else if (dayOverlap === "full") {
    availabilityScore = statusAvailable ? 20 : statusBusy ? 10 : 5;
  } else if (dayOverlap === "partial") {
    availabilityScore = statusAvailable ? 8 : statusBusy ? 4 : 2;
  } else {
    availabilityScore = 0;
  }

  const rate =
    volunteer.tasksAssigned > 0
      ? volunteer.tasksCompleted / volunteer.tasksAssigned
      : 0.5;
  const completionRateScore = Math.round(rate * 10);

  const total = Math.min(100, locationScore + skillScore + availabilityScore + completionRateScore);

  return { 
    total, 
    locationScore, 
    locationMatchStatus: locMatch.status,
    matchedKeywords: locMatch.keywords,
    skillScore, 
    availabilityScore, 
    completionRateScore, 
    dayOverlap, 
    missingDays 
  };
}

function getKeywordMatch(area1: string, area2: string) {
  const getWords = (str: string) => 
    str.toLowerCase()
       .replace(/[,.-]/g, ' ')
       .split(/\s+/)
       .filter(w => w.length > 2 && !["zone", "area", "district", "street", "near"].includes(w));
  
  const w1 = getWords(area1);
  const w2 = getWords(area2);
  const s1 = new Set(w1);
  const s2 = new Set(w2);
  
  const intersection = w1.filter(w => s2.has(w));
  const uniqueIntersection = [...new Set(intersection)];

  if (uniqueIntersection.length === 0) return { status: "none" as const, keywords: [] };
  
  // Full match if all keywords of either area are found in the other
  const isFull = uniqueIntersection.length >= Math.min(s1.size, s2.size) && s1.size > 0 && s2.size > 0;
  
  return {
    status: isFull ? ("full" as const) : ("partial" as const),
    keywords: uniqueIntersection
  };
}


function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function daysUnresolved(reportDate: Date | string): number {
  return Math.floor(
    (Date.now() - new Date(reportDate).getTime()) / (1000 * 60 * 60 * 24)
  );
}
