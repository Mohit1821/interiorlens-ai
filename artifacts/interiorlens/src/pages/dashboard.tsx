import * as React from "react"
import { AppLayout } from "@/components/layout/app-layout"
import { useGetDashboard } from "@workspace/api-client-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ArrowRight, FileText, CheckCircle2, Clock, AlertCircle } from "lucide-react"
import { Link } from "wouter"
import { Button } from "@/components/ui/button"

export default function DashboardPage() {
  const { data: dashboard, isLoading } = useGetDashboard()

  if (isLoading) {
    return (
      <AppLayout>
        <div className="animate-pulse space-y-8">
          <div className="h-10 bg-muted w-1/4" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-32 bg-muted" />)}
          </div>
          <div className="h-64 bg-muted w-full" />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="flex items-end justify-between mb-10">
        <div>
          <h1 className="text-3xl font-serif mb-2">Workspace</h1>
          <p className="text-muted-foreground text-sm">Overview of your active analyses and insights.</p>
        </div>
        <Button asChild>
          <Link href="/analysis/new">New Analysis</Link>
        </Button>
      </div>

      {dashboard && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-10">
            <MetricCard title="Active Analyses" value={dashboard.activeAnalyses.toString()} label="Processing & Live" />
            <MetricCard title="Reports Ready" value={dashboard.reportsReady.toString()} label="Awaiting Review" />
            <MetricCard title="Quotes Received" value={dashboard.quotesReceived.toString()} label="Vendor Responses" />
            <MetricCard 
              title="Est. Savings" 
              value={`$${dashboard.potentialSavings.toLocaleString()}`} 
              label="Via Optimization" 
              highlight 
            />
          </div>

          <h2 className="text-xl font-serif mb-6">Recent Analyses</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {dashboard.recentAnalyses.map(analysis => (
              <Card key={analysis.id} className="group hover:border-primary/50 transition-colors">
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">ID: {analysis.id.slice(0,6)}</span>
                    <StatusBadge status={analysis.status} />
                  </div>
                  <CardTitle className="text-lg">{analysis.name}</CardTitle>
                  <CardDescription>{analysis.room}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-1 w-full bg-accent mb-4">
                    <div 
                      className="h-full bg-primary transition-all duration-1000" 
                      style={{ width: `${analysis.progress}%` }} 
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Progress: {analysis.progress}%</span>
                    <Link href={`/analysis/${analysis.id}/report`} className="text-xs font-medium text-primary hover:underline inline-flex items-center">
                      View <ArrowRight className="ml-1 h-3 w-3" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
            {dashboard.recentAnalyses.length === 0 && (
              <div className="col-span-full py-12 border border-dashed border-border flex flex-col items-center justify-center text-center">
                <AlertCircle className="h-8 w-8 text-muted-foreground mb-4" />
                <h3 className="font-serif text-lg mb-1">No analyses yet</h3>
                <p className="text-sm text-muted-foreground mb-4">Start your first space analysis to see insights here.</p>
                <Button variant="outline" asChild>
                  <Link href="/analysis/new">Begin Analysis</Link>
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </AppLayout>
  )
}

function MetricCard({ title, value, label, highlight = false }: { title: string, value: string, label: string, highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-primary/20 bg-primary/5" : ""}>
      <CardContent className="p-6">
        <p className="text-sm font-medium text-muted-foreground mb-2">{title}</p>
        <p className="text-3xl font-serif mb-1">{value}</p>
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-mono">{label}</p>
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'completed') {
    return <span className="inline-flex items-center text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5"><CheckCircle2 className="mr-1 h-3 w-3"/> Ready</span>
  }
  if (status === 'processing') {
    return <span className="inline-flex items-center text-xs font-medium text-primary bg-primary/10 px-2 py-0.5"><Clock className="mr-1 h-3 w-3"/> Processing</span>
  }
  return <span className="inline-flex items-center text-xs font-medium text-muted-foreground bg-accent px-2 py-0.5 capitalize">{status}</span>
}
