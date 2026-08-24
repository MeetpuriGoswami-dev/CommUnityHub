import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useCreateVolunteer, getListVolunteersQueryKey, useListOrganizations } from "@workspace/api-client-react";
import { useAppContext } from "@/lib/contexts";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

const COMMON_SKILLS = [
  "Medical/First Aid", "Driving", "Logistics", "Cooking", "Translation", 
  "Counseling", "Construction", "Childcare", "Data Entry", "Security"
];

const LANGUAGES = ["English", "Hindi", "Gujarati", "Marathi", "Bengali", "Tamil"];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function NewVolunteer() {
  const navigate = useNavigate();
  const { organizationId } = useAppContext();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    area: "",
    skills: [] as string[],
    languages: [] as string[],
    availabilityDays: [] as string[],
    loginEmail: "",
    temporaryPassword: "",
    targetOrganizationId: organizationId !== 0 ? organizationId : "",
  });

  const { data: orgs } = useListOrganizations({ query: { enabled: organizationId === 0 } as any });

  const [customSkill, setCustomSkill] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);

  const createVolunteer = useCreateVolunteer();

  const toggleArrayItem = (field: 'skills' | 'languages' | 'availabilityDays', item: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].includes(item) 
        ? prev[field].filter(i => i !== item)
        : [...prev[field], item]
    }));
  };

  const addCustomSkill = () => {
    if (!customSkill.trim()) return;
    const trimmed = customSkill.trim();
    if (!formData.skills.includes(trimmed)) {
      setFormData(prev => ({ ...prev, skills: [...prev.skills, trimmed] }));
    }
    setCustomSkill("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (organizationId === 0 && !formData.targetOrganizationId) {
      toast({ title: "Select a target organization", variant: "destructive" });
      return;
    }
    try {
      const vol = await createVolunteer.mutateAsync({
        data: {
          organizationId: organizationId !== 0 ? organizationId : Number(formData.targetOrganizationId),
          name: formData.name,
          email: formData.email || null,
          phone: formData.phone || null,
          area: formData.area,
          skills: formData.skills,
          languages: formData.languages,
          availabilityDays: formData.availabilityDays,
          latitude: null,
          longitude: null,
          loginEmail: formData.loginEmail || formData.email || null,
          temporaryPassword: formData.temporaryPassword || null,
        } as any
      });
      
      queryClient.invalidateQueries({ queryKey: getListVolunteersQueryKey() });
      const v = vol as any;
      toast({
        title: "Volunteer Registered Successfully",
        description: v.loginEmail && v.temporaryPassword ? `Login created for ${v.loginEmail}. Share the temporary password with the volunteer.` : "Profile created without login credentials.",
      });
      navigate({ to: `/volunteers/${v.id}` });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to register volunteer. Please check your inputs.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Register Volunteer</h1>

      {organizationId === 0 && (
        <Card className="border-primary bg-primary/5">
          <CardHeader className="py-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Target Organization <span className="text-destructive">*</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <Select 
              value={String(formData.targetOrganizationId)} 
              onValueChange={(v) => setFormData(p => ({...p, targetOrganizationId: v}))}
            >
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Select organization to own this volunteer" />
              </SelectTrigger>
              <SelectContent>
                {orgs?.map(org => (
                  <SelectItem key={org.id} value={String(org.id)}>{org.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">
              You are in "All Organizations" view. You must explicitly select which organization this volunteer belongs to.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Volunteer Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name <span className="text-destructive">*</span></Label>
                <Input 
                  id="name" 
                  required 
                  placeholder="e.g., Jane Doe"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({...prev, name: e.target.value}))}
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input 
                    id="phone" 
                    placeholder="e.g., +91 9876543210"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({...prev, phone: e.target.value}))}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input 
                    id="email" 
                    type="email"
                    placeholder="e.g., jane@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({...prev, email: e.target.value}))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="area">Primary Area/Location <span className="text-destructive">*</span></Label>
                <Input 
                  id="area" 
                  required 
                  placeholder="e.g., South Zone, District 4"
                  value={formData.area}
                  onChange={(e) => setFormData(prev => ({...prev, area: e.target.value}))}
                />
              </div>

              <div className="space-y-3 pt-2">
                <Label>Skills & Capabilities</Label>
                <div className="flex flex-wrap gap-2">
                  {COMMON_SKILLS.map(skill => (
                    <Badge 
                      key={skill}
                      variant={formData.skills.includes(skill) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleArrayItem('skills', skill)}
                    >
                      {skill}
                    </Badge>
                  ))}
                  <Badge 
                    variant={showCustomInput ? "secondary" : "outline"}
                    className="cursor-pointer border-dashed"
                    onClick={() => setShowCustomInput(!showCustomInput)}
                  >
                    + Other / Custom
                  </Badge>
                </div>
                {showCustomInput && (
                  <div className="flex gap-2 mt-2 animate-in fade-in slide-in-from-top-1">
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
                {formData.skills.some(s => !COMMON_SKILLS.includes(s)) && (
                  <div className="flex flex-wrap gap-2 pt-3 border-t mt-3">
                    <Label className="w-full text-xs text-muted-foreground mb-1">Custom skills:</Label>
                    {formData.skills.filter(s => !COMMON_SKILLS.includes(s)).map(skill => (
                      <Badge key={skill} variant="secondary" className="pr-1 gap-1">
                        {skill}
                        <button 
                          type="button"
                          onClick={() => toggleArrayItem('skills', skill)}
                          className="hover:bg-muted-foreground/20 rounded-full w-3 h-3 flex items-center justify-center text-[10px]"
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <Card className="bg-muted/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Volunteer Login Credentials</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="loginEmail">Login Email</Label>
                      <Input
                        id="loginEmail"
                        type="email"
                        placeholder="Defaults to email address"
                        value={formData.loginEmail}
                        onChange={(e) => setFormData(prev => ({...prev, loginEmail: e.target.value}))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="temporaryPassword">Temporary Password</Label>
                      <Input
                        id="temporaryPassword"
                        type="text"
                        minLength={8}
                        placeholder="At least 8 characters"
                        value={formData.temporaryPassword}
                        onChange={(e) => setFormData(prev => ({...prev, temporaryPassword: e.target.value}))}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">The volunteer must use these credentials for first login, then set a new password before accessing their dashboard.</p>
                </CardContent>
              </Card>

              <div className="space-y-3 pt-2">
                <Label>Languages Spoken</Label>
                <div className="flex flex-wrap gap-2">
                  {LANGUAGES.map(lang => (
                    <Badge 
                      key={lang}
                      variant={formData.languages.includes(lang) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleArrayItem('languages', lang)}
                    >
                      {lang}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <Label>Typical Availability</Label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map(day => (
                    <Badge 
                      key={day}
                      variant={formData.availabilityDays.includes(day) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleArrayItem('availabilityDays', day)}
                    >
                      {day}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-4 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => navigate({ to: "/volunteers" })}>Cancel</Button>
              <Button type="submit" disabled={createVolunteer.isPending}>
                {createVolunteer.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Register Volunteer
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
