import { createFileRoute } from "@tanstack/react-router";
import VolunteerProfile from "@/pages/volunteers/[id]";

export const Route = createFileRoute("/volunteers/$id")({
  component: VolunteerProfile,
});
