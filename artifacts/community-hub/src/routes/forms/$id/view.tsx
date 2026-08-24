import { createFileRoute } from "@tanstack/react-router";
import PublicForm from "@/pages/forms/[id]/view";

export const Route = createFileRoute("/forms/$id/view")({
  component: PublicForm,
});
