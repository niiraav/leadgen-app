import { withAuth } from "@/lib/auth";
import { useState, useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import Papa from "papaparse";
import { api } from "@/lib/api";
import {
  Upload,
  FileText,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Database,
  FileSpreadsheet,
  X,
} from "lucide-react";

type ImportStep = "upload" | "preview" | "complete";

export default function ImportPage() {
  const [step, setStep] = useState<ImportStep>("upload");
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [csvData, setCsvData] = useState<Record<string, string>[]>([]);
  const [fullCsvData, setFullCsvData] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const KNOWN_FIELDS = [
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "company", label: "Company" },
    { key: "title", label: "Title" },
    { key: "location", label: "Location" },
    { key: "website", label: "Website" },
    { key: "industry", label: "Industry" },
  ];

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) {
      setError("Please upload a CSV file");
      return;
    }

    setFileName(file.name);
    setFileSize(file.size);
    setError(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as Record<string, string>[];
        const cols = results.meta.fields || [];
        setCsvData(data.slice(0, 10));
        setFullCsvData(data);
        setHeaders(cols);

        // Auto-map common fields
        const autoMap: Record<string, string> = {};
        cols.forEach((col) => {
          const lower = col.toLowerCase();
          if (/^(name|full.?name)/.test(lower)) autoMap.name = col;
          else if (/^email/.test(lower)) autoMap.email = col;
          else if (/^phone|tel/.test(lower)) autoMap.phone = col;
          else if (/^company|org|business/.test(lower)) autoMap.company = col;
          else if (/^(title|role|position)/.test(lower)) autoMap.title = col;
          else if (/^(location|city|state|address)/.test(lower)) autoMap.location = col;
          else if (/^website|url|site/.test(lower)) autoMap.website = col;
          else if (/^industry|sector|type/.test(lower)) autoMap.industry = col;
        });
        setMapping(autoMap);
        setStep("preview");
      },
      error: (err) => {
        setError(`Failed to parse CSV: ${err.message}`);
      },
    });
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleImport = async () => {
    setLoading(true);
    setError(null);
    try {
      // Map fields using the user's field mapping
      const dataToImport = fullCsvData.length > 0 ? fullCsvData : csvData;
      const mappedLeads = dataToImport.map((row) => {
        const lead: Record<string, unknown> = {
          business_name: row[mapping.company] || row[mapping.name] || "",
          email: row[mapping.email] || "",
          phone: row[mapping.phone] || "",
          website_url: row[mapping.website] || "",
          city: row[mapping.location] || "",
          category: row[mapping.industry] || "",
          status: "new",
          source: "manual",
          tags: [],
        };
        return lead;
      }).filter((l) => l.business_name !== "");

      // Send to backend via batch create
      const result = await api.import.csv(mappedLeads);
      setImportedCount(result.imported || mappedLeads.length);
      setStep("complete");
    } catch (err: any) {
      console.error("[Import] Failed to import CSV:", err.message);
      setError(`Import failed: ${err.message}. The API server may not be running — check backend status.`);
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text tracking-tight">Import Leads</h1>
        <p className="text-sm text-text-muted mt-1">
          Upload a CSV file to import leads into your pipeline
        </p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-3 text-sm">
        {[
          { key: "upload", label: "Upload" },
          { key: "preview", label: "Preview & Map" },
          { key: "complete", label: "Import" },
        ].map((s, i) => {
          const steps = ["upload", "preview", "complete"];
          const current = steps.indexOf(step);
          const idx = steps.indexOf(s.key);
          const active = idx === current;
          const done = idx < current;

          return (
            <div key={s.key} className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    done
                      ? "bg-green text-white"
                      : active
                      ? "bg-accent text-accent-text"
                      : "bg-surface-2 text-text-faint border border-border"
                  }`}
                >
                  {done ? <CheckCircle className="w-4 h-4" /> : idx + 1}
                </div>
                <span
                  className={
                    active || done ? "font-semibold text-text" : "text-text-faint"
                  }
                >
                  {s.label}
                </span>
              </div>
              {i < 2 && (
                <div className="w-8 h-[1px] bg-border" />
              )}
            </div>
          );
        })}
      </div>

      {/* Step 1: Upload */}
      {step === "upload" && (
        <Card className="p-0 overflow-hidden">
          <div
            className={`p-12 border-2 border-dashed transition-colors ${
              isDragging
                ? "border-blue bg-blue/5"
                : "border-border hover:border-border-strong"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <div className="text-center space-y-4">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-surface-2 flex items-center justify-center">
                <Upload className="w-6 h-6 text-text-muted" />
              </div>
              <div>
                <p className="text-sm font-semibold text-text">
                  Drop your CSV file here
                </p>
                <p className="text-xs text-text-faint mt-1">
                  or click to browse from your computer
                </p>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="btn btn-secondary text-sm mx-auto"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Browse Files
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileInput}
                className="hidden"
              />
            </div>
          </div>
          {error && (
            <div className="p-4 bg-red/5 text-red text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          <div className="p-4 bg-surface-2 border-t border-border/40">
            <p className="text-xs text-text-muted flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Accepted format: .CSV files only. Headers required.
            </p>
          </div>
        </Card>
      )}

      {/* Step 2: Preview & Map */}
      {step === "preview" && (
        <div className="space-y-4">
          {/* File Info */}
          <Card className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-surface-2 flex items-center justify-center">
                <Database className="w-5 h-5 text-text-muted" />
              </div>
              <div>
                <p className="text-sm font-medium text-text">{fileName}</p>
                <p className="text-xs text-text-faint">
                  {formatFileSize(fileSize)} • {csvData.length} rows previewed
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setStep("upload");
                setCsvData([]);
                setHeaders([]);
                setMapping({});
              }}
              className="rounded-full p-2 text-text-faint hover:text-text hover:bg-surface-2 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </Card>

          {/* Field Mapping */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-text mb-3">Map Fields</h3>
            <div className="space-y-3">
              {KNOWN_FIELDS.map((field) => (
                <div key={field.key} className="flex items-center gap-3">
                  <label className="text-xs font-medium text-text-muted w-24 shrink-0">
                    {field.label}
                  </label>
                  <select
                    value={mapping[field.key] || ""}
                    onChange={(e) =>
                      setMapping((prev) => ({
                        ...prev,
                        [field.key]: e.target.value,
                      }))
                    }
                    className="flex-1 h-9 px-2 text-xs rounded-lg bg-surface-2 border border-border text-text focus:outline-none focus:ring-2 focus:ring-blue/20"
                  >
                    <option value="">— Skip —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </Card>

          {/* Preview Table */}
          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b border-border/40">
              <h3 className="text-sm font-semibold text-text">Preview</h3>
              <p className="text-xs text-text-faint">
                First {Math.min(csvData.length, 5)} rows
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/40 bg-surface-2">
                    {headers.slice(0, 5).map((h) => (
                      <th
                        key={h}
                        className="text-left py-2 px-3 font-medium text-text-muted"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvData.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-b border-border/30">
                      {headers.slice(0, 5).map((h) => (
                        <td key={h} className="py-2 px-3 text-text truncate max-w-[150px]">
                          {row[h] || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setStep("upload")}
              className="btn btn-ghost text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <button
              onClick={handleImport}
              disabled={loading}
              className="btn btn-primary disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  Import {mappedCount(mapping, csvData)} Leads
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Complete */}
      {step === "complete" && (
        <Card className="p-12 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-green/10 flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-green" />
          </div>
          <h2 className="text-xl font-bold text-text mb-1">
            {importedCount} leads imported successfully!
          </h2>
          <p className="text-sm text-text-muted mb-6">
            Your leads have been added to your pipeline and are ready for outreach.
          </p>
          <div className="flex items-center justify-center gap-3">
            <a href="/leads" className="btn btn-primary">
              View Leads
            </a>
            <button
              onClick={() => {
                setStep("upload");
                setCsvData([]);
                setFileName("");
                setMapping({});
              }}
              className="btn btn-secondary"
            >
              Import Another
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}

function mappedCount(mapping: Record<string, string>, data: Record<string, string>[]) {
  const hasEmail = !!mapping.email;
  return hasEmail ? data.length : 0;
}

export const getServerSideProps = withAuth();
