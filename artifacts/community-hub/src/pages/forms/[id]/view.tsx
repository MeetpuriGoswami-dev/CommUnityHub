import React, { useState, useEffect } from "react";
import { useParams } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { Star, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

export default function PublicForm() {
  const { id: surveyId } = useParams({ strict: false });

  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [shuffledQuestions, setShuffledQuestions] = useState<any[]>([]);
  const [scrollProgress, setScrollProgress] = useState(0);

  const { data: survey, isLoading, error } = useQuery({
    queryKey: ["survey", "public", surveyId],
    queryFn: () => apiFetch<any>(`/surveys/${surveyId}/public`),
    enabled: !!surveyId,
  });

  useEffect(() => {
    if (surveyId && localStorage.getItem(`submitted_survey_${surveyId}`)) {
      if (survey?.limitOneResponse) {
        setAlreadySubmitted(true);
      }
    }
  }, [surveyId, survey]);

  useEffect(() => {
    if (survey?.fields) {
      let questions = [...survey.fields];
      if (survey.shuffleQuestions) {
        // Simple seeded shuffle or just random for now as requested
        questions = questions.sort(() => Math.random() - 0.5);
      }
      setShuffledQuestions(questions);
    }
  }, [survey]);

  useEffect(() => {
    const handleScroll = () => {
      const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
      const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const scrolled = (winScroll / height) * 100;
      setScrollProgress(scrolled);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const submitMutation = useMutation({
    mutationFn: (data: any) => apiFetch(`/surveys/${surveyId}/responses`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: (data: any) => {
      setSubmitted(true);
      localStorage.setItem(`submitted_survey_${surveyId}`, "true");
      toast({ title: "Response submitted", description: data.confirmationMessage });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Subscription failed", description: error.message });
    },
  });

  if (isLoading) return <div className="min-h-screen grid place-items-center"><Loader2 className="animate-spin h-8 w-8 text-muted-foreground" /></div>;
  if (error || !survey) return (
    <div className="min-h-screen grid place-items-center text-center p-4">
      <div className="max-w-md">
        <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Survey not found or unavailable</h2>
        <p className="text-muted-foreground">The survey you're looking for might not exist, or it hasn't been published yet. Please double check the link or contact the administrator.</p>
      </div>
    </div>
  );

  if (survey.closed) {
    return (
      <div className="min-h-screen bg-[#e8f0e9] py-12 px-4">
        <div className="max-w-[640px] mx-auto bg-white rounded-lg shadow-sm border overflow-hidden">
          <img src="/FullHorizontalLockUp.png" alt="Header" className="w-full h-24 object-cover" />
          <div className="p-8">
            <h1 className="text-3xl font-bold mb-4">{survey.title}</h1>
            <p className="text-lg text-muted-foreground">{survey.message || "This form is no longer accepting responses"}</p>
          </div>
        </div>
      </div>
    );
  }

  if (alreadySubmitted && !submitted) {
    return (
      <div className="min-h-screen bg-[#e8f0e9] py-12 px-4">
        <div className="max-w-[640px] mx-auto bg-white rounded-lg shadow-sm border overflow-hidden">
          <img src="/FullHorizontalLockUp.png" alt="Header" className="w-full h-24 object-cover" />
          <div className="p-8">
            <h1 className="text-3xl font-bold mb-4">{survey.title}</h1>
            <p className="text-lg text-muted-foreground">You have already responded to this form.</p>
          </div>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#e8f0e9] py-12 px-4">
        <div className="max-w-[640px] mx-auto bg-white rounded-lg shadow-sm border overflow-hidden">
          <img src="/FullHorizontalLockUp.png" alt="Header" className="w-full h-24 object-cover" />
          <div className="p-8">
            <h1 className="text-3xl font-bold mb-4">{survey.title}</h1>
            <p className="text-lg mb-6">{survey.confirmationMessage || "Thanks for submitting your response!"}</p>
            {survey.allowResponseEditing && (
              <Button variant="link" onClick={() => setSubmitted(false)} className="p-0 text-[#4CAF50]">
                Edit your response
              </Button>
            )}
            <div className="mt-8 pt-8 border-t">
              <Button variant="outline" onClick={() => window.location.reload()}>Submit another response</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Process "Other" answers
    const finalAnswers = { ...answers };
    shuffledQuestions.forEach(q => {
      const qId = q.id || q.name;
      if (q.allowOther && answers[`${qId}_other`]) {
        const otherVal = answers[`${qId}_other`];
        if (finalAnswers[qId] === "__OTHER__") {
          finalAnswers[qId] = otherVal;
        } else if (Array.isArray(finalAnswers[qId]) && finalAnswers[qId].includes("__OTHER__")) {
          finalAnswers[qId] = finalAnswers[qId].map((v: any) => v === "__OTHER__" ? otherVal : v);
        }
      }
      // Cleanup temp keys
      delete finalAnswers[`${qId}_other`];
    });

    // Simple validation
    const missingFields = shuffledQuestions.filter(q => q.required && !finalAnswers[q.id || q.name]);
    if (survey.collectEmail === 'input' && !email) {
      missingFields.push({ id: 'email', label: 'Email address' });
    }

    if (missingFields.length > 0) {
      toast({ variant: "destructive", title: "Validation Error", description: "Please fill in all required fields." });
      return;
    }

    submitMutation.mutate({ answers: finalAnswers, respondentEmail: email });
  };

  const updateAnswer = (id: string, val: any) => {
    setAnswers(prev => ({ ...prev, [id]: val }));
  };

  return (
    <div className="min-h-screen bg-[#e8f0e9] pb-12 transition-all">
      {survey.showProgressBar && (
        <Progress value={scrollProgress} className="fixed top-0 left-0 right-0 z-50 h-1.5 rounded-none bg-transparent [&>div]:bg-[#4CAF50]" />
      )}
      
      <div className="max-w-[640px] mx-auto pt-4 px-4 sm:px-0">
        <Card className="border-none shadow-sm overflow-hidden mb-4">
          <img 
            src="/FullHorizontalLockUp.png" 
            alt="Survey Header" 
            className="w-full h-[200px] object-cover" 
          />
          <CardContent className="p-8">
            <h1 className="text-4xl font-bold mb-4">{survey.title}</h1>
            <p className="whitespace-pre-wrap text-muted-foreground">{survey.description}</p>
            
            {survey.collectEmail !== 'none' && (
              <div className="mt-8 pt-8 border-t">
                <div className="flex flex-col gap-2">
                  <Label className="text-base font-medium">Email address <span className="text-destructive">*</span></Label>
                  <Input 
                    type="email" 
                    placeholder="Your email" 
                    value={email} 
                    onChange={e => setEmail(e.target.value)} 
                    required 
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {shuffledQuestions.map((q) => {
          const qId = q.id || q.name;
          return (
            <Card key={qId} className="mb-4 border-none shadow-sm">
              <CardContent className="p-8">
                <div className="mb-6">
                  <Label className="text-lg leading-tight font-medium">
                    {q.label} {q.required && <span className="text-destructive">*</span>}
                  </Label>
                  {q.description && <p className="text-sm text-muted-foreground mt-2">{q.description}</p>}
                </div>

                <div className="space-y-4">
                  {q.type === 'short_answer' || q.type === 'text' ? (
                    <Input 
                      placeholder="Your answer" 
                      className="border-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-b-2" 
                      style={{ borderColor: survey.themeColor }}
                      onChange={e => updateAnswer(qId, e.target.value)}
                    />
                  ) : q.type === 'paragraph' ? (
                    <Textarea 
                      placeholder="Your answer" 
                      className="border-0 border-b rounded-none px-0 min-h-[100px] focus-visible:ring-0 focus-visible:border-b-2" 
                      style={{ borderColor: survey.themeColor }}
                      onChange={e => updateAnswer(qId, e.target.value)}
                    />
                  ) : q.type === 'multiple_choice' || q.type === 'select' ? (
                    <RadioGroup onValueChange={val => updateAnswer(qId, val)}>
                      {(q.options || []).map((opt: string) => (
                        <div key={opt} className="flex items-center space-x-3 py-2">
                          <RadioGroupItem value={opt} id={`${qId}-${opt}`} />
                          <Label htmlFor={`${qId}-${opt}`} className="font-normal cursor-pointer text-base">{opt}</Label>
                        </div>
                      ))}
                      {q.allowOther && (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center space-x-3 py-2">
                            <RadioGroupItem value="__OTHER__" id={`${qId}-other`} />
                            <Label htmlFor={`${qId}-other`} className="font-normal cursor-pointer text-base">Other:</Label>
                          </div>
                          {answers[qId] === "__OTHER__" && (
                            <div className="pl-8">
                              <Input 
                                placeholder="Your answer" 
                                className="border-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-b-2"
                                style={{ borderColor: survey.themeColor }}
                                onChange={e => {
                                  // We'll store the object and handle it during submit
                                  setAnswers(prev => ({ ...prev, [`${qId}_other`]: e.target.value }));
                                }}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </RadioGroup>
                  ) : q.type === 'checkboxes' || q.type === 'multiselect' ? (
                    <div className="space-y-3">
                      {(q.options || []).map((opt: string) => (
                        <div key={opt} className="flex items-center space-x-3">
                          <Checkbox 
                            id={`${qId}-${opt}`} 
                            onCheckedChange={checked => {
                              const current = Array.isArray(answers[qId]) ? answers[qId] : [];
                              const next = checked ? [...current, opt] : current.filter((v: any) => v !== opt);
                              updateAnswer(qId, next);
                            }}
                          />
                          <Label htmlFor={`${qId}-${opt}`} className="font-normal cursor-pointer text-base">{opt}</Label>
                        </div>
                      ))}
                      {q.allowOther && (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center space-x-3">
                            <Checkbox 
                              id={`${qId}-other`}
                              onCheckedChange={checked => {
                                const current = Array.isArray(answers[qId]) ? answers[qId] : [];
                                const next = checked ? [...current, "__OTHER__"] : current.filter((v: any) => v !== "__OTHER__");
                                updateAnswer(qId, next);
                              }}
                            />
                            <Label htmlFor={`${qId}-other`} className="font-normal cursor-pointer text-base">Other:</Label>
                          </div>
                          {(Array.isArray(answers[qId]) && answers[qId].includes("__OTHER__")) && (
                            <div className="pl-8">
                              <Input 
                                placeholder="Your answer" 
                                className="border-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-b-2"
                                style={{ borderColor: survey.themeColor }}
                                onChange={e => {
                                  setAnswers(prev => ({ ...prev, [`${qId}_other`]: e.target.value }));
                                }}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : q.type === 'dropdown' ? (
                    <Select onValueChange={val => updateAnswer(qId, val)}>
                      <SelectTrigger className="w-full sm:w-[300px]">
                        <SelectValue placeholder="Choose" />
                      </SelectTrigger>
                      <SelectContent>
                        {(q.options || []).map((opt: string) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : q.type === 'linear_scale' ? (
                    <div className="flex flex-col gap-4">
                      <div className="flex items-end justify-between max-w-sm mx-auto w-full pt-4">
                        <span className="text-sm font-medium mb-1">{q.lowLabel}</span>
                        <div className="flex gap-4 sm:gap-6">
                           {[...Array((q.endValue || 5) - (q.startValue || 1) + 1)].map((_, i) => {
                             const val = (q.startValue || 1) + i;
                             return (
                               <div key={val} className="flex flex-col items-center gap-3">
                                 <span className="text-sm">{val}</span>
                                 <RadioGroup onValueChange={() => updateAnswer(qId, val)} value={String(answers[qId])}>
                                   <RadioGroupItem value={String(val)} />
                                 </RadioGroup>
                               </div>
                             );
                           })}
                        </div>
                        <span className="text-sm font-medium mb-1">{q.highLabel}</span>
                      </div>
                    </div>
                  ) : q.type === 'rating' ? (
                    <div className="flex gap-2">
                       {[1, 2, 3, 4, 5].map((val) => (
                         <Button 
                           key={val} 
                           type="button" 
                           variant="ghost" 
                           size="icon" 
                           className={`h-10 w-10 ${answers[qId] >= val ? 'text-yellow-400' : 'text-gray-300'}`}
                           onClick={() => updateAnswer(qId, val)}
                         >
                           <Star className={answers[qId] >= val ? 'fill-current' : ''} />
                         </Button>
                       ))}
                    </div>
                  ) : q.type === 'date' ? (
                    <Input type="date" className="w-[200px]" onChange={e => updateAnswer(qId, e.target.value)} />
                  ) : q.type === 'time' ? (
                    <Input type="time" className="w-[150px]" onChange={e => updateAnswer(qId, e.target.value)} />
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}

        <div className="flex items-center justify-between mt-8">
          <Button 
            onClick={handleSubmit} 
            size="lg" 
            className="px-8 text-lg font-bold h-12"
            style={{ backgroundColor: survey.themeColor }}
            disabled={submitMutation.isPending}
          >
            {submitMutation.isPending ? <Loader2 className="animate-spin mr-2" /> : 'Submit'}
          </Button>
          <Button variant="ghost" className="text-muted-foreground" onClick={() => setAnswers({})}>Clear form</Button>
        </div>
        
        <div className="mt-12 text-center text-xs text-muted-foreground flex flex-col gap-2">
          <p>This content is neither created nor endorsed by CommUnity Hub. Report Abuse - Terms of Service - Privacy Policy</p>
          <div className="flex items-center justify-center gap-1 text-base font-bold text-gray-500">
            <CheckCircle2 className="h-5 w-5" /> CommUnity Hub Forms
          </div>
        </div>
      </div>
    </div>
  );
}
