import { createFileRoute } from "@tanstack/react-router";
import NewVolunteer from "@/pages/volunteers/new";

export const Route = createFileRoute("/volunteers/new")({
  component: NewVolunteer,
});
