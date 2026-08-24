import { createFileRoute } from "@tanstack/react-router";
import SurveysList from "@/pages/surveys/index";

export const Route = createFileRoute("/surveys/")({
  component: SurveysList,
});
