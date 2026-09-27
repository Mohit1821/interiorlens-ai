import * as React from "react";
import { useParams, useLocation, Link } from "wouter";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clipboard,
  ClipboardCheck,
  FileText,
  Loader2,
  MessageCircle,
} from "lucide-react";
import { useGenerateVendorMessage, useGenerateBulkVendorMessage } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

type Finding = {
  category: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  description: string;
  evidence: string;
  recommendation: string;
};

type VerdictData = {
  status: "GREEN" | "YELLOW" | "RED";
  label: string;
  summary: string;
  highCount: number;
  mediumCount: number;
  lowCount: number;
};

type AnalysisData = {
  id: string;
  name: string;
  room: string;
  address?: string | null;
  replacementAnalysisId: string | null;
};

type IntelligenceData = {
  status: "pending" | "processing" | "complete" | "failed";
  findings: Finding[] | null;
  documentationCompletenessScore: number | null;
  verdict: VerdictData | null;
  error: string | null;
};

const titleForCategory = (category: string) =>
  category.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const readableEvidence = (evidence: string) =>
  evidence.startsWith("MISSING_FIELD:")
    ? `Missing from the extracted field: ${evidence.slice("MISSING_FIELD:".length)}`
    : evidence;

function formatEvidenceLines(evidence: string) {
  return readableEvidence(evidence)
    .replace(/\s+(PROCEDURE OF PAYMENT)/gi, "\n\n$1")
    .replace(/\s+(?=\d+(?:\.\d+)?%\s*(?:[-–—:]|at|on|after|before))/gi, "\n")
    .trim();
}

function splitPaymentSchedules(finding: Finding): string[] | null {
  if (!/conflicting payment schedules/i.test(finding.title)) return null;
  const formatted = formatEvidenceLines(finding.evidence);
  const headerMatches = [...formatted.matchAll(/PROCEDURE OF PAYMENT/gi)];
  if (headerMatches.length >= 2 && headerMatches[1].index !== undefined) {
    return [
      formatted.slice(0, headerMatches[1].index).trim(),
      formatted.slice(headerMatches[1].index).trim(),
    ];
  }
  const blocks = formatted.split(/\n\s*\n/).filter(Boolean);
  const percentageBlocks = blocks.filter(
    (block) => (block.match(/\d+(?:\.\d+)?%/g) ?? []).length >= 2,
  );
  return percentageBlocks.length >= 2 ? percentageBlocks.slice(0, 2) : null;
}

function FindingEvidence({ finding }: { finding: Finding }) {
  const schedules = splitPaymentSchedules(finding);
  if (schedules) {
    return (
      <div className="space-y-3">
        {schedules.map((schedule, index) => (
          <div key={index} className="rounded-[8px] bg-[#FAFAF7] p-3">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">
              Schedule {index + 1}
            </p>
            <p className="whitespace-pre-wrap text-[13px] italic leading-[1.6] text-[#6B6B6B]">
              {schedule}
            </p>
          </div>
        ))}
      </div>
    );
  }
  return (
    <p className="whitespace-pre-wrap rounded-[8px] bg-[#FAFAF7] p-3 text-[13px] italic leading-[1.6] text-[#6B6B6B]">
      “{formatEvidenceLines(finding.evidence)}”
    </p>
  );
}

function computeVerdictLocally(findings: Finding[]): VerdictData {
  const highCount = findings.filter((f) => f.severity === "HIGH" || f.severity === "CRITICAL").length;
  const mediumCount = findings.filter((f) => f.severity === "MEDIUM").length;
  const lowCount = findings.filter((f) => f.severity === "LOW").length;

  let status: "GREEN" | "YELLOW" | "RED" = "GREEN";
  let label = "SAFE TO SIGN";

  const hasPaymentHigh = findings.some(
    (f) =>
      (f.severity === "HIGH" || f.severity === "CRITICAL") &&
      (f.category.toLowerCase().includes("payment") || f.category.toLowerCase().includes("math"))
  );

  if (highCount >= 2 || hasPaymentHigh) {
    status = "RED";
    label = "DO NOT SIGN YET";
  } else if (highCount > 0) {
    status = "YELLOW";
    label = `RESOLVE ${highCount} CRITICAL ITEM${highCount > 1 ? "S" : ""} BEFORE SIGNING`;
  } else if (mediumCount >= 3) {
    status = "YELLOW";
    label = `RESOLVE ${mediumCount} ITEMS BEFORE SIGNING`;
  }

  const top =
    findings.find((f) => f.severity === "CRITICAL" || f.severity === "HIGH") ||
    findings.find((f) => f.severity === "MEDIUM") ||
    findings[0];

  return {
    status,
    label,
    summary: top ? top.title : "This quote is clearly documented and safe to sign.",
    highCount,
    mediumCount,
    lowCount,
  };
}

function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = React.useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      return initialValue;
    }
  });

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(error);
    }
  };

  return [storedValue, setValue] as const;
}

function FindingCard({
  analysisId,
  finding,
  type,
  index,
}: {
  analysisId: string;
  finding: Finding;
  type: "HIGH" | "MEDIUM" | "LOW";
  index: number;
}) {
  const isHigh = type === "HIGH";
  const isCompact = type === "LOW";

  const borderColor = type === "HIGH" ? "#A02C2C" : type === "MEDIUM" ? "#C8621A" : "#B8B4AA";
  const fingerprint = `${analysisId}-${finding.category}-${finding.title}-${finding.evidence}-${index}`;
  const [resolved, setResolved] = useLocalStorage(`resolved-${fingerprint}`, false);

  const [message, setMessage] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const generateMessage = useGenerateVendorMessage({
    mutation: {
      onSuccess: (result) => {
        setMessage(result.message);
        setCopied(false);
      },
    },
  });

  async function copyMessage() {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <article
      className={`relative overflow-hidden rounded-[12px] border border-[#E5E2DC] bg-white shadow-[0_4px_12px_rgba(0,0,0,0.03)] transition-opacity duration-300 ${
        resolved ? "opacity-50" : "opacity-100"
      }`}
      style={{ borderLeft: `4px solid ${borderColor}` }}
    >
      <div className={`p-5 ${isHigh ? "sm:p-7" : "sm:p-6"} ${isCompact ? "sm:p-4" : ""}`}>
        <div className="flex justify-between items-start mb-3 gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-sans uppercase tracking-[0.08em] text-[11px] font-semibold text-[#6B6B6B]">
              {titleForCategory(finding.category)}
            </span>
            <span
              className="rounded-[6px] px-2 py-0.5 text-[9px] font-bold tracking-[0.08em] text-white"
              style={{ backgroundColor: borderColor }}
            >
              {finding.severity}
            </span>
            {resolved && (
              <span className="bg-[#2F7A3A] text-white text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-[4px] font-semibold">
                Resolved
              </span>
            )}
          </div>

          <label className="flex items-center gap-2 cursor-pointer group shrink-0">
            <input
              type="checkbox"
              checked={resolved}
              onChange={(e) => setResolved(e.target.checked)}
              className="peer sr-only"
            />
            <span className="text-[12px] text-[#6B6B6B] group-hover:text-[#1A1A1A] font-medium transition-colors">
              Mark as resolved
            </span>
            <div className="w-4 h-4 border border-[#B8B4AA] rounded-[4px] peer-checked:bg-[#2F7A3A] peer-checked:border-[#2F7A3A] flex items-center justify-center transition-colors">
              <Check className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
            </div>
          </label>
        </div>

        <h3
          className={`font-serif text-[#1A1A1A] font-semibold tracking-[-0.02em] ${
            isHigh ? "text-[22px]" : isCompact ? "text-[17px]" : "text-[19px]"
          }`}
        >
          {finding.title}
        </h3>
        <p
          className={`mt-2 text-[#6B6B6B] ${
            isHigh ? "text-[15px] leading-[1.6]" : "text-[14px] leading-[1.5]"
          }`}
        >
          {finding.description}
        </p>

        <div
          className={`mt-5 border-t border-[#E5E2DC] pt-5 flex flex-col md:flex-row ${
            isHigh ? "gap-6" : "gap-4"
          }`}
        >
          <div className="flex-1">
            <p className="font-sans text-[10px] uppercase tracking-[0.08em] font-semibold text-[#6B6B6B] mb-2">
              Evidence from quote
            </p>
            <FindingEvidence finding={finding} />
          </div>
          <div className="flex-1">
            <p className="font-sans text-[10px] uppercase tracking-[0.08em] font-semibold text-[#C8621A] mb-2">
               Ask your quote provider
            </p>
            <p
              className={`text-[#1A1A1A] ${
                isHigh ? "text-[14px]" : "text-[13px]"
              } leading-[1.5] mb-4`}
            >
              {finding.recommendation}
            </p>

            {!message ? (
              <Button
                type="button"
                disabled={generateMessage.isPending}
                className={`w-full sm:w-auto h-9 px-4 rounded-[6px] text-[13px] border-none font-semibold transition-colors ${
                  isHigh
                    ? "bg-[#C8621A] text-white hover:bg-[#A85215]"
                    : "bg-[#F3EFE8] text-[#C8621A] hover:bg-[#EAE4D9]"
                }`}
                onClick={() =>
                  generateMessage.mutate({
                    id: analysisId,
                    data: { findingCategory: finding.category, findingTitle: finding.title },
                  })
                }
              >
                {generateMessage.isPending ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <MessageCircle className="mr-2 h-3.5 w-3.5" />
                )}
                Ask vendor
              </Button>
            ) : (
              <div className="rounded-[8px] border border-[#E5E2DC] bg-[#FAFAF7] p-3">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="font-sans text-[9px] font-semibold uppercase tracking-[0.08em] text-[#6B6B6B]">
                    Ready to send
                  </p>
                  <button
                    type="button"
                    onClick={() => void copyMessage()}
                    className="inline-flex shrink-0 items-center gap-1 rounded text-[11px] font-semibold text-[#C8621A] hover:text-[#A85215]"
                  >
                    {copied ? (
                      <ClipboardCheck className="h-3.5 w-3.5" />
                    ) : (
                      <Clipboard className="h-3.5 w-3.5" />
                    )}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="whitespace-pre-wrap text-[13px] leading-[1.5] text-[#1A1A1A]">
                  {message}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function BulkMessageModal({
  analysisId,
  priority,
  title,
  description,
  isOpen,
  onOpenChange,
}: {
  analysisId: string;
  priority: "LOW" | "HIGH";
  title: string;
  description: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [bulkMessage, setBulkMessage] = React.useState("");
  const [bulkCopied, setBulkCopied] = React.useState(false);
  const generateBulk = useGenerateBulkVendorMessage({
    mutation: {
      onSuccess: (res) => {
        setBulkMessage(res.message);
      },
    },
  });

  React.useEffect(() => {
    if (isOpen && !bulkMessage && !generateBulk.isPending && !generateBulk.isSuccess) {
      generateBulk.mutate({ id: analysisId, data: { priority } });
    }
  }, [isOpen, bulkMessage, generateBulk, analysisId, priority]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl sm:rounded-[12px] p-0 overflow-hidden border-[#E5E2DC]">
        <div className="p-6">
          <DialogHeader className="mb-6">
            <DialogTitle className="font-serif text-[22px] text-[#1A1A1A]">{title}</DialogTitle>
            <DialogDescription className="text-[14px] text-[#6B6B6B]">
              {description}
            </DialogDescription>
          </DialogHeader>
          {generateBulk.isPending ? (
            <div className="py-16 flex flex-col items-center justify-center text-[#6B6B6B]">
              <Loader2 className="h-8 w-8 animate-spin text-[#C8621A] mb-4" />
              <p className="text-[14px]">Drafting message...</p>
            </div>
          ) : generateBulk.isError ? (
            <div className="rounded-[8px] border border-[#E5E2DC] bg-[#FAFAF7] p-6 text-center">
              <p role="alert" className="text-[14px] text-[#A02C2C]">
                We couldn’t draft the message right now.
              </p>
              <Button
                className="mt-4 bg-[#C8621A] text-white hover:bg-[#A85215]"
                onClick={() => generateBulk.mutate({ id: analysisId, data: { priority } })}
              >
                Try again
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <textarea
                className="w-full h-64 p-4 border border-[#E5E2DC] rounded-[8px] text-[14px] text-[#1A1A1A] leading-[1.6] focus:outline-none focus:ring-2 focus:ring-[#C8621A] bg-[#FAFAF7]"
                value={bulkMessage}
                onChange={(e) => setBulkMessage(e.target.value)}
              />
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="outline"
                  className="border-[#E5E2DC] text-[#1A1A1A] hover:bg-[#F3EFE8] font-semibold"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button asChild className="bg-[#C8621A] text-white hover:bg-[#A85215]">
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(bulkMessage)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in WhatsApp
                  </a>
                </Button>
                <Button
                  className="bg-[#C8621A] hover:bg-[#A85215] text-white border-none font-semibold"
                  onClick={() => {
                    navigator.clipboard.writeText(bulkMessage);
                    setBulkCopied(true);
                    setTimeout(() => setBulkCopied(false), 2000);
                  }}
                >
                  {bulkCopied ? (
                    <>
                      <ClipboardCheck className="mr-2 h-4 w-4" /> Copied
                    </>
                  ) : (
                    <>
                      <Clipboard className="mr-2 h-4 w-4" /> Copy to clipboard
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NextStepsSection({
  verdict,
  analysisId,
  findings,
  isReadyToSign,
  setIsReadyToSign,
  onUploadCorrectedQuote,
}: {
  verdict: VerdictData;
  analysisId: string;
  findings: Finding[];
  isReadyToSign: boolean;
  setIsReadyToSign: (val: boolean) => void;
  onUploadCorrectedQuote: () => void;
}) {
  const highCount = verdict.highCount;
  const mediumCount = verdict.mediumCount;

  const highFindings = findings.filter((f) => f.severity === "HIGH" || f.severity === "CRITICAL");
  const topTitle = highFindings[0]?.title || "the critical questions";
  const [isCriticalModalOpen, setIsCriticalModalOpen] = React.useState(false);

  const getSteps = () => {
    if (verdict.status === "RED") {
      return [
        <span key="1">Do NOT make any payment or sign yet.</span>,
        <span key="2" className="inline-flex flex-wrap items-center gap-1">
          Send the {highCount} critical {highCount === 1 ? "question" : "questions"} to your vendor now
          <button
            type="button"
            className="ml-1 inline-flex items-center rounded-[6px] border border-[#C8621A] px-2.5 py-1 text-[12px] font-semibold text-[#C8621A] hover:bg-white"
            onClick={() => setIsCriticalModalOpen(true)}
          >
            <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
            Send all via WhatsApp
          </button>
        </span>,
        <span key="3">Ask for a corrected quote in writing before you proceed.</span>,
        <span key="4">Once resolved, come back and re-run the analysis on the corrected quote.</span>,
      ];
    } else if (verdict.status === "YELLOW" && highCount > 0) {
      return [
        <span key="1" className="inline-flex flex-wrap items-center gap-1">
          Send the {highCount} critical {highCount === 1 ? "question" : "questions"} to your vendor now —
          <button
            className="text-[#C8621A] font-semibold hover:underline inline-flex items-center"
            onClick={() =>
              window.open(
                `https://wa.me/?text=${encodeURIComponent(
                  `Hi, I'd like to ask about: ${topTitle}. Could you clarify this in writing?`
                )}`,
                "_blank"
              )
            }
          >
            [Send via WhatsApp]
          </button>
          <button
            className="text-[#6B6B6B] font-semibold hover:underline inline-flex items-center"
            onClick={() => {
              navigator.clipboard.writeText(`Hi, I'd like to ask about: ${topTitle}. Could you clarify this in writing?`);
              alert("Copied to clipboard for email!");
            }}
          >
            [Copy for Email]
          </button>
        </span>,
        <span key="2">Wait for their written reply. Take a screenshot for your records.</span>,
        <span key="3">Review the {mediumCount} clarifying questions with them together.</span>,
        <span key="4">Save the final dated quote before making any payment.</span>,
      ];
    } else {
      const msg =
        mediumCount > 0
          ? `Hi, I'd like to clarify ${mediumCount} details in the quote before we finalise. Could you please reply in writing?`
          : "Hi, I'd like to confirm a few small details in the quote before we finalise. Could you please reply in writing?";
      return [
        <span key="1" className="inline-flex flex-wrap items-center gap-1">
          {mediumCount > 0
            ? `Send the ${mediumCount} clarifying questions to your vendor —`
            : "Send any remaining small questions to your vendor —"}
          <button
            className="text-[#C8621A] font-semibold hover:underline inline-flex items-center"
            onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank")}
          >
            [Send via WhatsApp]
          </button>
        </span>,
        <span key="2">Wait for their written reply. Take a screenshot for your records.</span>,
        <span key="3">Save the final dated quote before making any payment.</span>,
        <span key="4">Keep this checklist as a record of what was agreed.</span>,
      ];
    }
  };

  const steps = getSteps();

  const getChecklistItems = () => {
    if (verdict.status === "RED") {
      return [
        { id: "red-1", label: "Vendor has sent a corrected quote in writing" },
        { id: "red-2", label: "I have re-run this analysis on the corrected quote" },
        { id: "red-3", label: "The re-run verdict is GREEN or YELLOW" },
      ];
    }
    if (verdict.status === "YELLOW") {
      return [
        {
          id: "y-1",
          label:
            highCount > 0
              ? `Vendor has confirmed the ${highCount} critical ${highCount === 1 ? "item" : "items"} in writing`
              : "Vendor has confirmed the requested clarifications in writing",
        },
        {
          id: "y-2",
          label:
            mediumCount > 0
              ? `The ${mediumCount} clarifying ${mediumCount === 1 ? "question has" : "questions have"} been resolved`
              : "Any remaining clarifying questions have been resolved",
        },
        { id: "y-3", label: "I have the final dated quote saved" },
        { id: "y-4", label: "I have vendor's replies saved (screenshots or emails)" },
      ];
    }
    return [
      { id: "g-1", label: "I have sent the clarifying questions to my vendor" },
      { id: "g-2", label: "Vendor has confirmed the answers in writing" },
      { id: "g-3", label: "I have the final dated quote saved" },
    ];
  };

  const checklistItems = getChecklistItems();
  const [tickedBoxes, setTickedBoxes] = useLocalStorage<Record<string, boolean>>(`checklist-${analysisId}`, {});
  const [isConfirmModalOpen, setIsConfirmModalOpen] = React.useState(false);

  const allTicked = checklistItems.length > 0 && checklistItems.every((item) => tickedBoxes[item.id]);
  const canMarkReady = verdict.status !== "RED" && allTicked;

  const handleToggle = (id: string) => {
    setTickedBoxes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleConfirmReady = () => {
    setIsReadyToSign(true);
    setIsConfirmModalOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <section className="mt-12 bg-[#F3EFE8] rounded-[12px] p-7 sm:p-10 w-full" id="section-next-steps">
      <span className="font-sans uppercase tracking-[0.08em] text-[11px] text-[#C8621A] font-semibold mb-3 block">
        WHAT TO DO NEXT
      </span>
      <h2 className="font-serif text-[26px] sm:text-[30px] text-[#1A1A1A] mb-8">Your next steps</h2>

      <ol className="list-decimal list-outside ml-5 space-y-4 text-[15px] sm:text-[16px] text-[#1A1A1A] mb-10 marker:font-semibold marker:text-[#C8621A]">
        {steps.map((step, i) => (
          <li key={i} className="pl-2 leading-[1.6]">
            {step}
          </li>
        ))}
      </ol>

      <div className="border-t border-[#E5E2DC] pt-8">
        <div className="space-y-4">
          {checklistItems.map((item, index) => {
            const isDisabled =
              verdict.status === "RED" &&
              index > 0 &&
              !checklistItems.slice(0, index).every((previous) => tickedBoxes[previous.id]);
            return (
            <label key={item.id} className="flex items-start gap-4 cursor-pointer group">
              <div className="mt-0.5 relative shrink-0 w-[22px] h-[22px] border border-[#B8B4AA] rounded-[6px] bg-white group-hover:border-[#C8621A] transition-colors">
                <input
                  type="checkbox"
                  checked={!!tickedBoxes[item.id]}
                  onChange={() => handleToggle(item.id)}
                  disabled={isDisabled}
                  className="peer sr-only"
                />
                <div className="absolute inset-0 bg-[#2F7A3A] border-[#2F7A3A] rounded-[5px] opacity-0 peer-checked:opacity-100 flex items-center justify-center transition-opacity">
                  <Check className="w-4 h-4 text-white" />
                </div>
              </div>
              <span
                className={`text-[15px] leading-[1.5] transition-colors ${
                  isDisabled
                    ? "text-[#B8B4AA]"
                    : tickedBoxes[item.id]
                      ? "text-[#6B6B6B] line-through"
                      : "text-[#1A1A1A]"
                }`}
              >
                {item.label}
              </span>
            </label>
            );
          })}
        </div>

        {verdict.status === "RED" ? (
          <div className="mt-8 flex flex-col gap-4 rounded-[8px] border border-[#E5E2DC] bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[14px] font-medium text-[#1A1A1A]">
              Upload the corrected quote to re-run the analysis
            </p>
            <Button
              type="button"
              className="bg-[#C8621A] text-white hover:bg-[#A85215]"
              onClick={onUploadCorrectedQuote}
            >
              Upload corrected quote →
            </Button>
          </div>
        ) : null}

        <Button
          disabled={!canMarkReady}
          className={`w-full sm:w-auto px-8 mt-10 h-12 text-[15px] rounded-[8px] font-semibold transition-colors ${
            canMarkReady && !isReadyToSign
              ? "bg-[#2F7A3A] hover:bg-[#25602E] text-white border-none shadow-[0_4px_12px_rgba(47,122,58,0.2)]"
              : isReadyToSign
              ? "bg-[#E5E2DC] text-[#6B6B6B] cursor-not-allowed border-none"
              : "bg-[#E5E2DC] text-[#6B6B6B] cursor-not-allowed border-none"
          }`}
          onClick={() => {
            if (canMarkReady && !isReadyToSign) setIsConfirmModalOpen(true);
          }}
        >
          {verdict.status === "RED"
            ? "Mark ready to sign"
            : isReadyToSign
              ? "Ready to sign ✓"
              : allTicked
                ? "Mark ready to sign ✓"
                : "Mark ready to sign"}
        </Button>
        {verdict.status === "RED" ? (
          <p className="mt-3 text-[12px] leading-5 text-[#6B6B6B]">
            This verdict is red — you cannot mark ready to sign here. Upload a corrected quote and re-analyse it first.
          </p>
        ) : null}
      </div>

      <Dialog open={isConfirmModalOpen} onOpenChange={setIsConfirmModalOpen}>
        <DialogContent className="sm:rounded-[12px] p-0 overflow-hidden border-[#E5E2DC]">
          <div className="p-6">
            <DialogHeader className="mb-4">
              <DialogTitle className="font-serif text-[22px] text-[#1A1A1A]">Ready to sign?</DialogTitle>
              <DialogDescription className="mt-3 text-[15px] text-[#6B6B6B] leading-[1.6]">
                You've confirmed all items are resolved. This report will be marked as 'Ready to sign' and archived
                under Quotes → Ready to sign. You can still reopen it anytime.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-8 gap-3">
              <Button variant="outline" className="border-[#E5E2DC] text-[#1A1A1A] font-semibold hover:bg-[#F3EFE8]" onClick={() => setIsConfirmModalOpen(false)}>
                Not yet
              </Button>
              <Button className="bg-[#2F7A3A] hover:bg-[#25602E] text-white border-none font-semibold" onClick={handleConfirmReady}>
                Confirm
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
      <BulkMessageModal
        analysisId={analysisId}
        priority="HIGH"
        title="Send all critical questions"
        description="Review the message, then copy it or open it in WhatsApp."
        isOpen={isCriticalModalOpen}
        onOpenChange={setIsCriticalModalOpen}
      />
    </section>
  );
}

export default function AnalysisReportPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [analysis, setAnalysis] = React.useState<AnalysisData | null>(null);
  const [intelligence, setIntelligence] = React.useState<IntelligenceData | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRetrying, setIsRetrying] = React.useState(false);

  React.useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function loadReport() {
      try {
        const [analysisResponse, intelligenceResponse] = await Promise.all([
          fetch(`/api/analyses/${id}`, { credentials: "include" }),
          fetch(`/api/analyses/${id}/intelligence`, { credentials: "include" }),
        ]);
        const analysisPayload = (await analysisResponse.json()) as AnalysisData & { error?: string };
        const intelligencePayload = (await intelligenceResponse.json()) as IntelligenceData & {
          error?: string;
        };
        if (!analysisResponse.ok || !intelligenceResponse.ok) {
          throw new Error(
            analysisPayload.error || intelligencePayload.error || "We couldn't load this quote review."
          );
        }
        if (!cancelled) {
          setAnalysis(analysisPayload);
          setIntelligence(intelligencePayload);
          setLoadError(null);
          if (intelligencePayload.status === "pending" || intelligencePayload.status === "processing") {
            setLocation(`/analysis/${id}/processing`);
          }
        }
      } catch (error) {
        if (!cancelled)
          setLoadError(error instanceof Error ? error.message : "We couldn't load this quote review.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void loadReport();
    return () => {
      cancelled = true;
    };
  }, [id, setLocation]);

  async function retryIntelligence() {
    if (!id) return;
    setIsRetrying(true);
    try {
      const response = await fetch(`/api/analyses/${id}/intelligence`, {
        method: "POST",
        credentials: "include",
      });
      const payload = (await response.json()) as IntelligenceData & { error?: string };
      if (!response.ok) throw new Error(payload.error || "We couldn't restart this review.");
      setIntelligence(payload);
      setLocation(`/analysis/${id}/processing`);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "We couldn't restart this review.");
    } finally {
      setIsRetrying(false);
    }
  }

  const findings = (intelligence?.findings ?? []) as Finding[];
  const documentationScore = intelligence?.documentationCompletenessScore ?? null;

  const highFindings = findings.filter((f) => f.severity === "HIGH" || f.severity === "CRITICAL");
  const mediumFindings = findings.filter((f) => f.severity === "MEDIUM");
  const lowFindings = findings.filter((f) => f.severity === "LOW");

  const highCount = highFindings.length;
  const mediumCount = mediumFindings.length;
  const lowCount = lowFindings.length;

  const verdict = intelligence?.verdict ?? computeVerdictLocally(findings);

  const [isLowExpanded, setIsLowExpanded] = React.useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = React.useState(false);

  const [isReadyToSign, setIsReadyToSign] = useLocalStorage(`ready-${id}`, false);

  return (
    <div className="min-h-screen bg-[#FAFAF7] text-[#1A1A1A] font-sans">
      <header className="border-b border-[#E5E2DC] bg-white relative z-10">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="text-[14px] font-bold tracking-[-0.02em] text-[#1A1A1A]">
            InteriorLens <span className="text-[#C8621A]">AI</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="hidden text-[11px] font-medium uppercase tracking-wide text-[#6B6B6B] sm:inline">
              Secure quote review
            </span>
            <Button
              onClick={() => setLocation("/analysis/new")}
              className="h-8 rounded-[6px] bg-[#C8621A] px-4 text-[11px] font-semibold text-white border-none hover:bg-[#A85215] transition-colors"
            >
              New analysis
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[760px] px-5 pb-16 pt-8 sm:px-8 sm:pt-12 relative z-0">
        {isLoading ? (
          <div className="animate-pulse space-y-8 mt-4">
            <div className="h-64 rounded-[12px] bg-[#E5E2DC]" />
            <div className="h-48 rounded-[12px] bg-[#E5E2DC]" />
          </div>
        ) : loadError ? (
          <div className="rounded-[12px] border border-[#A02C2C] bg-[#FFF8F8] p-10 text-center mt-4 shadow-[0_4px_12px_rgba(0,0,0,0.03)]">
            <AlertTriangle className="mx-auto h-8 w-8 text-[#A02C2C]" />
            <h1 className="mt-5 font-serif text-[28px] text-[#A02C2C]">Review unavailable</h1>
            <p className="mx-auto mt-3 max-w-md text-[14px] leading-[1.6] text-[#A02C2C] opacity-80">
              {loadError}
            </p>
          </div>
        ) : intelligence?.status === "pending" || intelligence?.status === "processing" ? (
          <div className="rounded-[12px] border border-[#E5E2DC] bg-white p-10 text-center mt-4 shadow-[0_4px_12px_rgba(0,0,0,0.03)]">
            <FileText className="mx-auto h-8 w-8 text-[#C8621A]" />
            <h1 className="mt-5 font-serif text-[28px] text-[#1A1A1A]">Preparing your quote review</h1>
            <p className="mx-auto mt-3 max-w-md text-[14px] leading-[1.6] text-[#6B6B6B]">
              We’re still checking scope, commercial terms, and supporting evidence. You’ll see the report
              once it is ready.
            </p>
          </div>
        ) : intelligence?.status === "failed" ? (
          <div className="rounded-[12px] border border-[#A02C2C] bg-[#FFF8F8] p-10 text-center mt-4 shadow-[0_4px_12px_rgba(0,0,0,0.03)]">
            <AlertTriangle className="mx-auto h-8 w-8 text-[#A02C2C]" />
            <h1 className="mt-5 font-serif text-[28px] text-[#A02C2C]">We couldn’t complete this review</h1>
            <p className="mx-auto mt-3 max-w-md text-[14px] leading-[1.6] text-[#A02C2C] opacity-80">
              {intelligence.error ?? "Please return to your quotation and try again."}
            </p>
            <Button
              disabled={isRetrying}
              onClick={() => void retryIntelligence()}
              className="mt-7 bg-[#A02C2C] text-white border-none hover:bg-[#802323] px-6 rounded-[6px]"
            >
              {isRetrying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Restarting review...
                </>
              ) : (
                "Try again"
              )}
            </Button>
          </div>
        ) : (
          <>
            {(verdict.status === "RED" || isReadyToSign) && (
              <div className="flex justify-end mb-5">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-bold text-white tracking-wider uppercase shadow-[0_2px_8px_rgba(0,0,0,0.12)] ${
                    verdict.status === "RED" ? "bg-[#A02C2C]" : "bg-[#2F7A3A]"
                  }`}
                >
                  {verdict.status === "RED" ? (
                    <>
                      <AlertTriangle className="h-3.5 w-3.5" /> Do not sign
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Ready to sign
                    </>
                  )}
                </span>
              </div>
            )}

            {/* Section A: Verdict Card */}
            <section
              className="w-full bg-white rounded-[12px] p-7 sm:p-10 shadow-[0_4px_16px_rgba(0,0,0,0.03)] border border-[#E5E2DC] mb-14"
              style={{
                borderLeft: `4px solid ${
                  verdict.status === "RED" ? "#A02C2C" : verdict.status === "YELLOW" ? "#C8621A" : "#2F7A3A"
                }`,
              }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <span className="font-sans uppercase tracking-[0.08em] text-[11px] text-[#C8621A] font-bold">
                  VERDICT
                </span>
                <span
                  className={`px-3.5 py-1.5 rounded-[6px] font-sans text-[11px] font-bold text-white uppercase tracking-wide ${
                    verdict.status === "RED"
                      ? "bg-[#A02C2C]"
                      : verdict.status === "YELLOW"
                      ? "bg-[#C8621A]"
                      : "bg-[#2F7A3A]"
                  }`}
                >
                  {verdict.label}
                </span>
              </div>
              <h1 className="font-serif text-[28px] sm:text-[34px] leading-[1.3] text-[#1A1A1A] mb-5 tracking-tight">
                {verdict.summary}
              </h1>
              <p className="text-[14px] text-[#6B6B6B] mb-8 font-medium">
                Documentation score: {documentationScore ?? "—"} / 100 — a supporting metric, not a verdict.
              </p>
            </section>

            {/* Section B: Must resolve */}
            {highCount > 0 && (
              <section id="section-high" className="mb-14 pt-2">
                <div className="flex items-end justify-between mb-6 pb-2 border-b border-[#E5E2DC]">
                  <div>
                    <span className="font-sans uppercase tracking-[0.08em] text-[11px] text-[#C8621A] font-bold block mb-1.5">
                      MUST RESOLVE
                    </span>
                    <h2 className="font-serif text-[26px] text-[#1A1A1A]">Fix before you sign</h2>
                  </div>
                  <span className="bg-[#A02C2C] text-white px-3 py-1 rounded-[6px] text-[12px] font-bold mb-1">
                    {highCount} item{highCount !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="space-y-4">
                  {highFindings.map((finding, idx) => (
                    <FindingCard
                      key={`high-${idx}`}
                      analysisId={id!}
                      finding={finding}
                      type="HIGH"
                      index={idx}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Section C: Worth asking */}
            {mediumCount > 0 && (
              <section id="section-medium" className="mb-14 pt-2">
                <div className="flex items-end justify-between mb-6 pb-2 border-b border-[#E5E2DC]">
                  <div>
                    <span className="font-sans uppercase tracking-[0.08em] text-[11px] text-[#C8621A] font-bold block mb-1.5">
                      WORTH ASKING
                    </span>
                    <h2 className="font-serif text-[26px] text-[#1A1A1A]">Clarify with the vendor</h2>
                  </div>
                  <span className="bg-[#C8621A] text-white px-3 py-1 rounded-[6px] text-[12px] font-bold mb-1">
                    {mediumCount} item{mediumCount !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="space-y-4">
                  {mediumFindings.map((finding, idx) => (
                    <FindingCard
                      key={`med-${idx}`}
                      analysisId={id!}
                      finding={finding}
                      type="MEDIUM"
                      index={idx}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Section D: Nice to clarify */}
            {lowCount > 0 && (
              <section id="section-low" className="mb-14 pt-2">
                <div className="flex items-end justify-between mb-6 pb-2 border-b border-[#E5E2DC]">
                  <div>
                    <span className="font-sans uppercase tracking-[0.08em] text-[11px] text-[#6B6B6B] font-bold block mb-1.5">
                      NICE TO CLARIFY
                    </span>
                    <h2 className="font-serif text-[26px] text-[#1A1A1A]">Ask if you have time</h2>
                  </div>
                  <button
                    type="button"
                    aria-expanded={isLowExpanded}
                    aria-controls="low-priority-findings"
                    onClick={() => setIsLowExpanded(!isLowExpanded)}
                    className="flex items-center gap-1.5 text-[#6B6B6B] hover:text-[#1A1A1A] text-[13px] font-semibold transition-colors outline-none mb-2"
                  >
                    {isLowExpanded ? `Hide low-priority items ↑` : `Show ${lowCount} low-priority items ↓`}
                  </button>
                </div>

                <div className="mb-6">
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto border-[#E5E2DC] bg-white hover:bg-[#F3EFE8] text-[#1A1A1A] rounded-[8px] h-11 px-5 text-[14px] font-semibold transition-colors shadow-[0_2px_8px_rgba(0,0,0,0.02)]"
                    onClick={() => setIsBulkModalOpen(true)}
                  >
                    <MessageCircle className="mr-2 h-4 w-4 text-[#C8621A]" />
                    Send all low-priority questions in one message
                  </Button>
                </div>

                {isLowExpanded && (
                  <div id="low-priority-findings" className="space-y-4">
                    {lowFindings.map((finding, idx) => (
                      <FindingCard
                        key={`low-${idx}`}
                        analysisId={id!}
                        finding={finding}
                        type="LOW"
                        index={idx}
                      />
                    ))}
                  </div>
                )}

                <BulkMessageModal
                  analysisId={id!}
                  priority="LOW"
                  title="Send all low-priority questions"
                  description="Edit your consolidated message before sending."
                  isOpen={isBulkModalOpen}
                  onOpenChange={setIsBulkModalOpen}
                />
              </section>
            )}

            {/* Section E: What to do next */}
            <NextStepsSection
              verdict={verdict}
              analysisId={id!}
              findings={findings}
              isReadyToSign={isReadyToSign}
              setIsReadyToSign={setIsReadyToSign}
              onUploadCorrectedQuote={() =>
                setLocation(`/analysis/new?sourceAnalysisId=${encodeURIComponent(id!)}`)
              }
            />

            {/* Footer */}
            <div className="mt-16 text-center border-t border-[#E5E2DC] pt-12 pb-8 flex flex-col items-center">
              <p className="text-[12px] text-[#6B6B6B]">
                <span className="font-bold text-[#1A1A1A]">InteriorLens AI</span> · Evidence-led quote clarity
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
