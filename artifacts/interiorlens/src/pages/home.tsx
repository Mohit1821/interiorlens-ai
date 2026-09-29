import { Check, CircleAlert } from "lucide-react";
import { Link } from "wouter";
import { PublicLayout } from "@/components/layout/public-layout";
import { Button } from "@/components/ui/button";

const workflow = [
  {
    number: "01",
    title: "Upload Quote",
    copy: "Upload a PDF or clear photo of your quotation or contract. No special formatting needed.",
  },
  {
    number: "02",
    title: "AI Review",
    copy: "We analyse costs, scope, and terms for potential gaps, checking for standard missing line items.",
  },
  {
    number: "03",
    title: "Secure Your Project",
    copy: "Get an actionable, itemized report with exact questions to ask your vendor before you commit.",
  },
];

const inScope = [
  "Missing line items",
  "Hidden costs",
  "Plywood & material grades",
  "Milestone payments",
  "Workmanship warranty",
  "Price inconsistencies",
];

const outOfScope = [
  "Vendor recommendations",
  "Legal representation",
  "Direct architectural design",
];

export default function HomePage() {
  return (
    <PublicLayout>
      <div className="font-sans">
        {/* Hero Section */}
        <section className="border-b border-border bg-gradient-to-b from-[#fcfcf9] to-background">
          <div className="mx-auto grid max-w-[1040px] grid-cols-1 items-center gap-8 px-5 py-10 sm:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] sm:gap-12 sm:px-8 sm:py-20 lg:py-24">
            <div className="min-w-0 text-center sm:text-left">
              <span className="inline-block rounded-full bg-primary/10 px-3 py-1 font-mono text-[10px] sm:text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                Independent AI Quote Auditor
              </span>
              <h1 className="mt-3 font-sans text-2xl font-bold leading-tight tracking-[-0.035em] text-foreground sm:text-4xl lg:text-5xl">
                Make one of the biggest purchases of your life with confidence.
              </h1>
              <p className="mt-3.5 text-sm sm:text-base leading-relaxed text-muted-foreground">
                Upload your interior quotation. We&apos;ll highlight hidden costs, missing items, unstated materials, and risky payment terms before you sign.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
                <Button
                  size="default"
                  asChild
                  className="rounded-full px-6 text-sm font-semibold shadow-sm"
                >
                  <Link href="/analysis/new">Analyse My Quote (Free)</Link>
                </Button>
                <Button
                  variant="outline"
                  size="default"
                  asChild
                  className="rounded-full px-5 text-sm font-medium"
                >
                  <Link href="/sample-report">View Sample Report</Link>
                </Button>
              </div>
              <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.12em] text-[#78756f]">
                Private · Evidence-backed · Ready in &lt;30s
              </p>
            </div>

            <ExampleReviewCard />
          </div>
        </section>

        {/* How It Works Section */}
        <section id="how-it-works" className="scroll-mt-16 bg-white py-12 sm:py-20">
          <div className="mx-auto max-w-[1040px] px-5 sm:px-8">
            <div className="text-center">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-primary font-medium">Simple 3-step process</span>
              <h2 className="mt-2 font-sans text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">
                How It Works
              </h2>
              <p className="mt-2 text-xs sm:text-sm text-muted-foreground max-w-md mx-auto">
                Simple, transparent, and built for homeowners and commercial spaces.
              </p>
            </div>
            <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-8 lg:gap-12">
              {workflow.map((item) => (
                <div key={item.number} className="rounded-xl border border-border/70 bg-[#fdfdfb] p-6 shadow-sm">
                  <p className="font-mono text-sm font-bold text-primary">{item.number}</p>
                  <h3 className="mt-3 font-sans text-base font-semibold text-foreground">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                    {item.copy}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Scope of Analysis Section */}
        <section id="scope" className="scroll-mt-16 py-12 sm:py-20 bg-background">
          <div className="mx-auto max-w-[1040px] px-5 sm:px-8">
            <div className="rounded-2xl border border-border bg-sidebar/50 p-6 sm:p-12">
              <div className="text-center">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-primary font-medium">What we cover</span>
                <h2 className="mt-2 font-sans text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">
                  Scope of Analysis
                </h2>
                <p className="mt-2 text-xs sm:text-sm text-muted-foreground max-w-md mx-auto">
                  Complete transparency on what we verify and what we leave to professionals.
                </p>
              </div>
              <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
                <ScopeCard label="In-scope checks" items={inScope} featured />
                <ScopeCard label="Out of scope" items={outOfScope} />
              </div>
            </div>
          </div>
        </section>

        {/* Call to action banner */}
        <section className="scroll-mt-16 bg-[#fffaf5] border-y border-[#f0ede6] py-12 sm:py-16">
          <div className="mx-auto max-w-[900px] px-5 text-center sm:px-8">
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-primary font-semibold">100% Free Instant Analysis</span>
            <h2 className="mt-2 font-sans text-xl font-bold tracking-[-0.02em] text-foreground sm:text-3xl">
              Upload Your Quotation — Results in Under 30 Seconds
            </h2>
            <p className="mt-3 text-xs sm:text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">
              Upload any PDF or image quotation. We highlight hidden costs, missing scopes, and risky payment terms before you pay your deposit.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Button asChild className="rounded-full px-7 text-sm font-semibold shadow-sm">
                <Link href="/analysis/new">Upload Quote Now (Free)</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full px-6 text-sm">
                <Link href="/sample-report">View Sample Report</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="py-12 sm:py-20">
          <div className="mx-auto max-w-[900px] px-5 sm:px-8">
            <div className="mx-auto max-w-xl rounded-2xl border border-border bg-sidebar p-8 text-center sm:p-12 shadow-sm">
              <h2 className="font-sans text-xl font-bold text-foreground sm:text-2xl">
                Secure your investment today.
              </h2>
              <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Spend 30 seconds checking for hidden risks that could cost you lakhs later.
              </p>
              <div className="mt-6">
                <Button
                  size="default"
                  className="rounded-full px-7 text-sm font-semibold shadow-sm"
                  asChild
                >
                  <Link href="/analysis/new">Analyse My Quote Now</Link>
                </Button>
              </div>
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
      <div className="rounded-xl border border-border bg-white p-5 shadow-[0_6px_24px_rgba(28,24,20,0.06)] sm:p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-semibold">
              Live Preview
            </p>
            <h2 className="mt-1 font-sans text-base font-bold text-foreground sm:text-lg">
              Transparency Score
            </h2>
          </div>
          <span className="font-mono text-2xl font-bold text-primary sm:text-3xl">
            72<span className="text-xs sm:text-sm text-muted-foreground">/100</span>
          </span>
        </div>
        <div className="mt-4 border-t border-border pt-4">
          <div className="flex items-start gap-2.5">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="text-xs font-semibold text-foreground">Hidden Cost Detected</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Base cabinetry listed without hardware brand specification or warranty.
              </p>
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Audit Checklist
          </p>
          <Link href="/sample-report" className="text-xs font-medium text-primary hover:underline">
            View full report →
          </Link>
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
      className={`rounded-xl border p-5 sm:p-6 ${
        featured ? "border-primary/25 bg-white shadow-sm" : "border-border bg-white/70"
      }`}
    >
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-foreground font-semibold">
        {label}
      </p>
      <ul className={`mt-4 grid gap-2.5 sm:gap-3 ${featured ? "grid-cols-1 sm:grid-cols-2" : ""}`}>
        {items.map((item) => (
          <li
            key={item}
            className="flex items-start gap-2 text-xs sm:text-sm leading-relaxed text-muted-foreground"
          >
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}