import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useGetNeedsMapData, useGetHeatmapData } from "@workspace/api-client-react";
import { useAppContext } from "@/lib/contexts";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// Fix Leaflet default icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const getMarkerIcon = (severity: string) => {
  const colorMap: Record<string, string> = {
    critical: "#e11d48", // destructive
    high: "#f59e0b",     // amber
    medium: "#eab308",   // yellow
    low: "#10b981",      // green
  };
  
  const color = colorMap[severity] || "#0f766e"; // primary
  
  return L.divIcon({
    className: "marker-pop",
    html: `
      <div class="relative flex flex-col items-center">
        <div style="background-color: ${color}; width: 24px; height: 24px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 2.5px solid white; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); margin-top: -12px;"></div>
        <div style="width: 8px; height: 8px; background: rgba(0,0,0,0.2); border-radius: 50%; filter: blur(2px); margin-top: 4px; transform: scaleX(1.5);"></div>
      </div>
    `,
    iconSize: [24, 40],
    iconAnchor: [12, 36],
    popupAnchor: [0, -32],
  });
};

function HeatmapLayer({ data }: { data: any[] }) {
  const map = useMap();
  
  useEffect(() => {
    if (!data || data.length === 0) return;
    
    // We would use leaflet.heat here but it requires additional setup
    // For now we'll simulate it with large circles
    const circles = data.map(zone => {
      const radius = 500 + (zone.totalUrgencyScore * 10);
      const color = zone.criticalCount > 0 ? '#e11d48' : '#f59e0b';
      
      return L.circle([zone.latitude, zone.longitude], {
        radius,
        color: 'transparent',
        fillColor: color,
        fillOpacity: 0.4 + (Math.min(zone.criticalCount, 10) / 20)
      }).addTo(map);
    });
    
    return () => {
      circles.forEach(c => map.removeLayer(c));
    };
  }, [map, data]);
  
  return null;
}

export default function NeedsMap() {
  const { t } = useAppContext();
  const [showHeatmap, setShowHeatmap] = useState(false);
  
  const { data: mapData } = useGetNeedsMapData();
  const { data: heatmapData } = useGetHeatmapData();

  const defaultCenter: [number, number] = [23.0225, 72.5714]; // Ahmedabad, Gujarat

  return (
    <div className="space-y-4 h-[calc(100vh-120px)] flex flex-col">
      <div className="flex justify-between items-center shrink-0">
        <h1 className="text-3xl font-bold tracking-tight">{t("nav.map")}</h1>
        <div className="flex items-center space-x-2 bg-card px-4 py-2 rounded-lg border">
          <Switch id="heatmap-mode" checked={showHeatmap} onCheckedChange={setShowHeatmap} />
          <Label htmlFor="heatmap-mode">Heatmap Overlay</Label>
        </div>
      </div>

      <Card className="flex-1 overflow-hidden relative">
        <MapContainer 
          center={defaultCenter} 
          zoom={11} 
          className="w-full h-full z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {showHeatmap && heatmapData && (
            <HeatmapLayer data={heatmapData} />
          )}

          {!showHeatmap && mapData && (
            <MarkerClusterGroup chunkedLoading>
              {mapData.filter(d => d.latitude && d.longitude).map((point) => (
                <Marker 
                  key={point.id} 
                  position={[point.latitude, point.longitude]}
                  icon={getMarkerIcon(point.severity)}
                >
                  <Popup>
                    <div className="p-1 min-w-[200px]">
                      <div className="font-bold text-base mb-1">{point.title}</div>
                      <div className="flex gap-1 mb-2">
                        <Badge variant="outline" className="text-[10px]">{point.category}</Badge>
                        <Badge variant="outline" className="text-[10px]">{point.status}</Badge>
                      </div>
                      <div className="text-sm space-y-1">
                        <div><strong>Area:</strong> {point.area}</div>
                        <div><strong>Affected:</strong> {point.affectedCount} people</div>
                        {point.daysUnresolved && <div><strong>Unresolved for:</strong> {point.daysUnresolved} days</div>}
                      </div>
                      <a href={`/needs/${point.id}`} className="mt-3 block text-center bg-primary text-primary-foreground py-1.5 rounded text-sm hover:bg-primary/90">
                        View Details
                      </a>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MarkerClusterGroup>
          )}
        </MapContainer>
        
        {/* Legend */}
        <div className="absolute bottom-6 right-6 z-[1000] bg-card p-3 rounded-md shadow-md border">
          <div className="text-xs font-semibold mb-2">Severity</div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs"><div className="w-3 h-3 rounded-full bg-[#e11d48]" /> Critical</div>
            <div className="flex items-center gap-2 text-xs"><div className="w-3 h-3 rounded-full bg-[#f59e0b]" /> High</div>
            <div className="flex items-center gap-2 text-xs"><div className="w-3 h-3 rounded-full bg-[#eab308]" /> Medium</div>
            <div className="flex items-center gap-2 text-xs"><div className="w-3 h-3 rounded-full bg-[#10b981]" /> Low</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
