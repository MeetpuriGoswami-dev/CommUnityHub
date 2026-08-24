import { createFileRoute } from "@tanstack/react-router";
import NeedsMap from "@/pages/map";

export const Route = createFileRoute("/map")({
  component: NeedsMap,
});
