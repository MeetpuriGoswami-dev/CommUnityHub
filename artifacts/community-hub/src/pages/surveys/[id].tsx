import React, { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAppContext } from "@/lib/contexts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  ArrowLeft, Eye, Link as LinkIcon, MoreVertical, Plus, Copy, Trash2, 
  GripHorizontal, Palette, Settings, BarChart3, ChevronDown, 
  ChevronUp, Calendar, Clock, Star, Type, CheckSquare, 
  ListOrdered, Layout, Folder, Star as StarOutline, Download, Printer,
  FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, Edit2, Share2
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format, formatDistanceToNow } from "date-fns";
import * as XLSX from 'xlsx';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';

/**
 * UTILS
 */
const generateId = () => Math.random().toString(36).substr(2, 9);

/**
 * COMPONENTS
 */

// Sortable Question Card Wrapper
function SortableItem(props: { id: string; children: React.ReactNode; isFocused: boolean; onClick: () => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: props.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 1,
    boxShadow: isDragging ? "0 10px 15px -3px rgba(0, 0, 0, 0.1)" : "none",
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`group relative mb-4 transition-all ${props.isFocused ? 'ring-1 ring-primary' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        props.onClick();
      }}
    >
      <div 
        {...attributes} 
        {...listeners}
        className="absolute top-0 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground transition-opacity"
      >
        <GripHorizontal className="h-5 w-5" />
      </div>
      {props.children}
    </div>
  );
}

export default function SurveyDetail() {
  const { id } = useParams({ strict: false });
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("questions");
  const [focusedQuestionId, setFocusedQuestionId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("All changes saved");
  
  // Local state for survey to enable snappy editing
  const [localSurvey, setLocalSurvey] = useState<any>(null);

  const { data: survey, isLoading, isError } = useQuery({
    queryKey: ["survey", id],
    queryFn: () => apiFetch<any>(`/surveys/${id}`),
    enabled: !!id,
  });

  const { data: responsesSummary } = useQuery({
    queryKey: ["survey-responses-summary", id],
    queryFn: () => apiFetch<any>(`/surveys/${id}/responses/summary`),
    enabled: activeTab === "responses",
  });

  useEffect(() => {
    if (survey) {
      setLocalSurvey(survey);
    }
  }, [survey]);

  // Auto-save mutation
  const saveMutation = useMutation({
    mutationFn: (data: any) => apiFetch(`/surveys/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      setSaveStatus("All changes saved");
      setTimeout(() => setIsSaving(false), 2000);
      queryClient.invalidateQueries({ queryKey: ["survey", id] });
    },
    onError: () => {
      setSaveStatus("Save failed — retrying");
    }
  });

  // Debounced save
  useEffect(() => {
    if (!localSurvey || isLoading) return;
    
    if (JSON.stringify(localSurvey) === JSON.stringify(survey)) return;

    setIsSaving(true);
    setSaveStatus("Saving...");
    
    const timer = setTimeout(() => {
      saveMutation.mutate(localSurvey);
    }, 1200);

    return () => clearTimeout(timer);
  }, [localSurvey, survey, isLoading, saveMutation]);

  // DND Sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id && localSurvey) {
      const oldIndex = localSurvey.fields.findIndex((q: any) => q.id === active.id);
      const newIndex = localSurvey.fields.findIndex((q: any) => q.id === over?.id);
      
      const newFields = arrayMove(localSurvey.fields, oldIndex, newIndex);
      setLocalSurvey({ ...localSurvey, fields: newFields });
    }
  };

  const updateSurvey = (updates: any) => {
    setLocalSurvey((prev: any) => ({ ...prev, ...updates }));
  };

  const updateQuestion = (qId: string, updates: any) => {
    const newFields = localSurvey.fields.map((q: any) => 
      q.id === qId ? { ...q, ...updates } : q
    );
    updateSurvey({ fields: newFields });
  };

  const addQuestion = () => {
    const newQ = {
      id: generateId(),
      type: "multiple_choice",
      label: "Question",
      required: false,
      options: ["Option 1"]
    };
    const newFields = [...localSurvey.fields, newQ];
    updateSurvey({ fields: newFields });
    setFocusedQuestionId(newQ.id);
  };

  const duplicateQuestion = (qId: string) => {
    const q = localSurvey.fields.find((q: any) => q.id === qId);
    const newQ = { ...q, id: generateId() };
    const index = localSurvey.fields.findIndex((q: any) => q.id === qId);
    const newFields = [...localSurvey.fields];
    newFields.splice(index + 1, 0, newQ);
    updateSurvey({ fields: newFields });
    setFocusedQuestionId(newQ.id);
  };

  const deleteQuestion = (qId: string) => {
    const newFields = localSurvey.fields.filter((q: any) => q.id !== qId);
    updateSurvey({ fields: newFields });
  };

  const downloadExcel = () => {
    if (!responsesSummary || !localSurvey) return;
    
    apiFetch<any[]>(`/surveys/${id}/responses`).then(responses => {
      const headers = ["Timestamp", "Email", ...localSurvey.fields.map((f: any) => f.label)];
      const data = responses.map(r => {
        const row: any[] = [
          format(new Date(r.createdAt || r.submittedAt), "yyyy-MM-dd HH:mm:ss"),
          r.respondentEmail || "Anonymous",
        ];
        localSurvey.fields.forEach((f: any) => {
          const val = r.data[f.id || f.name];
          row.push(Array.isArray(val) ? val.join(", ") : val);
        });
        return row;
      });

      const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Responses");
      XLSX.writeFile(wb, `${localSurvey.title}-Responses-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    });
  };

  if (isLoading || !localSurvey) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const publicUrl = `${window.location.origin}/forms/${id}/view`;

  return (
    <div className="min-h-screen bg-[#f0f3f4] pb-20 overflow-x-hidden">
      {/* Top Navigation */}
      <nav className="fixed top-0 left-0 right-0 h-28 bg-white border-b z-50 flex flex-col pt-2 shadow-sm">
        <div className="flex items-center justify-between px-4 sm:px-6 h-14">
          <div className="flex items-center gap-4">
            <Link href="/surveys">
              <Button variant="ghost" size="icon"><ArrowLeft /></Button>
            </Link>
            <div className="flex items-center gap-2">
              <Input 
                className="font-medium text-lg border-transparent hover:border-input focus:border-primary px-2 h-9 w-[150px] sm:w-[300px] transition-all bg-transparent"
                value={localSurvey.title}
                onChange={e => updateSurvey({ title: e.target.value })}
              />
              <Folder className="h-4 w-4 text-muted-foreground hidden sm:block" />
              <StarOutline className="h-4 w-4 text-muted-foreground hidden sm:block" />
            </div>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-3">
             <span className={`text-xs sm:text-sm mr-2 transition-opacity ${isSaving ? 'opacity-100' : 'opacity-60'}`}>
               {saveStatus}
             </span>
             <Button variant="ghost" size="icon" title="Preview" onClick={() => window.open(publicUrl, "_blank")}>
               <Eye className="h-5 w-5" />
             </Button>
             <Button variant="ghost" size="icon" title="Share" onClick={() => {
               navigator.clipboard.writeText(publicUrl);
               toast({ title: "Link copied!", description: "Shareable link copied to clipboard" });
             }}>
               <LinkIcon className="h-5 w-5" />
             </Button>
             
             <AdminActionsMenu 
               survey={localSurvey} 
               publicUrl={publicUrl}
               onDuplicate={() => {
                 apiFetch(`/surveys/${id}/duplicate`, { method: "POST" }).then((newS: any) => {
                   window.location.href = `/surveys/${newS.id}`;
                 });
               }}
               onTogglePublish={() => {
                 updateSurvey({ isPublished: !localSurvey.isPublished });
               }}
             />
             
             <Button variant="ghost" size="icon" className="sm:hidden"><MoreVertical className="h-5 w-5" /></Button>
          </div>
        </div>

        <div className="flex justify-center h-14">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
            <TabsList className="bg-transparent border-none gap-4 sm:gap-8 h-full">
              <TabsTrigger 
                value="questions" 
                className="data-[state=active]:border-b-4 data-[state=active]:border-primary data-[state=active]:text-primary rounded-none px-4 h-full font-medium"
              >
                Questions
              </TabsTrigger>
              <TabsTrigger 
                value="responses" 
                className="data-[state=active]:border-b-4 data-[state=active]:border-primary data-[state=active]:text-primary rounded-none px-4 h-full font-medium relative"
              >
                Responses
                {localSurvey.responseCount > 0 && (
                  <Badge variant="secondary" className="ml-2 bg-primary/10 text-primary hover:bg-primary/10 border-none px-1.5 h-5 min-w-[20px] justify-center">
                    {localSurvey.responseCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger 
                value="settings" 
                className="data-[state=active]:border-b-4 data-[state=active]:border-primary data-[state=active]:text-primary rounded-none px-4 h-full font-medium"
              >
                Settings
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-32 max-w-[770px] mx-auto px-4 " onClick={() => setFocusedQuestionId(null)}>
        <Tabs value={activeTab} className="w-full">
          <TabsContent value="questions" className="mt-0">
            {/* Survey Header Card */}
            <Card className="mb-4 overflow-hidden border-none shadow-sm group">
              <div 
                className="h-[10px] w-full"
                style={{ backgroundColor: localSurvey.themeColor || '#4CAF50' }}
              />
              <CardContent className="p-8">
                <Input 
                  className="text-3xl font-bold h-auto border-none px-0 mb-4 focus-visible:ring-0 placeholder:text-muted-foreground/50"
                  value={localSurvey.title}
                  onChange={e => updateSurvey({ title: e.target.value })}
                  placeholder="Untitled form"
                  onClick={e => e.stopPropagation()}
                />
                <Textarea 
                  className="text-base border-none px-0 focus-visible:ring-0 min-h-0 h-auto resize-none placeholder:text-muted-foreground/50"
                  value={localSurvey.description || ""}
                  onChange={e => updateSurvey({ description: e.target.value })}
                  placeholder="Form description"
                  rows={1}
                  onClick={e => e.stopPropagation()}
                />
                <div className="flex gap-2 mt-6 transition-opacity opacity-0 group-hover:opacity-100">
                  {['#4CAF50', '#2196F3', '#F44336', '#9C27B0', '#FF9800', '#607D8B'].map(color => (
                    <button 
                      key={color}
                      className={`h-6 w-6 rounded-full border-2 ${localSurvey.themeColor === color ? 'border-gray-500 ring-2 ring-gray-200' : 'border-transparent'}`}
                      style={{ backgroundColor: color }}
                      onClick={() => updateSurvey({ themeColor: color })}
                    />
                  ))}
                  <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full"><Palette className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>

            {/* Draggable Question Cards */}
            <DndContext 
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext 
                items={localSurvey.fields?.map((q: any) => q.id) || []}
                strategy={verticalListSortingStrategy}
              >
                {localSurvey.fields?.map((q: any) => (
                  <SortableItem 
                    key={q.id} 
                    id={q.id} 
                    isFocused={focusedQuestionId === q.id}
                    onClick={() => setFocusedQuestionId(q.id)}
                  >
                    <QuestionCard 
                      question={q} 
                      isFocused={focusedQuestionId === q.id} 
                      themeColor={localSurvey.themeColor}
                      onUpdate={(updates: any) => updateQuestion(q.id, updates)}
                      onDuplicate={() => duplicateQuestion(q.id)}
                      onDelete={() => deleteQuestion(q.id)}
                    />
                  </SortableItem>
                ))}
              </SortableContext>
            </DndContext>
          </TabsContent>

          <TabsContent value="responses" className="mt-0">
             <div className="flex items-center justify-between mb-6">
               <h2 className="text-3xl font-bold">{localSurvey.responseCount} responses</h2>
               <div className="flex gap-2">
                 <Button variant="outline" size="sm" onClick={downloadExcel} className="text-[#107c10] border-[#107c10]/30 hover:bg-[#107c10]/5">
                   <FileSpreadsheet className="h-4 w-4 mr-2" /> Download Excel
                 </Button>
                 <Button variant="ghost" size="icon"><MoreVertical className="h-5 w-5" /></Button>
               </div>
             </div>
             
             <ResponseSummary viewData={responsesSummary} survey={localSurvey} />
          </TabsContent>

          <TabsContent value="settings" className="mt-0">
             <SettingsTab localSurvey={localSurvey} updateSurvey={updateSurvey} />
          </TabsContent>
        </Tabs>

        {/* Floating Toolbar */}
        <div className="fixed right-4 sm:right-auto sm:ml-[790px] top-[140px] flex flex-col bg-white rounded-lg shadow-md border p-1 z-40 gap-1">
          <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-foreground" onClick={addQuestion}><Plus /></Button>
          <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-foreground"><Layout /></Button>
          <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-foreground"><Type /></Button>
          <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-foreground"><StarOutline /></Button>
        </div>
      </main>
    </div>
  );
}

function QuestionCard({ question, isFocused, themeColor, onUpdate, onDuplicate, onDelete }: any) {
  const [localQuestion, setLocalQuestion] = useState(question);

  useEffect(() => {
    setLocalQuestion(question);
  }, [question]);

  const update = (updates: any) => {
    const next = { ...localQuestion, ...updates };
    setLocalQuestion(next);
    onUpdate(next);
  };

  const addOption = () => {
    const options = [...(localQuestion.options || []), `Option ${(localQuestion.options?.length || 0) + 1}`];
    update({ options });
  };

  const removeOption = (index: number) => {
    const options = localQuestion.options.filter((_: any, i: number) => i !== index);
    update({ options });
  };

  const addOther = () => {
    update({ allowOther: true });
  };

  const removeOther = () => {
    update({ allowOther: false });
  };

  const updateOptionText = (index: number, text: string) => {
    const options = [...localQuestion.options];
    options[index] = text;
    update({ options });
  };

  return (
    <Card className={`border-none shadow-sm overflow-hidden border-l-4 transition-all ${isFocused ? 'border-l-primary' : 'border-l-transparent'}`} style={{ borderLeftColor: isFocused ? themeColor : 'transparent' }}>
      <CardContent className={`p-8 ${!isFocused ? 'cursor-pointer' : ''}`}>
        {!isFocused ? (
          <div className="space-y-4">
            <h3 className="text-base font-medium">{localQuestion.label}</h3>
            <div className="text-muted-foreground italic text-sm">
              {['text', 'short_answer'].includes(localQuestion.type) && 'Short answer text'}
              {localQuestion.type === 'paragraph' && 'Long answer text'}
              {['multiple_choice', 'dropdown', 'checkboxes', 'select', 'multiselect'].includes(localQuestion.type) && (
                <div className="flex flex-col gap-1 not-italic">
                  {(localQuestion.options || []).map((o: string, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                       {localQuestion.type === 'checkboxes' ? <div className="w-4 h-4 border rounded" /> : <div className="w-4 h-4 border rounded-full" />}
                       <span className="text-foreground">{o}</span>
                    </div>
                  ))}
                  {localQuestion.allowOther && (
                    <div className="flex items-center gap-2">
                       {localQuestion.type === 'checkboxes' ? <div className="w-4 h-4 border rounded" /> : <div className="w-4 h-4 border rounded-full" />}
                       <span className="text-foreground">Other...</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in slide-in-from-top-1">
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <Input 
                className="flex-1 bg-[#f8f9fa] border-none border-b rounded-none focus-visible:ring-0 text-lg py-6"
                value={localQuestion.label}
                onChange={e => update({ label: e.target.value })}
                placeholder="Question"
              />
              <Select value={localQuestion.type} onValueChange={val => update({ type: val })}>
                <SelectTrigger className="w-full sm:w-[220px] h-12">
                   <div className="flex items-center gap-2">
                     <QuestionTypeIcons type={localQuestion.type} />
                     <SelectValue />
                   </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="short_answer">Short answer</SelectItem>
                  <SelectItem value="paragraph">Paragraph</SelectItem>
                  <SelectItem value="multiple_choice">Multiple choice</SelectItem>
                  <SelectItem value="checkboxes">Checkboxes</SelectItem>
                  <SelectItem value="dropdown">Dropdown</SelectItem>
                  <SelectItem value="linear_scale">Linear scale</SelectItem>
                  <SelectItem value="rating">Rating</SelectItem>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="time">Time</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Answer Edit Area */}
            <div className="min-h-[100px] pt-4">
               {['short_answer', 'text'].includes(localQuestion.type) && (
                 <Input disabled placeholder="Short answer text" className="border-0 border-b border-dashed rounded-none max-w-[200px] px-0 bg-transparent" />
               )}
               {localQuestion.type === 'paragraph' && (
                 <Input disabled placeholder="Long answer text" className="border-0 border-b border-dashed rounded-none w-full px-0 bg-transparent" />
               )}
               {['multiple_choice', 'dropdown', 'checkboxes', 'select', 'multiselect'].includes(localQuestion.type) && (
                 <div className="space-y-3">
                   {(localQuestion.options || []).map((o: string, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                       <OptionPrefix type={localQuestion.type} index={i} />
                       <Input 
                         className="border-none focus-visible:ring-0 h-8 flex-1" 
                         value={o}
                         onChange={e => updateOptionText(i, e.target.value)}
                       />
                       <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeOption(i)}>
                         <Trash2 className="h-4 w-4" />
                       </Button>
                    </div>
                  ))}
                  
                  {localQuestion.allowOther && (
                    <div className="flex items-center gap-2">
                       <OptionPrefix type={localQuestion.type} index={localQuestion.options?.length || 0} />
                       <div className="flex-1 h-8 flex items-center px-3 text-muted-foreground">Other...</div>
                       <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={removeOther}>
                         <Trash2 className="h-4 w-4" />
                       </Button>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pl-2">
                    <OptionPrefix type={localQuestion.type} index={(localQuestion.options?.length || 0) + (localQuestion.allowOther ? 1 : 0)} />
                    <Button variant="link" className="p-0 text-muted-foreground hover:text-primary h-auto" onClick={addOption}>Add option</Button>
                    {!localQuestion.allowOther && (
                      <>
                        <span className="text-muted-foreground text-sm mx-1">or</span>
                        <Button variant="link" className="p-0 text-primary h-auto font-medium" onClick={addOther}>add "Other"</Button>
                      </>
                    )}
                  </div>
                 </div>
               )}
               {localQuestion.type === 'linear_scale' && (
                 <div className="flex flex-col gap-6 max-w-sm">
                   <div className="flex items-center gap-4">
                     <Select defaultValue="1" onValueChange={v => update({ startValue: parseInt(v) })}>
                       <SelectTrigger className="w-16"><SelectValue /></SelectTrigger>
                       <SelectContent>
                         <SelectItem value="0">0</SelectItem>
                         <SelectItem value="1">1</SelectItem>
                       </SelectContent>
                     </Select>
                     <span>to</span>
                     <Select defaultValue="5" onValueChange={v => update({ endValue: parseInt(v) })}>
                       <SelectTrigger className="w-16"><SelectValue /></SelectTrigger>
                       <SelectContent>
                         {[2,3,4,5,6,7,8,9,10].map(v => <SelectItem key={v} value={String(v)}>{v}</SelectItem>)}
                       </SelectContent>
                     </Select>
                   </div>
                   <div className="flex flex-col gap-2">
                     <div className="flex items-center gap-4 text-sm font-medium">
                       <span className="w-4">{localQuestion.startValue || 1}</span>
                       <Input placeholder="Label (optional)" value={localQuestion.lowLabel || ""} onChange={e => update({ lowLabel: e.target.value })} className="flex-1 h-9" />
                     </div>
                     <div className="flex items-center gap-4 text-sm font-medium">
                       <span className="w-4">{localQuestion.endValue || 5}</span>
                       <Input placeholder="Label (optional)" value={localQuestion.highLabel || ""} onChange={e => update({ highLabel: e.target.value })} className="flex-1 h-9" />
                     </div>
                   </div>
                 </div>
               )}
               {localQuestion.type === 'rating' && (
                 <div className="flex gap-2">
                   {[1,2,3,4,5].map(v => <StarOutline key={v} className="text-muted-foreground h-8 w-8" />)}
                 </div>
               )}
               {['date', 'time'].includes(localQuestion.type) && (
                 <div className="flex items-center gap-2 text-muted-foreground">
                   {localQuestion.type === 'date' ? <Calendar /> : <Clock />}
                   <span className="text-sm">Month, day, year</span>
                 </div>
               )}
            </div>

            <div className="pt-4 mt-4 border-t flex items-center justify-end gap-2">
              <Button variant="ghost" size="icon" onClick={onDuplicate}><Copy className="h-5 w-5" /></Button>
              <Button variant="ghost" size="icon" onClick={onDelete}><Trash2 className="h-5 w-5" /></Button>
              <div className="w-[1px] h-6 bg-border mx-2" />
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium cursor-pointer">Required</Label>
                <Switch checked={localQuestion.required} onCheckedChange={checked => update({ required: checked })} />
              </div>
              <Button variant="ghost" size="icon"><MoreVertical className="h-5 w-5" /></Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QuestionTypeIcons({ type }: { type: string }) {
  if (['text', 'short_answer'].includes(type)) return <Type className="h-4 w-4" />;
  if (type === 'paragraph') return <Layout className="h-4 w-4" />;
  if (type === 'multiple_choice') return <CheckSquare className="h-4 w-4" />;
  if (type === 'checkboxes') return <CheckSquare className="h-4 w-4" />;
  if (type === 'dropdown') return <ListOrdered className="h-4 w-4" />;
  return <Star className="h-4 w-4" />;
}

function OptionPrefix({ type, index }: { type: string; index: number }) {
  if (type === 'checkboxes') return <div className="w-5 h-5 border rounded" />;
  if (type === 'dropdown') return <span className="w-5 text-sm text-muted-foreground">{index + 1}.</span>;
  return <div className="w-5 h-5 border rounded-full" />;
}

function ResponseSummary({ viewData, survey }: any) {
  if (!viewData) return <div className="p-8 text-center"><Loader2 className="animate-spin inline mr-2 text-primary" /> Loading stats...</div>;

  const { totalCount, summary } = viewData;

  if (totalCount === 0) return <div className="p-12 text-center text-muted-foreground">Waiting for responses</div>;

  return (
    <div className="space-y-6 pb-12">
       {survey.fields?.map((q: any) => {
         const qId = q.id || q.name;
         const qData = summary[qId];
         
         const isChoice = ['multiple_choice', 'checkboxes', 'dropdown', 'select', 'multiselect'].includes(q.type);
         const isScale = ['linear_scale', 'rating'].includes(q.type);

         return (
           <Card key={qId} className="border-none shadow-sm">
             <CardContent className="p-8">
               <h3 className="text-lg font-bold mb-6">{q.label}</h3>
               <p className="text-sm text-muted-foreground mb-4">{isChoice || isScale ? `${totalCount} responses` : `${qData?.length || 0} responses`}</p>
               
               <div className="min-h-[200px]">
                 {isChoice ? (
                    <div className="space-y-6">
                      <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={qData} layout="vertical" margin={{ left: 100, right: 30 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" />
                            <YAxis dataKey="option" type="category" width={100} />
                            <RechartsTooltip />
                            <Bar dataKey="count" fill={survey.themeColor || '#4CAF50'} radius={[0, 4, 4, 0]}>
                              {qData.map((_: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={survey.themeColor || '#4CAF50'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Detailed Responses</h4>
                        {qData.map((item: any, i: number) => (
                          item.count > 0 && (
                            <div key={i} className="flex justify-between items-center p-3 bg-white border border-gray-100 rounded-lg shadow-sm">
                              <div className="flex items-center gap-2">
                                <span className={item.isOther ? 'font-medium' : ''}>{item.option}</span>
                                {item.isOther && <Badge variant="secondary" className="text-[10px] h-4 bg-primary/10 text-primary border-none">Other</Badge>}
                              </div>
                              <div className="flex items-center gap-4">
                                <span className="text-xs text-muted-foreground">{item.percent}%</span>
                                <span className="font-bold w-8 text-right underline underline-offset-4 decoration-primary/30">{item.count}</span>
                              </div>
                            </div>
                          )
                        ))}
                      </div>
                    </div>
                 ) : isScale ? (
                   <div className="space-y-6">
                     <div className="text-4xl font-bold text-primary">{qData.average} <span className="text-sm font-normal text-muted-foreground">average score</span></div>
                     <div className="h-[200px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={Object.entries(qData.distribution || {}).map(([val, count]) => ({ val, count }))}>
                            <XAxis dataKey="val" />
                            <YAxis />
                            <RechartsTooltip />
                            <Bar dataKey="count" fill={survey.themeColor || '#4CAF50'} radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                     </div>
                   </div>
                 ) : (
                   <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                     {Array.isArray(qData) && qData.map((resp: any, i: number) => (
                       <div key={i} className="p-3 bg-[#f8f9fa] rounded border text-sm">{resp}</div>
                     ))}
                   </div>
                 )}
               </div>
             </CardContent>
           </Card>
         );
       })}
    </div>
  );
}

function SettingsTab({ localSurvey, updateSurvey }: any) {
  return (
    <div className="space-y-4 pb-20">
      {/* Responses Section */}
      <CollapsibleSection title="Responses" icon={<MoreVertical className="h-5 w-5" />}>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Collect email addresses</Label>
              <p className="text-sm text-muted-foreground">Specify the source for email collection</p>
            </div>
            <Select value={localSurvey.collectEmail} onValueChange={val => updateSurvey({ collectEmail: val })}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Do not collect</SelectItem>
                <SelectItem value="input">Responder input</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between opacity-50 pointer-events-none">
            <div className="space-y-0.5">
              <Label className="text-base">Send responders a copy</Label>
              <p className="text-sm text-muted-foreground">Requires verified email collection</p>
            </div>
            <Switch disabled />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Allow response editing</Label>
              <p className="text-sm text-muted-foreground">Respondents can change their answers after submitting</p>
            </div>
            <Switch checked={localSurvey.allowResponseEditing} onCheckedChange={checked => updateSurvey({ allowResponseEditing: checked })} />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Limit to 1 response</Label>
              <p className="text-sm text-muted-foreground">Requires sign-in (or IP tracking in this version)</p>
            </div>
            <Switch checked={localSurvey.limitOneResponse} onCheckedChange={checked => updateSurvey({ limitOneResponse: checked })} />
          </div>

          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Stop accepting responses</Label>
                <p className="text-sm text-muted-foreground">Manually close the form</p>
              </div>
              <div className="flex items-center gap-2">
                 {!localSurvey.isAcceptingResponses && <Badge variant="destructive" className="animate-pulse">Closed</Badge>}
                 <Switch checked={!localSurvey.isAcceptingResponses} onCheckedChange={checked => updateSurvey({ isAcceptingResponses: !checked })} />
              </div>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Presentation Section */}
      <CollapsibleSection title="Presentation" icon={<Layout className="h-5 w-5" />}>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Show progress bar</Label>
              <p className="text-sm text-muted-foreground">Display status indicator at top of form</p>
            </div>
            <Switch checked={localSurvey.showProgressBar} onCheckedChange={checked => updateSurvey({ showProgressBar: checked })} />
          </div>
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Shuffle question order</Label>
              <p className="text-sm text-muted-foreground">Randomize question order for participants</p>
            </div>
            <Switch checked={localSurvey.shuffleQuestions} onCheckedChange={checked => updateSurvey({ shuffleQuestions: checked })} />
          </div>

          <div className="space-y-2">
            <Label className="text-base">Confirmation message</Label>
            <Textarea 
              defaultValue={localSurvey.confirmationMessage} 
              onBlur={e => updateSurvey({ confirmationMessage: e.target.value })} 
              className="resize-none"
            />
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}

function CollapsibleSection({ title, children, icon }: any) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Card className="border-none shadow-sm overflow-hidden">
      <div 
        className="flex items-center justify-between p-6 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-4">
          <div className="text-muted-foreground">{icon}</div>
          <h3 className="font-medium text-lg">{title}</h3>
        </div>
        {isOpen ? <ChevronUp /> : <ChevronDown />}
      </div>
      {isOpen && <CardContent className="px-14 pb-8">{children}</CardContent>}
    </Card>
  );
}

function AdminActionsMenu({ survey, publicUrl, onDuplicate, onTogglePublish }: any) {
  const [isClearOpen, setIsClearOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const queryClient = useQueryClient();

  const handleClear = async () => {
    if (confirmText !== "DELETE") return;
    try {
      await apiFetch(`/surveys/${survey.id}/responses`, {
        method: "DELETE",
        body: JSON.stringify({ confirm: "DELETE" })
      });
      toast({ title: "Responses cleared" });
      queryClient.invalidateQueries({ queryKey: ["survey", String(survey.id)] });
      queryClient.invalidateQueries({ queryKey: ["survey-responses-summary", String(survey.id)] });
      setIsClearOpen(false);
      setConfirmText("");
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon"><MoreVertical className="h-5 w-5" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => window.open(publicUrl, "_blank")}>
            <Eye className="mr-2 h-4 w-4" /> Preview form
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => {
            navigator.clipboard.writeText(publicUrl);
            toast({ title: "Link copied!" });
          }}>
            <LinkIcon className="mr-2 h-4 w-4" /> Copy shareable link
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onTogglePublish}>
            <CheckCircle2 className="mr-2 h-4 w-4" /> {survey.isPublished ? "Unpublish form" : "Publish form"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDuplicate}>
            <Copy className="mr-2 h-4 w-4" /> Duplicate survey
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={() => setIsClearOpen(true)}>
            <Trash2 className="mr-2 h-4 w-4" /> Clear all responses
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={isClearOpen} onOpenChange={setIsClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {survey.responseCount} responses for this survey. This action cannot be undone.
              <div className="mt-4">
                <Label className="text-foreground">Please type <span className="font-bold">DELETE</span> to confirm:</Label>
                <Input 
                  className="mt-2" 
                  value={confirmText} 
                  onChange={e => setConfirmText(e.target.value)} 
                  autoFocus
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmText("")}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleClear}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={confirmText !== "DELETE"}
            >
              Delete all responses
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
