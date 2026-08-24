import { createFileRoute } from "@tanstack/react-router";
import VolunteerDashboard from "@/pages/volunteer-dashboard";

export const Route = createFileRoute("/volunteer-dashboard")({
  component: VolunteerDashboard,
});
