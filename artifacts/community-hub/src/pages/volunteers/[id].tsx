import { useState, useEffect } from "react";
import { useParams, Link } from "@tanstack/react-router";
import {
  useGetVolunteer,
  useGetVolunteerTasks,
  useGetVolunteerImpact,
  useUpdateVolunteer,
  getGetVolunteerQueryKey,
  VolunteerAvailabilityStatus,
  UpdateVolunteerBodyAvailabilityStatus,
  Volunteer
} from "@workspace/api-client-react";
import { useAppContext } from "@/lib/contexts";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import {
  CheckCircle2, Clock, MapPin, Phone, Mail, Globe, Calendar, Award,
  KeyRound, ShieldOff, FileText, UserCog, AlertTriangle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/api";

type CredentialLog = {
  id: number;
  email: string;
  type: string;
  status: string;
  errorMessage: string | null;
  performedBy: string | null;
  createdAt: string;
};

type ActiveTask = { id: number; title: string; status: string; };

export default function VolunteerProfile() {
  const { id } = useParams({ strict: false });
  const volunteerId = parseInt(id || "0");
  const { user, t } = useAppContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isAdmin = user?.role !== "volunteer";

  const { data: volunteer, isLoading } = useGetVolunteer(volunteerId, { query: { enabled: !!volunteerId } as any });
  const { data: tasks } = useGetVolunteerTasks(volunteerId, { query: { enabled: !!volunteerId } as any });
  const { data: impact } = useGetVolunteerImpact(volunteerId, { query: { enabled: !!volunteerId } as any });

  const updateVolunteer = useUpdateVolunteer();

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    area: "",
    skills: [] as string[],
    phone: "",
    email: "",
  });

  useEffect(() => {
    if (volunteer) {
      setEditForm({
        area: volunteer.area,
        skills: volunteer.skills,
        phone: volunteer.phone || "",
        email: volunteer.email || "",
      });
    }
  }, [volunteer]);

  const [customSkill, setCustomSkill] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);

  const COMMON_SKILLS = [
    "Medical/First Aid", "Driving", "Logistics", "Cooking", "Translation",
    "Counseling", "Construction", "Childcare", "Data Entry", "Security"
  ];

  // Admin panel state
  const [credLogs, setCredLogs] = useState<CredentialLog[]>([]);
  const [credLogsLoaded, setCredLogsLoaded] = useState(false);
  const [newTempPw, setNewTempPw] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [deactivateLoading, setDeactivateLoading] = useState(false);
  const [activeTasks, setActiveTasks] = useState<ActiveTask[]>([]);
  const [showForceConfirm, setShowForceConfirm] = useState(false);
  const [resetResult, setResetResult] = useState<string | null>(null);

  if (isLoading) {
    return <div className="flex justify-center p-12 text-muted-foreground">Loading volunteer profile...</div>;
  }

  if (!volunteer) return <div>Volunteer not found</div>;

  const handleStatusToggle = async (checked: boolean) => {
    if (volunteer.availabilityStatus === VolunteerAvailabilityStatus.on_task) {
      toast({ title: "Cannot change status", description: "Volunteer is currently on an active task.", variant: "destructive" });
      return;
    }
    try {
      await updateVolunteer.mutateAsync({
        id: volunteerId,
        data: {
          availabilityStatus: checked
            ? UpdateVolunteerBodyAvailabilityStatus.available
            : UpdateVolunteerBodyAvailabilityStatus.busy
        }
      });
      queryClient.invalidateQueries({ queryKey: getGetVolunteerQueryKey(volunteerId) });
      toast({ title: "Status updated" });
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    }
  };

  const handleSave = async () => {
    try {
      await updateVolunteer.mutateAsync({
        id: volunteerId,
        data: {
          area: editForm.area,
          skills: editForm.skills,
        } as any
      });
      queryClient.invalidateQueries({ queryKey: getGetVolunteerQueryKey(volunteerId) });
      setIsEditing(false);
      toast({ title: "Profile updated" });
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    }
  };

  const toggleSkill = (skill: string) => {
    setEditForm(prev => ({
      ...prev,
      skills: prev.skills.includes(skill)
        ? prev.skills.filter(s => s !== skill)
        : [...prev.skills, skill]
    }));
  };

  const addCustomSkill = () => {
    if (!customSkill.trim()) return;
    const trimmed = customSkill.trim();
    if (!editForm.skills.includes(trimmed)) {
      setEditForm(prev => ({ ...prev, skills: [...prev.skills, trimmed] }));
    }
    setCustomSkill("");
  };

  const handleResetPassword = async () => {
    if (newTempPw.length < 8) {
      toast({ title: "Password too short", description: "Must be at least 8 characters.", variant: "destructive" });
      return;
    }
    setResetLoading(true);
    try {
      const res = await apiFetch<{ ok: boolean; temporaryPassword: string; message: string }>(`/volunteers/${volunteerId}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ temporaryPassword: newTempPw }),
      });
      setResetResult(res.temporaryPassword);
      setNewTempPw("");
    } catch (e: any) {
      toast({ title: "Reset failed", description: e?.message, variant: "destructive" });
    } finally {
      setResetLoading(false);
    }
  };

  const handleDeactivate = async (force: boolean) => {
    setDeactivateLoading(true);
    try {
      const res = await apiFetch<{ ok: boolean; tasksUnassigned: number; activeTasks: ActiveTask[] }>(
        `/volunteers/${volunteerId}/deactivate`, {
        method: "POST",
        body: JSON.stringify({ forceUnassign: force }),
      }
      );
      if (!res.ok && res.activeTasks.length > 0) {
        setActiveTasks(res.activeTasks);
        setShowForceConfirm(true);
        return;
      }
      queryClient.invalidateQueries({ queryKey: getGetVolunteerQueryKey(volunteerId) });
      toast({
        title: "Volunteer deactivated",
        description: res.tasksUnassigned > 0 ? `${res.tasksUnassigned} task(s) returned to queue.` : "No active tasks affected.",
      });
    } catch (e: any) {
      toast({ title: "Deactivation failed", description: e?.message, variant: "destructive" });
    } finally {
      setDeactivateLoading(false);
      setShowForceConfirm(false);
    }
  };

  const loadCredLogs = async () => {
    if (credLogsLoaded) return;
    try {
      const logs = await apiFetch<CredentialLog[]>(`/volunteers/${volunteerId}/credential-log`);
      setCredLogs(logs);
      setCredLogsLoaded(true);
    } catch {
      toast({ title: "Failed to load credential log", variant: "destructive" });
    }
  };

  const statusConfig = {
    [VolunteerAvailabilityStatus.available]: { color: "text-[#10b981]", bg: "bg-[#10b981]/20", icon: CheckCircle2, label: "Available" },
    [VolunteerAvailabilityStatus.busy]: { color: "text-slate-600", bg: "bg-slate-200", icon: Clock, label: "Busy" },
    [VolunteerAvailabilityStatus.on_task]: { color: "text-blue-700", bg: "bg-blue-100", icon: MapPin, label: "On Task" },
  };

  const conf = statusConfig[volunteer.availabilityStatus as VolunteerAvailabilityStatus] || statusConfig[VolunteerAvailabilityStatus.busy];
  const ConfIcon = conf.icon;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between gap-4 md:items-start">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary text-2xl font-bold shadow-inner">
            {volunteer.name.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-bold tracking-tight">{volunteer.name}</h1>
              <Badge variant="outline" className={`border-transparent ${conf.bg} ${conf.color}`}>
                <ConfIcon className="w-3 h-3 mr-1" />
                {conf.label}
              </Badge>
            </div>
            <p className="text-muted-foreground flex items-center gap-2">
              <MapPin className="w-4 h-4" /> {volunteer.area}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {isAdmin && (
            isEditing ? (
              <>
                <Button variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={updateVolunteer.isPending}>Save Changes</Button>
              </>
            ) : (
              <Button onClick={() => {
                setEditForm({ area: volunteer.area, skills: volunteer.skills, phone: volunteer.phone || "", email: volunteer.email || "" });
                setIsEditing(true);
              }}>
                <UserCog className="w-4 h-4 mr-2" /> Edit Profile
              </Button>
            )
          )}
        </div>

        <Card className="bg-card w-full md:w-auto shrink-0 border-primary/20">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="flex flex-col items-center px-4">
              <div className="text-2xl font-bold">{volunteer.tasksCompleted}</div>
              <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Completed</div>
            </div>
            <div className="w-px h-10 bg-border" />
            <div className="flex flex-col items-center px-4">
              <div className="text-2xl font-bold">{Math.round(volunteer.completionRate * 100)}%</div>
              <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Success Rate</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="mb-4">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          {isAdmin && <TabsTrigger value="admin" onClick={loadCredLogs}>Admin Actions</TabsTrigger>}
        </TabsList>

        {/* PROFILE TAB */}
        <TabsContent value="profile">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-6 lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center justify-between">
                    Contact & Skills
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {isEditing ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Primary Area <span className="text-destructive">*</span></Label>
                        <Input
                          value={editForm.area}
                          onChange={e => setEditForm(prev => ({ ...prev, area: e.target.value }))}
                        />
                      </div>

                      <div className="space-y-3">
                        <Label>Skills & Capabilities</Label>
                        <div className="flex flex-wrap gap-2">
                          {COMMON_SKILLS.map(skill => (
                            <Badge
                              key={skill}
                              variant={editForm.skills.includes(skill) ? "default" : "outline"}
                              className="cursor-pointer"
                              onClick={() => toggleSkill(skill)}
                            >
                              {skill}
                            </Badge>
                          ))}
                          <Badge
                            variant={showCustomInput ? "secondary" : "outline"}
                            className="cursor-pointer border-dashed"
                            onClick={() => setShowCustomInput(!showCustomInput)}
                          >
                            + Other
                          </Badge>
                        </div>
                        {showCustomInput && (
                          <div className="flex gap-2 mt-2">
                            <Input
                              placeholder="Type custom skill..."
                              value={customSkill}
                              onChange={(e) => setCustomSkill(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  addCustomSkill();
                                }
                              }}
                              className="h-9 text-sm"
                            />
                            <Button type="button" size="sm" onClick={addCustomSkill}>Add</Button>
                          </div>
                        )}
                        {editForm.skills.some(s => !COMMON_SKILLS.includes(s)) && (
                          <div className="flex flex-wrap gap-2 pt-3 border-t mt-3">
                            <Label className="w-full text-xs text-muted-foreground mb-1">Custom skills:</Label>
                            {editForm.skills.filter(s => !COMMON_SKILLS.includes(s)).map(skill => (
                              <Badge key={skill} variant="secondary" className="pr-1 gap-1">
                                {skill}
                                <button
                                  onClick={() => toggleSkill(skill)}
                                  className="hover:bg-muted-foreground/20 rounded-full w-3 h-3 flex items-center justify-center text-[10px]"
                                >
                                  ×
                                </button>
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-3">
                        {volunteer.phone && (
                          <div className="flex items-center gap-3 text-sm"><Phone className="w-4 h-4 text-muted-foreground" /> {volunteer.phone}</div>
                        )}
                        {volunteer.email && (
                          <div className="flex items-center gap-3 text-sm"><Mail className="w-4 h-4 text-muted-foreground" /> {volunteer.email}</div>
                        )}
                        <div className="flex items-start gap-3 text-sm">
                          <Globe className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                          <div className="flex flex-wrap gap-1">{volunteer.languages.join(", ")}</div>
                        </div>
                        <div className="flex items-start gap-3 text-sm">
                          <Calendar className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                          <div className="flex flex-wrap gap-1">
                            {volunteer.availabilityDays.map(d => (
                              <Badge key={d} variant="secondary" className="text-[10px]">{d.substring(0, 3)}</Badge>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="pt-4 border-t">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Skills</Label>
                        <div className="flex flex-wrap gap-2">
                          {volunteer.skills.map(s => <Badge key={s} variant="outline" className="bg-muted/50">{s}</Badge>)}
                        </div>
                      </div>

                      <div className="pt-4 mt-4 border-t flex items-center justify-between">
                        <Label htmlFor="avail-toggle" className="cursor-pointer">Mark Available</Label>
                        <Switch
                          id="avail-toggle"
                          checked={volunteer.availabilityStatus === VolunteerAvailabilityStatus.available}
                          onCheckedChange={handleStatusToggle}
                          disabled={volunteer.availabilityStatus === VolunteerAvailabilityStatus.on_task || updateVolunteer.isPending}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6 lg:col-span-2">
              {impact && (
                <Card className="bg-primary/5 border-primary/20">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-primary">
                      <Award className="w-5 h-5" /> Volunteer Impact
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-foreground italic font-serif leading-relaxed mb-6">"{impact.impactStatement}"</p>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="p-3 rounded-lg bg-card border shadow-sm">
                        <div className="text-2xl font-bold text-primary">{impact.peopleHelped}</div>
                        <div className="text-xs font-medium text-muted-foreground uppercase">People Helped</div>
                      </div>
                      <div className="p-3 rounded-lg bg-card border shadow-sm">
                        <div className="text-2xl font-bold text-primary">{impact.tasksCompleted}</div>
                        <div className="text-xs font-medium text-muted-foreground uppercase">Tasks</div>
                      </div>
                      <div className="p-3 rounded-lg bg-card border shadow-sm">
                        <div className="text-2xl font-bold text-primary">{impact.hoursContributed}</div>
                        <div className="text-xs font-medium text-muted-foreground uppercase">Hours Est.</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* TASKS TAB */}
        <TabsContent value="tasks">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Task History</span>
                <Badge variant="secondary">{tasks?.length || 0} Total</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tasks && tasks.length > 0 ? (
                <div className="space-y-3">
                  {tasks.map((task: any) => (
                    <div key={task.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                      <div>
                        <Link href={`/needs/${task.id}`}>
                          <div className="font-medium hover:text-primary transition-colors">{task.title}</div>
                        </Link>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">{task.category}</Badge>
                          <span>{format(new Date(task.updatedAt), "MMM d, yyyy")}</span>
                        </div>
                      </div>
                      <Badge className={
                        task.status === "resolved" || task.status === "closed" ? "bg-[#10b981]/20 text-[#10b981] hover:bg-[#10b981]/30 border-transparent" :
                          task.status === "in_progress" ? "bg-amber-100 text-amber-800 border-transparent" :
                            "bg-slate-100 text-slate-700 border-transparent"
                      }>
                        {task.status.replace("_", " ").toUpperCase()}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">No task history available.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ADMIN ACTIONS TAB */}
        {isAdmin && (
          <TabsContent value="admin">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Reset Password */}
              <Card className="border-amber-200">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2 text-amber-700">
                    <KeyRound className="w-5 h-5" /> Reset Password
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Set a new temporary password. The volunteer will be required to change it on next login.
                    If email is configured, credentials will be emailed automatically.
                  </p>
                  <div className="space-y-2">
                    <Label>New Temporary Password</Label>
                    <Input
                      type="text"
                      placeholder="Min 8 characters"
                      value={newTempPw}
                      onChange={e => setNewTempPw(e.target.value)}
                    />
                  </div>
                  <Button
                    onClick={handleResetPassword}
                    disabled={resetLoading || newTempPw.length < 8}
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    {resetLoading ? "Resetting..." : "Reset Password"}
                  </Button>

                  {resetResult && (
                    <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-300">
                      <p className="text-xs font-semibold text-amber-800 mb-1">Password reset successfully. Share this with the volunteer:</p>
                      <code className="block text-base font-mono font-bold text-amber-900 select-all bg-white border border-amber-200 rounded px-2 py-1">{resetResult}</code>
                      <p className="text-xs text-amber-600 mt-1">Volunteer must change this on first login.</p>
                      <Button size="sm" variant="ghost" className="mt-1 text-xs" onClick={() => setResetResult(null)}>Dismiss</Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Deactivate */}
              <Card className="border-red-200">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2 text-red-700">
                    <ShieldOff className="w-5 h-5" /> Deactivate Account
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Deactivating removes this volunteer's login access. If they have active tasks, you will be asked to confirm before tasks are returned to the queue.
                  </p>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" className="w-full" disabled={deactivateLoading}>
                        {deactivateLoading ? "Processing..." : "Deactivate Volunteer"}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Deactivate {volunteer.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will disable their login. Any active tasks will be checked first.
                          This action can be reversed by an admin reassigning them.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => handleDeactivate(false)}>
                          Confirm Deactivate
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  {/* Force unassign dialog */}
                  {showForceConfirm && activeTasks.length > 0 && (
                    <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 space-y-3">
                      <div className="flex items-start gap-2 text-red-700">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        <p className="text-sm font-medium">
                          {volunteer.name} has {activeTasks.length} active task(s). Deactivating will return them to the queue:
                        </p>
                      </div>
                      <ul className="text-xs text-red-600 space-y-1 pl-6 list-disc">
                        {activeTasks.map(t => <li key={t.id}>{t.title} ({t.status})</li>)}
                      </ul>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setShowForceConfirm(false)} className="flex-1">
                          Cancel
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDeactivate(true)} disabled={deactivateLoading} className="flex-1">
                          {deactivateLoading ? "Processing..." : "Force Deactivate"}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Credential Audit Log */}
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="w-5 h-5" /> Credential Email Log
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {credLogs.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No credential emails recorded for this volunteer.</p>
                  ) : (
                    <div className="space-y-2">
                      {credLogs.map(log => (
                        <div key={log.id} className="flex items-center justify-between p-3 rounded-lg border bg-card text-sm">
                          <div>
                            <div className="font-medium capitalize">{log.type} email → {log.email}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {format(new Date(log.createdAt), "MMM d, yyyy h:mm a")}
                              {log.performedBy && ` • by ${log.performedBy}`}
                            </div>
                            {log.errorMessage && (
                              <div className="text-xs text-red-500 mt-0.5">Error: {log.errorMessage}</div>
                            )}
                          </div>
                          <Badge className={log.status === "sent" ? "bg-[#10b981]/20 text-[#10b981] border-transparent" : "bg-red-100 text-red-700 border-transparent"}>
                            {log.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}

                </CardContent>

              </Card>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div >
  );
}
