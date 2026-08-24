import { jsPDF } from 'jspdf';

// Keep this strictly synchronized with the AI JSON schema
export interface QuickScanData {
  projectInfo: { orgName: string; sourceFile: string; generatedOn: string };
  executiveSummary: string;
  stats: { totalRecords: number; issuesIdentified: number; areasCovered: number; peopleAffected: number };
  severityDistribution: { critical: number; high: number; medium: number; low: number };
  topIssues: Array<{ issueTitle: string; category: string; reports: number; affected: number; area: string; severity: string }>;
  locationBreakdown: Array<{ area: string; reports: number; peopleAffected: number; topIssue: string; criticalCount: number }>;
  categoryDistribution: Array<{ customCategory: string; percentage: number }>;
  recommendations: string[];
  dataQualityNotes: string;
  detailedIssues: Array<{ title: string; severity: string; category: string; description: string; reports: number; affected: number; avgDurationText: string; primaryArea: string; alsoReportedIn: string; pctOfTotal: string; reporters: string }>;
}

export const generateQuickScanReport = async (data: QuickScanData) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  });

  doc.setProperties({
    title: 'Community Needs Analysis Report',
    author: 'CommUnity Hub',
    subject: 'Quick Scan Report',
    keywords: 'community, needs, NGO, analysis'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 50;
  
  // Use a generic placeholder logo if specific file not requested, but try standard path
  const logoUrl = '/logo.png'; // Will try standard public logo if exists
  let logoImg: HTMLImageElement | null = null;
  try {
    logoImg = new Image();
    logoImg.src = logoUrl;
    await new Promise((resolve) => {
      logoImg!.onload = resolve;
      logoImg!.onerror = resolve; // Just skip if error
    });
  } catch (e) {
    // Ignore
  }

  // Helper colors
  const primary = { r: 26, g: 107, b: 92, hex: '#1a6b5c' };
  
  const drawStandardHeader = (page: number) => {
    doc.setFillColor(247, 247, 247);
    doc.rect(0, 0, pageWidth, 50, 'F');
    doc.setTextColor(primary.r, primary.g, primary.b);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Community Needs Analysis Report', marginX, 30);
    doc.setTextColor(136, 136, 136);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`${data.projectInfo.orgName} · ${data.projectInfo.generatedOn}`, marginX + 220, 30);
    
    doc.setTextColor(170, 170, 170);
    doc.setFontSize(9);
    doc.text(`Page ${page} of 3`, pageWidth - marginX - 40, 30);

    // Accent bar
    doc.setDrawColor(232, 147, 26);
    doc.setLineWidth(4);
    doc.line(0, 50, pageWidth, 50);
  };

  const drawFooter = (page: number) => {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, pageHeight - 40, pageWidth, 40, 'F');
    doc.setTextColor(170, 170, 170);
    doc.setFontSize(8);
    doc.text('CommUnity Hub · Community Coordination & NGO Management · Confidential', marginX + 30, pageHeight - 20);
    doc.text(`Page ${page} of 3`, pageWidth - marginX - 40, pageHeight - 20);
  };

  // --- PAGE 1 ---
  
  // Background Header
  doc.setFillColor(primary.r, primary.g, primary.b);
  doc.rect(0, 0, pageWidth, 220, 'F');
  
  // Decorative circles
  doc.setFillColor(255, 255, 255);
  doc.setGState(new (doc as any).GState({ opacity: 0.05 }));
  doc.circle(pageWidth - 50, 40, 100, 'F');
  doc.circle(50, 180, 40, 'F');
  doc.setGState(new (doc as any).GState({ opacity: 1.0 }));

  if (logoImg && logoImg.width > 0) {
    doc.addImage(logoImg, 'PNG', marginX, 35, 18 * (logoImg.width / logoImg.height), 18);
  }

  // Pill badge
  doc.setGState(new (doc as any).GState({ opacity: 0.15 }));
  doc.roundedRect(marginX, 75, 110, 18, 9, 9, 'F');
  doc.setGState(new (doc as any).GState({ opacity: 1.0 }));
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('QUICK SCAN REPORT', marginX + 10, 87);

  // Title
  doc.setFontSize(28);
  doc.text('Community Needs Analysis Report', marginX, 120);
  doc.setTextColor(255, 255, 255);
  doc.setGState(new (doc as any).GState({ opacity: 0.65 }));
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('Field Survey & Data Intelligence Summary', marginX, 140);
  doc.setGState(new (doc as any).GState({ opacity: 1.0 }));

  // Divider
  doc.setDrawColor(255, 255, 255);
  doc.setGState(new (doc as any).GState({ opacity: 0.15 }));
  doc.setLineWidth(1);
  doc.line(marginX, 160, pageWidth - marginX, 160);
  doc.setGState(new (doc as any).GState({ opacity: 1.0 }));

  // Metadata
  doc.setFontSize(8);
  doc.setTextColor(200, 200, 200);
  const colW = (pageWidth - marginX * 2) / 4;
  doc.text('Organisation', marginX, 180);
  doc.text('Source File', marginX + colW, 180);
  doc.text('Generated On', marginX + colW * 2, 180);
  doc.text('Total Records', marginX + colW * 3, 180);
  
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(data.projectInfo.orgName, marginX, 195);
  let srcFile = doc.splitTextToSize(data.projectInfo.sourceFile, colW - 10);
  doc.text(srcFile[0] || "Unknown", marginX + colW, 195);
  doc.text(data.projectInfo.generatedOn, marginX + colW * 2, 195);
  doc.text(data.stats.totalRecords.toString(), marginX + colW * 3, 195);

  // Accent bar
  doc.setFillColor(232, 147, 26);
  doc.rect(0, 220, pageWidth, 4, 'F');

  // Executive Summary
  let y = 250;
  doc.setFontSize(8);
  doc.setTextColor(primary.r, primary.g, primary.b);
  doc.setFont('helvetica', 'bold');
  doc.text('EXECUTIVE SUMMARY', marginX, y);
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.5);
  doc.line(marginX + 110, y - 3, pageWidth - marginX, y - 3);

  y += 15;
  doc.setFillColor(244, 250, 247);
  doc.roundedRect(marginX, y, pageWidth - marginX * 2, 80, 4, 4, 'F');
  doc.setDrawColor(primary.r, primary.g, primary.b);
  doc.setLineWidth(3);
  doc.line(marginX, y, marginX, y + 80);
  
  doc.setTextColor(51, 51, 51);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  const exLines = doc.splitTextToSize(data.executiveSummary, pageWidth - marginX * 2 - 20);
  doc.text(exLines.slice(0, 5), marginX + 10, y + 20);
  y += 100;

  // Stats Row
  const boxW = (pageWidth - marginX * 2 - 30) / 4;
  const stats = [
    { label: 'Total Records', val: data.stats.totalRecords },
    { label: 'Issues Identified', val: data.stats.issuesIdentified },
    { label: 'Areas Covered', val: data.stats.areasCovered },
    { label: 'People Affected', val: data.stats.peopleAffected }
  ];
  
  stats.forEach((s, i) => {
    const rx = marginX + (boxW + 10) * i;
    doc.setFillColor(247, 247, 247);
    doc.roundedRect(rx, y, boxW, 60, 6, 6, 'F');
    doc.setTextColor(s.label === 'Critical Count' || s.val > 1000 ? 226 : primary.r, s.val > 1000 ? 75 : primary.g, s.val > 1000 ? 74 : primary.b);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(s.val.toString(), rx + boxW/2, y + 35, { align: 'center' });
    doc.setTextColor(136, 136, 136);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(s.label, rx + boxW/2, y + 50, { align: 'center' });
  });

  y += 80;

  // Severity Distribution
  const sevs = [
    { label: 'Critical', val: data.severityDistribution.critical, bg: [255,240,240], text: [163,45,45], dot: '#e24b4a' },
    { label: 'High', val: data.severityDistribution.high, bg: [255,247,237], text: [133,79,11], dot: '#f59e0b' },
    { label: 'Medium', val: data.severityDistribution.medium, bg: [255,251,235], text: [122,96,0], dot: '#eab308' },
    { label: 'Low', val: data.severityDistribution.low, bg: [234,243,222], text: [59,109,17], dot: '#22c55e' }
  ];

  sevs.forEach((s, i) => {
    const rx = marginX + (boxW + 10) * i;
    doc.setFillColor(s.bg[0], s.bg[1], s.bg[2]);
    doc.roundedRect(rx, y, boxW, 25, 12, 12, 'F');
    doc.setTextColor(s.text[0], s.text[1], s.text[2]);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(s.label, rx + 15, y + 16);
    doc.text(s.val.toString(), rx + boxW - 15, y + 16, { align: 'right' });
  });

  y += 50;

  // Top Issues Table
  doc.setFontSize(8);
  doc.setTextColor(102, 102, 102);
  doc.setFillColor(240, 240, 240);
  doc.rect(marginX, y, pageWidth - marginX * 2, 20, 'F');
  
  const tCols = [marginX + 5, marginX + 25, marginX + 180, marginX + 260, marginX + 310, marginX + 360, marginX + 430];
  doc.text('#', tCols[0], y + 14);
  doc.text('ISSUE TITLE', tCols[1], y + 14);
  doc.text('CATEGORY', tCols[2], y + 14);
  doc.text('REPORTS', tCols[3], y + 14);
  doc.text('AFFECTED', tCols[4], y + 14);
  doc.text('AREA', tCols[5], y + 14);
  doc.text('SEVERITY', tCols[6], y + 14);

  y += 20;

  data.topIssues.slice(0, 10).forEach((issue, i) => {
    if (i % 2 === 1) {
      doc.setFillColor(250, 250, 250);
      doc.rect(marginX, y, pageWidth - marginX * 2, 25, 'F');
    }
    
    doc.setTextColor(51, 51, 51);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text((i+1).toString(), tCols[0], y + 16);
    
    let title = doc.splitTextToSize(issue.issueTitle, 140)[0];
    if (issue.issueTitle.length > title.length) title += "...";
    doc.setFont('helvetica', 'bold');
    doc.text(title, tCols[1], y + 16);
    doc.setFont('helvetica', 'normal');

    // Category Badge
    doc.setFillColor(241, 239, 232); doc.setTextColor(95, 94, 90);
    if(issue.category.toLowerCase().includes('water')) { doc.setFillColor(225,245,238); doc.setTextColor(15,110,86); }
    if(issue.category.toLowerCase().includes('medical')) { doc.setFillColor(230,241,251); doc.setTextColor(24,95,165); }
    if(issue.category.toLowerCase().includes('food')) { doc.setFillColor(250,238,218); doc.setTextColor(133,79,11); }
    if(issue.category.toLowerCase().includes('shelter')) { doc.setFillColor(238,237,254); doc.setTextColor(83,74,183); }
    doc.roundedRect(tCols[2], y + 6, 60, 14, 7, 7, 'F');
    doc.text(issue.category.toUpperCase(), tCols[2] + 30, y + 15, { align: 'center', baseline: 'middle' });

    doc.setTextColor(51, 51, 51);
    doc.text(issue.reports.toString(), tCols[3], y + 16);
    doc.text(issue.affected.toString(), tCols[4], y + 16);
    
    let area = doc.splitTextToSize(issue.area, 65)[0];
    doc.text(area, tCols[5], y + 16);

    // Severity Badge
    let sbBg = [234,243,222], sbTx = [59,109,17]; // low
    if(issue.severity.toLowerCase() === 'critical') { sbBg = [255,240,240]; sbTx = [163,45,45]; }
    else if(issue.severity.toLowerCase() === 'high') { sbBg = [255,247,237]; sbTx = [133,79,11]; }
    else if(issue.severity.toLowerCase() === 'medium') { sbBg = [255,251,235]; sbTx = [122,96,0]; }
    doc.setFillColor(sbBg[0], sbBg[1], sbBg[2]);
    doc.roundedRect(tCols[6], y + 6, 50, 14, 7, 7, 'F');
    doc.setTextColor(sbTx[0], sbTx[1], sbTx[2]);
    doc.text(issue.severity.toUpperCase(), tCols[6] + 25, y + 15, { align: 'center', baseline: 'middle' });

    y += 25;
  });

  drawFooter(1);

  // --- PAGE 2 ---
  doc.addPage();
  drawStandardHeader(2);
  y = 80;

  // Location Breakdown
  doc.setFontSize(8);
  doc.setTextColor(primary.r, primary.g, primary.b);
  doc.setFont('helvetica', 'bold');
  doc.text('LOCATION BREAKDOWN', marginX, y);
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.5);
  doc.line(marginX + 120, y - 3, pageWidth - marginX, y - 3);

  y += 20;

  // Loc Table Header
  doc.setFillColor(240, 240, 240);
  doc.rect(marginX, y, pageWidth - marginX * 2, 20, 'F');
  doc.setTextColor(102, 102, 102);
  doc.text('AREA', marginX + 5, y + 14);
  doc.text('REPORTS', marginX + 120, y + 14);
  doc.text('AFFECTED', marginX + 180, y + 14);
  doc.text('TOP ISSUE', marginX + 240, y + 14);
  doc.text('CRITICAL', marginX + 380, y + 14);
  doc.text('COVERAGE', marginX + 440, y + 14);

  y += 20;
  const maxLocRep = Math.max(...data.locationBreakdown.map(l => l.reports), 1);
  data.locationBreakdown.slice(0, 5).forEach((loc, i) => {
    if (i % 2 === 1) {
      doc.setFillColor(250, 250, 250);
      doc.rect(marginX, y, pageWidth - marginX * 2, 25, 'F');
    }
    
    doc.setTextColor(51, 51, 51);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    let lArea = doc.splitTextToSize(loc.area, 100)[0];
    doc.text(lArea, marginX + 5, y + 16);
    
    doc.setFont('helvetica', 'normal');
    doc.text(loc.reports.toString(), marginX + 120, y + 16);
    doc.text(loc.peopleAffected.toString(), marginX + 180, y + 16);
    
    let tIssue = doc.splitTextToSize(loc.topIssue, 130)[0];
    if (loc.topIssue.length > tIssue.length) tIssue += "...";
    doc.text(tIssue, marginX + 240, y + 16);

    if (loc.criticalCount > 0) {
      doc.setFillColor(255,240,240);
      doc.roundedRect(marginX + 380, y + 6, 25, 14, 7, 7, 'F');
      doc.setTextColor(163,45,45);
      doc.text(loc.criticalCount.toString(), marginX + 392.5, y + 15, { align: 'center', baseline: 'middle' });
    } else {
      doc.setTextColor(170, 170, 170);
      doc.text("-", marginX + 392.5, y + 16, { align: 'center' });
    }

    // Bar
    doc.setFillColor(238, 238, 238);
    doc.rect(marginX + 440, y + 10, 50, 6, 'F');
    doc.setFillColor(primary.r, primary.g, primary.b);
    let barW = (loc.reports / maxLocRep) * 50;
    doc.rect(marginX + 440, y + 10, barW, 6, 'F');

    y += 25;
  });

  y += 30;

  // Two columns
  const midX = pageWidth / 2 + 10;
  
  // Left col: Category
  doc.setFontSize(8);
  doc.setTextColor(primary.r, primary.g, primary.b);
  doc.setFont('helvetica', 'bold');
  doc.text('CATEGORY DISTRIBUTION', marginX, y);
  doc.setDrawColor(220, 220, 220);
  doc.line(marginX + 130, y - 3, midX - 20, y - 3);

  let cy = y + 20;
  data.categoryDistribution.forEach((cat) => {
    doc.setFillColor(247, 247, 247);
    doc.rect(marginX, cy, midX - marginX - 30, 24, 'F');
    
    let cHex = [136, 135, 128]; // other
    let n = cat.customCategory.toLowerCase();
    if(n.includes('medical')) cHex = [55,138,221];
    if(n.includes('food')) cHex = [239,159,39];
    if(n.includes('water')) cHex = [29,158,117];
    if(n.includes('shelter')) cHex = [127,119,221];
    if(n.includes('education')) cHex = [99,153,34];

    doc.setFillColor(cHex[0], cHex[1], cHex[2]);
    doc.circle(marginX + 10, cy + 12, 4, 'F');
    
    doc.setTextColor(51, 51, 51);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(cat.customCategory.toUpperCase(), marginX + 22, cy + 16);

    let maxBar = 80;
    let bW = (cat.percentage / 100) * maxBar;
    doc.setFillColor(230, 230, 230);
    doc.roundedRect(marginX + 100, cy + 10, maxBar, 4, 2, 2, 'F');
    doc.setFillColor(cHex[0], cHex[1], cHex[2]);
    doc.roundedRect(marginX + 100, cy + 10, bW, 4, 2, 2, 'F');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`${cat.percentage}%`, marginX + 190, cy + 15);

    cy += 30;
  });

  // Right col: Recommendations
  doc.setFontSize(8);
  doc.setTextColor(primary.r, primary.g, primary.b);
  doc.setFont('helvetica', 'bold');
  doc.text('KEY RECOMMENDATIONS', midX, y);
  doc.setDrawColor(220, 220, 220);
  doc.line(midX + 120, y - 3, pageWidth - marginX, y - 3);

  let ry = y + 20;
  data.recommendations.slice(0, 5).forEach((rec, i) => {
    doc.setFillColor(primary.r, primary.g, primary.b);
    doc.circle(midX + 11, ry + 6, 11, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text((i+1).toString(), midX + 11, ry + 10, { align: 'center' });

    doc.setTextColor(51, 51, 51);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    let rLines = doc.splitTextToSize(rec, pageWidth - marginX - midX - 30);
    doc.text(rLines, midX + 30, ry + 10);

    ry += rLines.length * 15 + 10;
  });

  y = Math.max(cy, ry) + 20;

  // Data Quality Notes
  doc.setFillColor(255, 247, 237);
  doc.setDrawColor(240, 200, 122);
  doc.setLineWidth(1);
  doc.roundedRect(marginX, y, pageWidth - marginX * 2, 60, 6, 6, 'FD');
  
  doc.setTextColor(245, 158, 11);
  doc.setFontSize(14);
  doc.text('!', marginX + 15, y + 25); // simple warning icon

  doc.setTextColor(90, 62, 0);
  doc.setFontSize(10);
  let dqLines = doc.splitTextToSize(data.dataQualityNotes, pageWidth - marginX * 2 - 40);
  doc.text(dqLines.slice(0, 3), marginX + 30, y + 20);

  drawFooter(2);

  // --- PAGE 3 ---
  doc.addPage();
  drawStandardHeader(3);
  y = 80;

  doc.setFontSize(8);
  doc.setTextColor(primary.r, primary.g, primary.b);
  doc.setFont('helvetica', 'bold');
  doc.text('DETAILED ISSUE ANALYSIS', marginX, y);
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.5);
  doc.line(marginX + 140, y - 3, pageWidth - marginX, y - 3);

  y += 30;

  data.detailedIssues.slice(0, 3).forEach((iss, i) => {
    // Circle Rank
    doc.setFillColor(primary.r, primary.g, primary.b);
    doc.circle(marginX + 14, y + 14, 14, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text((i+1).toString(), marginX + 14, y + 18, { align: 'center' });

    // Title + Badges
    doc.setTextColor(34, 34, 34);
    doc.setFontSize(13);
    doc.text(iss.title, marginX + 40, y + 15);
    let titleW = doc.getTextWidth(iss.title);

    // Sev badge
    let sbBg = [234,243,222], sbTx = [59,109,17]; // low
    if(iss.severity.toLowerCase() === 'critical') { sbBg = [255,240,240]; sbTx = [163,45,45]; }
    else if(iss.severity.toLowerCase() === 'high') { sbBg = [255,247,237]; sbTx = [133,79,11]; }
    doc.setFillColor(sbBg[0], sbBg[1], sbBg[2]);
    doc.roundedRect(marginX + 50 + titleW, y + 3, 50, 14, 7, 7, 'F');
    doc.setTextColor(sbTx[0], sbTx[1], sbTx[2]);
    doc.setFontSize(8);
    doc.text(iss.severity.toUpperCase(), marginX + 75 + titleW, y + 12, { align: 'center' });

    // Description
    doc.setTextColor(85, 85, 85);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    let dLines = doc.splitTextToSize(iss.description, pageWidth - marginX * 2 - 40);
    doc.text(dLines.slice(0, 3), marginX + 40, y + 35);

    let baseStatY = y + 35 + (Math.min(dLines.length, 3) * 15);

    // 3 Cell Stats
    const statW = (pageWidth - marginX * 2 - 40) / 3;
    const ista = [
      { label: 'REPORTS', val: iss.reports.toString() },
      { label: 'PEOPLE AFFECTED', val: iss.affected.toString() },
      { label: 'AVG. DURATION', val: iss.avgDurationText }
    ];
    ista.forEach((st, si) => {
      let sx = marginX + 40 + (statW + 10) * si;
      doc.setFillColor(247, 247, 247);
      doc.roundedRect(sx, baseStatY, statW, 35, 4, 4, 'F');
      doc.setTextColor(150, 150, 150);
      doc.setFontSize(8);
      doc.text(st.label, sx + 5, baseStatY + 14);
      doc.setTextColor(34, 34, 34);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(st.val, sx + 5, baseStatY + 28);
    });

    baseStatY += 45;

    // Chips
    doc.setFillColor(240, 240, 240);
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    let chips = [
      `Primary Area: ${iss.primaryArea}`,
      `Also in: ${iss.alsoReportedIn}`,
      `${iss.pctOfTotal} of total`,
      `Reporters: ${iss.reporters}`
    ];
    let cx = marginX + 40;
    chips.forEach(c => {
      let cw = doc.getTextWidth(c) + 16;
      if (cx + cw > pageWidth - marginX) return; // simple overflow protection
      doc.roundedRect(cx, baseStatY, cw, 16, 8, 8, 'F');
      doc.text(c, cx + 8, baseStatY + 11);
      cx += cw + 8;
    });

    y = baseStatY + 35;
    
    // Divider
    if (i < 2) {
      doc.setDrawColor(240, 240, 240);
      doc.setLineWidth(0.5);
      doc.line(marginX, y, pageWidth - marginX, y);
      y += 20;
    }
  });

  // Custom Branded Footer
  doc.setFillColor(244, 250, 247);
  doc.rect(0, pageHeight - 60, pageWidth, 60, 'F');
  doc.setDrawColor(primary.r, primary.g, primary.b);
  doc.setLineWidth(3);
  doc.line(0, pageHeight - 60, pageWidth, pageHeight - 60);

  if (logoImg && logoImg.width > 0) {
    doc.addImage(logoImg, 'PNG', marginX, pageHeight - 50, 20 * (logoImg.width / logoImg.height), 20);
  }

  doc.setTextColor(primary.r, primary.g, primary.b);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(data.projectInfo.orgName, marginX + 30, pageHeight - 40);

  doc.setTextColor(136, 136, 136);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('This report was auto-generated by Smart Drive Quick Scan. Verify key figures before external distribution.', marginX + 30, pageHeight - 25);

  doc.text('Page 3 of 3', pageWidth - marginX - 60, pageHeight - 40);
  doc.text(`Generated: ${data.projectInfo.generatedOn}`, pageWidth - marginX - 60, pageHeight - 25);

  // Construct filename safely
  const safeOrgName = data.projectInfo.orgName.replace(/[^a-z0-9]/gi, '_');
  const filename = `${safeOrgName}-Quick-Scan-Report-${data.projectInfo.generatedOn}.pdf`;
  doc.save(filename);
};
