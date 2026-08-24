import { createFileRoute } from "@tanstack/react-router";
import ChangePasswordPage from "@/pages/change-password";

export const Route = createFileRoute("/change-password")({
  component: ChangePasswordPage,
});
