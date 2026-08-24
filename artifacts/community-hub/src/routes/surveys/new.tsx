import { createFileRoute } from "@tanstack/react-router";
import NewSurvey from "@/pages/surveys/new";

export const Route = createFileRoute("/surveys/new")({
  component: NewSurvey,
});
