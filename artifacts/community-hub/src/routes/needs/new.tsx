import { createFileRoute } from "@tanstack/react-router";
import NewNeed from "@/pages/needs/new";

export const Route = createFileRoute("/needs/new")({
  component: NewNeed,
});
