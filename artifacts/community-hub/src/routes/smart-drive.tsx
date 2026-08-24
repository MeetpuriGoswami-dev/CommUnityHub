import { createFileRoute } from "@tanstack/react-router";
import SmartDrive from "@/pages/smart-drive";

export const Route = createFileRoute("/smart-drive")({
  component: SmartDrive,
});
