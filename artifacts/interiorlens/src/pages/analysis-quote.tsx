import * as React from "react"
import { AppLayout } from "@/components/layout/app-layout"
import { useParams, Link } from "wouter"
import { useListQuotes } from "@workspace/api-client-react"
import { ChevronLeft, FileText, CheckCircle2, FileWarning } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function AnalysisQuotePage() {
  const params = useParams()
  const id = params.id as string
  const { data: quotes, isLoading } = useListQuotes()

  // Filter quotes for this analysis
  const projectQuotes = quotes?.filter(q => q.analysisId === id) || []

  return (
    <AppLayout>
      <div className="mb-8">
        <Link href={`/analysis/${id}/report`} className="inline-flex items-center text-xs font-medium text-muted-foreground hover:text-foreground mb-4">
          <ChevronLeft className="h-3 w-3 mr-1" /> Back to Report
        </Link>
        <h1 className="text-3xl font-serif mb-2">Quote Review</h1>
        <p className="text-muted-foreground text-sm">Compare submitted bids against algorithmic estimates.</p>
      </div>

      {isLoading ? (
        <div className="h-64 bg-muted animate-pulse border border-border" />
      ) : projectQuotes.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground border border-dashed border-border bg-white">
          <FileText className="h-8 w-8 mx-auto mb-4 opacity-50" />
          <h3 className="font-serif text-lg text-foreground mb-1">Awaiting Quotes</h3>
          <p className="text-sm max-w-md mx-auto">Requests have been sent to matched vendors. You will be notified when bids are submitted.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {projectQuotes.map(quote => {
            const hasEvidence = quote.evidence.length > 0
            return (
            <div key={quote.id} className="border border-border bg-white p-6 relative">
              {quote.status === 'accepted' && (
                <div className="absolute top-0 right-0 bg-green-50 text-green-700 border-b border-l border-green-200 px-3 py-1 flex items-center text-xs font-medium">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Accepted
                </div>
              )}
              <h3 className="text-xl font-serif mb-1">{hasEvidence ? quote.vendorName : "Bid details withheld"}</h3>
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-mono mb-6">{hasEvidence ? quote.category : "No structured evidence attached"}</p>
              {hasEvidence ? (
                <div className="text-3xl font-serif mb-6">${quote.amount.toLocaleString()}</div>
              ) : (
                <div className="flex gap-2 text-sm text-muted-foreground mb-6">
                  <FileWarning className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>Vendor and bid claims are not shown until an evidence record is attached.</p>
                </div>
              )}
              {hasEvidence && quote.note && (
                <div className="bg-sidebar p-4 border border-border text-sm text-muted-foreground mb-6 italic">
                  "{quote.note}"
                </div>
              )}

              {hasEvidence && <div className="flex gap-3">
                {quote.status !== 'accepted' && (
                  <Button className="flex-1">Accept Bid</Button>
                )}
                <Button variant="outline" className={quote.status === 'accepted' ? "w-full" : "flex-1"}>View Details</Button>
              </div>}
            </div>
          )})}
        </div>
      )}
    </AppLayout>
  )
}
