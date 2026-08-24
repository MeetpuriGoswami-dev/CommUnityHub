import { useState } from "react";
import { useListNeeds, getListNeedsQueryKey } from "@workspace/api-client-react";
import { useAppContext } from "@/lib/contexts";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Filter } from "lucide-react";
import { format } from "date-fns";
import { NeedSeverity, NeedStatus } from "@workspace/api-client-react";

export default function NeedsList() {
  const { organizationId, t } = useAppContext();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");

  const { data: needs, isLoading } = useListNeeds({ 
    organizationId,
    status: (statusFilter !== "all" ? statusFilter : undefined) as any,
    severity: (severityFilter !== "all" ? severityFilter : undefined) as any,
  });

  const filteredNeeds = needs?.filter(need => 
    !search || 
    need.title.toLowerCase().includes(search.toLowerCase()) || 
    need.area.toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => (b.urgencyScore || 0) - (a.urgencyScore || 0));

  const severityColors: Record<string, string> = {
    [NeedSeverity.critical]: "bg-destructive text-destructive-foreground",
    [NeedSeverity.high]: "bg-amber-500 text-white",
    [NeedSeverity.medium]: "bg-yellow-500 text-white",
    [NeedSeverity.low]: "bg-[#10b981] text-white",
  };

  const statusColors: Record<string, string> = {
    [NeedStatus.reported]: "bg-slate-200 text-slate-800",
    [NeedStatus.verified]: "bg-blue-100 text-blue-800",
    [NeedStatus.assigned]: "bg-purple-100 text-purple-800",
    [NeedStatus.in_progress]: "bg-amber-100 text-amber-800",
    [NeedStatus.resolved]: "bg-[#10b981]/20 text-[#10b981]",
    [NeedStatus.closed]: "bg-slate-100 text-slate-500",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("nav.needs")}</h1>
        <Link href="/needs/new">
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
            <Plus className="mr-2 h-4 w-4" /> Report Need
          </Button>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 bg-card p-4 rounded-lg border">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search by title or area..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.values(NeedStatus).map(status => (
                <SelectItem key={status} value={status}>{status.replace('_', ' ').toUpperCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severities</SelectItem>
              {Object.values(NeedSeverity).map(severity => (
                <SelectItem key={severity} value={severity}>{severity.toUpperCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-card rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Urgency</TableHead>
              <TableHead>Title</TableHead>
              {organizationId === 0 && <TableHead>Organization</TableHead>}
              <TableHead>Area</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Reported</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading needs...</TableCell>
              </TableRow>
            ) : filteredNeeds?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No needs found matching your filters.</TableCell>
              </TableRow>
            ) : filteredNeeds?.map((need, idx) => (
              <TableRow 
                key={need.id} 
                className="hover:bg-muted/50 cursor-pointer transition-colors duration-[120ms] animate-fade-up" 
                style={{ animationDelay: `${idx * 30}ms` }}
                onClick={() => window.location.assign(`/needs/${need.id}`)}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-standard ${(need.urgencyScore || 0) > 70 ? 'bg-destructive/10 text-destructive' : 'bg-slate-100 text-slate-700'}`}>
                      {need.urgencyScore || 0}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="font-medium text-foreground">{need.title}</div>
                  <div className="text-xs text-muted-foreground">{need.category} • {need.affectedCount} affected</div>
                </TableCell>
                {organizationId === 0 && (
                  <TableCell>
                    <Badge variant="secondary" className="bg-purple-50 text-purple-700 hover:bg-purple-50 border-purple-100">
                      {(need as any).organizationName || "Hub"}
                    </Badge>
                  </TableCell>
                )}
                <TableCell>{need.area}</TableCell>
                <TableCell>
                  <Badge className={`${severityColors[need.severity]} transition-standard`} variant="outline">
                    {need.severity}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge className={`${statusColors[need.status]} transition-standard`} variant="outline">
                    {need.status.replace('_', ' ')}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {format(new Date(need.reportDate), 'MMM d, yyyy')}
                </TableCell>
              </TableRow>
            ))}

          </TableBody>
        </Table>
      </div>
    </div>
  );
}
