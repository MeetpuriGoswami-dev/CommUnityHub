import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useListSurveys } from "@workspace/api-client-react";
import { useAppContext } from "@/lib/contexts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, ClipboardList, AlertCircle, BarChart3, Edit2, Share2, Eye, FileText } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "@/hooks/use-toast";

export default function SurveysList() {
  const { organizationId, t } = useAppContext();
  const { data: surveys, isLoading } = useListSurveys({ organizationId });

  const copyShareLink = (id: number) => {
    const url = `${window.location.origin}/forms/${id}/view`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied to clipboard" });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{t("nav.surveys")}</h1>
        <Link href="/surveys/new">
          <Button className="bg-[#4CAF50] hover:bg-[#43a047]">
            <Plus className="mr-2 h-4 w-4" /> Create Survey
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card className="border-l-4 border-l-blue-500 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Surveys</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{surveys?.length || 0}</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-[#4CAF50] shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Active Responses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {surveys?.reduce((acc: number, s: any) => acc + (s.responseCount || 0), 0) || 0}
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Live Surveys</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {surveys?.filter((s: any) => s.isPublished && s.isAcceptingResponses).length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-[#4CAF50]" />
            Forms & Surveys
          </CardTitle>
          <CardDescription>Design, distribute, and analyze field data collections</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Survey Title</TableHead>
                {organizationId === 0 && <TableHead>Organization</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead>Deadline</TableHead>
                <TableHead className="text-right">Responses</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-muted-foreground">Loading collections...</span>
                  </div>
                </TableCell></TableRow>
              ) : surveys && surveys.length > 0 ? (
                surveys.map((survey: any) => {
                  const isClosed = !survey.isAcceptingResponses || (survey.responseDeadline && new Date() > new Date(survey.responseDeadline));
                  
                  return (
                    <TableRow key={survey.id} className="group hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium">
                        <Link href={`/surveys/${survey.id}`}>
                          <div className="flex flex-col cursor-pointer">
                            <span className="text-base group-hover:text-primary transition-colors">{survey.title}</span>
                            <span className="text-xs text-muted-foreground font-normal line-clamp-1">{survey.description || "No description"}</span>
                          </div>
                        </Link>
                      </TableCell>
                      {organizationId === 0 && (
                        <TableCell>
                          <Badge variant="secondary" className="bg-green-50 text-green-700 hover:bg-green-50 border-green-100 font-normal">
                            {survey.organizationName || "Hub"}
                          </Badge>
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {!survey.isPublished && <Badge variant="secondary" className="bg-gray-100 text-gray-500 border-none">Draft</Badge>}
                          {survey.isPublished && (
                            isClosed ? (
                              <Badge variant="destructive" className="bg-red-50 text-red-600 border-red-100">Closed</Badge>
                            ) : (
                              <Badge className="bg-green-50 text-green-600 border-green-100">Accepting</Badge>
                            )
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {survey.responseDeadline ? (
                          <div className={`text-sm ${isClosed ? 'text-muted-foreground' : 'text-amber-600 font-medium'}`}>
                            {isClosed ? 'Expired ' : 'Ends '}
                            {formatDistanceToNow(new Date(survey.responseDeadline), { addSuffix: true })}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end">
                          <span className="font-bold text-lg">{survey.responseCount || 0}</span>
                          <span className="text-[10px] text-muted-foreground uppercase tracking-tighter">Submissions</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/surveys/${survey.id}`}>
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-primary" title="Edit Questions">
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Link href={`/surveys/${survey.id}?tab=responses`}>
                             <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-[#4CAF50]" title="View Analytics">
                               <BarChart3 className="h-4 w-4" />
                             </Button>
                          </Link>
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-blue-500" title="Copy Public Link" onClick={() => copyShareLink(survey.id)}>
                            <Share2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow><TableCell colSpan={5} className="text-center py-16 text-muted-foreground">
                  <div className="flex flex-col items-center gap-3">
                    <FileText className="h-10 w-10 opacity-20" />
                    <p>No surveys created yet. Start by creating a data collection form.</p>
                    <Link href="/surveys/new">
                      <Button variant="outline" size="sm">Create your first survey</Button>
                    </Link>
                  </div>
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
