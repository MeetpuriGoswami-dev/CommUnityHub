import { createFileRoute } from "@tanstack/react-router";
import UploadHub from "@/pages/upload-hub";

export const Route = createFileRoute("/upload-hub")({
  component: UploadHub,
});
