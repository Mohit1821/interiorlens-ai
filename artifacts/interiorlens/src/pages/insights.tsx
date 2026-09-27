import * as React from "react"
import { AppLayout } from "@/components/layout/app-layout"
import { useListInsights } from "@workspace/api-client-react"
import { AlertCircle, AlertTriangle, Info, BookOpen, FileWarning } from "lucide-react"

export default function InsightsPage() {
  const { data: insights, isLoading } = useListInsights()

  const getSeverityIcon = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical': return <AlertTriangle className="h-5 w-5 text-destructive" />
      case 'moderate': return <AlertCircle className="h-5 w-5 text-primary" />
      default: return <Info className="h-5 w-5 text-muted-foreground" />
    }
  }

  const getSeverityClass = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical': return "border-l-4 border-l-destructive bg-destructive/5"
      case 'moderate': return "border-l-4 border-l-primary bg-primary/5"
      default: return "border-l-4 border-l-muted-foreground bg-accent/50"
    }
  }

  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-serif mb-2">Insight Feed</h1>
        <p className="text-muted-foreground text-sm max-w-2xl">
          A chronologically sorted feed of structural, aesthetic, and cost insights generated across your spaces. Evidence is attached to every observation.
        </p>
      </div>

      <div className="space-y-6 max-w-3xl">
        {isLoading ? (
          <div className="space-y-4">
            {[1,2,3].map(i => <div key={i} className="h-32 bg-muted animate-pulse border border-border" />)}
          </div>
        ) : (
          insights?.map(insight => {
            const hasEvidence = insight.evidenceRecords.length > 0
            return (
            <div key={insight.id} className={`p-6 border border-border ${getSeverityClass(insight.severity)}`}>
              <div className="flex items-start gap-4">
                <div className="mt-1">{getSeverityIcon(insight.severity)}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-serif text-lg leading-tight">{hasEvidence ? insight.title : "Observation withheld"}</h3>
                    <span className="px-2 py-0.5 bg-background border border-border text-xs uppercase tracking-wider font-medium text-muted-foreground">
                      {insight.category}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/80 mb-4 leading-relaxed">
                    {hasEvidence ? insight.detail : "This feed item has no structured evidence record, so its factual content is not displayed."}
                  </p>
                  
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 bg-background border border-border p-3 text-sm">
                    <div className="flex items-center text-muted-foreground flex-1">
                      <BookOpen className="h-4 w-4 mr-2" />
                      {hasEvidence ? <span className="italic">Evidence: {insight.evidenceRecords[0].source} · {insight.evidenceRecords[0].verificationStatus.replaceAll("_", " ")}</span> : <span className="italic flex items-center gap-1"><FileWarning className="h-3 w-3" /> Evidence record required</span>}
                    </div>
                    {hasEvidence && insight.estimate && (
                      <div className="font-mono text-primary font-medium border-t sm:border-t-0 sm:border-l border-border pt-2 sm:pt-0 sm:pl-4">
                        Est: ${insight.estimate.toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )})
        )}
        {insights?.length === 0 && (
          <div className="py-20 text-center text-muted-foreground border border-dashed border-border">
            No insights generated yet. Start an analysis to see findings.
          </div>
        )}
      </div>
    </AppLayout>
  )
}
