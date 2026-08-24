import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useCreateSurvey, getListSurveysQueryKey } from "@workspace/api-client-react";
import { useAppContext } from "@/lib/contexts";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function NewSurvey() {
  const navigate = useNavigate();
  const { organizationId } = useAppContext();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createSurvey = useCreateSurvey();
  const hasCreated = useRef(false);

  useEffect(() => {
    if (hasCreated.current || !organizationId) return;
    hasCreated.current = true;

    const createInitialSurvey = async () => {
      try {
        const survey = await createSurvey.mutateAsync({
          data: {
            organizationId: Number(organizationId),
            title: "Untitled Survey",
            description: "",
            fields: [
              {
                id: Math.random().toString(36).substr(2, 9),
                name: "field_1",
                type: "select",
                label: "Untitled Question",
                required: false,
                options: ["Option 1"]
              }
            ],
            isAcceptingResponses: true,
            limitOneResponse: false,
            allowResponseEditing: false,
            collectEmail: "none",
            showProgressBar: false,
            shuffleQuestions: false,
            themeColor: "#4CAF50",
            isPublished: true
          } as any
        });
        
        queryClient.invalidateQueries({ queryKey: getListSurveysQueryKey() });
        navigate({ to: `/surveys/${survey.id}` });
      } catch (e) {
        console.error("Survey creation error:", e);
        toast({ title: "Failed to initialize survey", variant: "destructive" });
        navigate({ to: "/surveys" });
      }
    };

    createInitialSurvey();
  }, [organizationId, createSurvey, navigate, queryClient, toast]);

  return (
    <div className="flex flex-col h-[60vh] items-center justify-center gap-4">
      <div className="relative">
        <Loader2 className="h-12 w-12 animate-spin text-[#4CAF50]" />
        <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-2 w-2 bg-[#4CAF50] rounded-full animate-ping" />
        </div>
      </div>
      <div className="text-xl font-medium text-slate-700 animate-pulse">Setting up your survey editor...</div>
      <p className="text-muted-foreground text-sm">This takes just a second.</p>
    </div>
  );
}
