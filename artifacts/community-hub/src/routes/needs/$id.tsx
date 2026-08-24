import { createFileRoute } from "@tanstack/react-router";
import NeedDetail from "@/pages/needs/[id]";

export const Route = createFileRoute("/needs/$id")({
  component: NeedDetail,
});
