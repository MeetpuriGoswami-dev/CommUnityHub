import { createFileRoute } from "@tanstack/react-router";
import VolunteersList from "@/pages/volunteers/index";

export const Route = createFileRoute("/volunteers/")({
  component: VolunteersList,
});
