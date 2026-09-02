import { useState } from "react";
import { useListVolunteers } from "@workspace/api-client-react";
import { useAppContext } from "@/lib/contexts";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, CheckCircle2, Clock, MapPin } from "lucide-react";
import { VolunteerAvailabilityStatus, Volunteer } from "@workspace/api-client-react";

export default function VolunteersList() {
  const { organizationId, t } = useAppContext();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: volunteers, isLoading } = useListVolunteers({ 
    organizationId,
    available: statusFilter === "available" ? true : undefined
  });

  const filteredVolunteers = volunteers?.filter((vol: Volunteer) => 
    !search || 
    vol.name.toLowerCase().includes(search.toLowerCase()) || 
    vol.area.toLowerCase().includes(search.toLowerCase()) ||
    vol.skills.some((s: string) => s.toLowerCase().includes(search.toLowerCase()))
  );

  const statusConfig: Record<string, { color: string, icon: React.ElementType, label: string }> = {
    [VolunteerAvailabilityStatus.available]: { color: "bg-[#10b981]/20 text-[#10b981]", icon: CheckCircle2, label: "Available" },
    [VolunteerAvailabilityStatus.busy]: { color: "bg-slate-200 text-slate-600", icon: Clock, label: "Busy" },
    [VolunteerAvailabilityStatus.on_task]: { color: "bg-blue-100 text-blue-700", icon: MapPin, label: "On Task" },
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{t("nav.volunteers")}</h1>
        <Link to="/volunteers/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Register Volunteer
          </Button>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 bg-card p-4 rounded-lg border">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search by name, area, or skills..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Availability" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="available">Available Now</SelectItem>
              <SelectItem value="on_task">Currently On Task</SelectItem>
              <SelectItem value="busy">Busy/Unavailable</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-card rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              {organizationId === 0 && <TableHead>Organization</TableHead>}
              <TableHead>Area</TableHead>
              <TableHead>Skills</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Tasks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading volunteers...</TableCell>
              </TableRow>
            ) : filteredVolunteers?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No volunteers found.</TableCell>
              </TableRow>
            ) : filteredVolunteers?.map((vol: Volunteer) => {
              const conf = statusConfig[vol.availabilityStatus as VolunteerAvailabilityStatus];
              const Icon = conf?.icon || CheckCircle2;
              
              return (
                <TableRow key={vol.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => window.location.href = `/volunteers/${vol.id}`}>
                  <TableCell>
                    <div className="font-medium">{vol.name}</div>
                    <div className="text-xs text-muted-foreground">{vol.phone || vol.email}</div>
                  </TableCell>
                  {organizationId === 0 && (
                    <TableCell>
                      <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-50 border-blue-100">
                        {`ID: ${vol.organizationId}`}
                      </Badge>
                    </TableCell>
                  )}
                  <TableCell>{vol.area}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-[250px]">
                      {vol.skills.slice(0, 3).map((skill: string) => (
                        <Badge key={skill} variant="secondary" className="text-xs bg-secondary/50 font-normal">
                          {skill}
                        </Badge>
                      ))}
                      {vol.skills.length > 3 && (
                        <Badge variant="secondary" className="text-xs bg-secondary/50 font-normal">
                          +{vol.skills.length - 3}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`border-transparent ${conf?.color}`}>
                      <Icon className="w-3 h-3 mr-1" />
                      {conf?.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="font-medium">{vol.tasksCompleted}</div>
                    <div className="text-xs text-muted-foreground">completed</div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
