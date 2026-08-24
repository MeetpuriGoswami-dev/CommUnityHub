import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  useCreateNeed,
  CreateNeedBodyCategory,
  CreateNeedBodySeverity,
  CreateNeedBodySourceType,
  getListNeedsQueryKey,
  useListOrganizations
} from "@workspace/api-client-react";
import { useAppContext } from "@/lib/contexts";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Mic, MicOff, Loader2, MapPin, ChevronDown, ChevronUp, Locate, Search, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet default icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function LocationPicker({ onLocationSelect, position }: { onLocationSelect: (lat: number, lng: number) => void, position: [number, number] | null }) {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return position ? (
    <Marker 
      position={position} 
      draggable={true}
      eventHandlers={{
        dragend: (e) => {
          const marker = e.target;
          const pos = marker.getLatLng();
          onLocationSelect(pos.lat, pos.lng);
        }
      }}
    />
  ) : null;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function NewNeed() {
  const navigate = useNavigate();
  const { organizationId } = useAppContext();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isListening, setIsListening] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    category: CreateNeedBodyCategory.other,
    severity: CreateNeedBodySeverity.medium,
    area: "",
    zone: "",
    affectedCount: "",
    description: "",
    reporterName: "",
    requiredSkills: "",
    needDate: new Date().toISOString().slice(0, 10),
    daysRequired: [] as string[],
    startTime: "",
    endTime: "",
    isRecurring: false,
    recurrenceNote: "",
    latitude: "",
    longitude: "",
    coordinatesLocked: false,
    targetOrganizationId: organizationId !== 0 ? organizationId : "",
  });

  const { data: orgs } = useListOrganizations({ query: { enabled: organizationId === 0 } as any });

  const createNeed = useCreateNeed();

  const toggleDay = (day: string) => {
    setFormData((p) => ({
      ...p,
      daysRequired: p.daysRequired.includes(day)
        ? p.daysRequired.filter((d) => d !== day)
        : [...p.daysRequired, day],
    }));
  };

  const handleGeocode = async () => {
    if (!formData.area.trim()) {
      toast({ title: "Enter an area name first", variant: "destructive" });
      return;
    }
    setGeocoding(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/geocode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ query: formData.area }),
      });
      const data = await res.json();
      if (data?.latitude && data?.longitude) {
        setFormData((p) => ({
          ...p,
          latitude: String(data.latitude),
          longitude: String(data.longitude),
          coordinatesLocked: true,
        }));
        setShowMap(true);
        toast({ title: "Location found", description: data.displayName ?? "" });
      } else {
        toast({ title: "Could not geocode", description: "Try a more specific name or enter coordinates manually.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Geocoding failed", variant: "destructive" });
    } finally {
      setGeocoding(false);
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: "Geolocation not supported", variant: "destructive" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFormData((p) => ({
          ...p,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
          coordinatesLocked: true,
        }));
        toast({ title: "Location captured" });
      },
      () => toast({ title: "Could not get location", variant: "destructive" }),
    );
  };

  const handleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast({ title: "Voice input not supported", variant: "destructive" });
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setFormData((p) => ({ ...p, description: p.description ? `${p.description} ${transcript}` : transcript }));
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.daysRequired.length === 0) {
      toast({ title: "Select at least one day of the week", variant: "destructive" });
      return;
    }
    if (organizationId === 0 && !formData.targetOrganizationId) {
      toast({ title: "Select a target organization", variant: "destructive" });
      return;
    }
    try {
      const payload: any = {
        organizationId: organizationId !== 0 ? organizationId : Number(formData.targetOrganizationId),
        title: formData.title,
        category: formData.category as any,
        severity: formData.severity as any,
        area: formData.area,
        zone: formData.zone || null,
        affectedCount: parseInt(formData.affectedCount) || 1,
        description: formData.description || null,
        reporterName: formData.reporterName || null,
        sourceType: CreateNeedBodySourceType.manual,
        reportDate: new Date().toISOString(),
        requiredSkills: formData.requiredSkills.split(",").map((s) => s.trim()).filter(Boolean),
        needDate: formData.needDate,
        daysRequired: formData.daysRequired,
        startTime: formData.startTime || null,
        endTime: formData.endTime || null,
        isRecurring: formData.isRecurring,
        recurrenceNote: formData.recurrenceNote || null,
      };
      if (formData.latitude && formData.longitude) {
        payload.latitude = parseFloat(formData.latitude);
        payload.longitude = parseFloat(formData.longitude);
        payload.coordinatesLocked = formData.coordinatesLocked;
      }
      const need = await createNeed.mutateAsync({ data: payload });
      queryClient.invalidateQueries({ queryKey: getListNeedsQueryKey() });
      toast({ title: "Need reported successfully" });
      navigate({ to: `/needs/${need.id}` });
    } catch (error: any) {
      toast({ title: "Error", description: error?.message ?? "Failed to report need.", variant: "destructive" });
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Report New Need</h1>
        <Button type="button" variant={isListening ? "destructive" : "secondary"} onClick={handleVoiceInput} className="flex items-center gap-2">
          {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          {isListening ? "Stop" : "Voice Input"}
        </Button>
      </div>

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
                <SelectValue placeholder="Select organization to own this report" />
              </SelectTrigger>
              <SelectContent>
                {orgs?.map(org => (
                  <SelectItem key={org.id} value={String(org.id)}>{org.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">
              You are in "All Organizations" view. You must explicitly select which organization this need belongs to.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Need Details</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">Title <span className="text-destructive">*</span></Label>
              <Input id="title" required placeholder="e.g., Medical supplies needed at shelter"
                value={formData.title} onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="requiredSkills">Required Skills</Label>
              <Input id="requiredSkills" placeholder="e.g., Medical/First Aid, Driving, Logistics"
                value={formData.requiredSkills} onChange={(e) => setFormData((p) => ({ ...p, requiredSkills: e.target.value }))} />
              <p className="text-xs text-muted-foreground">Comma-separated. Weighted heavily in volunteer suggestions.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category <span className="text-destructive">*</span></Label>
                <Select value={formData.category} onValueChange={(v) => setFormData((p) => ({ ...p, category: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.values(CreateNeedBodyCategory).map((c) => (
                      <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Severity <span className="text-destructive">*</span></Label>
                <Select value={formData.severity} onValueChange={(v) => setFormData((p) => ({ ...p, severity: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.values(CreateNeedBodySeverity).map((s) => (
                      <SelectItem key={s} value={s}>{s.toUpperCase()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="area">Area / Location <span className="text-destructive">*</span></Label>
                <Input id="area" required placeholder="e.g., Maninagar, Ahmedabad"
                  value={formData.area} onChange={(e) => setFormData((p) => ({ ...p, area: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zone">Zone (Optional)</Label>
                <Input id="zone" placeholder="e.g., North"
                  value={formData.zone} onChange={(e) => setFormData((p) => ({ ...p, zone: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="affectedCount">Affected Count</Label>
                <Input id="affectedCount" type="number" min="1" required
                  value={formData.affectedCount} onChange={(e) => setFormData((p) => ({ ...p, affectedCount: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reporterName">Reporter Name (Optional)</Label>
                <Input id="reporterName" value={formData.reporterName}
                  onChange={(e) => setFormData((p) => ({ ...p, reporterName: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" rows={4} placeholder="Provide additional details..."
                value={formData.description} onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))} />
            </div>

            <div className="rounded-lg border p-4 space-y-4 bg-muted/30">
              <div className="flex items-center gap-2 font-medium">
                <span className="text-base">Schedule</span>
                <span className="text-xs text-muted-foreground">When are volunteers needed?</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="needDate">Date of Need / Incident <span className="text-destructive">*</span></Label>
                  <Input id="needDate" type="date" required value={formData.needDate}
                    onChange={(e) => setFormData((p) => ({ ...p, needDate: e.target.value }))} />
                </div>
                <div className="space-y-2 md:col-span-1">
                  <Label>Time Window (Optional)</Label>
                  <div className="flex gap-2">
                    <Input type="time" value={formData.startTime}
                      onChange={(e) => setFormData((p) => ({ ...p, startTime: e.target.value }))} />
                    <Input type="time" value={formData.endTime}
                      onChange={(e) => setFormData((p) => ({ ...p, endTime: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Day(s) of Week Required <span className="text-destructive">*</span></Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                  {DAYS.map((d) => (
                    <label key={d} className="flex items-center gap-2 text-sm cursor-pointer rounded-md border px-2 py-1.5 hover:bg-muted">
                      <Checkbox checked={formData.daysRequired.includes(d)} onCheckedChange={() => toggleDay(d)} />
                      <span>{d.slice(0, 3)}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Switch checked={formData.isRecurring}
                  onCheckedChange={(v) => setFormData((p) => ({ ...p, isRecurring: v }))} />
                <Label>Recurring Task</Label>
              </div>
              {formData.isRecurring && (
                <Input placeholder="e.g., Every Monday for 4 weeks"
                  value={formData.recurrenceNote}
                  onChange={(e) => setFormData((p) => ({ ...p, recurrenceNote: e.target.value }))} />
              )}
            </div>

            <div className="rounded-lg border p-4 space-y-3">
              <button type="button" className="flex items-center justify-between w-full font-medium"
                onClick={() => setShowMap((s) => !s)}>
                <span className="flex items-center gap-2"><MapPin className="w-4 h-4" /> Map Location (Optional)</span>
                {showMap ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {showMap && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={handleGeocode} disabled={geocoding}>
                      {geocoding ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Search className="w-3 h-3 mr-1" />}
                      Find from Area Name
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={useMyLocation}>
                      <Locate className="w-3 h-3 mr-1" /> Use My Current Location
                    </Button>
                  </div>

                  <div className="h-[300px] w-full rounded-lg border overflow-hidden relative z-0">
                    <MapContainer
                      center={[23.0225, 72.5714]}
                      zoom={12}
                      className="h-full w-full"
                    >
                      <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      <LocationPicker 
                        position={formData.latitude && formData.longitude ? [parseFloat(formData.latitude), parseFloat(formData.longitude)] : null}
                        onLocationSelect={(lat, lng) => setFormData(p => ({ ...p, latitude: lat.toFixed(6), longitude: lng.toFixed(6), coordinatesLocked: true }))}
                      />
                    </MapContainer>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Latitude</Label>
                      <Input type="number" step="0.000001" value={formData.latitude}
                        onChange={(e) => setFormData((p) => ({ ...p, latitude: e.target.value, coordinatesLocked: true }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Longitude</Label>
                      <Input type="number" step="0.000001" value={formData.longitude}
                        onChange={(e) => setFormData((p) => ({ ...p, longitude: e.target.value, coordinatesLocked: true }))} />
                    </div>
                  </div>
                  {formData.latitude && formData.longitude && (
                    <p className="text-xs text-emerald-600 flex items-center gap-1 font-bold">
                      <MapPin className="w-3 h-3" /> Pin dropped: {formData.latitude}, {formData.longitude}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground italic">Tip: Click on the map or drag the blue marker to set the exact location.</p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-4 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => navigate({ to: "/needs" })}>Cancel</Button>
              <Button type="submit" disabled={createNeed.isPending}>
                {createNeed.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Submit Report
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
