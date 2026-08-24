import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/bulk-upload")({
  beforeLoad: () => {
    throw redirect({ to: "/upload-hub" });
  },
  component: () => null,
});
