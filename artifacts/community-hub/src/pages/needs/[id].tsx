import { useParams, Link } from "@tanstack/react-router";
import {
  useGetNeed,
  useUpdateNeedStatus,
  useAssignVolunteerToNeed,
  useAssignVolunteersBulk,
  useListNeedAssignments,
  useGetMatchedVolunteers,
  useGetNeedAuditTrail,
  getGetNeedQueryKey,
  getGetMatchedVolunteersQueryKey,
  getGetNeedAuditTrailQueryKey,
  getListNeedAssignmentsQueryKey,
  NeedStatus,
  UpdateNeedStatusBodyStatus,
  VolunteerMatch,
  useListNeedAttachments,
  useUploadNeedAttachment,
  useDeleteNeedAttachment,
  getListNeedAttachmentsQueryKey,
} from "@workspace/api-client-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAppContext } from "@/lib/contexts";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { format } from "date-fns";
import {
  CheckCircle2,
  Clock,
  MapPin,
  AlertTriangle,
  User,
  Activity,
  FileText,
  ArrowRight,
  Loader2,
  Star,
  Paperclip,
  X,
  Plus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const PIPELINE_STAGES = [
  NeedStatus.reported,
  NeedStatus.verified,
  NeedStatus.assigned,
  NeedStatus.in_progress,
  NeedStatus.resolved,
  NeedStatus.closed,
];

export default function NeedDetail() {
  const { id } = useParams({ strict: false });
  const needId = parseInt(id || "0");
  const { user, t } = useAppContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: need, isLoading: needLoading } = useGetNeed(needId, {
    query: { enabled: !!needId, queryKey: getGetNeedQueryKey(needId) } as any,
  });
  const { data: matches, isLoading: matchesLoading } = useGetMatchedVolunteers(
    needId,
    {
      query: {
        enabled:
          !!needId &&
          need?.status !== NeedStatus.resolved &&
          need?.status !== NeedStatus.closed,
        queryKey: getGetMatchedVolunteersQueryKey(needId),
      } as any,
    },
  );
  const { data: auditTrail, isLoading: auditLoading } = useGetNeedAuditTrail(
    needId,
    { query: { enabled: !!needId, queryKey: getGetNeedAuditTrailQueryKey(needId) } as any },
  );
  const { data: attachments, refetch: refetchAttachments } = useListNeedAttachments(needId, {
    query: { enabled: !!needId, queryKey: getListNeedAttachmentsQueryKey(needId) } as any
  });

  const uploadAttachment = useUploadNeedAttachment();
  const deleteAttachment = useDeleteNeedAttachment();

  const updateStatus = useUpdateNeedStatus();
  const assignVolunteer = useAssignVolunteerToNeed();
  const assignBulk = useAssignVolunteersBulk();
  const { data: assignedList } = useListNeedAssignments(needId, {
    query: { enabled: !!needId, queryKey: getListNeedAssignmentsQueryKey(needId) } as any,
  });
  const [staged, setStaged] = useState<number[]>([]);
  const [pendingPartial, setPendingPartial] = useState<{ id: number; name: string; missing: string[] } | null>(null);

  const toggleStage = (m: any) => {
    if (m.dayOverlap === "none") return;
    if (m.dayOverlap === "partial" && !staged.includes(m.volunteerId)) {
      setPendingPartial({ id: m.volunteerId, name: m.name, missing: m.missingDays ?? [] });
      return;
    }
    setStaged((prev) =>
      prev.includes(m.volunteerId) ? prev.filter((x) => x !== m.volunteerId) : [...prev, m.volunteerId],
    );
  };

  const confirmStagePartial = () => {
    if (pendingPartial) setStaged((prev) => [...prev, pendingPartial.id]);
    setPendingPartial(null);
  };

  const confirmAll = async () => {
    if (staged.length === 0) return;
    try {
      await assignBulk.mutateAsync({ id: needId, data: { volunteerIds: staged } });
      queryClient.invalidateQueries({ queryKey: getGetNeedQueryKey(needId) });
      queryClient.invalidateQueries({ queryKey: getListNeedAssignmentsQueryKey(needId) });
      toast({ title: `Assigned ${staged.length} volunteer(s)` });
      setStaged([]);
    } catch (e: any) {
      toast({ title: "Bulk assignment failed", description: e?.message, variant: "destructive" });
    }
  };

  if (needLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!need) return <div>Need not found</div>;

  const currentStageIndex = PIPELINE_STAGES.indexOf(need.status);

  const handleStatusUpdate = async (newStatus: UpdateNeedStatusBodyStatus) => {
    try {
      await updateStatus.mutateAsync({
        id: needId,
        data: { status: newStatus },
      });
      queryClient.invalidateQueries({ queryKey: getGetNeedQueryKey(needId) });
      toast({ title: "Status updated successfully" });
    } catch (e) {
      toast({ title: "Failed to update status", variant: "destructive" });
    }
  };

  const handleAssign = async (volunteerId: number) => {
    try {
      await assignVolunteer.mutateAsync({
        id: needId,
        data: { volunteerId },
      });
      queryClient.invalidateQueries({ queryKey: getGetNeedQueryKey(needId) });
      toast({ title: "Volunteer assigned successfully" });
    } catch (e) {
      toast({ title: "Failed to assign volunteer", variant: "destructive" });
    }
  };
  const handleUploadAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await uploadAttachment.mutateAsync({
        id: needId,
        data: { file }
      });
      toast({ title: "Attachment uploaded" });
      refetchAttachments();
    } catch (error) {
      toast({ title: "Upload failed", variant: "destructive" });
    }
  };

  const handleDeleteAttachment = async (aid: number) => {
    try {
      await deleteAttachment.mutateAsync({ id: aid });
      toast({ title: "Attachment deleted" });
      refetchAttachments();
    } catch (error) {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between gap-4 md:items-center">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Badge
              variant="outline"
              className="uppercase bg-secondary text-secondary-foreground transition-standard"
            >
              {need.category}
            </Badge>
            <Badge
              className={`transition-standard ${
                need.severity === "critical"
                  ? "bg-destructive hover:bg-destructive text-destructive-foreground"
                  : need.severity === "high"
                    ? "bg-amber-500 hover:bg-amber-600 text-white"
                    : need.severity === "medium"
                      ? "bg-yellow-500 hover:bg-yellow-600 text-white"
                      : "bg-[#10b981] hover:bg-[#10b981]/90 text-white"
              }`}
            >
              {need.severity.toUpperCase()}
            </Badge>
            <Badge variant="secondary" className="bg-slate-100 text-slate-700 transition-standard">
              Score: {need.urgencyScore || 0}
            </Badge>

          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {need.title}
          </h1>
        </div>
        <div className="flex gap-2">
          {currentStageIndex < PIPELINE_STAGES.length - 1 && (
            <Button
              onClick={() =>
                handleStatusUpdate(
                  PIPELINE_STAGES[
                    currentStageIndex + 1
                  ] as UpdateNeedStatusBodyStatus,
                )
              }
              disabled={updateStatus.isPending}
            >
              Advance to{" "}
              {PIPELINE_STAGES[currentStageIndex + 1]
                .replace("_", " ")
                .toUpperCase()}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </div>

      {/* Status Pipeline */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between relative">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-muted rounded-full" />
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-primary rounded-full transition-all duration-500"
              style={{
                width: `${(Math.max(0, currentStageIndex) / (PIPELINE_STAGES.length - 1)) * 100}%`,
              }}
            />

            {PIPELINE_STAGES.map((stage, idx) => {
              const isCompleted = idx <= currentStageIndex;
              const isCurrent = idx === currentStageIndex;

              return (
                <div
                  key={stage}
                  className="relative z-10 flex flex-col items-center gap-2"
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                      isCompleted
                        ? "bg-primary border-primary text-primary-foreground"
                        : "bg-background border-muted-foreground/30 text-muted-foreground"
                    } ${isCurrent ? "ring-4 ring-primary/20 border-primary" : ""}`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-5 h-5 animate-[page-entrance_200ms_ease-out]" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-current" />
                    )}
                  </div>
                  <span
                    className={`text-xs font-medium uppercase absolute -bottom-6 whitespace-nowrap transition-colors duration-200 ${isCompleted ? "text-primary" : "text-muted-foreground"}`}
                  >
                    {stage.replace("_", " ")}
                  </span>
                </div>

              );
            })}
          </div>
          <div className="h-6" /> {/* Spacer for labels */}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Details Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                Need Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {need.description && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">
                    Description
                  </h3>
                  <p className="text-foreground whitespace-pre-wrap">
                    {need.description}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1 mb-1">
                    <MapPin className="w-3 h-3" /> Area
                  </h3>
                  <p className="text-foreground font-medium">{need.area}</p>
                </div>
                {need.zone && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">
                      Zone
                    </h3>
                    <p className="text-foreground font-medium">{need.zone}</p>
                  </div>
                )}
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1 mb-1">
                    <User className="w-3 h-3" /> Affected
                  </h3>
                  <p className="text-foreground font-medium">
                    {need.affectedCount} people
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1 mb-1">
                    <Clock className="w-3 h-3" /> Reported On
                  </h3>
                  <p className="text-foreground font-medium">
                    {format(new Date(need.reportDate), "MMM d, yyyy")}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">
                    Source
                  </h3>
                  <p className="text-foreground font-medium capitalize">
                    {need.sourceType}
                  </p>
                </div>
                {need.reporterName && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">
                      Reporter
                    </h3>
                    <p className="text-foreground font-medium">
                      {need.reporterName}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Volunteer Assignment Section */}
          {need.status !== NeedStatus.resolved &&
            need.status !== NeedStatus.closed && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="w-5 h-5 text-primary" />
                    Volunteer Assignment
                  </CardTitle>
                  <CardDescription>
                    {need.assignedVolunteerId
                      ? `Currently assigned to ${need.assignedVolunteerName}`
                      : "No volunteer currently assigned"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {matchesLoading ? (
                    <div className="flex justify-center p-4">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : matches && matches.length > 0 ? (
                    <div className="space-y-4 h-full flex flex-col">
                      {assignedList && assignedList.length > 0 && (
                        <div className="rounded-md border bg-muted/30 p-3 space-y-3">
                          <p className="text-xs font-semibold text-muted-foreground">
                            Volunteers Assigned: {assignedList.length}
                          </p>
                          <div className="space-y-2">
                            {assignedList.map((a: any) => (
                              <div key={a.id} className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{a.volunteerName}</span>
                                    <Badge variant="outline" className="text-[10px]">{a.status?.replace("_", " ")}</Badge>
                                  </div>
                                  <span className="tabular-nums text-muted-foreground">{a.progress ?? 0}%</span>
                                </div>
                                <div className="h-1.5 bg-muted rounded overflow-hidden">
                                  <div
                                    className={`h-full transition-all ${
                                      (a.progress ?? 0) >= 100
                                        ? "bg-green-600"
                                        : (a.progress ?? 0) >= 50
                                        ? "bg-primary"
                                        : "bg-yellow-500"
                                    }`}
                                    style={{ width: `${a.progress ?? 0}%` }}
                                  />
                                </div>
                                {Array.isArray(a.progressNotes) && a.progressNotes.length > 0 && (
                                  <details className="text-[11px] text-muted-foreground pl-1">
                                    <summary className="cursor-pointer">Notes ({a.progressNotes.length})</summary>
                                    <div className="space-y-1 pt-1">
                                      {a.progressNotes.slice().reverse().map((n: any, idx: number) => (
                                        <div key={idx} className="border-l-2 border-muted pl-2">
                                          <span className="font-medium">{n.progress}%</span> — {n.note}
                                          <div className="text-[10px]">{new Date(n.at).toLocaleString()}</div>
                                        </div>
                                      ))}
                                    </div>
                                  </details>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {staged.length > 0 && (
                        <div className="rounded-md border-2 border-primary/40 bg-primary/5 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold">Selected for Assignment ({staged.length})</p>
                            <Button size="sm" onClick={confirmAll} disabled={assignBulk.isPending}>
                              {assignBulk.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                              Confirm All Assignments ({staged.length})
                            </Button>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {staged.map((id) => {
                              const m: any = matches.find((x: any) => x.volunteerId === id);
                              return (
                                <Badge key={id} variant="outline" className="text-[10px] gap-1 cursor-pointer"
                                  onClick={() => setStaged((prev) => prev.filter((x) => x !== id))}>
                                  {m?.name ?? `#${id}`} ×
                                </Badge>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      <div className="space-y-6">
                        {/* SAME AREA SECTION */}
                        <div className="space-y-3">
                          <h3 className="text-[11px] font-bold uppercase tracking-widest text-emerald-600 flex items-center gap-2 mb-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            In the Same Area ({matches.filter((m: any) => m.locationMatchStatus === "full" && m.dayOverlap !== "none").length})
                          </h3>
                          {matches.filter((m: any) => m.locationMatchStatus === "full" && m.dayOverlap !== "none").length === 0 ? (
                            <p className="text-xs text-muted-foreground italic pl-4">No volunteers found in this exact area.</p>
                          ) : (
                            matches.filter((m: any) => m.locationMatchStatus === "full" && m.dayOverlap !== "none").map((match: any, idx: number) => (

                              <div
                                key={match.volunteerId}
                                className={`flex items-center justify-between p-4 border rounded-xl hover:bg-emerald-50/30 hover:border-emerald-200 transition-all shadow-sm animate-fade-up ${staged.includes(match.volunteerId) ? 'bg-emerald-50/50 border-emerald-300' : ''}`}
                                style={{ animationDelay: `${idx * 50}ms` }}
                              >

                                <div className="flex items-center gap-4">
                                  <div className="w-11 h-11 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-extrabold text-sm border-2 border-emerald-200">
                                    {Math.round(match.matchScore)}%
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <p className="font-semibold text-foreground">
                                        {match.name}
                                      </p>
                                      <Badge className="bg-emerald-500 text-white border-transparent text-[10px] px-2 h-5">Same Area</Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {match.area} • {match.tasksCompleted} tasks
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="flex gap-1.5 cursor-help">
                                        {match.skills.slice(0, 2).map((skill: string) => (
                                          <Badge key={skill} variant="outline" className="text-[10px] py-0 h-5 bg-muted/50 border-muted-foreground/20">
                                            {skill}
                                          </Badge>
                                        ))}
                                        {match.skills.length > 2 && (
                                          <Badge variant="outline" className="text-[10px] py-0 h-5 bg-muted/50">+{match.skills.length - 2}</Badge>
                                        )}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent className="w-60 p-0 overflow-hidden rounded-lg shadow-xl border-emerald-100">
                                      <div className="bg-emerald-600 text-white px-3 py-2 text-xs font-bold flex justify-between items-center">
                                        <span>Match Score Breakdown</span>
                                        <span className="bg-white/20 px-1.5 rounded">{Math.round(match.matchScore)}%</span>
                                      </div>
                                      <div className="p-3 space-y-2 bg-card">
                                        <div className="flex justify-between text-[11px]">
                                          <span className="text-muted-foreground">Location (Keywords)</span>
                                          <span className="font-bold text-emerald-600">{Math.round(match.locationScore)}/30</span>
                                        </div>
                                        {match.matchedKeywords && match.matchedKeywords.length > 0 && (
                                          <div className="flex flex-wrap gap-1 mt-1">
                                            {match.matchedKeywords.map((k: string) => (
                                              <span key={k} className="bg-emerald-50 text-emerald-700 text-[9px] px-1.5 py-0.5 rounded border border-emerald-100">"{k}"</span>
                                            ))}
                                          </div>
                                        )}
                                        <div className="flex justify-between text-[11px] pt-1">
                                          <span className="text-muted-foreground">Skill Matching</span>
                                          <span className="font-bold text-blue-600">{Math.round(match.skillScore)}/40</span>
                                        </div>
                                        <div className="flex justify-between text-[11px]">
                                          <span className="text-muted-foreground">Availability</span>
                                          <span className="font-bold text-amber-600">{Math.round(match.availabilityScore)}/20</span>
                                        </div>
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>

                                  <Button
                                    size="sm"
                                    className="h-8 rounded-lg shadow-sm"
                                    variant={staged.includes(match.volunteerId) ? "secondary" : "default"}
                                    onClick={() => toggleStage(match)}
                                  >
                                    {staged.includes(match.volunteerId) ? "Selected ✓" : "Assign"}
                                  </Button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                        {/* DIFFERENT AREA SECTION */}
                        <div className="space-y-3 pt-2">
                          <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2 mb-2">
                            <span className="w-2 h-2 rounded-full bg-slate-400" />
                            In Different Areas ({matches.filter((m: any) => m.locationMatchStatus !== "full" && m.dayOverlap !== "none").length})
                          </h3>
                          {matches.filter((m: any) => m.locationMatchStatus !== "full" && m.dayOverlap !== "none").map((match: any, idx: number) => (

                            <div
                              key={match.volunteerId}
                              className={`flex items-center justify-between p-3.5 border rounded-xl hover:bg-muted/30 transition-all opacity-85 hover:opacity-100 animate-fade-up ${staged.includes(match.volunteerId) ? 'bg-emerald-50/50 border-emerald-300 opacity-100' : ''}`}
                              style={{ animationDelay: `${idx * 50}ms` }}
                            >

                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs border border-slate-200">
                                  {Math.round(match.matchScore)}%
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium text-foreground text-sm">
                                      {match.name}
                                    </p>
                                    <Badge variant="secondary" className="bg-slate-100 text-slate-600 border-slate-200 text-[10px] px-1.5 h-4.5">
                                      {match.locationMatchStatus === "partial" ? "Nearby" : "Different Area"}
                                    </Badge>
                                  </div>
                                  <p className="text-[11px] text-muted-foreground">
                                    {match.area}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex gap-1 cursor-help opacity-70">
                                      {match.skills.slice(0, 1).map((skill: string) => (
                                        <Badge key={skill} variant="outline" className="text-[10px] h-5">{skill}</Badge>
                                      ))}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-[10px]">Location Match: {Math.round(match.locationScore)}/30</p>
                                    <p className="text-[10px]">Skills Match: {Math.round(match.skillScore)}/40</p>
                                  </TooltipContent>
                                </Tooltip>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 text-xs border hover:bg-white"
                                  onClick={() => toggleStage(match)}
                                >
                                  {staged.includes(match.volunteerId) ? "Selected" : "Assign"}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* SCHEDULE CONFLICT DETAILS */}
                        {matches.filter((m: any) => m.dayOverlap === "none").length > 0 && (
                          <details className="rounded-xl border bg-destructive/5 overflow-hidden">
                            <summary className="cursor-pointer px-4 py-3 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors flex items-center justify-between">
                              <span>Schedule Conflict ({matches.filter((m: any) => m.dayOverlap === "none").length})</span>
                              <span className="text-[10px] font-normal opacity-70">Not available on required days</span>
                            </summary>
                            <div className="p-4 space-y-2 border-t border-destructive/10 bg-white">
                              {matches.filter((m: any) => m.dayOverlap === "none").map((m: any) => (
                                <div key={m.volunteerId} className="flex items-center justify-between text-xs py-1 border-b border-muted transition-all">
                                  <span className="font-medium">{m.name} <span className="text-muted-foreground font-normal ml-2">({m.area})</span></span>
                                  <Badge variant="outline" className="text-[9px] text-destructive border-destructive/20 h-5">Unavailable</Badge>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    </div>
                  ) : (
                      <div className="text-center py-6 text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
                        No suitable volunteer matches found based on location,
                        skills, and availability.
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

          <AlertDialog open={!!pendingPartial} onOpenChange={(o) => !o && setPendingPartial(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Partial availability</AlertDialogTitle>
                <AlertDialogDescription>
                  {pendingPartial?.name} is not available on all required days
                  {pendingPartial && pendingPartial.missing.length > 0 && (
                    <> (missing: {pendingPartial.missing.join(", ")})</>
                  )}. Assign anyway?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={confirmStagePartial}>Confirm</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-primary" />
                  Attachments
                </div>
                <label className="cursor-pointer">
                  <Plus className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors" />
                  <input type="file" className="hidden" onChange={handleUploadAttachment} />
                </label>
              </CardTitle>
              <CardDescription className="text-[10px]">Guidelines, maps, or route details.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {attachments && attachments.length > 0 ? (
                attachments.map((a: any) => (
                  <div key={a.id} className="group flex items-center justify-between p-2 rounded-lg border bg-background/50 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <a 
                          href={a.filePath} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="text-xs font-medium truncate block hover:underline hover:text-primary"
                          title={a.fileName}
                        >
                          {a.fileName}
                        </a>
                        <p className="text-[10px] text-muted-foreground">
                          {Math.round(a.fileSize / 1024)} KB
                        </p>
                      </div>
                    </div>
                    {user && ["admin", "coordinator", "super_admin"].includes(user.role) && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleDeleteAttachment(a.id)}
                      >
                        <X className="h-3 w-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-[11px] text-muted-foreground italic bg-muted/20 rounded border border-dashed">
                  No attachments yet.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Audit Trail
              </CardTitle>
            </CardHeader>
            <CardContent>
              {auditLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="w-2 h-2 mt-1.5 rounded-full bg-muted" />
                      <div className="space-y-2 flex-1">
                        <div className="h-3 bg-muted rounded w-3/4" />
                        <div className="h-2 bg-muted rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : auditTrail && auditTrail.length > 0 ? (
                <div className="space-y-4 relative before:absolute before:inset-0 before:ml-[5px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
                  {auditTrail.map((entry: any, i: number) => (
                    <div
                      key={entry.id}
                      className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active"
                    >
                      <div className="flex items-center justify-center w-3 h-3 rounded-full border border-white bg-slate-300 group-[.is-active]:bg-primary text-slate-500 group-[.is-active]:text-primary-foreground shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2" />
                      <div className="w-[calc(100%-2rem)] md:w-[calc(50%-1.5rem)] p-3 rounded border border-slate-200 bg-white shadow-sm">
                        <div className="flex items-center justify-between space-x-2 mb-1">
                          <div className="font-bold text-slate-900 text-xs capitalize">
                            {entry.action.replace("_", " ")}
                          </div>
                          <time className="font-caveat font-medium text-primary text-[10px]">
                            {format(new Date(entry.createdAt), "MMM d, HH:mm")}
                          </time>
                        </div>
                        {entry.newValue && (
                          <div className="text-slate-500 text-xs">
                            Changed to{" "}
                            <span className="font-medium text-slate-700">
                              {entry.newValue}
                            </span>
                            {entry.performedBy && ` by ${entry.performedBy}`}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No history available
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
