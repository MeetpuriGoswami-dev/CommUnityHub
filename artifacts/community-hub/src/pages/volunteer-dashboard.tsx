import { useEffect, useState } from "react";
import { useAppContext } from "@/lib/contexts";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { AnimatedCounter } from "@/components/animated-counter";
import { 
  Bell, 
  CheckCircle2, 
  Clock, 
  HeartHandshake, 
  LogOut, 
  MapPin, 
  UserRound, 
  CalendarDays,
  Paperclip, 
  FileText, 
  X, 
  Plus, 
  ExternalLink,
  Cloud 
} from "lucide-react";
import { useListSmartDriveFiles, useUploadSmartDriveFile, SmartDriveFile } from "@workspace/api-client-react";


type Need = {
  id: number;
  title: string;
  category: string;
  severity: string;
  status: string;
  area: string;
  affectedCount: number;
  matchScore?: number;
  daysUnresolved?: number;
  requiredSkills?: string[];
};

type Impact = {
  tasksCompleted: number;
  peopleHelped: number;
  hoursContributed: number;
  impactStatement: string;
};

type Notification = {
  id: number;
  title: string;
  message: string;
  createdAt: string;
};

type Attachment = {
  id: number;
  fileName: string;
  fileSize: number;
  fileType: string;
  filePath: string;
  createdAt: string;
};

type Assignment = {
  id: number;
  needId: number;
  volunteerId: number;
  progress: number;
  progressNotes: Array<{ at: string; note: string; progress: number }>;
  status: string;
};

type VolunteerProfile = {
  id: number;
  availabilityDays: string[];
  availabilityStatus: string;
  dailyOverride: string | null;
  dailyOverrideDate: string | null;
};

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export default function VolunteerDashboard() {
  const { user, logout } = useAppContext();
  const { toast } = useToast();
  const volunteerId = user?.volunteerId;
  const [tasks, setTasks] = useState<Need[]>([]);
  const [nearby, setNearby] = useState<Need[]>([]);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [assignments, setAssignments] = useState<Record<number, Assignment>>({});
  const [profile, setProfile] = useState<VolunteerProfile | null>(null);
  const [pendingRequests, setPendingRequests] = useState<Set<number>>(new Set());

  const load = async () => {
    if (!volunteerId) return;
    const [taskData, nearbyData, impactData, notificationData, profileData, pendingData] = await Promise.all([
      apiFetch<Need[]>(`/volunteers/${volunteerId}/tasks`),
      apiFetch<Need[]>(`/volunteers/${volunteerId}/nearby-tasks`),
      apiFetch<Impact>(`/volunteers/${volunteerId}/impact`),
      apiFetch<Notification[]>(`/volunteers/${volunteerId}/notifications`),
      apiFetch<VolunteerProfile>(`/volunteers/${volunteerId}`),
      apiFetch<{ needId: number }[]>(`/volunteers/${volunteerId}/pending-requests`),
    ]);
    setTasks(taskData);
    setNearby(nearbyData);
    setImpact(impactData);
    setNotifications(notificationData);
    setProfile(profileData);
    setPendingRequests(new Set(pendingData.map(p => p.needId)));

    // Ensure we trigger a re-fetch of Smart Drive files if org changes
    if (user?.organizationId) {
       // Handled by react-query below
    }

    // Fetch the volunteer's assignment record for each assigned need
    const records: Record<number, Assignment> = {};
    await Promise.all(
      taskData.map(async (task) => {
        try {
          const list = await apiFetch<Assignment[]>(`/needs/${task.id}/assignments`);
          const mine = list.find((a) => a.volunteerId === volunteerId);
          if (mine) records[task.id] = mine;
        } catch {
          /* ignore */
        }
      })
    );
    setAssignments(records);
  };

  useEffect(() => {
    load().catch((error) => toast({ title: "Could not load dashboard", description: error.message, variant: "destructive" }));
  }, [volunteerId]);

  const selfAssign = async (needId: number) => {
    if (!volunteerId) return;
    try {
      await apiFetch(`/volunteers/${volunteerId}/self-assign`, { method: "POST", body: JSON.stringify({ needId }) });
      toast({ title: "Request sent for approval" });
      await load();
    } catch (error) {
      toast({ title: "Could not send request", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  };

  const updateProgress = async (assignmentId: number, progress: number, note?: string) => {
    try {
      await apiFetch(`/assignments/${assignmentId}/progress`, {
        method: "PATCH",
        body: JSON.stringify({ progress, note: note || undefined }),
      });
      toast({ title: `Progress saved: ${progress}%` });
      await load();
    } catch (error) {
      toast({ title: "Could not save progress", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    }
  };

  const markComplete = async (needId: number) => {
    try {
      await apiFetch(`/needs/${needId}/task-status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "completed" }),
      });
      toast({ title: "Task marked as completed" });
      await load();
    } catch (error) {
      toast({ title: "Could not mark complete", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    }
  };

  const saveAvailability = async (patch: Partial<VolunteerProfile>) => {
    if (!volunteerId) return;
    try {
      await apiFetch(`/volunteers/${volunteerId}/profile`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      toast({ title: "Availability updated" });
      await load();
    } catch (error) {
      toast({ title: "Could not update availability", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    }
  };

  const todayIso = new Date().toISOString().slice(0, 10);
  const isAvailableToday =
    profile?.dailyOverrideDate === todayIso
      ? profile?.dailyOverride === "available"
      : profile?.availabilityStatus !== "unavailable";

  const signOut = async () => {
    await logout();
    window.location.href = import.meta.env.BASE_URL;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-6xl mx-auto p-4 flex items-center justify-between">
          <div>
            <div className="text-sm text-muted-foreground">Volunteer portal</div>
            <h1 className="text-2xl font-bold">Welcome, {user?.name}</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 border rounded-lg bg-muted/30">
              <Switch
                checked={isAvailableToday}
                onCheckedChange={(checked) =>
                  saveAvailability({
                    dailyOverride: checked ? "available" : "unavailable",
                    dailyOverrideDate: todayIso,
                  } as any)
                }
              />
              <span className="text-sm font-medium">{isAvailableToday ? "Available today" : "Unavailable today"}</span>
            </div>
            <Button variant="outline" onClick={signOut}><LogOut className="w-4 h-4 mr-2" /> Sign out</Button>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="animate-fade-up [animation-delay:0ms]">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Active Tasks</CardTitle></CardHeader>
            <CardContent className="text-3xl font-bold">
              <AnimatedCounter value={tasks.length} />
            </CardContent>
          </Card>
          <Card className="animate-fade-up [animation-delay:60ms]">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Completed</CardTitle></CardHeader>
            <CardContent className="text-3xl font-bold">
               <AnimatedCounter value={impact?.tasksCompleted ?? 0} />
            </CardContent>
          </Card>
          <Card className="animate-fade-up [animation-delay:120ms]">
            <CardHeader className="pb-2"><CardTitle className="text-sm">People Helped</CardTitle></CardHeader>
            <CardContent className="text-3xl font-bold">
               <AnimatedCounter value={impact?.peopleHelped ?? 0} />
            </CardContent>
          </Card>
          <Card className="animate-fade-up [animation-delay:180ms]">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Hours</CardTitle></CardHeader>
            <CardContent className="text-3xl font-bold">
               <AnimatedCounter value={impact?.hoursContributed ?? 0} />
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="tasks">
          <TabsList className="grid w-full grid-cols-2 lg:grid-cols-6 h-auto gap-1 mb-2">
            <TabsTrigger value="tasks">Assigned</TabsTrigger>
            <TabsTrigger value="available">Self-assign</TabsTrigger>
            <TabsTrigger value="availability">Availability</TabsTrigger>
            <TabsTrigger value="impact">Impact</TabsTrigger>
            <TabsTrigger value="hub">Upload Hub</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
          </TabsList>

          <TabsContent value="hub" className="mt-4">
            <VolunteerUploadHub organizationId={user?.organizationId ?? undefined} />
          </TabsContent>

          <TabsContent value="tasks" className="space-y-4 mt-4">
            {tasks.length ? tasks.map((task, idx) => (
              <div 
                key={task.id} 
                className="animate-fade-up" 
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                <AssignedTaskCard
                  task={task}
                  assignment={assignments[task.id]}
                  onProgress={updateProgress}
                  onComplete={() => markComplete(task.id)}
                />
              </div>
            )) : <EmptyCard icon={<Clock className="w-6 h-6" />} title="No assigned tasks" description="Your assigned work will appear here." />}
          </TabsContent>


          <TabsContent value="available" className="space-y-4 mt-4">
            {nearby.length ? nearby.map((task) => (
              <SimpleTaskCard 
                key={task.id} 
                task={task} 
                action={
                  <Button 
                    onClick={() => selfAssign(task.id)}
                    disabled={pendingRequests.has(task.id)}
                    variant={pendingRequests.has(task.id) ? "secondary" : "default"}
                  >
                    {pendingRequests.has(task.id) ? "Request Sent" : "Self-assign"}
                  </Button>
                } 
              />
            )) : <EmptyCard icon={<MapPin className="w-6 h-6" />} title="No available matches" description="Check back when coordinators publish open needs." />}
          </TabsContent>

          <TabsContent value="availability" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><CalendarDays className="w-5 h-5" /> My Availability</CardTitle>
                <CardDescription>Set the days you can usually volunteer. Coordinators only see you for tasks that match your availability.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label className="text-sm font-medium mb-3 block">Weekly availability</Label>
                  <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
                    {DAYS.map((day) => {
                      const checked = profile?.availabilityDays?.includes(day) ?? false;
                      return (
                        <label key={day} className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/40">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => {
                              const current = profile?.availabilityDays ?? [];
                              const next = value
                                ? Array.from(new Set([...current, day]))
                                : current.filter((d) => d !== day);
                              saveAvailability({ availabilityDays: next } as any);
                            }}
                          />
                          <span className="text-sm capitalize">{day.slice(0, 3)}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium mb-3 block">Overall status</Label>
                  <div className="flex gap-2 flex-wrap">
                    {["available", "busy", "unavailable"].map((status) => (
                      <Button
                        key={status}
                        variant={profile?.availabilityStatus === status ? "default" : "outline"}
                        size="sm"
                        className="transition-standard px-4"
                        onClick={() => saveAvailability({ availabilityStatus: status } as any)}
                      >
                        <span className="capitalize">{status}</span>
                      </Button>
                    ))}

                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    "Unavailable" hides you from all assignment suggestions until you change it back.
                  </p>
                </div>
                <div className="border-t pt-4">
                  <Label className="text-sm font-medium mb-2 block">Today only</Label>
                  <p className="text-xs text-muted-foreground mb-3">
                    Use the toggle in the header to mark yourself available or unavailable for today only — without changing your weekly schedule.
                  </p>
                  {profile?.dailyOverrideDate === todayIso && (
                    <Badge variant={profile.dailyOverride === "unavailable" ? "destructive" : "secondary"}>
                      Today's override: {profile.dailyOverride}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="impact" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><HeartHandshake className="w-5 h-5" /> Impact summary</CardTitle></CardHeader>
              <CardContent className="text-muted-foreground">{impact?.impactStatement ?? "Complete tasks to build your impact report."}</CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="profile" className="grid gap-4 md:grid-cols-2 mt-4">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><UserRound className="w-5 h-5" /> Profile</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div><span className="text-muted-foreground">Name:</span> {user?.name}</div>
                <div><span className="text-muted-foreground">Email:</span> {user?.email}</div>
                <div><span className="text-muted-foreground">Role:</span> volunteer</div>
                <Button variant="outline" asChild><a href={`${import.meta.env.BASE_URL}change-password`}>Change password</a></Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Bell className="w-5 h-5" /> Notifications</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {notifications.length ? notifications.map((item) => (
                  <div key={item.id} className="border rounded-lg p-3">
                    <div className="font-medium">{item.title}</div>
                    <div className="text-sm text-muted-foreground">{item.message}</div>
                  </div>
                )) : <div className="text-sm text-muted-foreground">No notifications yet.</div>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}function AssignedTaskCard({
  task,
  assignment,
  onProgress,
  onComplete,
}: {
  task: Need;
  assignment?: Assignment;
  onProgress: (assignmentId: number, progress: number, note?: string) => void;
  onComplete: () => void;
}) {
  const { toast } = useToast();
  const [localProgress, setLocalProgress] = useState(assignment?.progress ?? 0);
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");
  const [isCompleting, setIsCompleting] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const loadAttachments = async () => {
    try {
      const data = await apiFetch<Attachment[]>(`/needs/${task.id}/attachments`);
      setAttachments(data);
    } catch (e) {
      console.error("Failed to load attachments", e);
    }
  };

  useEffect(() => {
    setLocalProgress(assignment?.progress ?? 0);
    loadAttachments();
  }, [assignment?.progress, task.id]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      await apiFetch(`/needs/${task.id}/attachments`, {
        method: "POST",
        body: formData,
        // apiFetch handles boundary if we don't set Content-Type
      });
      toast({ title: "Proof uploaded" });
      loadAttachments();
    } catch (error) {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const isComplete = task.status === "resolved" || task.status === "completed";
  const at100 = localProgress >= 100;
  const stages = [0, 25, 50, 75, 100];

  const handleComplete = async () => {
    setIsCompleting(true);
    await new Promise((r) => setTimeout(r, 300));
    onComplete();
  };

  return (
    <Card
      className={`transition-all duration-[300ms] ease-in-out ${isCompleting ? "bg-green-50 border-green-200 opacity-0 -translate-y-2 max-h-0 py-0 my-0 overflow-hidden border-0" : ""}`}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="transition-all duration-300">
            <CardTitle className="transition-standard">{task.title}</CardTitle>
            <CardDescription className="transition-standard">
              {task.area} · {task.affectedCount} people affected
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <Badge className="transition-standard">{task.category}</Badge>
            <Badge variant="outline" className="transition-standard">
              {task.severity}
            </Badge>
            <Badge variant="secondary" className="transition-standard">
              {task.status}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {assignment && !isComplete && (
          <div className={`space-y-4 border-t pt-4 transition-all duration-300`}>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">My progress</Label>
                <span className="text-sm font-bold tabular-nums">{localProgress}%</span>
              </div>
              <Slider
                value={[localProgress]}
                min={0}
                max={100}
                step={25}
                onValueChange={(v) => setLocalProgress(v[0])}
                onValueCommit={(v) => onProgress(assignment.id, v[0], note)}
              />
              <div className="flex flex-wrap gap-2">
                {stages.map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={localProgress === s ? "default" : "outline"}
                    className="transition-standard"
                    onClick={() => {
                      setLocalProgress(s);
                      onProgress(assignment.id, s, note);
                      setNote("");
                    }}
                  >
                    {s}%
                  </Button>
                ))}
              </div>
            </div>

            {/* Attachments Section for Volunteers */}
            <div className="bg-muted/30 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-tight flex items-center gap-1.5">
                  <Paperclip className="h-3.5 w-3.5" />
                  Task Files & Proof
                </h4>
                <label className="cursor-pointer">
                  <Plus className="h-3.5 w-3.5 text-primary hover:scale-110 transition-transform" />
                  <input type="file" className="hidden" onChange={handleUpload} disabled={isUploading} />
                </label>
              </div>
              
              {attachments.length > 0 ? (
                <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
                  {attachments.map((a) => (
                    <div key={a.id} className="flex items-center justify-between p-2 rounded border bg-background text-[11px] group">
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="truncate" title={a.fileName}>{a.fileName}</span>
                      </div>
                      <a 
                        href={a.filePath} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="text-primary hover:underline shrink-0 flex items-center"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground italic">No guidelines or proof uploaded yet.</p>
              )}
              {isUploading && <Progress value={45} className="h-0.5" />}
            </div>

            <div>
              {!showNote ? (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline transition-standard hover:text-primary"
                  onClick={() => setShowNote(true)}
                >
                  Add a note for this update (optional)
                </button>
              ) : (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  <Textarea
                    placeholder="What did you accomplish?"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    className="transition-standard focus:ring-1"
                  />
                  <p className="text-xs text-muted-foreground">
                    Your note will be saved with the next progress update.
                  </p>
                </div>
              )}
            </div>
            <Button
              className={`w-full transition-all duration-300 ${at100 ? "bg-green-600 hover:bg-green-700 text-white shadow-lg" : ""}`}
              variant={at100 ? "default" : "outline"}
              onClick={handleComplete}
              disabled={!at100 || isCompleting}
            >
              <CheckCircle2 className={`w-4 h-4 mr-2 ${at100 ? "animate-scale-pulse" : ""}`} />
              {at100 ? "Mark as Completed" : "Reach 100% to mark complete"}
            </Button>
          </div>
        )}
        {assignment && assignment.progressNotes?.length > 0 && (
          <div className="border-t pt-3 space-y-2">
            <div className="text-xs font-semibold text-muted-foreground">My update history</div>
            {assignment.progressNotes
              .slice()
              .reverse()
              .map((entry, idx) => (
                <div key={idx} className="text-xs bg-muted/30 rounded p-2 transition-standard hover:bg-muted/50">
                  <span className="font-medium">{entry.progress}%</span> — {entry.note}
                  <div className="text-muted-foreground">{new Date(entry.at).toLocaleString()}</div>
                </div>
              ))}
          </div>
        )}
        {isComplete && (
          <div className="flex items-center gap-2 text-green-700 text-sm animate-in fade-in duration-300">
            <CheckCircle2 className="w-4 h-4" /> Task completed.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SimpleTaskCard({ task, action }: { task: Need; action?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>{task.title}</CardTitle>
            <CardDescription>{task.area} · {task.affectedCount} people affected</CardDescription>
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Badge>{task.category}</Badge>
        <Badge variant="outline">{task.severity}</Badge>
        <Badge variant="secondary">{task.status}</Badge>
        {typeof task.matchScore === "number" && <Badge variant="outline">{Math.round(task.matchScore)}% match</Badge>}
      </CardContent>
    </Card>
  );
}

function EmptyCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <Card>
      <CardContent className="py-10 text-center text-muted-foreground">
        <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-muted flex items-center justify-center">{icon}</div>
        <div className="font-medium text-foreground">{title}</div>
        <div className="text-sm">{description}</div>
      </CardContent>
    </Card>
  );
}

export function VolunteerUploadHub({ organizationId }: { organizationId?: number }) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const { data: files, refetch } = useListSmartDriveFiles(
    { organizationId: organizationId || 0 },
    { query: { enabled: !!organizationId } as any }
  );
  const uploadFile = useUploadSmartDriveFile();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !organizationId) return;

    setIsUploading(true);
    try {
      await uploadFile.mutateAsync({
        data: {
          file,
          organizationId
        }
      });
      toast({
        title: "File uploaded",
        description: "Your file has been sent to the admin for approval.",
      });
      refetch();
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "There was an error uploading your file.",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const displayFiles = files?.filter(f => f.isVisibleToVolunteers || f.status !== 'approved') || [];

  return (
    <Card>
      <CardHeader>
         <div className="flex items-center justify-between">
           <div>
             <CardTitle className="flex items-center gap-2"><Cloud className="w-5 h-5" /> Smart Drive Upload Hub</CardTitle>
             <CardDescription>View files shared by your organization and upload files for admin approval.</CardDescription>
           </div>
           <label className="cursor-pointer inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2">
             <Plus className="w-4 h-4 mr-2" /> Upload File
             <input type="file" className="hidden" onChange={handleUpload} disabled={isUploading} />
           </label>
         </div>
      </CardHeader>
      <CardContent>
         {isUploading && (
           <div className="mb-4">
             <p className="text-xs text-muted-foreground mb-2">Uploading...</p>
             <Progress value={45} className="h-1" />
           </div>
         )}
         <div className="grid gap-3">
           {displayFiles.length > 0 ? (
             displayFiles.map((file: SmartDriveFile) => (
               <div key={file.id} className="flex items-center justify-between p-3 border rounded-lg bg-card/50 hover:bg-muted/30 transition-colors">
                 <div className="flex flex-col gap-1">
                   <div className="flex items-center gap-2">
                     <span className="font-medium text-sm">{file.fileName}</span>
                     {file.status === 'pending' && <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-700">Pending Approval</Badge>}
                     {file.status === 'approved' && <Badge variant="outline" className="border-green-500/30 text-green-700">Approved</Badge>}
                     {file.status === 'rejected' && <Badge variant="destructive">Rejected</Badge>}
                   </div>
                   <span className="text-xs text-muted-foreground">Uploaded {new Date(file.createdAt).toLocaleDateString()}</span>
                 </div>
                 <Button variant="ghost" size="sm" asChild>
                   <a href={file.filePath} target="_blank" rel="noreferrer">
                     Download
                   </a>
                 </Button>
               </div>
             ))
           ) : (
             <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
               No files found in the Upload Hub.
             </div>
           )}
         </div>
      </CardContent>
    </Card>
  );
}
