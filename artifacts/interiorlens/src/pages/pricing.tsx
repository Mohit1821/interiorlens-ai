import * as React from "react"
import { PublicLayout } from "@/components/layout/public-layout"
import { CheckCircle2 } from "lucide-react"

export default function PricingPage() {
  return (
    <PublicLayout>
      <div className="py-20 max-w-7xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h1 className="text-4xl md:text-5xl font-serif mb-4">Transparent Pricing.</h1>
          <p className="text-lg text-muted-foreground">Select the tier that matches your volume. No hidden fees or percentage cuts from vendor contracts.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 max-w-4xl mx-auto gap-8">
          <div className="border border-border bg-white p-8 md:p-10 flex flex-col">
            <div className="mb-6">
              <span className="text-xs uppercase tracking-wider font-mono text-muted-foreground mb-2 block">Homeowner</span>
              <h2 className="text-3xl font-serif mb-2">Standard</h2>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-serif">$49</span>
                <span className="text-muted-foreground">/mo</span>
              </div>
            </div>
            
            <p className="text-sm text-muted-foreground mb-8">For individuals planning a single property renovation.</p>
            
            <ul className="space-y-4 mb-10 flex-1">
              {['Up to 3 space analyses per month', 'Automated vendor matching', 'Standard email support', 'PDF export functionality'].map(f => (
                <li key={f} className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                  <span className="text-sm">{f}</span>
                </li>
              ))}
            </ul>
            
            <button className="w-full py-3 bg-secondary text-secondary-foreground font-medium hover:bg-secondary/80 transition-colors border border-border">
              Select Standard
            </button>
          </div>

          <div className="border-2 border-primary bg-white p-8 md:p-10 flex flex-col relative shadow-xl">
            <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs uppercase tracking-wider font-mono px-3 py-1 -translate-y-1/2 translate-x-4">
              Recommended
            </div>
            <div className="mb-6">
              <span className="text-xs uppercase tracking-wider font-mono text-primary mb-2 block">Professional</span>
              <h2 className="text-3xl font-serif mb-2">Pro Workspace</h2>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-serif">$199</span>
                <span className="text-muted-foreground">/mo</span>
              </div>
            </div>
            
            <p className="text-sm text-muted-foreground mb-8">For architects, interior designers, and contractors.</p>
            
            <ul className="space-y-4 mb-10 flex-1">
              {['Unlimited space analyses', 'Priority vendor routing', 'White-labeled reports', 'Dedicated account manager', 'API access'].map(f => (
                <li key={f} className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                  <span className="text-sm font-medium">{f}</span>
                </li>
              ))}
            </ul>
            
            <button className="w-full py-3 bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors">
              Start Pro Trial
            </button>
          </div>
        </div>
      </div>
    </PublicLayout>
  )
}
