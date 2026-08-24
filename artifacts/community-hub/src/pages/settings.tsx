import { useState } from "react";
import { useAppContext } from "@/lib/contexts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGetOrganization, useListOrganizations } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function Settings() {
  const { organizationId, language, setLanguage, simpleMode, setSimpleMode, t, setOrganizationId, user } = useAppContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: orgs } = useListOrganizations();
  const [newOrg, setNewOrg] = useState({ name: "", contactEmail: "", contactPhone: "", address: "", description: "" });
  
  const { data: org } = useGetOrganization(organizationId || 0, { query: { enabled: !!organizationId } as any });

  const createOrganization = async () => {
    if (!newOrg.name.trim()) return;
    try {
      const org = await apiFetch<{ id: number }>("/organizations", {
        method: "POST",
        body: JSON.stringify({
          name: newOrg.name,
          contactEmail: newOrg.contactEmail || null,
          contactPhone: newOrg.contactPhone || null,
          address: newOrg.address || null,
          description: newOrg.description || null,
        }),
      });
      setOrganizationId(org.id);
      setNewOrg({ name: "", contactEmail: "", contactPhone: "", address: "", description: "" });
      await queryClient.invalidateQueries();
      toast({ title: "Organization created" });
    } catch (error) {
      toast({ title: "Could not create organization", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  };

  const toggleOrganization = async (id: number, isActive: boolean) => {
    try {
      await apiFetch(`/organizations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      });
      await queryClient.invalidateQueries();
      toast({ title: isActive ? "Organization activated" : "Organization deactivated" });
    } catch (error) {
      toast({ title: "Could not update organization", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">{t("nav.settings")}</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Organization Profile</CardTitle>
          <CardDescription>View your organization details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-muted-foreground">Organization Name</Label>
              <div className="font-medium text-foreground">{org?.name || "Loading..."}</div>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground">Contact Email</Label>
              <div className="font-medium text-foreground">{org?.contactEmail || "Not provided"}</div>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground">Contact Phone</Label>
              <div className="font-medium text-foreground">{org?.contactPhone || "Not provided"}</div>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground">Address</Label>
              <div className="font-medium text-foreground">{org?.address || "Not provided"}</div>
            </div>
            <div className="col-span-1 md:col-span-2 space-y-1">
              <Label className="text-muted-foreground">Description</Label>
              <div className="font-medium text-foreground">{org?.description || "Not provided"}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {user?.role === "super_admin" && (
        <Card>
          <CardHeader>
            <CardTitle>Super Admin Organization Management</CardTitle>
            <CardDescription>Create, switch, activate, or deactivate organizations.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input placeholder="Organization name" value={newOrg.name} onChange={(event) => setNewOrg(prev => ({ ...prev, name: event.target.value }))} />
              <Input placeholder="Contact email" value={newOrg.contactEmail} onChange={(event) => setNewOrg(prev => ({ ...prev, contactEmail: event.target.value }))} />
              <Input placeholder="Contact phone" value={newOrg.contactPhone} onChange={(event) => setNewOrg(prev => ({ ...prev, contactPhone: event.target.value }))} />
              <Input placeholder="Address" value={newOrg.address} onChange={(event) => setNewOrg(prev => ({ ...prev, address: event.target.value }))} />
              <Input className="md:col-span-2" placeholder="Description" value={newOrg.description} onChange={(event) => setNewOrg(prev => ({ ...prev, description: event.target.value }))} />
            </div>
            <Button onClick={createOrganization}>Create Organization</Button>
            <div className="space-y-3">
              {orgs?.map((organization: any) => (
                <div key={organization.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="font-medium">{organization.name}</div>
                    <div className="text-sm text-muted-foreground">{organization.contactEmail || "No contact email"} · {organization.isActive === false ? "Inactive" : "Active"}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setOrganizationId(organization.id)}>Switch</Button>
                    <Button variant={organization.isActive === false ? "default" : "destructive"} size="sm" onClick={() => toggleOrganization(organization.id, organization.isActive === false)}>
                      {organization.isActive === false ? "Activate" : "Deactivate"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>Customize your CommUnity Hub experience</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Simple Mode</Label>
              <p className="text-sm text-muted-foreground">Increase font size and reduce visual clutter for easier reading</p>
            </div>
            <Switch 
              checked={simpleMode} 
              onCheckedChange={setSimpleMode} 
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
