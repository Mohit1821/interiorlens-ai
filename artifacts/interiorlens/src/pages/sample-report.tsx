import * as React from "react"
import { PublicLayout } from "@/components/layout/public-layout"
import { Button } from "@/components/ui/button"
import { FileText, MapPin, Download, AlertTriangle, ArrowRight } from "lucide-react"

export default function SampleReportPage() {
  return (
    <PublicLayout>
      <div className="bg-sidebar border-b border-border py-12">
        <div className="max-w-5xl mx-auto px-6 flex flex-col md:flex-row items-start md:items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="bg-white border border-border px-2 py-0.5 text-xs font-mono uppercase tracking-wider text-muted-foreground">Sample Report</span>
              <span className="text-primary font-mono text-xs">ID: S-8924A</span>
            </div>
            <h1 className="text-4xl font-serif mb-2">Modernizing a 1970s Master Bath</h1>
            <p className="text-muted-foreground flex items-center">
              <MapPin className="h-4 w-4 mr-1 opacity-50" /> San Francisco, CA • 120 sq ft
            </p>
            <p className="mt-3 text-xs text-muted-foreground">Illustrative scenario only — this sample does not represent a live property assessment or verified cost data.</p>
          </div>
          <Button variant="outline" className="gap-2 bg-white">
            <Download className="h-4 w-4" /> Export PDF
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="border border-border bg-white">
            <div className="border-b border-border p-5 bg-sidebar flex justify-between items-center">
              <h2 className="font-serif text-lg">Structural Assessment</h2>
            </div>
            <div className="p-0">
              <div className="p-6 border-b border-border flex gap-4">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium mb-1">Subfloor Water Damage Detected</h3>
                  <p className="text-sm text-muted-foreground mb-3">Visual analysis of the tile grout lines near the shower pan indicates potential moisture failure. Structural integrity of the subfloor must be verified.</p>
                  <div className="bg-accent p-3 text-sm border border-border">
                    <span className="font-medium text-foreground">Remediation:</span> Complete tear-down of shower pan and replacement of 4x8 subfloor section.
                  </div>
                </div>
              </div>
              <div className="p-6 flex gap-4">
                <FileText className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium mb-1">Plumbing Node Relocation</h3>
                  <p className="text-sm text-muted-foreground mb-3">Moving the vanity requires extending the waste line 4 feet across load-bearing joists.</p>
                  <div className="bg-accent p-3 text-sm border border-border">
                    <span className="font-medium text-foreground">Remediation:</span> Drill maximum 2" holes center-joist to comply with local code.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="border border-border bg-white p-6">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-mono mb-4">Illustrative Financial Model</h3>
            <div className="text-4xl font-serif mb-2">$24,850</div>
            <p className="text-sm text-muted-foreground mb-6 pb-6 border-b border-border">Example-only budget breakdown; it is not a market estimate or pricing recommendation.</p>
            
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Demolition & Prep</span>
                <span className="font-mono">$3,200</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rough Plumbing</span>
                <span className="font-mono">$4,150</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Waterproofing</span>
                <span className="font-mono">$2,800</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Finish Materials</span>
                <span className="font-mono">$8,500</span>
              </div>
              <div className="flex justify-between font-medium pt-3 mt-3 border-t border-border">
                <span>Labor & Contingency</span>
                <span className="font-mono">$6,200</span>
              </div>
            </div>
          </div>

          <div className="bg-sidebar border border-border p-6 text-center">
            <h3 className="font-serif text-lg mb-3">Generate your own</h3>
            <p className="text-sm text-muted-foreground mb-6">Create a dedicated workspace to analyze your property and receive accurate matching.</p>
            <Button className="w-full">Create Workspace</Button>
          </div>
        </div>
      </div>
    </PublicLayout>
  )
}
