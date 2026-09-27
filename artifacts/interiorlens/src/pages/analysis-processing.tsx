import * as React from "react";
import { useLocation, useParams } from "wouter";
import { useGetAnalysis, getGetAnalysisQueryKey } from "@workspace/api-client-react";
import {
  BarChart3,
  Clock3,
  FileText,
  Loader2,
  Ruler,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const reviewCards = [
  {
    icon: BarChart3,
    title: "Hidden Costs",
    description: "Checking for missing amounts and unclear inclusions.",
  },
  {
    icon: Ruler,
    title: "Specification Clarity",
    description: "Checking listed material, brand, and hardware detail.",
  },
  {
    icon: Clock3,
    title: "Timeline Terms",
    description: "Checking whether a timeline and milestones are stated.",
  },
  {
    icon: Scale,
    title: "Price Consistency",
    description: "Checking only the quote's own amounts and totals.",
  },
];

type ExtractionState = {
  status: "pending" | "processing" | "complete" | "failed";
  error: string | null;
};

type IntelligenceState = ExtractionState;

export default function AnalysisProcessingPage() {
  const params = useParams();
  const id = params.id as string;
  const [, setLocation] = useLocation();
  const { data: analysis } = useGetAnalysis(id, {
    query: {
      enabled: Boolean(id),
      queryKey: getGetAnalysisQueryKey(id),
    },
  });
  const [localProgress, setLocalProgress] = React.useState(0);
  const [extractionProgress, setExtractionProgress] = React.useState(5);
  const isAwaitingReview = Boolean(analysis?.fileName) && analysis?.status !== "complete";
  const [extraction, setExtraction] = React.useState<ExtractionState | null>(null);
  const [intelligence, setIntelligence] = React.useState<IntelligenceState | null>(null);

  React.useEffect(() => {
    if (analysis?.fileName && analysis.status === "complete" && id) {
      setLocation(`/analysis/${id}/report`);
    }
  }, [analysis?.fileName, analysis?.status, id, setLocation]);

  React.useEffect(() => {
    if (!analysis || isAwaitingReview) return;

    setLocalProgress(analysis.progress);
    if (analysis.progress >= 100) return;

    const timer = window.setInterval(() => {
      setLocalProgress((current) => {
        const next = current + 5;
        if (next >= 100) window.clearInterval(timer);
        return Math.min(next, 100);
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [analysis, isAwaitingReview]);

  React.useEffect(() => {
    if (!isAwaitingReview || !id) return;

    let cancelled = false;
    const updateFromResponse = (response: ExtractionState) => {
      if (!cancelled) setExtraction(response);
    };

    async function runExtraction() {
      try {
        updateFromResponse({ status: "processing", error: null });
        const existingResponse = await fetch(`/api/analyses/${id}/extraction`, {
          credentials: "include",
        });
        if (existingResponse.ok) {
          const existing = (await existingResponse.json()) as ExtractionState;
          if (existing.status === "complete" || existing.status === "failed") {
            updateFromResponse(existing);
            return;
          }
        }

        const response = await fetch(`/api/analyses/${id}/extraction`, {
          method: "POST",
          credentials: "include",
        });
        const payload = (await response.json()) as ExtractionState;
        if (!response.ok) {
          throw new Error(payload.error || "We couldn't extract this quotation.");
        }
        updateFromResponse(payload);
      } catch (error) {
        updateFromResponse({
          status: "failed",
          error:
            error instanceof Error
              ? error.message
              : "We couldn't extract this quotation.",
        });
      }
    }

    void runExtraction();
    return () => {
      cancelled = true;
    };
  }, [id, isAwaitingReview]);

  React.useEffect(() => {
    if (extraction?.status !== "processing") return;
    setExtractionProgress((current) => Math.max(current, 8));
    const timer = window.setInterval(() => {
      setExtractionProgress((current) => Math.min(current + 3, 45));
    }, 4000);
    return () => window.clearInterval(timer);
  }, [extraction?.status]);

  const isExtractionComplete = extraction?.status === "complete";
  const isExtractionFailed = extraction?.status === "failed";
  const isIntelligenceComplete = intelligence?.status === "complete";
  const isIntelligenceFailed = intelligence?.status === "failed";

  async function retryIntelligence() {
    if (!id) return;
    setIntelligence({ status: "processing", error: null });
    try {
      const response = await fetch(`/api/analyses/${id}/intelligence`, {
        method: "POST",
        credentials: "include",
      });
      const payload = (await response.json()) as IntelligenceState;
      if (!response.ok) {
        throw new Error(payload.error || "We couldn't restart this quotation review.");
      }
      setIntelligence(payload);
    } catch (error) {
      setIntelligence({
        status: "failed",
        error: error instanceof Error ? error.message : "We couldn't restart this quotation review.",
      });
    }
  }

  async function retryExtraction() {
    if (!id) return;
    setExtractionProgress(5);
    setExtraction({ status: "processing", error: null });
    try {
      const response = await fetch(`/api/analyses/${id}/extraction`, {
        method: "POST",
        credentials: "include",
      });
      const payload = (await response.json()) as ExtractionState;
      if (!response.ok) {
        throw new Error(payload.error || "We couldn't restart quotation extraction.");
      }
      setExtraction(payload);
    } catch (error) {
      setExtraction({
        status: "failed",
        error:
          error instanceof Error
            ? error.message
            : "We couldn't restart quotation extraction.",
      });
    }
  }

  React.useEffect(() => {
    if (!isAwaitingReview || !isExtractionComplete || !id) return;
    let cancelled = false;
    const update = (response: IntelligenceState) => {
      if (!cancelled) setIntelligence(response);
    };
    async function runIntelligence() {
      try {
        update({ status: "processing", error: null });
        const existingResponse = await fetch(`/api/analyses/${id}/intelligence`, { credentials: "include" });
        if (existingResponse.ok) {
          const existing = (await existingResponse.json()) as IntelligenceState;
          if (existing.status === "complete") {
            update(existing);
            return;
          }
          if (existing.status === "processing") {
            window.setTimeout(() => { void runIntelligence(); }, 1800);
            return;
          }
        }
        const response = await fetch(`/api/analyses/${id}/intelligence`, { method: "POST", credentials: "include" });
        const payload = (await response.json()) as IntelligenceState;
        if (!response.ok) throw new Error(payload.error || "We couldn't review this quotation.");
        update(payload);
      } catch (error) {
        update({ status: "failed", error: error instanceof Error ? error.message : "We couldn't review this quotation." });
      }
    }
    void runIntelligence();
    return () => { cancelled = true; };
  }, [id, isAwaitingReview, isExtractionComplete]);

  React.useEffect(() => {
    if (!isAwaitingReview || !isIntelligenceComplete || !id) return;

    const redirectTimer = window.setTimeout(() => {
      setLocation(`/analysis/${id}/report`);
    }, 350);

    return () => window.clearTimeout(redirectTimer);
  }, [id, isAwaitingReview, isIntelligenceComplete, setLocation]);

  const progress = isAwaitingReview
    ? isIntelligenceComplete
      ? 100
      : isExtractionComplete
        ? 55
        : extractionProgress
    : localProgress;
  const statusText = isExtractionFailed
    ? extraction?.error || "This quotation could not be read."
    : isIntelligenceFailed
      ? intelligence?.error || "This quotation could not be reviewed."
    : isAwaitingReview
      ? isIntelligenceComplete
        ? "Quote intelligence report is ready."
        : isExtractionComplete
          ? "Reviewing scope, terms, and quote consistency..."
        : "Reading your quotation details..."
    : progress >= 100
      ? "Analysis complete."
      : "Detecting hidden risks...";
  const fileName = analysis?.fileName || "Quotation file";

  return (
    <div className="min-h-screen bg-[#fcfcf8] font-sans text-[#171717]">
      <header className="mx-auto flex max-w-[960px] items-center justify-between px-6 py-5 sm:px-10">
        <a href="/" className="text-[22px] font-semibold tracking-[-0.04em]">
          InteriorLens <span className="text-primary">AI</span>
        </a>
        <div className="inline-flex max-w-[52vw] items-center gap-2 rounded-full border border-[#e5e3dc] bg-white px-4 py-2 text-xs font-medium shadow-[0_1px_3px_rgba(30,25,20,0.04)]">
          <FileText className="h-3.5 w-3.5 shrink-0 text-[#6f6b65]" />
          <span className="truncate">{fileName}</span>
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-160px)] max-w-[960px] flex-col items-center px-6 pb-12 pt-12 sm:px-10 sm:pt-14">
        <h1 className="font-sans text-center text-[30px] font-semibold tracking-[-0.045em] sm:text-[34px]">
          Analysing Your Quote
        </h1>
        <p className="mt-4 text-center text-sm text-[#68655f]">
          {isAwaitingReview ? "Most quotations finish within 90 seconds." : "Usually takes under 30 seconds."}
        </p>

        <div
          className="relative mt-16 flex h-48 w-48 items-center justify-center rounded-full sm:mt-16 sm:h-52 sm:w-52"
          style={{
            background: `conic-gradient(#c96016 ${Math.max(progress, 3) * 3.6}deg, #e3e1dc 0deg)`,
          }}
        >
          <div className="absolute inset-[8px] rounded-full bg-[#fcfcf8]" />
          <div className="relative text-center">
            <p className="text-[40px] font-semibold leading-none tracking-[-0.05em]">
              {isAwaitingReview ? `${progress}%` : `${progress}%`}
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#68655f]">
              {isAwaitingReview
                ? isExtractionFailed
                  ? "Unreadable"
                  : isIntelligenceFailed
                    ? "Retry needed"
                  : isIntelligenceComplete
                    ? "Reviewed"
                    : isExtractionComplete
                      ? "Reviewing"
                    : "Extracting"
                : "Processed"}
            </p>
          </div>
        </div>

        <div className="mt-11 text-center">
          <p className="text-base font-medium text-[#bd5c18]">
            <span className="mr-2">•</span>{statusText}
          </p>
          <p className="mt-3 inline-flex items-center gap-2 text-xs text-[#aaa7a0]">
            <ShieldCheck className="h-3.5 w-3.5" />
            Secure &amp; Encrypted Analysis
          </p>
          {isIntelligenceFailed && (
            <Button
              onClick={() => void retryIntelligence()}
              className="mt-5 h-9 bg-[#b55418] px-4 text-xs hover:bg-[#934112]"
            >
              Try review again
            </Button>
          )}
          {isExtractionFailed && (
            <Button
              onClick={() => void retryExtraction()}
              className="mt-5 h-9 bg-[#b55418] px-4 text-xs hover:bg-[#934112]"
            >
              Try extraction again
            </Button>
          )}
        </div>

        <div className="mt-20 grid w-full grid-cols-2 gap-4 sm:grid-cols-4">
          {reviewCards.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="min-h-[162px] rounded-xl border border-[#e4e2dc] bg-white p-5 shadow-[0_2px_7px_rgba(30,25,20,0.035)]"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-md border border-[#ebe8e1] bg-[#fffaf5] text-primary">
                <Icon className="h-4 w-4" />
              </div>
              <h2 className="mt-5 font-sans text-sm font-semibold leading-5">{title}</h2>
              <p className="mt-1 text-xs leading-5 text-[#77736d]">{description}</p>
            </div>
          ))}
        </div>

        {((isAwaitingReview && !isIntelligenceComplete && !isExtractionFailed && !isIntelligenceFailed) ||
          (!isAwaitingReview && progress < 100)) && (
          <Loader2 className="mt-8 h-4 w-4 animate-spin text-primary" aria-label="Processing" />
        )}
      </main>

      <footer className="border-t border-[#eeece6] px-6 py-6 sm:px-10">
        <div className="mx-auto flex max-w-[700px] flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[10px] tracking-[0.08em] text-[#69665f]">
          <span className="font-semibold text-foreground">InteriorLens AI</span>
          <span>© 2024 InteriorLens AI. Secure &amp; Encrypted Analysis.</span>
          <a href="/account" className="hover:text-primary">Privacy Policy</a>
          <a href="/account" className="hover:text-primary">Terms of Service</a>
          <a href="/account" className="hover:text-primary">Contact Support</a>
        </div>
      </footer>
    </div>
  );
}