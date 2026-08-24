import { useState, useRef, useEffect, useCallback } from "react";
import { useBulkCreateNeeds, CreateNeedBodyCategory, CreateNeedBodySeverity, CreateNeedBodySourceType } from "@workspace/api-client-react";
import { useAppContext } from "@/lib/contexts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { UploadCloud, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2, ArrowRight, Trash2, AlertTriangle, Download, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Papa from "papaparse";
import * as XLSX from "xlsx";

type MappingState = { [key: string]: string };

const REQUIRED_FIELDS = [
  { key: "title", label: "Title" },
  { key: "category", label: "Category" },
  { key: "severity", label: "Severity" },
  { key: "area", label: "Area" },
];

const OPTIONAL_FIELDS = [
  { key: "zone", label: "Zone" },
  { key: "affectedCount", label: "Affected Count" },
  { key: "description", label: "Description" },
  { key: "reporterName", label: "Reporter Name" },
];

const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

const CATEGORIES = ["food", "medical", "shelter", "water", "education", "sanitation", "clothing", "other"];
const SEVERITIES = ["low", "medium", "high", "critical"];

function normalizeSeverity(val: string): { severity: string; autoConverted: boolean } {
  if (!val) return { severity: "medium", autoConverted: false };
  const lower = val.toLowerCase().trim();
  if (SEVERITIES.includes(lower)) return { severity: lower, autoConverted: false };
  // Try numeric percentage
  const num = parseFloat(lower.replace(/%/g, ""));
  if (!isNaN(num)) {
    if (num > 60) return { severity: "critical", autoConverted: true };
    if (num > 40) return { severity: "high", autoConverted: true };
    if (num > 20) return { severity: "medium", autoConverted: true };
    return { severity: "low", autoConverted: true };
  }
  return { severity: "medium", autoConverted: false };
}

function normalizeCategory(val: string): string {
  if (!val) return "other";
  const lower = val.toLowerCase().trim();
  if (CATEGORIES.includes(lower)) return lower;
  return "other";
}

type PreviewRow = {
  id: number;
  title: string;
  category: string;
  severity: string;
  area: string;
  zone: string;
  affectedCount: number;
  description: string;
  reporterName: string;
  severityAutoConverted: boolean;
  selected: boolean;
  errors: string[];
};

function validateRow(row: PreviewRow): string[] {
  const errs: string[] = [];
  if (!row.title.trim()) errs.push("Title is required");
  if (!row.category.trim()) errs.push("Category is required");
  if (!row.severity.trim()) errs.push("Severity is required");
  if (!row.area.trim()) errs.push("Area is required");
  return errs;
}

const PAGE_SIZE = 25;

export default function UploadHub() {
  const { organizationId, t } = useAppContext();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawData, setRawData] = useState<any[]>([]);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [mapping, setMapping] = useState<MappingState>({});
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [results, setResults] = useState<{ created: number; failed: number; errors: string[]; batchId: string } | null>(null);
  const [editableRows, setEditableRows] = useState<PreviewRow[]>([]);
  const [page, setPage] = useState(0);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [editingCell, setEditingCell] = useState<{ row: number; field: string } | null>(null);

  const bulkCreate = useBulkCreateNeeds();

  // Check sessionStorage for pre-populated rows from Quick Scan
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("uploadHubPrePopulatedRows");
      if (stored) {
        sessionStorage.removeItem("uploadHubPrePopulatedRows");
        const rows = JSON.parse(stored) as PreviewRow[];
        if (Array.isArray(rows) && rows.length > 0) {
          const validated = rows.map((r, i) => {
            const errors = validateRow(r);
            return { ...r, id: i, selected: true, errors };
          });
          setEditableRows(validated);
          setStep(3);
          toast({ title: "Rows imported from Quick Scan", description: `${validated.length} rows pre-loaded for review.` });
        }
      }
    } catch { }
  }, []);

  const parseFile = (selectedFile: File) => {
    const ext = selectedFile.name.split(".").pop()?.toLowerCase();

    if (ext === "csv") {
      Papa.parse(selectedFile, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.meta.fields) {
            handleParsed(results.meta.fields, results.data);
          } else {
            toast({ title: "Invalid CSV", description: "Could not read headers.", variant: "destructive" });
          }
        },
        error: (error) => {
          toast({ title: "Parse Error", description: error.message, variant: "destructive" });
        },
      });
    } else if (ext === "xls" || ext === "xlsx") {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json<any>(firstSheet, { defval: "" });
          if (jsonData.length > 0) {
            const fields = Object.keys(jsonData[0]);
            handleParsed(fields, jsonData);
          } else {
            toast({ title: "Empty File", description: "No data rows found.", variant: "destructive" });
          }
        } catch (err) {
          toast({ title: "Parse Error", description: (err as Error).message, variant: "destructive" });
        }
      };
      reader.readAsArrayBuffer(selectedFile);
    } else {
      toast({ title: "Unsupported File", description: "Please upload a .csv, .xls, or .xlsx file.", variant: "destructive" });
    }
  };

  const handleParsed = (fields: string[], data: any[]) => {
    setHeaders(fields);
    setRawData(data);
    setPreviewData(data.slice(0, 5));

    // Auto-map columns
    const initialMapping: MappingState = {};
    fields.forEach((header) => {
      const lowerHeader = header.toLowerCase().replace(/[^a-z0-9]/g, "");
      const match = ALL_FIELDS.find(
        (f) => f.key.toLowerCase() === lowerHeader || f.label.toLowerCase().replace(/[^a-z0-9]/g, "") === lowerHeader
      );
      if (match) initialMapping[match.key] = header;
    });
    setMapping(initialMapping);
    setStep(2);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    parseFile(selectedFile);
  };

  const buildEditableRows = () => {
    const missingRequired = REQUIRED_FIELDS.filter((f) => !mapping[f.key]);
    if (missingRequired.length > 0) {
      toast({
        title: "Missing Mappings",
        description: `Please map columns for: ${missingRequired.map((f) => f.label).join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    const processFull = (allData: any[]) => {
      const rows: PreviewRow[] = allData.map((row, i) => {
        const catVal = normalizeCategory(row[mapping.category] || "");
        const sevResult = normalizeSeverity(row[mapping.severity] || "");
        const rowObj: PreviewRow = {
          id: i,
          title: row[mapping.title] || "",
          category: catVal,
          severity: sevResult.severity,
          area: row[mapping.area] || "",
          zone: mapping.zone ? row[mapping.zone] || "" : "",
          affectedCount: mapping.affectedCount ? parseInt(row[mapping.affectedCount]) || 0 : 0,
          description: mapping.description ? row[mapping.description] || "" : "",
          reporterName: mapping.reporterName ? row[mapping.reporterName] || "" : "",
          severityAutoConverted: sevResult.autoConverted,
          selected: true,
          errors: [],
        };
        rowObj.errors = validateRow(rowObj);
        return rowObj;
      });
      setEditableRows(rows);
      setPage(0);
      setStep(3);
    };

    if (ext === "csv") {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => processFull(results.data),
      });
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<any>(firstSheet, { defval: "" });
        processFull(jsonData);
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const updateRowField = (rowId: number, field: string, value: any) => {
    setEditableRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const updated = { ...r, [field]: value };
        updated.errors = validateRow(updated);
        return updated;
      })
    );
  };

  const deleteRow = (rowId: number) => {
    setEditableRows((prev) => prev.filter((r) => r.id !== rowId));
  };

  const selectedRows = editableRows.filter((r) => r.selected);
  const errorRows = selectedRows.filter((r) => r.errors.length > 0);
  const warningRows = selectedRows.filter((r) => r.severityAutoConverted && r.errors.length === 0);
  const totalPages = Math.ceil(editableRows.length / PAGE_SIZE);
  const pageRows = editableRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleConfirmImport = async () => {
    setShowConfirmDialog(false);
    const batchId = `import_${Date.now()}`;
    const rowsToCreate = selectedRows
      .filter((r) => r.errors.length === 0)
      .map((r) => ({
        organizationId,
        title: r.title,
        category: r.category as any,
        severity: r.severity as any,
        area: r.area,
        zone: r.zone || null,
        affectedCount: r.affectedCount || 1,
        description: r.description || null,
        reporterName: r.reporterName || null,
        sourceType: CreateNeedBodySourceType.csv,
        reportDate: new Date().toISOString(),
      }));

    try {
      const response = await bulkCreate.mutateAsync({
        data: { organizationId, rows: rowsToCreate },
      });
      setResults({ ...response, batchId });
      setStep(4);
      toast({ title: "Import Complete" });
    } catch (error) {
      toast({ title: "Import Failed", description: "An error occurred during bulk creation.", variant: "destructive" });
    }
  };

  const downloadFailedRows = () => {
    if (!results || results.errors.length === 0) return;
    const csvContent = "Error\n" + results.errors.map((e) => `"${e.replace(/"/g, '""')}"`).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "failed_rows.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setFile(null);
    setHeaders([]);
    setRawData([]);
    setPreviewData([]);
    setMapping({});
    setStep(1);
    setResults(null);
    setEditableRows([]);
    setPage(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("nav.uploadHub")}</h1>
        <p className="text-muted-foreground mt-1">Import community needs from CSV or Excel files.</p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between mb-8 relative">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-muted -z-10 rounded-full" />
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-primary -z-10 rounded-full transition-all duration-300"
          style={{ width: step === 1 ? "0%" : step === 2 ? "33%" : step === 3 ? "66%" : "100%" }}
        />
        {[
          { num: 1, label: "Upload" },
          { num: 2, label: "Map Columns" },
          { num: 3, label: "Review & Edit" },
          { num: 4, label: "Results" },
        ].map((s) => (
          <div key={s.num} className="flex flex-col items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border-2 ${
                step >= s.num
                  ? "bg-primary border-primary text-primary-foreground"
                  : "bg-background border-muted text-muted-foreground"
              }`}
            >
              {s.num < step ? <CheckCircle2 className="w-5 h-5" /> : s.num}
            </div>
            <span className={`text-xs mt-2 font-medium ${step >= s.num ? "text-foreground" : "text-muted-foreground"}`}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Select File</CardTitle>
            <CardDescription>Upload a CSV or Excel file containing needs data</CardDescription>
          </CardHeader>
          <CardContent>
            <input type="file" accept=".csv,.xls,.xlsx" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
            <div
              className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:bg-muted/50 hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileSpreadsheet className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Click to select file</h3>
              <p className="text-muted-foreground max-w-sm mx-auto text-sm">
                Accepts .csv, .xls, and .xlsx files. First row must be column headers. Supports Title, Category, Severity, Area and more.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Map Columns */}
      {step === 2 && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Map Columns</CardTitle>
                <CardDescription>Match your file headers to the required fields</CardDescription>
              </div>
              <Badge variant="outline" className="text-xs">{file?.name}</Badge>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h3 className="font-semibold text-sm border-b pb-2">Required Fields</h3>
                  {REQUIRED_FIELDS.map((field) => (
                    <div key={field.key} className="flex items-center justify-between gap-4">
                      <div className="text-sm font-medium w-1/3">
                        {field.label} <span className="text-destructive">*</span>
                      </div>
                      <Select
                        value={mapping[field.key] || ""}
                        onValueChange={(val) => setMapping((prev) => ({ ...prev, [field.key]: val }))}
                      >
                        <SelectTrigger className="w-2/3"><SelectValue placeholder="Select column" /></SelectTrigger>
                        <SelectContent>
                          {headers.map((h) => (<SelectItem key={h} value={h}>{h}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                <div className="space-y-4">
                  <h3 className="font-semibold text-sm border-b pb-2">Optional Fields</h3>
                  {OPTIONAL_FIELDS.map((field) => (
                    <div key={field.key} className="flex items-center justify-between gap-4">
                      <div className="text-sm font-medium w-1/3 text-muted-foreground">{field.label}</div>
                      <Select
                        value={mapping[field.key] || "none"}
                        onValueChange={(val) => {
                          const newMap = { ...mapping };
                          if (val === "none") delete newMap[field.key];
                          else newMap[field.key] = val;
                          setMapping(newMap);
                        }}
                      >
                        <SelectTrigger className="w-2/3"><SelectValue placeholder="Skip (Don't map)" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Skip (Don't map)</SelectItem>
                          {headers.map((h) => (<SelectItem key={h} value={h}>{h}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
            <CardFooter className="justify-between border-t pt-4">
              <Button variant="outline" onClick={reset}>Cancel</Button>
              <Button onClick={buildEditableRows} disabled={REQUIRED_FIELDS.some((f) => !mapping[f.key])}>
                <ArrowRight className="w-4 h-4 mr-2" /> Review Rows
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Data Preview (First 5 Rows)</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {headers.map((h) => (<TableHead key={h} className="whitespace-nowrap">{h}</TableHead>))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.map((row, i) => (
                    <TableRow key={i}>
                      {headers.map((h) => (<TableCell key={h} className="max-w-[200px] truncate">{row[h]}</TableCell>))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 3: Editable Row Preview */}
      {step === 3 && (
        <div className="space-y-4">
          {/* Summary bar */}
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-4 text-sm">
                  <span>
                    Importing <strong>{selectedRows.length}</strong> of <strong>{editableRows.length}</strong> rows
                  </span>
                  {warningRows.length > 0 && (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-200">
                      <AlertTriangle className="w-3 h-3 mr-1" /> {warningRows.length} warnings
                    </Badge>
                  )}
                  {errorRows.length > 0 && (
                    <Badge variant="destructive">
                      <AlertCircle className="w-3 h-3 mr-1" /> {errorRows.length} errors
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={reset}>Cancel</Button>
                  <Button
                    size="sm"
                    disabled={errorRows.length > 0 || selectedRows.length === 0 || bulkCreate.isPending}
                    onClick={() => {
                      if (warningRows.length > 0) {
                        setShowConfirmDialog(true);
                      } else {
                        handleConfirmImport();
                      }
                    }}
                  >
                    {bulkCreate.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    <UploadCloud className="w-4 h-4 mr-2" /> Confirm Import ({selectedRows.filter(r => r.errors.length === 0).length})
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Editable table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Title *</TableHead>
                      <TableHead className="w-[120px]">Category *</TableHead>
                      <TableHead className="w-[120px]">Severity *</TableHead>
                      <TableHead>Area *</TableHead>
                      <TableHead>Zone</TableHead>
                      <TableHead className="w-[90px]">Affected</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((row) => {
                      const hasError = row.errors.length > 0;
                      const hasWarning = row.severityAutoConverted && !hasError;
                      return (
                        <TableRow
                          key={row.id}
                          className={`${hasError ? "bg-red-50/60" : hasWarning ? "bg-amber-50/60" : ""}`}
                        >
                          <TableCell className="text-xs text-muted-foreground font-mono">{row.id + 1}</TableCell>
                          <TableCell>
                            <EditableTextCell
                              value={row.title}
                              onChange={(v) => updateRowField(row.id, "title", v)}
                              error={row.errors.includes("Title is required")}
                            />
                          </TableCell>
                          <TableCell>
                            <Select value={row.category} onValueChange={(v) => updateRowField(row.id, "category", v)}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {CATEGORIES.map((c) => (<SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Select value={row.severity} onValueChange={(v) => updateRowField(row.id, "severity", v)}>
                                <SelectTrigger className={`h-8 text-xs ${row.severityAutoConverted ? "border-amber-400" : ""}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {SEVERITIES.map((s) => (<SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>))}
                                </SelectContent>
                              </Select>
                              {row.severityAutoConverted && (
                                <span title="Auto-converted from percentage" className="text-amber-500 cursor-help text-xs">⚡</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <EditableTextCell
                              value={row.area}
                              onChange={(v) => updateRowField(row.id, "area", v)}
                              error={row.errors.includes("Area is required")}
                            />
                          </TableCell>
                          <TableCell>
                            <EditableTextCell
                              value={row.zone}
                              onChange={(v) => updateRowField(row.id, "zone", v)}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              className="h-8 text-xs w-20"
                              value={row.affectedCount}
                              onChange={(e) => updateRowField(row.id, "affectedCount", parseInt(e.target.value) || 0)}
                            />
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteRow(row.id)}>
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <span className="text-xs text-muted-foreground">
                    Page {page + 1} of {totalPages} · {editableRows.length} rows total
                  </span>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Warning confirmation dialog */}
          <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Auto-converted severity values</AlertDialogTitle>
                <AlertDialogDescription>
                  {warningRows.length} row(s) had severity values auto-converted from percentage values. These are marked with ⚡ in the Severity column. Do you want to proceed with the import?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Go back and review</AlertDialogCancel>
                <AlertDialogAction onClick={handleConfirmImport}>Proceed with Import</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {/* Step 4: Results */}
      {step === 4 && results && (
        <Card>
          <CardContent className="pt-10 pb-10 text-center">
            {results.failed === 0 ? (
              <div className="w-20 h-20 bg-[#10b981]/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-10 h-10 text-[#10b981]" />
              </div>
            ) : (
              <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-10 h-10 text-amber-600" />
              </div>
            )}

            <h2 className="text-2xl font-bold mb-2">Import Complete</h2>
            <p className="text-muted-foreground mb-8">
              Successfully created <span className="font-bold text-foreground">{results.created}</span> needs.
            </p>

            {results.failed > 0 && (
              <div className="bg-destructive/5 text-destructive-foreground border border-destructive/20 rounded-lg p-4 max-w-lg mx-auto text-left mb-8">
                <h4 className="font-semibold flex items-center gap-2 mb-2 text-destructive">
                  <AlertTriangle className="w-4 h-4" />
                  {results.failed} rows failed to import
                </h4>
                <ul className="list-disc pl-5 text-sm space-y-1 text-destructive/80">
                  {results.errors.slice(0, 5).map((e, i) => (<li key={i}>{e}</li>))}
                  {results.errors.length > 5 && <li>...and {results.errors.length - 5} more errors</li>}
                </ul>
              </div>
            )}

            <div className="flex justify-center gap-4 flex-wrap">
              <Button variant="outline" onClick={reset}>Upload Another File</Button>
              {results.failed > 0 && (
                <Button variant="outline" onClick={downloadFailedRows}>
                  <Download className="w-4 h-4 mr-2" /> Download Failed Rows
                </Button>
              )}
              <Button onClick={() => (window.location.href = "/needs")}>
                View Created Needs <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EditableTextCell({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [localVal, setLocalVal] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { setLocalVal(value); }, [value]);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  if (editing) {
    return (
      <Input
        ref={ref}
        className={`h-8 text-xs ${error ? "border-red-400" : ""}`}
        value={localVal}
        onChange={(e) => setLocalVal(e.target.value)}
        onBlur={() => { onChange(localVal); setEditing(false); }}
        onKeyDown={(e) => { if (e.key === "Enter") { onChange(localVal); setEditing(false); } }}
      />
    );
  }
  return (
    <div
      className={`text-xs cursor-pointer px-2 py-1.5 rounded hover:bg-muted/50 min-h-[32px] flex items-center ${
        error ? "text-destructive border border-red-300 bg-red-50/50" : ""
      } ${!value ? "text-muted-foreground italic" : ""}`}
      onClick={() => setEditing(true)}
    >
      {value || "Click to edit"}
    </div>
  );
}
