import * as React from "react";
import { useLocation, useSearch } from "wouter";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  ImageIcon,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSampleQuote } from "@/lib/sample-quote";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB maximum
const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WEBP",
};
const ALLOWED_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png", "webp"]);

type UploadUrlResponse = {
  uploadURL: string;
  objectPath: string;
};

type AnalysisResponse = {
  id: string;
};

function getFileContentType(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !ALLOWED_EXTENSIONS.has(extension)) return null;

  if (ALLOWED_TYPES[file.type]) return file.type;
  if (extension === "pdf") return "application/pdf";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return null;
}

function readApiError(response: Response, fallback: string) {
  return response
    .json()
    .then((body: { error?: string }) => body.error || fallback)
    .catch(() => fallback);
}

export default function NewAnalysisPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const sourceAnalysisId = React.useMemo(
    () => new URLSearchParams(search).get("sourceAnalysisId"),
    [search],
  );
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const selectFile = (candidate?: File) => {
    setError(null);
    if (!candidate) return;

    if (!getFileContentType(candidate)) {
      setFile(null);
      setError("Please choose a PDF, JPG, PNG, or WEBP quotation.");
      return;
    }

    if (candidate.size > MAX_FILE_SIZE) {
      setFile(null);
      setError("This file is too large. Please upload a quotation up to 5 MB.");
      return;
    }

    setFile(candidate);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    selectFile(event.dataTransfer.files[0]);
  };

  const submitQuotation = async () => {
    if (!file) {
      setError("Choose a quotation before starting your review.");
      return;
    }

    const contentType = getFileContentType(file);
    if (!contentType) {
      setError("Please choose a PDF, JPG, PNG, or WEBP quotation.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const urlResponse = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType,
        }),
      });
      if (!urlResponse.ok) {
        throw new Error(await readApiError(urlResponse, "We couldn't prepare your upload."));
      }
      const { uploadURL, objectPath } = (await urlResponse.json()) as UploadUrlResponse;

      const uploadResponse = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: file,
      });
      if (!uploadResponse.ok) {
        throw new Error("The file upload did not complete. Please try again.");
      }

      const projectName = file.name.replace(/\.[^.]+$/, "").trim() || "Interior quotation";
      const analysisResponse = await fetch("/api/analyses", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projectName,
          room: "Interior quotation",
          fileName: file.name,
          filePath: objectPath,
          fileType: contentType,
          fileSize: file.size,
          ...(sourceAnalysisId ? { sourceAnalysisId } : {}),
        }),
      });
      if (!analysisResponse.ok) {
        throw new Error(
          await readApiError(analysisResponse, "We couldn't create your analysis."),
        );
      }

      const analysis = (await analysisResponse.json()) as AnalysisResponse;
      setLocation(`/analysis/${analysis.id}/processing`);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Something went wrong while uploading your quotation.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fcfcf8] font-sans text-[#171717]">
      <header className="border-b border-[#e6e5df] bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <a href="/" className="text-sm font-semibold tracking-tight">
            InteriorLens <span className="text-primary">AI</span>
          </a>
          <nav className="hidden items-center gap-8 text-sm text-[#5d5b57] sm:flex">
            <a href="/dashboard" className="hover:text-foreground">Studio</a>
            <a href="/quotes" className="hover:text-foreground">Assets</a>
            <span className="border-b-2 border-primary pb-1 font-medium text-primary">Quote Analysis</span>
          </nav>
          <button
            type="button"
            onClick={beginLogin}
            className="text-xs font-medium text-[#5d5b57] hover:text-foreground"
          >
            Sign in
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.78fr)] lg:gap-16 lg:py-16">
        <section>
          <p className="text-sm font-medium">Upload Your Interior Quote</p>
          <h1 className="mt-3 max-w-xl text-xl font-medium leading-snug text-[#68655f] sm:text-2xl">
            Deep analysis of material costs, quantities, and hidden project risks.
          </h1>

          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
            }}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`mt-10 flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center transition-colors ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-[#c9c8c2] bg-white hover:border-primary hover:bg-[#fffaf5]"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => selectFile(event.target.files?.[0])}
            />
            {file ? (
              <>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  {getFileContentType(file) === "application/pdf" ? (
                    <FileText className="h-6 w-6" />
                  ) : (
                    <ImageIcon className="h-6 w-6" />
                  )}
                </div>
                <p className="mt-4 max-w-sm break-all text-sm font-semibold">{file.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(1)} MB · {ALLOWED_TYPES[getFileContentType(file) ?? ""]}
                </p>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setFile(null);
                    inputRef.current && (inputRef.current.value = "");
                  }}
                  className="mt-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" /> Remove file
                </button>
              </>
            ) : (
              <>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Upload className="h-6 w-6" />
                </div>
                <p className="mt-5 text-sm font-medium">Click or drag to upload</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  PDF, JPG, PNG, or WEBP · up to 5 MB
                </p>
              </>
            )}
          </div>

          {!sourceAnalysisId && (
            <div className="mt-4 rounded-xl border border-[#e3e1da] bg-white p-4 sm:flex sm:items-center sm:justify-between sm:gap-5">
              <div>
                <p className="text-sm font-semibold">No quote handy? Try a synthetic sample.</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  A sample interior quotation with itemized costs and terms. It runs through the
                  same deep AI analysis as your own document. No sign-in required.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-3 shrink-0 sm:mt-0"
                onClick={() => selectFile(createSampleQuote())}
              >
                Use sample quote
              </Button>
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row">
            <Button
              type="button"
              onClick={submitQuotation}
              disabled={!file || isSubmitting}
              className="h-11 rounded-full px-7 text-sm shadow-sm"
            >
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isSubmitting ? "Uploading quotation..." : "Analyse My Quote"}
            </Button>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <LockKeyhole className="h-3.5 w-3.5 text-primary" /> Stored privately and securely
            </span>
          </div>

          <div className="mt-12">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#68655f]">What you&apos;ll receive</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <BenefitCard
                icon={<FileText className="h-5 w-5" />}
                title="Cost Synthesis"
                description="A clear review of quantities, allowances, and the material costs in your quote."
              />
              <BenefitCard
                icon={<AlertCircle className="h-5 w-5" />}
                title="Risk Detection"
                description="A focused checklist for missing line items, unclear fees, and material inconsistencies."
              />
            </div>
          </div>
        </section>

        <aside className="rounded-2xl border border-[#e3e1da] bg-white p-6 shadow-[0_8px_24px_rgba(30,25,20,0.05)] sm:p-8">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-[#b6652a]">Review process</p>
          <ol className="mt-6 space-y-7">
            {[
              "Upload Quote",
              "Review Queued",
              "Risks Found",
              "Download Report",
            ].map((step, index) => (
              <li
                key={step}
                className={`flex items-center gap-4 rounded-lg p-3 ${
                  index === 0 ? "bg-[#fff3ea] text-[#be5e1a]" : ""
                }`}
              >
                {index === 0 ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                ) : (
                  <span className="h-5 w-5 shrink-0 rounded-full border-2 border-[#dfded8]" />
                )}
                <span className="text-sm font-semibold">{index + 1}. {step}</span>
              </li>
            ))}
          </ol>
          <div className="mt-10 border-t border-[#e8e7e1] pt-6">
            <p className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#5f5c57]">
              <ShieldCheck className="h-4 w-4 text-primary" /> Private upload storage
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}

function BenefitCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-[#e3e1da] bg-white p-6 shadow-sm">
      <div className="text-primary">{icon}</div>
      <h2 className="mt-5 font-sans text-sm font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}