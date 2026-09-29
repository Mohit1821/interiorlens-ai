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

async function safeFetchJson<T = any>(
  url: string,
  options?: RequestInit,
): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      if (res.status === 504 || res.status === 502) {
        return {
          ok: false,
          status: res.status,
          error: "The server is taking a moment to process your quotation. Retrying...",
        };
      }
      return {
        ok: false,
        status: res.status,
        error: `Server responded with status ${res.status}.`,
      };
    }
    const data = await res.json();
    return {
      ok: res.ok,
      status: res.status,
      data,
      error: res.ok ? undefined : (data?.error || `Request failed with status ${res.status}`),
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : "Network connection error.",
    };
  }
}

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
  const [extractionProgress, setExtractionProgress] = React.useState(8);
  const [intelligenceProgress, setIntelligenceProgress] = React.useState(55);
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

  // Extraction trigger and polling
  React.useEffect(() => {
    if (!isAwaitingReview || !id) return;

    let cancelled = false;
    let pollTimer: number | undefined;

    const updateFromResponse = (response: ExtractionState) => {
      if (!cancelled) setExtraction(response);
    };

    async function pollExtraction() {
      if (cancelled) return;
      const res = await safeFetchJson<ExtractionState>(`/api/analyses/${id}/extraction`, {
        credentials: "include",
      });
      if (cancelled) return;
      if (res.ok && res.data) {
        if (res.data.status === "complete" || res.data.status === "failed") {
          updateFromResponse(res.data);
          return;
        }
      }
      pollTimer = window.setTimeout(() => { void pollExtraction(); }, 1500);
    }

    async function runExtraction() {
      try {
        updateFromResponse({ status: "processing", error: null });

        // 1. Check existing state
        const existing = await safeFetchJson<ExtractionState>(`/api/analyses/${id}/extraction`, {
          credentials: "include",
        });
        if (cancelled) return;

        if (existing.ok && existing.data) {
          if (existing.data.status === "complete" || existing.data.status === "failed") {
            updateFromResponse(existing.data);
            return;
          }
          if (existing.data.status === "processing") {
            pollTimer = window.setTimeout(() => { void pollExtraction(); }, 1500);
            return;
          }
        }

        // 2. Start extraction via POST
        const started = await safeFetchJson<ExtractionState>(`/api/analyses/${id}/extraction`, {
          method: "POST",
          credentials: "include",
        });
        if (cancelled) return;

        if (!started.ok || !started.data) {
          throw new Error(started.error || "We couldn't extract this quotation.");
        }

        if (started.data.status === "complete" || started.data.status === "failed") {
          updateFromResponse(started.data);
          return;
        }

        // 3. Poll until finished
        pollTimer = window.setTimeout(() => { void pollExtraction(); }, 1500);
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
      if (pollTimer) window.clearTimeout(pollTimer);
    };
  }, [id, isAwaitingReview]);

  // Smooth extraction progress ticking
  React.useEffect(() => {
    if (extraction?.status !== "processing") return;
    setExtractionProgress((prev) => Math.max(prev, 8));
    const timer = window.setInterval(() => {
      setExtractionProgress((current) => {
        if (current >= 50) return current;
        const step = current < 30 ? 2 : 1;
        return Math.min(current + step, 50);
      });
    }, 400);
    return () => window.clearInterval(timer);
  }, [extraction?.status]);

  const isExtractionComplete = extraction?.status === "complete";
  const isExtractionFailed = extraction?.status === "failed";
  const isIntelligenceComplete = intelligence?.status === "complete";
  const isIntelligenceFailed = intelligence?.status === "failed";

  // Intelligence trigger and polling
  React.useEffect(() => {
    if (!isAwaitingReview || !isExtractionComplete || !id) return;
    let cancelled = false;
    let pollTimer: number | undefined;

    const update = (response: IntelligenceState) => {
      if (!cancelled) setIntelligence(response);
    };

    async function pollIntelligence() {
      if (cancelled) return;
      const res = await safeFetchJson<IntelligenceState>(`/api/analyses/${id}/intelligence`, {
        credentials: "include",
      });
      if (cancelled) return;
      if (res.ok && res.data) {
        if (res.data.status === "complete" || res.data.status === "failed") {
          update(res.data);
          return;
        }
      }
      pollTimer = window.setTimeout(() => { void pollIntelligence(); }, 1500);
    }

    async function runIntelligence() {
      try {
        update({ status: "processing", error: null });

        // 1. Check existing state
        const existing = await safeFetchJson<IntelligenceState>(`/api/analyses/${id}/intelligence`, {
          credentials: "include",
        });
        if (cancelled) return;

        if (existing.ok && existing.data) {
          if (existing.data.status === "complete" || existing.data.status === "failed") {
            update(existing.data);
            return;
          }
          if (existing.data.status === "processing") {
            pollTimer = window.setTimeout(() => { void pollIntelligence(); }, 1500);
            return;
          }
        }

        // 2. Start intelligence
        const started = await safeFetchJson<IntelligenceState>(`/api/analyses/${id}/intelligence`, {
          method: "POST",
          credentials: "include",
        });
        if (cancelled) return;

        if (!started.ok || !started.data) {
          throw new Error(started.error || "We couldn't review this quotation.");
        }

        if (started.data.status === "complete" || started.data.status === "failed") {
          update(started.data);
          return;
        }

        // 3. Poll
        pollTimer = window.setTimeout(() => { void pollIntelligence(); }, 1500);
      } catch (error) {
        update({
          status: "failed",
          error: error instanceof Error ? error.message : "We couldn't review this quotation.",
        });
      }
    }

    void runIntelligence();
    return () => {
      cancelled = true;
      if (pollTimer) window.clearTimeout(pollTimer);
    };
  }, [id, isAwaitingReview, isExtractionComplete]);

  // Smooth intelligence progress ticking
  React.useEffect(() => {
    if (intelligence?.status !== "processing") return;
    setIntelligenceProgress((prev) => Math.max(prev, 55));
    const timer = window.setInterval(() => {
      setIntelligenceProgress((current) => {
        if (current >= 95) return current;
        return Math.min(current + 2, 95);
      });
    }, 350);
    return () => window.clearInterval(timer);
  }, [intelligence?.status]);

  async function retryIntelligence() {
    if (!id) return;
    setIntelligence({ status: "processing", error: null });
    setIntelligenceProgress(55);
    try {
      const res = await safeFetchJson<IntelligenceState>(`/api/analyses/${id}/intelligence`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok || !res.data) {
        throw new Error(res.error || "We couldn't restart this quotation review.");
      }
      setIntelligence(res.data);
    } catch (error) {
      setIntelligence({
        status: "failed",
        error: error instanceof Error ? error.message : "We couldn't restart this quotation review.",
      });
    }
  }

  async function retryExtraction() {
    if (!id) return;
    setExtractionProgress(8);
    setExtraction({ status: "processing", error: null });
    try {
      const res = await safeFetchJson<ExtractionState>(`/api/analyses/${id}/extraction`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok || !res.data) {
        throw new Error(res.error || "We couldn't restart quotation extraction.");
      }
      setExtraction(res.data);
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
        ? intelligenceProgress
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
        : "Extracting items and material specifications..."
    : progress >= 100
      ? "Analysis complete."
      : "Detecting hidden risks...";

  const fileName = analysis?.fileName || "Quotation file";

  return (
    <div className="min-h-screen bg-[#fcfcf8] font-sans text-[#171717]">
      <header className="mx-auto flex max-w-[960px] items-center justify-between px-4 py-4 sm:px-10 sm:py-5">
        <a href="/" className="text-[20px] font-semibold tracking-[-0.04em] sm:text-[22px]">
          InteriorLens <span className="text-primary">AI</span>
        </a>
        <div className="inline-flex max-w-[55vw] items-center gap-2 rounded-full border border-[#e5e3dc] bg-white px-3 py-1.5 text-xs font-medium shadow-[0_1px_3px_rgba(30,25,20,0.04)] sm:max-w-xs sm:px-4 sm:py-2">
          <FileText className="h-3.5 w-3.5 shrink-0 text-[#6f6b65]" />
          <span className="truncate">{fileName}</span>
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-160px)] max-w-[960px] flex-col items-center px-4 pb-12 pt-8 sm:px-10 sm:pt-14">
        <h1 className="font-sans text-center text-[26px] font-semibold tracking-[-0.045em] sm:text-[34px]">
          Analysing Your Quote
        </h1>
        <p className="mt-2 text-center text-xs text-[#68655f] sm:mt-4 sm:text-sm">
          Usually completes in under 30 seconds.
        </p>

        <div
          className="relative mt-10 flex h-44 w-44 items-center justify-center rounded-full transition-all duration-300 sm:mt-14 sm:h-52 sm:w-52"
          style={{
            background: `conic-gradient(#c96016 ${Math.max(progress, 3) * 3.6}deg, #e3e1dc 0deg)`,
          }}
        >
          <div className="absolute inset-[8px] rounded-full bg-[#fcfcf8]" />
          <div className="relative text-center">
            <p className="text-[34px] font-semibold leading-none tracking-[-0.05em] sm:text-[40px]">
              {progress}%
            </p>
            <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[#68655f] sm:text-[10px]">
              {isAwaitingReview
                ? isExtractionFailed
                  ? "Check quote"
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

        <div className="mt-8 text-center sm:mt-10">
          <p className="max-w-md px-2 text-sm font-medium text-[#bd5c18] sm:text-base">
            <span className="mr-1.5">•</span>{statusText}
          </p>
          <p className="mt-2.5 inline-flex items-center gap-1.5 text-xs text-[#aaa7a0]">
            <ShieldCheck className="h-3.5 w-3.5" />
            Secure &amp; Encrypted Analysis
          </p>
          {isIntelligenceFailed && (
            <div className="mt-4">
              <Button
                onClick={() => void retryIntelligence()}
                className="h-9 bg-[#b55418] px-4 text-xs hover:bg-[#934112]"
              >
                Try review again
              </Button>
            </div>
          )}
          {isExtractionFailed && (
            <div className="mt-4">
              <Button
                onClick={() => void retryExtraction()}
                className="h-9 bg-[#b55418] px-4 text-xs hover:bg-[#934112]"
              >
                Try extraction again
              </Button>
            </div>
          )}
        </div>

        <div className="mt-12 grid w-full grid-cols-1 gap-3.5 sm:mt-16 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          {reviewCards.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="flex min-h-[140px] flex-col justify-between rounded-xl border border-[#e4e2dc] bg-white p-4 shadow-[0_2px_7px_rgba(30,25,20,0.035)] sm:min-h-[162px] sm:p-5"
            >
              <div>
                <div className="flex h-8 w-8 items-center justify-center rounded-md border border-[#ebe8e1] bg-[#fffaf5] text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <h2 className="mt-3.5 font-sans text-sm font-semibold leading-5 sm:mt-5">{title}</h2>
                <p className="mt-1 text-xs leading-relaxed text-[#77736d]">{description}</p>
              </div>
            </div>
          ))}
        </div>

        {((isAwaitingReview && !isIntelligenceComplete && !isExtractionFailed && !isIntelligenceFailed) ||
          (!isAwaitingReview && progress < 100)) && (
          <Loader2 className="mt-8 h-4 w-4 animate-spin text-primary" aria-label="Processing" />
        )}
      </main>

      <footer className="border-t border-[#eeece6] px-4 py-5 sm:px-10 sm:py-6">
        <div className="mx-auto flex max-w-[700px] flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[10px] tracking-[0.08em] text-[#69665f]">
          <span className="font-semibold text-foreground">InteriorLens AI</span>
          <span>© 2026 InteriorLens AI. Secure &amp; Encrypted Analysis.</span>
          <a href="/account" className="hover:text-primary">Privacy Policy</a>
          <a href="/account" className="hover:text-primary">Terms of Service</a>
          <a href="/account" className="hover:text-primary">Contact Support</a>
        </div>
      </footer>
    </div>
  );
}