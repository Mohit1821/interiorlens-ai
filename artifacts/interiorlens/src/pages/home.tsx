import { ArrowRight, Check, CircleAlert, FileSearch } from "lucide-react";
import { Link } from "wouter";
import { PublicLayout } from "@/components/layout/public-layout";
import { Button } from "@/components/ui/button";

const workflow = [
  {
    number: "01",
    title: "Upload Quote",
    copy: "Upload a PDF or clear photo of your quotation or contract. No special data needed.",
  },
  {
    number: "02",
    title: "AI Review",
    copy: "We analyse costs, scope, and terms for potential gaps and check for standard missing items.",
  },
  {
    number: "03",
    title: "Secure Your Project",
    copy: "Get a clear, practical report with questions to ask your vendor before you commit.",
  },
];

const inScope = [
  "Missing line items",
  "Hidden costs",
  "Materials",
  "Milestones",
  "Warranty",
  "Price anomalies",
];

const outOfScope = [
  "Vendor recommendations",
  "Legal advice or representation",
  "Direct architectural design",
];

export default function HomePage() {
  return (
    <PublicLayout>
      <div className="font-sans">
        <section className="border-b border-border">
          <div className="mx-auto grid max-w-[900px] grid-cols-[minmax(0,1fr)_minmax(124px,0.62fr)] items-center gap-4 px-5 pb-3 pt-7 sm:gap-12 sm:px-8 sm:pb-24 sm:pt-20">
            <div className="min-w-0">
              <h1 className="max-w-[390px] font-sans text-[19px] font-bold leading-[1.02] tracking-[-0.045em] sm:text-5xl">
                Make one of the biggest purchases of your life with confidence.
              </h1>
              <p className="mt-3 max-w-[390px] text-[6px] leading-[1.55] text-muted-foreground sm:mt-6 sm:text-sm sm:leading-6">
                Upload your quotation. We&apos;ll highlight hidden costs,
                missing items, and risky clauses before you sign. Results in
                under 30 seconds.
              </p>
              <div className="mt-4 flex items-center gap-2 sm:mt-7 sm:gap-3">
                <Button
                  size="sm"
                  asChild
                  className="h-5 px-2 text-[6px] sm:h-10 sm:px-5 sm:text-xs"
                >
                  <Link href="/analysis/new">Analyse My Quote</Link>
                </Button>
                <Link
                  href="/sample-report"
                  className="whitespace-nowrap text-[6px] text-foreground underline-offset-4 hover:underline sm:text-xs"
                >
                  View Sample Report
                </Link>
              </div>
              <p className="mt-3 font-mono text-[5px] uppercase tracking-[0.12em] text-muted-foreground sm:mt-6 sm:text-[9px]">
                Private · Evidence-backed · Independent
              </p>
            </div>

            <ExampleReviewCard />
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-16">
          <div className="mx-auto max-w-[900px] px-5 py-5 sm:px-8 sm:py-20">
            <div className="text-center">
              <h2 className="font-sans text-[14px] font-semibold tracking-[-0.02em] sm:text-2xl">
                How it Works
              </h2>
              <p className="mt-2 text-[7px] text-muted-foreground sm:text-xs">
                Simple, transparent, and built for homeowners.
              </p>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-4 sm:mt-12 sm:gap-12">
              {workflow.map((item) => (
              <div key={item.number} className="min-w-0">
                  <p className="font-mono text-[8px] text-primary sm:text-[10px]">{item.number}</p>
                  <h3 className="mt-2 font-sans text-[7px] font-semibold sm:mt-4 sm:text-sm">
                    {item.title}
                  </h3>
                  <p className="mt-1.5 text-[5px] leading-[1.45] text-muted-foreground sm:text-[10px] sm:leading-5">
                    {item.copy}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="scope" className="scroll-mt-16">
          <div className="mx-auto max-w-[900px] px-5 sm:px-8">
            <div className="rounded-[14px] bg-sidebar px-4 py-5 sm:px-12 sm:py-14">
              <div className="text-center">
                <h2 className="font-sans text-[14px] font-semibold tracking-[-0.02em] sm:text-2xl">
                  Scope of Analysis
                </h2>
                <p className="mt-2 text-[7px] text-muted-foreground sm:text-xs">
                  Complete transparency on what we check and what we don&apos;t.
                </p>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2 sm:mt-10 sm:gap-4">
                <ScopeCard label="In-scope checks" items={inScope} featured />
                <ScopeCard label="Out of scope" items={outOfScope} />
              </div>
            </div>
          </div>
        </section>

        <section className="scroll-mt-16 bg-[#fffaf5] border-y border-[#f0ede6]">
          <div className="mx-auto max-w-[900px] px-5 py-10 sm:px-8 sm:py-16 text-center">
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-primary">100% Free Instant Access</span>
            <h2 className="mt-2 font-sans text-xl font-semibold tracking-[-0.02em] sm:text-3xl text-foreground">
              Instant AI Quotation Review — No Fees or Sign-up Required
            </h2>
            <p className="mt-2 text-xs text-muted-foreground max-w-md mx-auto">
              Upload any PDF or image quotation. We highlight hidden costs, missing scopes, and risky payment terms in under 30 seconds.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Button asChild className="rounded-full px-6 text-xs sm:text-sm">
                <Link href="/analysis/new">Upload Quote Now (Free)</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full px-6 text-xs sm:text-sm">
                <Link href="/sample-report">View Sample Report</Link>
              </Button>
            </div>
          </div>
        </section>

        <section>
          <div className="mx-auto max-w-[900px] px-5 pb-9 sm:px-8 sm:pb-20">
            <div className="mx-auto max-w-[560px] rounded-[12px] bg-sidebar px-5 py-6 text-center sm:px-10 sm:py-12">
              <h2 className="font-sans text-[14px] font-semibold sm:text-2xl">
                Secure your investment today.
              </h2>
              <p className="mt-2 text-[6px] leading-4 text-muted-foreground sm:text-xs">
                Spend 30 seconds checking for hidden risks that could cost you
                much more later.
              </p>
              <Button
                size="sm"
                className="mt-4 h-5 px-3 text-[6px] sm:h-9 sm:text-xs"
                asChild
              >
                <Link href="/analysis/new">Analyse My Quote Now</Link>
              </Button>
            </div>
          </div>
        </section>
      </div>
    </PublicLayout>
  );
}

function ExampleReviewCard() {
  return (
    <div className="min-w-0">
      <div className="rounded-[10px] border border-border bg-white p-2.5 shadow-[0_6px_20px_rgba(28,24,20,0.05)] sm:p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-mono text-[6px] uppercase tracking-[0.16em] text-muted-foreground sm:text-[8px]">
              Illustrative report
            </p>
            <h2 className="mt-1.5 font-sans text-[9px] font-semibold sm:text-lg">
              Transparency
            </h2>
          </div>
          <span className="font-mono text-[13px] font-semibold text-primary sm:text-3xl">
            72<span className="text-[9px] sm:text-base">/100</span>
          </span>
        </div>
        <div className="mt-3 border-t border-border pt-2 sm:mt-6 sm:pt-4">
          <div className="flex gap-2">
            <CircleAlert className="mt-0.5 h-2.5 w-2.5 shrink-0 text-primary sm:h-3 sm:w-3" />
            <div>
              <p className="text-[5px] font-semibold sm:text-[9px]">Hidden Cost Detected</p>
              <p className="mt-0.5 text-[4px] leading-2.5 text-muted-foreground sm:text-[8px] sm:leading-4">
                A scope item is missing from the supplied quote.
              </p>
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-border pt-2 sm:mt-6 sm:pt-4">
          <p className="font-mono text-[5px] uppercase tracking-[0.12em] text-muted-foreground sm:text-[7px]">
            Illustrative signal
          </p>
          <span className="text-[5px] text-primary sm:text-[7px]">View report →</span>
        </div>
      </div>
    </div>
  );
}

function ScopeCard({
  label,
  items,
  featured = false,
}: {
  label: string;
  items: string[];
  featured?: boolean;
}) {
  return (
    <div
      className={`rounded-[9px] border p-2.5 sm:p-5 ${
        featured ? "border-primary/20 bg-white" : "border-border bg-white/50"
      }`}
    >
      <p className="font-mono text-[6px] uppercase tracking-[0.14em] text-muted-foreground sm:text-[8px]">
        {label}
      </p>
      <ul className={`mt-3 grid gap-1.5 sm:mt-5 sm:gap-3 ${featured ? "grid-cols-2" : ""}`}>
        {items.map((item) => (
          <li
            key={item}
            className="flex items-start gap-1.5 text-[6px] leading-3 text-muted-foreground sm:text-[9px] sm:leading-4"
          >
            <Check className="mt-0.5 h-2 w-2 shrink-0 text-primary sm:h-3 sm:w-3" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PriceCard({
  eyebrow,
  title,
  copy,
  cta,
  href,
  featured = false,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  cta: string;
  href: string;
  featured?: boolean;
}) {
  return (
    <div
      className={`relative flex min-w-0 flex-col rounded-[10px] border p-2.5 text-center sm:p-5 ${
        featured
          ? "border-primary/20 bg-white shadow-[0_8px_20px_rgba(28,24,20,0.05)]"
          : "border-border bg-white"
      }`}
    >
      {featured && (
        <span className="absolute -right-1.5 -top-2 rounded-sm bg-primary px-1.5 py-0.5 font-mono text-[5px] uppercase tracking-wider text-white sm:text-[7px]">
          Most popular
        </span>
      )}
      <p className="font-mono text-[6px] uppercase tracking-[0.15em] text-muted-foreground sm:text-[8px]">
        {eyebrow}
      </p>
      <p className="mt-1.5 font-sans text-[14px] font-semibold sm:text-2xl">{title}</p>
      <p className="mx-auto mt-1.5 max-w-[145px] text-[5px] leading-2.5 text-muted-foreground sm:mt-3 sm:text-[9px] sm:leading-4">
        {copy}
      </p>
      <Button
        variant={featured ? "default" : "outline"}
        size="sm"
        className="mt-3 h-5 w-full px-1 text-[5px] sm:mt-5 sm:h-8 sm:text-[9px]"
        asChild
      >
        <Link href={href}>{cta}</Link>
      </Button>
    </div>
  );
}