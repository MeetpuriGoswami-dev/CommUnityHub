import React, { useState, useMemo } from "react";
import { 
  FileText, 
  Upload, 
  Trash2, 
  Search, 
  File, 
  Table as TableIcon, 
  BarChart3, 
  Download, 
  Filter, 
  Zap,
  Info,
  Clock,
  MoreVertical,
  DownloadCloud,
  FileSpreadsheet,
  AlertTriangle
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { 
  useListSmartDriveFiles, 
  useUploadSmartDriveFile, 
  useDeleteSmartDriveFile,
  useUpdateSmartDriveFile,
  useListNeeds,
  SmartDriveFile,
  Need
} from "@workspace/api-client-react";
import { useAppContext } from "@/lib/contexts";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import { Progress } from "@/components/ui/progress";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export default function SmartDrive() {
  const { user, organizationId, t } = useAppContext();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("files");
  const [searchQuery, setSearchQuery] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isAiScanning, setIsAiScanning] = useState(false);
  const [selectedAiFile, setSelectedAiFile] = useState<File | null>(null);

  // API Hooks
  const { data: files, refetch: refetchFiles } = useListSmartDriveFiles({ organizationId: organizationId || 0 }, { query: { enabled: !!organizationId } as any });
  const uploadFile = useUploadSmartDriveFile();
  const deleteFile = useDeleteSmartDriveFile();
  const updateFile = useUpdateSmartDriveFile();
  const { data: needs } = useListNeeds({ organizationId: organizationId });

  // Filtering
  const { approvedFiles, pendingFiles } = useMemo(() => {
    if (!files) return { approvedFiles: [], pendingFiles: [] };
    const searched = files.filter((f: SmartDriveFile) => 
      f.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.fileType.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return {
      approvedFiles: searched.filter(f => !f.status || f.status === 'approved'),
      pendingFiles: searched.filter(f => f.status === 'pending')
    };
  }, [files, searchQuery]);

  // Handlers
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !organizationId) return;

    setIsUploading(true);
    try {
      await uploadFile.mutateAsync({
        data: {
          file,
          organizationId: organizationId
        }
      });
      toast({
        title: "File uploaded",
        description: `${file.name} is now safely stored in your Smart Drive.`,
      });
      refetchFiles();
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "There was an error uploading your file. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
      e.target.value = ""; // Reset input
    }
  };

  const handleAiScan = async () => {
    if (!selectedAiFile || !organizationId) {
      toast({ title: "No file selected", description: "Please upload a document or survey to scan.", variant: "destructive" });
      return;
    }

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Generating Report...</title><style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;color:#666;} .spinner{width:40px;height:40px;border:4px solid #f3f3f3;border-top:4px solid #1a6b5c;border-radius:50%;animation:spin 1s linear infinite;} @keyframes spin{0%{transform:rotate(0deg);} 100%{transform:rotate(360deg);}}</style></head><body><div class="spinner"></div><p>AI is analyzing your document...</p></body></html>');
    }

    setIsAiScanning(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedAiFile);
      formData.append("organizationId", organizationId.toString());

      const res = await fetch("/api/smart-drive/quick-scan", {
        method: "POST",
        body: formData,
        credentials: "include"
      });

      const body = await res.json();
      if (!res.ok) {
        if (printWindow) printWindow.close();
        throw new Error(body.error || "AI Scan failed");
      }

      toast({ title: "AI Scan Complete", description: "Displaying dynamic report..." });
      
      if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(body.html);
        printWindow.document.close();
        printWindow.focus();
        
        setTimeout(() => {
           printWindow.print();
        }, 800);
      }
      
    } catch (error: any) {
      if (printWindow) printWindow.close();
      toast({
        title: "AI Scan Failed",
        description: error.message || "Failed to generate AI report.",
        variant: "destructive"
      });
    } finally {
      setIsAiScanning(false);
      setSelectedAiFile(null);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteFile.mutateAsync({ id });
      toast({ title: "File deleted" });
      refetchFiles();
    } catch (error) {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  };

  const handleUpdate = async (id: number, updates: { isVisibleToVolunteers?: boolean, status?: 'approved' | 'pending' | 'rejected' }) => {
    try {
      await updateFile.mutateAsync({ id, data: updates });
      toast({ title: "File updated" });
      refetchFiles();
    } catch (error) {
      console.error("Smart Drive Update Error:", error);
      toast({ title: "Update failed", variant: "destructive" });
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getFileIcon = (type: string) => {
    if (type.includes("pdf")) return <FileText className="h-4 w-4 text-red-500" />;
    if (type.includes("sheet") || type.includes("csv") || type.includes("excel")) return <TableIcon className="h-4 w-4 text-green-500" />;
    if (type.includes("word")) return <FileText className="h-4 w-4 text-blue-500" />;
    if (type.includes("image")) return <File className="h-4 w-4 text-purple-500" />;
    return <File className="h-4 w-4 text-gray-400" />;
  };

  // Quick Scan Analysis
  const analysis = useMemo(() => {
    if (!needs) return null;
    
    const byCategory = needs.reduce((acc: Record<string, number>, n: Need) => {
      acc[n.category] = (acc[n.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const bySeverity = needs.reduce((acc: Record<string, number>, n: Need) => {
      acc[n.severity] = (acc[n.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byArea = needs.reduce((acc: Record<string, number>, n: Need) => {
      acc[n.area] = (acc[n.area] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const totalNeeds = needs.length;
    const resolvedNeeds = needs.filter((n: Need) => n.status === "resolved").length;
    const completionRate = totalNeeds > 0 ? (resolvedNeeds / totalNeeds) * 100 : 0;

    return {
      totalNeeds,
      resolvedNeeds,
      completionRate,
      byCategory,
      bySeverity,
      byArea
    };
  }, [needs]);

  const exportAnalysis = () => {
    if (!analysis || !needs) return;
    
    // Create workbook with multiple sheets
    const wb = XLSX.utils.book_new();
    
    // Sheet 1: Raw Data
    const wsData = XLSX.utils.json_to_sheet(needs);
    XLSX.utils.book_append_sheet(wb, wsData, "Active Needs");
    
    // Sheet 2: Summary
    const summaryData = [
      ["Metric", "Value"],
      ["Total Needs", analysis.totalNeeds],
      ["Resolved", analysis.resolvedNeeds],
      ["Completion Rate", `${analysis.completionRate.toFixed(1)}%`],
      [],
      ["Category Breakdown"],
      ...Object.entries(analysis.byCategory),
      [],
      ["Severity Breakdown"],
      ...Object.entries(analysis.bySeverity)
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Quick Scan Summary");
    
    XLSX.writeFile(wb, `CommunityHub_QuickScan_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            {t("Smart Hub")}
          </h1>
          <p className="text-muted-foreground">
            Centralized file library and data intelligence for {user?.role === "super_admin" ? "all organizations" : "your NGO"}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className={cn(buttonVariants({ variant: "default" }), "cursor-pointer")}>
            <Upload className="mr-2 h-4 w-4" />
            Upload File
            <input type="file" className="hidden" onChange={handleUpload} disabled={isUploading} />
          </label>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted/50 p-1 border">
          <TabsTrigger value="files" className="gap-2 data-[state=active]:bg-background">
            <File className="h-4 w-4" />
            {t("Smart Drive")}
          </TabsTrigger>
          <TabsTrigger value="scan" className="gap-2 data-[state=active]:bg-background">
            <Zap className="h-4 w-4 text-yellow-500 fill-yellow-500" />
            Quick Scan
          </TabsTrigger>
        </TabsList>

        <TabsContent value="files" className="space-y-4">
          <Card className="border-none shadow-md bg-card/60 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>File Library</CardTitle>
                  <CardDescription>Secure storage for organization documents, guidelines, and resource packs.</CardDescription>
                </div>
                <div className="relative w-72">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search files..."
                    className="pl-8 bg-background/50 border-none focus-visible:ring-1"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isUploading && (
                <div className="mb-4 space-y-2 anim-pulse">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Uploading your file...</span>
                    <span>Encrypting for storage</span>
                  </div>
                  <Progress value={45} className="h-1" />
                </div>
              )}

              {pendingRequestsSection(pendingFiles, handleUpdate, handleDelete, formatSize)}

              <div className="rounded-md border bg-background/40 overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="w-[30%]">Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Visible to Volunteers</TableHead>
                      <TableHead>Uploaded At</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {approvedFiles.length > 0 ? (
                      approvedFiles.map((f: SmartDriveFile) => (
                        <TableRow key={f.id} className="hover:bg-muted/20 transition-colors group">
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-lg bg-background border shadow-sm flex-shrink-0">
                                {getFileIcon(f.fileType)}
                              </div>
                              <span className="truncate max-w-[200px] md:max-w-md lg:max-w-xl" title={f.fileName}>
                                {f.fileName}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-normal text-[10px] uppercase tracking-wider bg-background/50">
                              {f.fileType.split("/")[1] || f.fileType}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              className={cn("capitalize", 
                                (!f.status || f.status === 'approved') ? 'bg-green-500/10 text-green-700 hover:bg-green-500/20' : 
                                f.status === 'pending' ? 'bg-yellow-500/10 text-yellow-700 hover:bg-yellow-500/20' : 
                                'bg-red-500/10 text-red-700 hover:bg-red-500/20'
                              )}
                            >
                              {f.status || 'approved'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch 
                                checked={f.isVisibleToVolunteers} 
                                onCheckedChange={(checked) => handleUpdate(f.id, { isVisibleToVolunteers: checked })}
                                disabled={f.status === 'pending'}
                              />
                               <span className="text-xs text-muted-foreground">{f.isVisibleToVolunteers ? 'Visible' : 'Hidden'}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {format(new Date(f.createdAt), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem onClick={() => window.open(f.filePath, "_blank")} className="gap-2">
                                  <Download className="h-4 w-4 text-blue-500" />
                                  Download
                                </DropdownMenuItem>
                                {f.status === 'pending' && (
                                  <>
                                    <DropdownMenuItem onClick={() => handleUpdate(f.id, { status: 'approved' })} className="gap-2 text-green-600">
                                      <Zap className="h-4 w-4" />
                                      Approve
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleUpdate(f.id, { status: 'rejected' })} className="gap-2 text-red-600">
                                      <Trash2 className="h-4 w-4" />
                                      Reject
                                    </DropdownMenuItem>
                                  </>
                                )}
                                <DropdownMenuItem onClick={() => handleDelete(f.id)} className="gap-2 text-destructive focus:text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                          {searchQuery ? "No files match your search." : "Your Smart Drive is currently empty."}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scan">
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="md:col-span-2 shadow-md">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                      Quick Scan Analytics
                    </CardTitle>
                    <CardDescription>Instant client-side intelligence based on your current need reports.</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={exportAnalysis} disabled={!analysis}>
                    <Download className="mr-2 h-4 w-4" />
                    Smart Export
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {!analysis ? (
                  <div className="h-64 flex flex-col items-center justify-center text-center space-y-4">
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center anim-pulse">
                      <Search className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground max-w-xs text-sm">No analysis data available. Run reports or upload data to use Quick Scan.</p>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-4 grid-cols-3">
                      <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 transition-all hover:bg-primary/10">
                        <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">Total Reports</p>
                        <p className="text-3xl font-bold">{analysis.totalNeeds}</p>
                      </div>
                      <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/10 transition-all hover:bg-green-500/10">
                        <p className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-1">Impact Made</p>
                        <p className="text-3xl font-bold">{analysis.resolvedNeeds}</p>
                      </div>
                      <div className="p-4 rounded-xl bg-orange-500/5 border border-orange-500/10 transition-all hover:bg-orange-500/10">
                        <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider mb-1">Status</p>
                        <p className="text-3xl font-bold">{analysis.completionRate.toFixed(0)}%</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <BarChart3 className="h-4 w-4" />
                        Key Category Saturation
                      </h4>
                        <div className="space-y-3">
                        {Object.entries(analysis.byCategory).sort((a: [string, any], b: [string, any]) => b[1] - a[1]).slice(0, 5).map(([cat, count]) => (
                          <div key={cat} className="space-y-1.5">
                            <div className="flex justify-between text-xs font-medium">
                              <span>{cat}</span>
                              <span className="text-muted-foreground">{(count as number)} needs ({(((count as number) / analysis.totalNeeds) * 100).toFixed(0)}%)</span>
                            </div>
                            <Progress value={((count as number) / analysis.totalNeeds) * 100} className="h-1.5 bg-muted" />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-4 border-t grid grid-cols-2 gap-8">
                      <div className="space-y-3">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground underline decoration-primary/30 underline-offset-4">Top Regions</h4>
                        <div className="space-y-2">
                          {Object.entries(analysis.byArea).sort((a: [string, any], b: [string, any]) => b[1] - a[1]).slice(0, 3).map(([area, count]) => (
                            <div key={area} className="flex items-center justify-between text-sm">
                              <span className="flex items-center gap-2"><Filter className="h-3 w-3 text-muted-foreground" /> {area}</span>
                              <Badge variant="secondary" className="text-[10px] uppercase font-bold">{(count as number)}</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-3">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground underline decoration-destructive/30 underline-offset-4">Critical Pulse</h4>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2 font-semibold text-destructive"><AlertTriangle className="h-3 w-3" /> Critical Needs</span>
                            <span className="font-bold">{analysis.bySeverity["critical"] || 0}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2 font-semibold text-orange-500 underline decoration-orange-500/20 underline-offset-2 decoration-2 decoration-wavy">High Severity</span>
                            <span className="font-bold">{analysis.bySeverity["high"] || 0}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="bg-gradient-to-br from-primary to-indigo-600 text-white border-none shadow-lg overflow-hidden relative group">
                <div className="absolute top-0 right-0 p-3 opacity-10 transform scale-150 group-hover:scale-110 transition-transform duration-500">
                  <FileText className="h-32 w-32" />
                </div>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-yellow-300" />
                    AI Report Generator
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm opacity-90 relative z-10">Upload any survey CSV/Excel, field note PDF, or document. Gemini AI will calculate data percentages and generate a formatted Analysis PDF.</p>
                  
                  {!selectedAiFile ? (
                    <div className="relative border-2 border-dashed border-primary/40 rounded-xl p-6 text-center hover:bg-primary/5 transition-colors cursor-pointer group">
                      <Input 
                        type="file" 
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                        onChange={(e) => {
                          if (e.target.files?.[0]) setSelectedAiFile(e.target.files[0]);
                          e.target.value = '';
                        }}
                        disabled={isAiScanning}
                        accept="image/*,application/pdf,text/csv,text/plain,.xlsx,.xls,.docx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      />
                      <Upload className="h-8 w-8 text-primary/50 mx-auto mb-2 group-hover:text-primary transition-colors" />
                      <p className="font-semibold text-sm">Step 1: Select Survey or Document</p>
                      <p className="text-xs text-muted-foreground mt-1 px-4">Supports CSV, Excel, PDF, DOCX, Images</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 rounded-xl bg-background border shadow-sm">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                          <div className="truncate">
                            <p className="text-sm font-medium text-foreground truncate">{selectedAiFile.name}</p>
                            <p className="text-xs text-muted-foreground">{formatSize(selectedAiFile.size)}</p>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive flex-shrink-0" onClick={() => setSelectedAiFile(null)} disabled={isAiScanning}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      <Button 
                        className="w-full bg-yellow-400 text-yellow-900 hover:bg-yellow-500 shadow-xl relative z-10 font-bold" 
                        disabled={isAiScanning}
                        onClick={handleAiScan}
                      >
                        {isAiScanning ? (
                           <div className="h-5 w-5 rounded-full border-2 border-yellow-900/50 border-t-yellow-900 animate-spin mr-2" />
                        ) : (
                          <Zap className="mr-2 h-5 w-5" />
                        )}
                        {isAiScanning ? "AI Calculating & Scanning..." : "Step 2: Generate Smart PDF"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-none shadow-md bg-muted/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    Recent Activity
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs space-y-4">
                  {files?.slice(0, 3).map((f: SmartDriveFile) => (
                    <div key={f.id} className="flex gap-3 items-start">
                      <div className="mt-0.5 rounded p-1 bg-background border">
                        {getFileIcon(f.fileType)}
                      </div>
                      <div className="space-y-0.5 min-w-0">
                        <p className="font-medium truncate" title={f.fileName}>{f.fileName}</p>
                        <p className="text-muted-foreground capitalize">uploaded {format(new Date(f.createdAt), "MMM d")}</p>
                      </div>
                    </div>
                  ))}
                  {(!files || files.length === 0) && (
                    <p className="text-muted-foreground italic text-center py-4">No recent uploads.</p>
                  )}
                </CardContent>
                <CardFooter className="pt-0">
                   <Button variant="link" size="sm" className="h-6 px-0 text-xs text-primary" onClick={() => setActiveTab("files")}>View all library files →</Button>
                </CardFooter>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function pendingRequestsSection(
  pendingFiles: SmartDriveFile[],
  handleUpdate: (id: number, updates: any) => Promise<void>,
  handleDelete: (id: number) => Promise<void>,
  formatSize: (bytes: number) => string
) {
  if (pendingFiles.length === 0) return null;

  return (
    <div className="mb-8">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-yellow-600 uppercase tracking-widest">
        <Zap className="h-4 w-4" /> Pending File Approvals ({pendingFiles.length})
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {pendingFiles.map((f) => (
          <div key={f.id} className="border bg-yellow-500/5 hover:bg-yellow-500/10 transition-colors rounded-xl p-4 shadow-sm relative">
            <div className="flex items-start justify-between gap-2 mb-3">
              <span className="font-medium text-sm truncate" title={f.fileName}>{f.fileName}</span>
              <Badge variant="outline" className="text-[10px] bg-background">
                 {f.fileType.split("/")[1] || f.fileType}
              </Badge>
            </div>
            
            <p className="text-xs text-muted-foreground mb-4">
              {formatSize(f.fileSize)} • Uploaded {new Date(f.createdAt).toLocaleDateString()}
            </p>
            
            <div className="flex items-center gap-2 mt-auto pt-3 border-t border-yellow-500/20">
              <Button 
                size="sm" 
                className="w-full bg-green-600 hover:bg-green-700 text-white text-xs h-8"
                onClick={() => handleUpdate(f.id, { status: 'approved' })}
              >
                Approve
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                className="w-full text-destructive border-destructive/30 hover:bg-destructive/10 text-xs h-8"
                onClick={() => handleUpdate(f.id, { status: 'rejected' })}
              >
                Reject
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
