import { useGetDashboardStats, useGetRecentActivity, useGetDashboardInsights, useGetZoneBreakdown, useGetPendingAssignments, useApproveAssignment, useDeclineAssignment, getGetPendingAssignmentsQueryKey } from "@workspace/api-client-react";
import { useAppContext } from "@/lib/contexts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Users, Clock, Activity, AlertCircle, Info, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useState, useEffect } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AnimatedCounter } from "@/components/animated-counter";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";export default function Dashboard() {
  const { organizationId, t } = useAppContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [decliningId, setDecliningId] = useState<number | null>(null);
  const [declineReason, setDeclineReason] = useState("");

  const { data: stats, isLoading: statsLoading } = useGetDashboardStats({ organizationId });
  const { data: activity, isLoading: activityLoading } = useGetRecentActivity({ organizationId, limit: 5 });
  const { data: insights, isLoading: insightsLoading } = useGetDashboardInsights({ organizationId });
  const { data: zones, isLoading: zonesLoading } = useGetZoneBreakdown({ organizationId });
  const { data: pendingRequests, isLoading: pendingLoading } = useGetPendingAssignments(
    { organizationId: organizationId! },
    { query: { enabled: !!organizationId, refetchInterval: 10000, queryKey: getGetPendingAssignmentsQueryKey({ organizationId: organizationId! }) } as any }
  );

  const { mutate: approveRequest, isPending: isApproving } = useApproveAssignment();
  const { mutate: declineRequest, isPending: isDeclining } = useDeclineAssignment();

  if (statsLoading || activityLoading || insightsLoading || zonesLoading || pendingLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">{t("nav.dashboard")}</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-[100px]" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-[60px]" />
                <Skeleton className="h-3 w-[120px] mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          <Card className="col-span-4">
            <CardHeader>
              <Skeleton className="h-6 w-[150px]" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[300px] w-full" />
            </CardContent>
          </Card>
          <Card className="col-span-3">
            <CardHeader>
              <Skeleton className="h-6 w-[150px]" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[300px] w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("nav.dashboard")}</h1>

      {/* Pending Approval Requests */}
      {pendingRequests && (pendingRequests as any).length > 0 && (
        <Card className="border-warning bg-amber-50/30 border-amber-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-amber-900">
              <AlertCircle className="h-5 w-5" />
              Pending Approval Requests
            </CardTitle>
            <CardDescription className="text-amber-800/80 font-medium">
              {(pendingRequests as any).length} volunteer request{(pendingRequests as any).length > 1 ? 's' : ''} awaiting approval
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(pendingRequests as any).map((req: any) => (
              <div key={req.id} className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center p-4 bg-white rounded-lg border shadow-sm">
                <div className="space-y-1.5 flex-1 w-full">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-lg">{req.volunteerName}</span>
                    <span className="text-muted-foreground text-sm">requested to join</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{req.needTitle}</span>
                    <span className="text-muted-foreground">({req.needArea})</span>
                    {req.needSeverity === 'critical' && <Badge variant="destructive" className="h-5 text-[10px]">CRITICAL</Badge>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-1 cursor-default">
                    {req.volunteerSkills?.slice(0, 3).map((skill: string) => (
                      <Badge key={skill} variant="secondary" className="font-normal">{skill}</Badge>
                    ))}
                    {req.volunteerSkills?.length > 3 && <span>+{req.volunteerSkills.length - 3} more</span>}
                    <span className="flex items-center gap-1 before:content-['•'] before:mr-1">
                      <Clock className="w-3 h-3" /> {formatDistanceToNow(new Date(req.createdAt))} ago
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 w-full sm:w-auto shrink-0">
                  {decliningId === req.id ? (
                    <div className="flex items-center gap-2 bg-muted/50 p-2 rounded-md">
                      <Input
                        placeholder="Reason (optional)"
                        value={declineReason}
                        onChange={(e) => setDeclineReason(e.target.value)}
                        className="h-8 text-sm min-w-[200px]"
                        autoFocus
                      />
                      <Button size="sm" variant="destructive" disabled={isDeclining} onClick={() => (declineRequest as any)({ id: req.id, data: { reason: declineReason } }, {
                        onSuccess: () => {
                          toast({ title: "Request declined" });
                          setDecliningId(null);
                          setDeclineReason("");
                          queryClient.invalidateQueries({ queryKey: ["volunteers", "pending-assignments"] });
                        },
                        onError: (err: any) => {
                          toast({ title: "Could not decline", description: err.message, variant: "destructive" });
                        }
                      })}>
                        Confirm
                      </Button>
                      <Button size="sm" variant="ghost" disabled={isDeclining} onClick={() => { setDecliningId(null); setDeclineReason(""); }}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 w-full">
                      <Button
                        size="sm"
                        className="w-full sm:w-auto bg-[#10b981] hover:bg-[#059669]"
                        disabled={isApproving || isDeclining}
                        onClick={() => (approveRequest as any)({ id: req.id }, {
                          onSuccess: () => {
                            toast({ title: "Task assigned successfully" });
                            queryClient.invalidateQueries({ queryKey: ["volunteers", "pending-assignments"] });
                          },
                          onError: (err: any) => {
                            toast({ title: "Could not approve", description: err.message, variant: "destructive" });
                          }
                        })}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDecliningId(req.id)}
                        disabled={isApproving || decliningId !== null}
                        className="w-full sm:w-auto text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20"
                      >
                        Decline
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-primary animate-fade-up [animation-delay:0ms]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Active Needs</CardTitle>
            <Activity className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              <AnimatedCounter value={stats?.totalActiveNeeds || 0} />
            </div>
            <p className="text-xs text-muted-foreground mt-1 transition-standard">
              across all zones
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-destructive bg-destructive/5 animate-fade-up [animation-delay:60ms]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-destructive">Critical Needs</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">
               <AnimatedCounter value={stats?.criticalNeeds || 0} />
            </div>
            <p className="text-xs text-destructive/80 mt-1 transition-standard">
              require immediate attention
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#10b981] animate-fade-up [animation-delay:120ms]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolved This Week</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-[#10b981]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
               <AnimatedCounter value={stats?.resolvedThisWeek || 0} />
            </div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 transition-standard">
              {stats && stats.resolvedThisWeek >= stats.resolvedLastWeek ? (
                <span className="text-[#10b981]">↑ {stats.resolvedThisWeek - stats.resolvedLastWeek} more</span>
              ) : (
                <span className="text-amber-500">↓ {stats ? stats.resolvedLastWeek - stats.resolvedThisWeek : 0} less</span>
              )}
              than last week
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-primary animate-fade-up [animation-delay:180ms]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Volunteer Utilization</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
               <AnimatedCounter value={stats?.volunteerUtilizationRate ? Math.round(stats.volunteerUtilizationRate * 100) : 0} />%
            </div>
            <p className="text-xs text-muted-foreground mt-1 transition-standard">
              {stats?.availableVolunteers || 0} / {stats?.totalVolunteers || 0} available
            </p>
          </CardContent>
        </Card>

      </div>

      {/* AI Insights & Recent Activity */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              AI Operational Insights
            </CardTitle>
            <CardDescription>Generated based on current need trends</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {insights?.length ? insights.map((insight, idx) => (
              <div 
                key={insight.id} 
                className={`flex gap-4 p-4 rounded-lg border bg-card transition-standard animate-fade-up`}
                style={{ 
                  animationDelay: `${idx * 80}ms`,
                  borderLeftWidth: '2px',
                  borderLeftColor: insight.severity === 'critical' ? 'hsl(var(--destructive))' : insight.severity === 'warning' ? 'hsl(35 90% 50%)' : undefined
                }}
              >
                <div className={`mt-0.5 ${(insight.severity === 'critical' || insight.severity === 'warning') ? 'animate-pulse-subtle' : ''}`}>
                  {insight.severity === 'critical' ? (
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                  ) : insight.severity === 'warning' ? (
                    <AlertCircle className="h-5 w-5 text-amber-500" />
                  ) : (
                    <Info className="h-5 w-5 text-primary" />
                  )}
                </div>
                <div className="flex-1 space-y-1">
                  <p className="font-semibold text-foreground leading-none">{insight.title}</p>
                  <p className="text-sm text-muted-foreground">{insight.description}</p>
                  <div className="flex items-center gap-2 mt-2 pt-2">
                    {insight.category && <Badge variant="outline" className="transition-micro">{insight.category}</Badge>}
                    {insight.zone && <Badge variant="outline" className="transition-micro">{insight.zone}</Badge>}
                  </div>
                </div>
              </div>
            )) : (
              <div className="text-center py-8 text-muted-foreground animate-fade-up">No active insights at this time.</div>
            )}

          </CardContent>
        </Card>

        <Card className="col-span-3 flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="space-y-6">
              {activity?.length ? activity.map((item, idx) => (
                <div 
                  key={item.id} 
                  className="flex gap-4 animate-fade-up"
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0 relative">
                    <div className="absolute w-px h-10 bg-border left-[3px] top-4"></div>
                  </div>
                  <div className="space-y-1 flex-1">
                    <p className="text-sm text-foreground font-medium">{item.message}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(item.createdAt), 'MMM d, h:mm a')}</p>
                  </div>
                </div>
              )) : (
                <div className="text-center py-8 text-muted-foreground">No recent activity.</div>
              )}
            </div>

          </CardContent>
        </Card>
      </div>

      {/* Charts & Tables */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Needs by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {stats?.needsByCategory && stats.needsByCategory.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.needsByCategory} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <XAxis type="number" hide />
                    <YAxis dataKey="category" type="category" axisLine={false} tickLine={false} fontSize={12} width={80} />
                    <Tooltip
                      cursor={{ fill: 'var(--color-muted)', opacity: 0.4 }}
                      contentStyle={{ borderRadius: '8px', border: '1px solid var(--color-border)' }}
                    />
                    <Bar 
                      dataKey="count" 
                      radius={[0, 4, 4, 0]} 
                      barSize={24}
                      animationBegin={0}
                      animationDuration={500}
                      animationEasing="ease-out"
                    >
                      {stats.needsByCategory.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={`var(--color-chart-${(index % 5) + 1})`} />
                      ))}
                    </Bar>

                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">No data available</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Zone Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zone</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Critical</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {zones?.length ? zones.map((zone) => (
                  <TableRow key={zone.zone}>
                    <TableCell className="font-medium">{zone.zone}</TableCell>
                    <TableCell className="text-right">{zone.totalNeeds}</TableCell>
                    <TableCell className="text-right">
                      {zone.criticalNeeds > 0 ? (
                        <span className="text-destructive font-bold">{zone.criticalNeeds}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{zone.urgencyScore}</TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">No zone data available</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Recent Survey Submissions */}
      <RecentSubmissions organizationId={organizationId} />
    </div>
  );
}

function RecentSubmissions({ organizationId }: { organizationId?: number }) {
  const { data: responses, isLoading } = useQuery({
    queryKey: ["recent-survey-responses", organizationId],
    queryFn: async () => {
      return await apiFetch<any[]>(`/surveys/recent-responses?organizationId=${organizationId}`);
    },
    enabled: !!organizationId,
    refetchInterval: 60000,
  });

  if (isLoading || (responses && responses.length === 0)) return null;

  return (
    <Card className="animate-fade-up border-none shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Recent Survey Submissions
        </CardTitle>
        <CardDescription>Latest data collected from field forms</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Survey</TableHead>
              <TableHead>Respondent</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {responses?.map((resp: any) => (
              <TableRow key={resp.id}>
                <TableCell className="font-medium">{resp.surveyTitle}</TableCell>
                <TableCell className="text-sm">
                  {resp.respondentEmail || "Anonymous"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(resp.createdAt), { addSuffix: true })}
                </TableCell>
                <TableCell className="text-right">
                  <Link to={`/surveys/${resp.surveyId}?tab=responses` as any}>
                    <Button variant="ghost" size="sm" className="h-8 text-primary font-medium hover:text-primary hover:bg-primary/5">
                      View
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

