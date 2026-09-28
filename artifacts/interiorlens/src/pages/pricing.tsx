import * as React from "react"
import { PublicLayout } from "@/components/layout/public-layout"
import { CheckCircle2, Sparkles } from "lucide-react"
import { Link } from "wouter"
import { Button } from "@/components/ui/button"

export default function PricingPage() {
  return (
    <PublicLayout>
      <div className="py-20 max-w-7xl mx-auto px-6 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono uppercase tracking-wider mb-6">
          <Sparkles className="h-3.5 w-3.5" /> 100% Free Public Access
        </div>
        <h1 className="text-4xl md:text-5xl font-serif mb-4">No Subscriptions. No Hidden Fees.</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-12">
          InteriorLens AI is completely free to use. Upload your interior quote to receive an instant, itemized risk and cost analysis report.
        </p>

        <div className="max-w-md mx-auto border-2 border-primary bg-white p-8 md:p-10 shadow-xl rounded-2xl text-left">
          <span className="text-xs uppercase tracking-wider font-mono text-primary mb-1 block">Public Access</span>
          <h2 className="text-3xl font-serif mb-2">Free Instant Review</h2>
          <div className="flex items-baseline gap-1 mb-6">
            <span className="text-4xl font-serif font-bold text-foreground">₹0</span>
            <span className="text-muted-foreground">/ free forever</span>
          </div>

          <ul className="space-y-4 mb-8">
            {[
              'Unlimited quotation PDF & photo uploads',
              'Deep line-item material & cost breakdown',
              'Hidden fee and markup detection',
              'Timeline and payment milestone check',
              'Vendor background risk assessment',
            ].map((f) => (
              <li key={f} className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                <span className="text-sm font-medium">{f}</span>
              </li>
            ))}
          </ul>

          <Button asChild size="lg" className="w-full rounded-full">
            <Link href="/analysis/new">Upload Quote Now (Instant & Free)</Link>
          </Button>
        </div>
      </div>
    </PublicLayout>
  )
}
