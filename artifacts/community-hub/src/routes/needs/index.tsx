import { createFileRoute } from "@tanstack/react-router";
import NeedsList from "@/pages/needs/index";

export const Route = createFileRoute("/needs/")({
  component: NeedsList,
});
