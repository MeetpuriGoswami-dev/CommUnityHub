import { createFileRoute } from "@tanstack/react-router";
import SurveyDetail from "@/pages/surveys/[id]";

export const Route = createFileRoute("/surveys/$id")({
  component: SurveyDetail,
});
